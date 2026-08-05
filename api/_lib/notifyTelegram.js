// api/_lib/notifyTelegram.js — alerta por Telegram para eventos que
// precisam da tua atenção (pagamento em revisão manual, falha grave, etc.)
// ──────────────────────────────────────────────────────────────────────────
// COMO CONFIGURAR (5 minutos):
//  1. No Telegram, fala com @BotFather → /newbot → segue as instruções →
//     copia o token que ele te dá (parece "123456789:AAF...").
//  2. Envia UMA mensagem qualquer ao teu bot novo (tem de ser o primeiro
//     contacto, senão ele não te consegue responder).
//  3. Abre no browser (troca <TOKEN> pelo teu):
//     https://api.telegram.org/bot<TOKEN>/getUpdates
//     Procura "chat":{"id": NÚMERO — esse número é o teu TELEGRAM_CHAT_ID.
//  4. Na Vercel → Settings → Environment Variables, adiciona:
//     TELEGRAM_BOT_TOKEN = <o token do passo 1>
//     TELEGRAM_CHAT_ID   = <o número do passo 3>
//
// Se quiseres que a equipa toda receba (não só tu), cria um grupo,
// adiciona o bot a ele, e usa o chat_id NEGATIVO do grupo (o getUpdates
// mostra isso da mesma forma depois de escreveres algo no grupo).
//
// DESIGN: esta função NUNCA lança excepção — um alerta falhado não pode
// derrubar um pagamento ou uma geração de documento. Se as variáveis não
// estiverem configuradas, sai em silêncio (fail-open, não fail-closed —
// ao contrário da verificação de assinatura de webhook, que é o oposto
// de propósito).
// ──────────────────────────────────────────────────────────────────────────

/**
 * @param {string} text — suporta formatação Markdown do Telegram (*negrito*, _itálico_, `código`).
 * @param {{ silent?: boolean }} [opts] — silent:true não faz o telemóvel vibrar (útil para alertas informativos, não urgentes).
 */
async function notifyTelegram(text, opts = {}) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[notifyTelegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados — alerta ignorado:', text.slice(0, 80));
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_notification: !!opts.silent,
      }),
      signal: AbortSignal.timeout(5000), // nunca deixar um alerta lento atrasar o pedido que o disparou
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[notifyTelegram] Telegram devolveu erro:', res.status, body.slice(0, 200));
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn('[notifyTelegram] falha ao enviar alerta:', err.message);
    return { sent: false, reason: err.message };
  }
}

/** Atalho pronto para o caso mais comum: pagamento caiu em revisão manual. */
function notifyPaymentNeedsReview({ transactionId, packageId, amount, phone, reason, confidence }) {
  const text =
    `⚠️ *Pagamento a aguardar revisão manual*\n` +
    `Pacote: ${packageId || '—'}  ·  Valor: ${amount ?? '—'} MZN\n` +
    `Telefone: ${phone || '—'}\n` +
    `Motivo: ${reason || '—'}` +
    (confidence != null ? `\nConfiança da IA: ${(confidence * 100).toFixed(0)}%` : '') +
    `\nID: \`${transactionId}\``;
  // Fire-and-forget deliberado — quem chama isto (ex. _markReviewNeeded)
  // não deve esperar pela resposta do Telegram nem falhar se ela demorar.
  return notifyTelegram(text);
}

module.exports = { notifyTelegram, notifyPaymentNeedsReview };
