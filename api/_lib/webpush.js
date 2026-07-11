// api/_lib/webpush.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// Wrapper fino sobre o pacote 'web-push' para notificações push reais
// (Android/Chrome/Edge — mostradas pelo próprio sistema operativo, mesmo
// com a app fechada, uma vez instalada como PWA).
//
// Requer três variáveis de ambiente na Vercel:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex: mailto:suporte@mzdocs.co.mz)
// Gerar um par de chaves novo com: npx web-push generate-vapid-keys
// ──────────────────────────────────────────────────────────────────────────

const webpush = require('web-push');
const { restRequest } = require('./supabaseAdmin');

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:suporte@mzdocs.co.mz';
  if (!pub || !priv) {
    const err = new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas no servidor.');
    err.code = 'VAPID_NOT_CONFIGURED';
    throw err;
  }
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

/**
 * Envia uma notificação push para uma lista de subscrições e remove
 * automaticamente as que estejam mortas (410 Gone / 404 Not Found — o
 * browser desinstalou a app ou revogou a permissão).
 *
 * @param {Array<{id:string, endpoint:string, p256dh:string, auth:string}>} subscriptions
 * @param {{title:string, body:string, url?:string, icon?:string}} payload
 * @returns {Promise<{sent:number, failed:number, pruned:number}>}
 */
async function sendPushToSubscriptions(subscriptions, payload) {
  ensureConfigured();
  let sent = 0, failed = 0;
  const deadIds = [];

  const jobs = subscriptions.map(async (s) => {
    const pushSub = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webpush.sendNotification(pushSub, JSON.stringify({
        title: payload.title || 'MzDocs Pro',
        body:  payload.body  || '',
        url:   payload.url   || '/',
        icon:  payload.icon  || '/assets/icons/icon-192x192.png',
      }));
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = subscrição inválida/expirada, deve ser removida da BD.
      if (err.statusCode === 404 || err.statusCode === 410) deadIds.push(s.id);
      else console.warn('[webpush] Falha a enviar para', s.endpoint.slice(0, 60), '—', err.statusCode || err.message);
    }
  });

  await Promise.all(jobs);

  if (deadIds.length) {
    try {
      await restRequest(`push_subscriptions?id=in.(${deadIds.join(',')})`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[webpush] Falha ao limpar subscrições mortas:', e.message);
    }
  }

  return { sent, failed, pruned: deadIds.length };
}

module.exports = { sendPushToSubscriptions };
