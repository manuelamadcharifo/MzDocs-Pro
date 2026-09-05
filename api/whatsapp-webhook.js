// api/whatsapp-webhook.js — v1.0 (Set/2026)
//
// NOVO: canal de recuperação de password 100% gratuito via WhatsApp,
// complementar ao e-mail (ver api/auth/index.js → handleResetPassword).
//
// PORQUÊ ESTE FICHEIRO É UMA FUNÇÃO À PARTE (não uma acção dentro de
// api/misc.js, o router genérico): a Meta assina cada pedido POST com um
// HMAC (X-Hub-Signature-256) calculado sobre o corpo EXACTO do pedido, em
// bytes. api/misc.js já depende do parsing automático de JSON da Vercel
// (`req.body` pré-processado) para todas as outras acções que já lá vivem
// — desligar isso globalmente para conseguir o corpo em bruto aqui
// arriscava partir esse router inteiro. Uma função isolada, com o seu
// próprio `config.api.bodyParser = false`, evita esse risco por completo.
//
// COMO FUNCIONA (fluxo completo):
//   1. No site, o botão "Recuperar por WhatsApp" abre um link
//      wa.me/<número de suporte>?text=RECUPERAR — o utilizador confirma o
//      envio no próprio WhatsApp dele.
//   2. Isso abre, do lado da Meta, uma janela de 24h em que o NOSSO número
//      pode responder com texto livre, de graça (ver api/_lib/whatsappCloud.js
//      para a explicação completa do porquê disto ser grátis).
//   3. A Meta chama este webhook (POST) com a mensagem recebida.
//   4. Se o texto contiver "recuperar" (case-insensitive — cobre também o
//      texto do botão de "Contactar Suporte" já existente, que embrulha
//      contexto à volta, ver UserModel.openSupport em Models.js), usamos o
//      número de quem escreveu (`from`, verificado pela própria Meta — não
//      é algo que o utilizador possa simplesmente digitar) para procurar a
//      conta e gerar um link de recuperação (adminGenerateRecoveryLink —
//      NÃO depende do envio de e-mail do Supabase), e respondemos com esse
//      link directamente no WhatsApp.
//   5. Qualquer outra mensagem (pedidos de suporte, comprovativos de
//      pagamento, etc.) é ignorada por este código e continua a ser lida
//      manualmente por um humano no WhatsApp, exactamente como já era —
//      este webhook SÓ acrescenta uma resposta automática ao caso
//      específico de "recuperar", nunca substitui o fluxo manual existente.
//
// CONFIGURAÇÃO NECESSÁRIA (Vercel → Settings → Environment Variables — ver
// api/_lib/whatsappCloud.js para onde obter cada uma, todas grátis):
//   WHATSAPP_CLOUD_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET,
//   WHATSAPP_VERIFY_TOKEN
// E, no painel da Meta (developers.facebook.com → a tua app → WhatsApp →
// Configuration → Webhook): Callback URL = https://mzdocs.co.mz/api/whatsapp-webhook,
// Verify Token = o mesmo valor de WHATSAPP_VERIFY_TOKEN, subscrito ao campo
// "messages".

const { normalizeMzPhone } = require('./_lib/phone');
const { verifyWebhookSignature, sendWhatsAppText } = require('./_lib/whatsappCloud');
const { selectOne, adminGenerateRecoveryLink } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');

let logEvent = () => {};
try { ({ logEvent } = require('./_lib/observability')); } catch (_) { /* best-effort, nunca deve bloquear o webhook */ }

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleRecoveryRequest(fromDigits) {
  const normalized = normalizeMzPhone(fromDigits);
  if (!normalized) return;

  // Máx. 1 pedido/hora por número em modo degradado (Redis indisponível),
  // 3/hora em modo normal — ver SENSITIVE_DEGRADED_LIMIT em rateLimit.js.
  const allowed = await checkRateLimit('wa-recover', normalized, { limit: 3, windowSec: 3600 }).catch(() => true);
  if (!allowed) {
    await sendWhatsAppText(fromDigits, 'Já pediste uma recuperação recentemente. Espera um pouco antes de tentar de novo, ou verifica o WhatsApp — o link anterior continua válido.').catch(() => {});
    return;
  }

  // Mesma lógica de correspondência que api/auth/index.js usa para a
  // recuperação por e-mail: procura primeiro por whatsapp, depois por
  // phone — tem de ser exactamente o número declarado no registo.
  const profile = (await selectOne('profiles', 'whatsapp', normalized, 'email').catch(() => null))
                || (await selectOne('profiles', 'phone', normalized, 'email').catch(() => null));

  if (!profile || !profile.email) {
    logEvent('auth', 'reset_password_whatsapp_no_account', {});
    await sendWhatsAppText(
      fromDigits,
      'Não encontrámos nenhuma conta MzDocs Pro registada com este número de WhatsApp. Confirma se é o mesmo número que usaste no registo — ou recupera por e-mail em https://mzdocs.co.mz'
    ).catch(() => {});
    return;
  }

  const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';
  let linkResult;
  try {
    linkResult = await adminGenerateRecoveryLink(profile.email, `${origin}/?reset=true`);
  } catch (err) {
    console.error('[whatsapp-webhook] Excepção ao gerar link:', err.message);
    linkResult = { ok: false, status: 0, body: err.message };
  }

  if (linkResult.ok && linkResult.body?.action_link) {
    logEvent('auth', 'reset_password_whatsapp_sent', {});
    await sendWhatsAppText(
      fromDigits,
      `🔑 Aqui está o teu link de recuperação de password do MzDocs Pro:\n${linkResult.body.action_link}\n\nVálido por tempo limitado. Se não pediste isto, ignora esta mensagem.`
    ).catch(() => {});
  } else {
    console.error('[whatsapp-webhook] Falha ao gerar link de recuperação:', linkResult.status, JSON.stringify(linkResult.body));
    logEvent('auth', 'reset_password_whatsapp_send_failed', { status: linkResult.status });
    await sendWhatsAppText(
      fromDigits,
      'Não conseguimos gerar o link de recuperação agora. Tenta novamente daqui a alguns minutos, ou usa a opção "Recuperar por e-mail" no site.'
    ).catch(() => {});
  }
}

async function handler(req, res) {
  // --- Handshake de verificação (feito uma única vez, ao configurar o
  // webhook no painel da Meta) ---
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Verificação falhou');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const rawBody = await readRawBody(req);

  const signature = req.headers['x-hub-signature-256'];
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[whatsapp-webhook] Assinatura inválida — pedido ignorado.');
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }

  // Responder já à Meta — se demorarmos ou não respondermos 200, a Meta
  // reenvia o mesmo evento repetidamente. O processamento real (que pode
  // envolver 2-3 pedidos de rede: perfil + geração de link + envio) corre
  // depois, de forma best-effort.
  res.status(200).json({ received: true });

  try {
    const changes = payload?.entry?.[0]?.changes || [];
    for (const change of changes) {
      const messages = change?.value?.messages;
      if (!Array.isArray(messages)) continue; // pode ser um "status" (entregue/lido), não uma mensagem

      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.from) continue;
        const text = String(msg.text?.body || '').trim().toLowerCase();
        if (!text.includes('recuperar')) continue; // não é um pedido de recuperação — ignorar, deixar para leitura manual como já era

        await handleRecoveryRequest(msg.from);
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] Erro a processar evento:', err.message);
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
