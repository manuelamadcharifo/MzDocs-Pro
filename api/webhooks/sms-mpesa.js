// api/webhooks/sms-mpesa.js — recebe o SMS de confirmação da Vodacom
// reencaminhado pela app instalada no telemóvel que recebe os pagamentos
// (ver instruções de configuração da app no chat, não neste ficheiro).
//
// SEGURANÇA: estas apps de reencaminhamento (SMS to URL Forwarder, httpSMS,
// etc.) não suportam assinatura HMAC como um gateway de pagamento a sério —
// por isso a protecção aqui é um token secreto na própria URL, seguindo a
// recomendação da própria documentação da app "SMS to URL Forwarder": usa
// um endpoint longo e impossível de adivinhar, e confirma o token. Configura
// a URL na app como:
//   https://mzdocs.co.mz/api/webhooks/sms-mpesa?token=<SMS_WEBHOOK_TOKEN>
//
// Reutiliza a mesma sequência de atribuição de créditos que já usámos em
// api/webhooks/paysuite.js e que existe em api/misc.js::verifyReceiptInternal
// — PATCH condicional a status=eq.pending → add_credits → credit_logs →
// process_affiliate_commission_v2 — para não criar um quarto caminho de
// crédito divergente.
const { restRequest, rpc, insert } = require('../_lib/supabaseAdmin');
const { parseMpesaConfirmationSms } = require('../_lib/parseMpesaSms');

// Tolerância de valor (arredondamentos raros) e janela de tempo para
// aceitar a correspondência — os mesmos princípios que já usas na
// verificação por imagem em api/misc.js.
const AMOUNT_TOLERANCE_MZN = 1;
const MATCH_WINDOW_MINUTES = 60;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const token = req.query?.token || req.headers['x-webhook-token'];
  if (!process.env.SMS_WEBHOOK_TOKEN || token !== process.env.SMS_WEBHOOK_TOKEN) {
    console.warn('[webhooks/sms-mpesa] token ausente ou inválido — pedido rejeitado');
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Diferentes apps de reencaminhamento usam nomes de campo diferentes para
  // o texto do SMS — aceita os mais comuns em vez de obrigar a app a um
  // formato específico.
  const rawText = req.body?.message || req.body?.text || req.body?.body || req.body?.payload?.text;
  if (!rawText) return res.status(400).json({ error: 'Corpo do SMS não encontrado no pedido' });

  const parsed = parseMpesaConfirmationSms(rawText);
  if (!parsed) {
    // Não reconhecido — não confirmes um pagamento às cegas. Regista para
    // poderes ver se a Vodacom mudou o formato do SMS.
    console.warn('[webhooks/sms-mpesa] SMS não reconhecido pelo parser:', rawText.slice(0, 200));
    return res.status(200).json({ received: true, parsed: false });
  }

  try {
    // Procura uma transacção pending do mesmo telefone, valor compatível
    // (tolerância de 1 MZN), dentro da janela de tempo — mesmo espírito da
    // verificação por imagem, mas com dados que vieram directamente da
    // operadora, não de uma imagem editável.
    const since = new Date(Date.now() - MATCH_WINDOW_MINUTES * 60 * 1000).toISOString();
    const candidates = await restRequest(
      `transactions?status=eq.pending&phone_number=eq.${encodeURIComponent('+258' + parsed.senderPhone)}` +
      `&amount=gte.${parsed.amount - AMOUNT_TOLERANCE_MZN}&amount=lte.${parsed.amount + AMOUNT_TOLERANCE_MZN}` +
      `&created_at=gte.${since}&select=*&order=created_at.desc&limit=1`
    );

    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.warn('[webhooks/sms-mpesa] nenhuma transacção pendente correspondente para', parsed.reference);
      // Regista mesmo assim — útil para reconciliares manualmente pagamentos
      // que chegaram sem uma transacção pending correspondente (ex.:
      // cliente pagou sem passar pelo teu checkout).
      await insert('sms_confirmations_unmatched', {
        reference: parsed.reference, amount: parsed.amount, sender_phone: parsed.senderPhone,
        sender_name: parsed.senderName, confirmed_at: parsed.confirmedAt, raw_text: rawText,
      }).catch(e => console.warn('[webhooks/sms-mpesa] sms_confirmations_unmatched insert (tabela existe?):', e.message));
      return res.status(200).json({ received: true, matched: false });
    }

    const tx = candidates[0];

    // PATCH condicional a status=eq.pending — mesma protecção contra
    // corrida (ex.: o cliente também enviou comprovativo em paralelo, e os
    // dois caminhos tentam confirmar ao mesmo tempo).
    const updatedTx = await restRequest(`transactions?id=eq.${tx.id}&status=eq.pending`, {
      method: 'PATCH',
      body: {
        status: 'completed',
        confirmed_at: new Date().toISOString(),
        receipt_ref: parsed.reference,
        verification_method: 'sms_mpesa',
      },
      prefer: 'return=representation',
    });
    if (!Array.isArray(updatedTx) || updatedTx.length === 0) {
      console.warn('[webhooks/sms-mpesa] transacção já confirmada por outra via:', tx.id);
      return res.status(200).json({ received: true, matched: true, note: 'já confirmada' });
    }

    const userId = tx.user_id;
    const credits = tx.credits;
    if (userId && credits > 0) {
      await rpc('add_credits', { user_id: userId, amount: credits });

      await insert('credit_logs', {
        user_id: userId,
        transaction_id: tx.id,
        action: 'purchase_confirmed',
        credits,
        document_type: null,
        note: `Pagamento confirmado via SMS M-Pesa real (ref ${parsed.reference})`,
      }).catch(e => console.warn('[webhooks/sms-mpesa] credit_logs insert:', e.message));

      rpc('process_affiliate_commission_v2', {
        p_transaction_id: tx.id, p_user_id: userId, p_package_id: tx.package_id, p_amount: tx.amount,
      }).catch(e => console.warn('[webhooks/sms-mpesa] process_affiliate_commission falhou:', e.message));
    } else {
      // Sem user_id (ex.: compra avulso anónima) — mesmo caminho de
      // revisão manual que os outros webhooks já usam para este caso.
      await restRequest(`transactions?id=eq.${tx.id}`, {
        method: 'PATCH',
        body: { review_reason: 'CONFIRMADO_POR_SMS_SEM_USER_ID: requer criação manual de conta avulso' },
        prefer: 'return=minimal',
      }).catch(() => {});
    }

    console.log('[webhooks/sms-mpesa] CONFIRMADO por SMS real:', tx.id, parsed.reference);
    return res.status(200).json({ received: true, matched: true, transactionId: tx.id });
  } catch (err) {
    console.error('[webhooks/sms-mpesa] erro a processar SMS:', err.message);
    return res.status(500).json({ error: 'Erro interno ao processar o SMS' });
  }
};
