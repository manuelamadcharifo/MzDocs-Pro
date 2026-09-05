// api/_lib/whatsappCloud.js
//
// NOVO (Set/2026): cliente mínimo para a WhatsApp Cloud API oficial da Meta
// (developers.facebook.com) — usado só pelo webhook de recuperação de
// password por WhatsApp (api/whatsapp-webhook.js).
//
// Porquê esta API e não outra coisa: quando um utilizador nos escreve
// primeiro no WhatsApp, a Meta abre uma "janela de serviço" de 24h em que
// responder com texto livre é GRÁTIS e ilimitado (ver documentação oficial
// da Meta, secção "Service conversations"). Esta janela só existe porque a
// mensagem é real e verificada pela própria Meta — daí a verificação de
// assinatura abaixo ser obrigatória, não opcional.
//
// Variáveis de ambiente necessárias (Vercel → Settings → Environment
// Variables), todas obtidas de graça em developers.facebook.com:
//   WHATSAPP_CLOUD_TOKEN     — token de acesso permanente do system user
//   WHATSAPP_PHONE_NUMBER_ID — ID do número de telefone WhatsApp Business
//   WHATSAPP_APP_SECRET      — "App Secret" da app Meta (verificação HMAC)
//   WHATSAPP_VERIFY_TOKEN    — qualquer string à tua escolha (handshake GET)

const crypto = require('crypto');

const GRAPH_VERSION = 'v20.0';

/**
 * Verifica a assinatura HMAC-SHA256 que a Meta envia em todos os pedidos
 * POST ao webhook (header `X-Hub-Signature-256: sha256=...`). Sem isto,
 * qualquer pessoa na internet podia fazer POST directo a este URL fingindo
 * ser a Meta e forjar mensagens "recebidas" de qualquer número.
 *
 * @param {string|Buffer} rawBody - corpo EXACTO do pedido, por assinar (por
 *   isso o endpoint desliga o bodyParser automático da Vercel — ver
 *   api/whatsapp-webhook.js — um JSON.stringify(req.body) reserializado
 *   não bate necessariamente byte-a-byte com o original).
 * @param {string} signatureHeader - valor do header x-hub-signature-256
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false; // sem app secret configurado, recusar por omissão (fail-closed)
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expectedHex = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const providedHex = signatureHeader.slice('sha256='.length);

  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(providedHex, 'hex'));
  } catch {
    return false; // comprimentos diferentes/hex inválido → timingSafeEqual lança excepção
  }
}

/**
 * Envia uma mensagem de texto livre via WhatsApp Cloud API. SÓ funciona
 * dentro da janela de serviço de 24h aberta por uma mensagem real e
 * recente do destinatário — fora dessa janela a Meta rejeita com um erro
 * (nesse caso seria preciso um "template" pré-aprovado, que este fluxo
 * propositadamente evita, para se manter 100% gratuito).
 *
 * @param {string} toDigitsOnly - número de destino, dígitos com código de
 *   país, sem '+' (o mesmo formato que chega no campo `from` do webhook)
 * @param {string} body - texto da mensagem
 * @returns {Promise<{ok: boolean, status: number, body: any}>}
 */
async function sendWhatsAppText(toDigitsOnly, body) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp Cloud API não configurada (WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID em falta)');
  }

  const to = String(toDigitsOnly || '').replace(/\D/g, '');
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: true },
    }),
  });

  const text = await res.text().catch(() => '');
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch { json = text; } }

  return { ok: res.ok, status: res.status, body: json };
}

module.exports = { verifyWebhookSignature, sendWhatsAppText };
