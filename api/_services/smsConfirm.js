// api/_services/smsConfirm.js — confirmação automática de pagamento via
// SMS de M-Pesa reencaminhado (Telegram webhook OU HTTP directo).
// Reaproveita integralmente parseMpesaSms.js e a RPC confirm_payment_and_credit
// já usadas no caminho de verificação por imagem (payments.js) — mesma
// garantia de atomicidade, mesma idempotência via credit_logs.
//
// NOVO (monetização — Tarefa 3 do script de execução): reduz a dependência
// da verificação manual/por IA-de-visão de comprovativos, usando o SMS de
// confirmação real que a Vodacom envia ao telemóvel que recebe os
// pagamentos — mais difícil de falsificar do que uma imagem, e chega em
// 1-2 segundos após o pagamento. Corre EM PARALELO com a verificação por
// imagem já existente (não a substitui) — se este caminho falhar por
// qualquer motivo, o cliente ainda pode confirmar por upload de
// comprovativo normalmente.

const { parseMpesaConfirmationSms } = require('../_lib/parseMpesaSms');
const { notifyTelegram }            = require('../_lib/notifyTelegram');
const { restRequest, rpc }          = require('../_lib/supabaseAdmin');
const { checkRateLimit }            = require('../_lib/rateLimit');
const { loadPackagesFromSettings, packageTotalCredits } = require('../_lib/packages');
const { logEvent }                  = require('../_lib/observability');

// Reaproveita a criação de conta avulso do payments.js (mesma lógica,
// não duplicar) — _createAvulsoAccount já está exportada desse ficheiro.
const { _createAvulsoAccount } = require('./payments');

async function handleSmsMpesaWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── 1. Validar origem: OU veio do Telegram (com secret_token), OU
  //       veio de um HTTP forward directo (com X-Sms-Secret) ─────────────
  const tgSecret    = req.headers['x-telegram-bot-api-secret-token'];
  const httpSecret  = req.headers['x-sms-secret'];
  const validTelegram = !!tgSecret && tgSecret === process.env.TELEGRAM_WEBHOOK_SECRET;
  const validHttp      = !!httpSecret && httpSecret === process.env.SMS_FORWARD_SECRET;

  if (!validTelegram && !validHttp) {
    // Não revelar qual credencial falhou — resposta genérica.
    return res.status(403).json({ error: 'forbidden' });
  }

  // Rate limit leve — isto só recebe tráfego do teu próprio telemóvel,
  // mas o endpoint é publicamente alcançável, por isso mantém-se a defesa.
  const allowed = await checkRateLimit('sms-webhook', 'global', { limit: 60, windowSec: 60 });
  if (!allowed) return res.status(429).json({ error: 'rate_limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  let smsText = '';
  if (validTelegram) {
    // Formato de update do Telegram: só interessa message.text.
    // Ignorar silenciosamente qualquer update que não seja mensagem de
    // texto (ex.: /start, stickers, etc.) — devolver 200 sempre, para a
    // Telegram não ficar a reenviar o mesmo update.
    smsText = body?.message?.text || '';
    const chatId = body?.message?.chat?.id;
    if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
      return res.status(200).json({ ok: true, ignored: 'chat_id_mismatch' });
    }
  } else {
    // Formato directo (app de forward por HTTP) — ajustar o nome do
    // campo ao que a app escolhida realmente envia (normalmente `text`,
    // `message` ou `body`).
    smsText = body?.text || body?.message || body?.body || '';
  }

  if (!smsText) return res.status(200).json({ ok: true, ignored: 'empty' });

  const parsed = parseMpesaConfirmationSms(smsText);
  if (!parsed) {
    // Não é um SMS de confirmação reconhecível (ou o formato mudou) —
    // não é erro, só não há nada a fazer aqui.
    return res.status(200).json({ ok: true, ignored: 'not_a_confirmation' });
  }

  const { reference, amount, senderPhone, confirmedAt } = parsed;

  // ── 2. Procurar transacção pendente correspondente ───────────────────
  const normalizedPhone = `+258${senderPhone}`;
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60min
  let candidates;
  try {
    candidates = await restRequest(
      `transactions?phone_number=eq.${encodeURIComponent(normalizedPhone)}` +
      `&status=in.(pending,review_needed)` +
      `&created_at=gte.${encodeURIComponent(cutoff)}` +
      `&select=id,user_id,package_id,amount,credits,visitor_id,reference_id` +
      `&order=created_at.desc`
    );
  } catch (e) {
    await notifyTelegram(`⚠️ Erro ao procurar transacção para SMS M-Pesa (ref ${reference}): ${e.message}`);
    return res.status(200).json({ ok: true, error: 'lookup_failed' });
  }

  const match = (candidates || []).find(tx => Math.abs(Number(tx.amount) - amount) <= 1);

  if (!match) {
    // Não é erro do sistema — pode ser um pagamento avulso sem
    // transacção prévia, ou o valor não bateu por 1 MZN. Avisa para
    // revisão humana em vez de ficar silencioso.
    await notifyTelegram(
      `💰 *SMS M-Pesa recebido sem transacção correspondente*\n` +
      `Valor: ${amount} MZN · De: ${normalizedPhone}\n` +
      `Referência M-Pesa: ${reference}\nVerificar manualmente.`
    );
    return res.status(200).json({ ok: true, matched: false });
  }

  // NOVO (monetização — bónus escada): recomputa a partir do pacote
  // actual para incluir sempre o bónus (packageTotalCredits), com
  // fallback para o valor já gravado na transacção (match.credits, que o
  // process-payment.js já grava com o bónus incluído) se o pacote tiver
  // entretanto desaparecido de system_settings — nunca creditar menos do
  // que o que foi prometido ao cliente no checkout.
  const PACKAGES = await loadPackagesFromSettings();
  const pkg = PACKAGES[match.package_id];
  const credits = match.user_id
    ? (pkg ? packageTotalCredits(pkg) : (match.credits || 0))
    : 0;

  let rpcResult;
  try {
    rpcResult = await rpc('confirm_payment_and_credit', {
      p_transaction_id:    match.id,
      p_receipt_hash:      `sms:${reference}`,
      p_receipt_ref:       reference,
      p_confidence:        1.0,
      p_credits:           credits,
      p_user_id:           match.user_id || null,
      p_verification_note: `Confirmado automaticamente via SMS M-Pesa reencaminhado (ref ${reference})`,
    });
  } catch (rpcErr) {
    await notifyTelegram(`⚠️ Falha ao confirmar via SMS (${match.reference_id}): ${rpcErr.message}`);
    return res.status(200).json({ ok: true, error: 'rpc_failed' });
  }

  if (rpcResult?.already_confirmed) {
    // Normal — pode já ter sido confirmado por IA de visão segundos antes.
    return res.status(200).json({ ok: true, already_confirmed: true });
  }

  // Conta avulso sem sessão — mesmo caminho já usado na verificação por imagem.
  // NOVO: credits usa aqui o mesmo total (base + bónus) já calculado acima.
  const avulsoCredits = pkg ? packageTotalCredits(pkg) : (match.credits || 0);
  if (!match.user_id && match.package_id === 'avulso' && avulsoCredits > 0) {
    try {
      const accountInfo = await _createAvulsoAccount({
        reference: match.reference_id, phone: normalizedPhone, credits: avulsoCredits, transactionId: match.id,
      });
      await rpc('add_credits', { user_id: accountInfo.tempUserId, amount: avulsoCredits }).catch(() => {});
      await notifyTelegram(
        `✅ Pagamento avulso confirmado por SMS — conta criada: ${accountInfo.tempEmail}`,
        { silent: true }
      );
    } catch (accErr) {
      await notifyTelegram(`⚠️ SMS confirmou pagamento mas falhou criar conta avulso: ${accErr.message}`);
    }
  }

  logEvent('payment', 'auto_approved_sms', { transactionId: match.id, reference, amount, confirmedAt });
  await notifyTelegram(`✅ Pagamento confirmado automaticamente via SMS — ${amount} MZN`, { silent: true });

  return res.status(200).json({ ok: true, matched: true, transactionId: match.id });
}

module.exports = { handleSmsMpesaWebhook };
