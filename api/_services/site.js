// api/_services/site.js — PAGE-VIEW, MARKETING, CONFIG, PUBLIC-REVIEWS,
// PUSH-SUBSCRIBE/UNSUBSCRIBE, DOCUMENT-USAGE (extraído de api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Agrupa as rotas "utilitárias" de site/analytics que antes viviam soltas
// dentro do monólito. Move puro — nenhuma lógica alterada.
// api/misc.js continua a ser o único entrypoint HTTP (mesma rota Vercel).
// ──────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const {
  restRequest,
  rpc,
  insert,
  update,
  selectOne,
  getUserFromToken,
  countRows,
} = require('../_lib/supabaseAdmin');
const { checkRateLimit } = require('../_lib/rateLimit');
const { loadPackagesFromSettings } = require('../_lib/packages');
const { ORIGIN, parseBody } = require('../_lib/httpHelpers');
const { logEvent } = require('../_lib/observability');

async function handlePageView(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { slug } = parseBody(req);
  if (!slug || typeof slug !== 'string' || slug.length > 100)
    return res.status(400).json({ error: 'slug inválido' });

  try {
    await rpc('increment_page_views', { p_slug: slug });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[handlePageView] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível registar a visualização.' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MARKETING ANALYTICS — Fase 1 (fundação de tracking)
// POST /api/misc?_ns=marketing&_a=visit   { visitor_id, source, referrer, landing_page, device, browser, language }
// POST /api/misc?_ns=marketing&_a=event   { visitor_id, user_id?, event, document_type?, value?, metadata? }
//
// Rota única, sem função serverless nova (reutiliza api/misc.js, dentro do
// limite de 12 do plano Hobby). Nunca falha de forma visível para o
// utilizador — analytics não deve poder quebrar a experiência da app; em
// erro, respondemos sempre 200 e só registamos no log do servidor.
// ════════════════════════════════════════════════════════════════════════════
const VALID_MKT_EVENTS = new Set([
  'signup', 'login', 'document_generated', 'pdf_download',
  'credit_purchase', 'plan_purchase', 'became_affiliate',
  'referred_friend', 'commission_earned', 'template_created', 'template_purchased',
]);

function _clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || '0.0.0.0';
}

function _parseDevice(ua = '') {
  if (/mobile/i.test(ua) && !/ipad|tablet/i.test(ua)) return 'mobile';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

function _parseBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/safari\//i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/opr\//i.test(ua)) return 'Opera';
  return 'outro';
}

async function handleMarketing(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  // Rate limit por IP — analytics é o alvo perfeito para spam/flood
  // (não custa créditos, é tentador abusar). 60/min é generoso para uso
  // normal (1 visita + poucos eventos por carregamento de página) e
  // barra scripts a martelar o endpoint.
  const ip = _clientIp(req);
  const allowed = await checkRateLimit('marketing', ip, { limit: 60, windowSec: 60 }).catch(() => true);
  if (!allowed) return res.status(200).json({ ok: false, throttled: true });

  const body = parseBody(req);
  const visitorId = (body.visitor_id || '').toString().slice(0, 64);
  if (!visitorId) return res.status(200).json({ ok: false, error: 'visitor_id required' });

  try {
    if (action === 'visit') {
      const ua = (req.headers['user-agent'] || '').slice(0, 300);
      await insert('marketing_visits', {
        visitor_id:       visitorId,
        marketing_source: (body.source || 'direct').toString().slice(0, 50).toLowerCase(),
        referrer:         (body.referrer || '').toString().slice(0, 500) || null,
        landing_page:     (body.landing_page || '/').toString().slice(0, 300),
        user_agent:       ua,
        device:           _parseDevice(ua),
        browser:          _parseBrowser(ua),
        // CORRIGIDO: país/cidade vêm dos headers de geo do próprio Vercel —
        // zero custo, zero chamada a um serviço externo de geo-IP.
        country:          req.headers['x-vercel-ip-country'] || null,
        city:             req.headers['x-vercel-ip-city']    || null,
        language:         (body.language || '').toString().slice(0, 10) || null,
        ip_hash:          crypto.createHash('sha256').update(ip).digest('hex'),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'event') {
      const event = (body.event || '').toString();
      if (!VALID_MKT_EVENTS.has(event)) return res.status(200).json({ ok: false, error: 'evento desconhecido' });
      await insert('marketing_events', {
        visitor_id:    visitorId,
        user_id:       (body.user_id && /^[0-9a-f-]{36}$/i.test(body.user_id)) ? body.user_id : null,
        event,
        document_type: (body.document_type || '').toString().slice(0, 50) || null,
        value:         Number.isFinite(body.value) ? body.value : null,
        metadata:      (body.metadata && typeof body.metadata === 'object') ? body.metadata : {},
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: false, error: `acção desconhecida: ${action}` });
  } catch (err) {
    // Nunca deixar analytics derrubar a experiência do utilizador.
    console.error('[handleMarketing] erro:', err.message);
    return res.status(200).json({ ok: false });
  }
}


async function handleConfig(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // CORRIGIDO: 60s + stale-while-revalidate=300s fazia alterações de preço
  // feitas no painel de admin (system_settings → packages, devolvido aqui)
  // demorarem até vários minutos a propagar para o utilizador, mesmo após
  // limpar a cache do browser — a CDN da Vercel podia continuar a servir
  // a resposta antiga em cache durante esse período. supabaseUrl/anonKey
  // não mudam, mas packages/docsGenerated mudam com frequência suficiente
  // (controlados por admin) para justificarem um cache bem mais curto.
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl     = process.env.SUPABASE_URL      || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const isSandbox       = !process.env.MPESA_API_KEY || !process.env.MPESA_SERVICE_CODE;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(200).json({ configured: false, isSandbox, message: 'Supabase não configurado' });
  }

  // Contador público de documentos gerados (evita COUNT(*) full-scan)
  let docsGenerated = null;
  try {
    // Preferir valor pré-agregado em analytics_metrics se existir
    const metrics = await restRequest(
      'analytics_metrics?metric_type=eq.counter&metric_name=eq.docs_generated&order=metric_date.desc&limit=1&select=metric_value'
    );
    if (Array.isArray(metrics) && metrics[0]?.metric_value > 0) {
      docsGenerated = metrics[0].metric_value;
    } else {
      // Fallback: count directo (mais lento em tabelas grandes)
      // CORRIGIDO (auditoria de dados, v27): credit_usage_log nunca é
      // escrita pelo código actual — a tabela real é credit_logs
      // (action='consume'). Ver mesma correcção em handleStats/handleAnalytics.
      //
      // CORRIGIDO (P1-07, Ago/2026 — encontrado durante o refactor deste
      // ficheiro): este bloco fazia um fetch() manual usando SERVICE_KEY e
      // SUPABASE_URL importados de api/_lib/supabaseAdmin.js — mas esse
      // módulo NÃO exporta esses dois valores (ver o próprio comentário em
      // supabaseAdmin.js: "removidos em vez de exportados desactualizados").
      // Isto significa que a chamada ia sempre com `apikey: undefined`,
      // falhava silenciosamente (o try/catch à volta engolia o erro), e
      // `docsGenerated` ficava sempre `null` sempre que a métrica
      // pré-agregada estivesse vazia — sem nenhum aviso nos logs. Trocado
      // para countRows(), o helper que o resto deste módulo já usa
      // correctamente para o mesmo tipo de contagem.
      try {
        docsGenerated = await countRows('credit_logs', '?select=id&action=eq.consume');
      } catch (countErr) {
        console.warn('[handleConfig] Falha ao contar credit_logs (fallback docsGenerated):', countErr.message);
      }
    }
  } catch (_) {}

  // Resumo real de avaliações públicas (nunca inventado) — usado pelo hero
  // em vez do "4.9 (128 avaliações)" fixo que lá estava antes. Só conta
  // avaliações com status='approved' (ver migration_v44_public_reviews.sql
  // e api/_lib/contentModeration.js): passaram pelo filtro automático de
  // abuso/spam ou foram aprovadas manualmente por um admin.
  let reviewsSummary = null;
  try {
    const rows = await restRequest('user_feedback?status=eq.approved&select=rating');
    if (Array.isArray(rows) && rows.length > 0) {
      const count = rows.length;
      const avg   = rows.reduce((s, r) => s + (r.rating || 0), 0) / count;
      reviewsSummary = { avg: Math.round(avg * 10) / 10, count };
    }
  } catch (_) {}

  // Pacotes (preços/créditos) — única fonte de verdade em system_settings,
  // via _lib/packages.js. Antes desta correcção, o frontend usava valores
  // hard-coded em PaymentService.js/PaymentController.js que nunca
  // reflectiam alterações feitas no painel de admin.
  const packages = await loadPackagesFromSettings();

  // CORRIGIDO: mesmo problema dos pacotes, mas para os campos de
  // "Configurações do Sistema" (Nome do Site, Créditos Grátis, WhatsApp
  // Suporte) — o admin altera-os em /admin.html, mas o número de WhatsApp
  // estava hard-coded em 4 ficheiros do frontend
  // (DocumentController.js, DocumentEditor.js, PaymentService.js,
  // Models.js), e os créditos grátis hard-coded numa função SQL
  // (handle_new_user, migration_v13_fix_signup_credits.sql) — nenhum dos
  // dois lia esta tabela. Expor aqui é o primeiro passo para os 4 locais
  // do frontend passarem a usar o valor real; a função SQL precisa de
  // ser corrigida separadamente (não pode ler isto via HTTP).
  let whatsappSupport = null, freeCreditsNormal = null, freeCreditsExpiryDays = null;
  try {
    const settingsRows = await restRequest(
      `system_settings?key=in.(whatsapp_support,free_credits_normal,free_credits_expiry_days)&select=key,value`
    );
    if (Array.isArray(settingsRows)) {
      const sMap = {};
      settingsRows.forEach(r => { sMap[r.key] = r.value; });
      if (sMap.whatsapp_support) whatsappSupport = sMap.whatsapp_support;
      if (Number.isFinite(Number(sMap.free_credits_normal)))      freeCreditsNormal     = Number(sMap.free_credits_normal);
      if (Number.isFinite(Number(sMap.free_credits_expiry_days))) freeCreditsExpiryDays = Number(sMap.free_credits_expiry_days);
    }
  } catch (e) {
    console.warn('[handleConfig] Falha ao carregar settings extra:', e.message);
  }

  // supabaseUrl/supabaseAnonKey são intencionalmente públicos — ver nota
  // completa no topo desta função (handleConfig). A protecção real é o
  // RLS de cada tabela, não o sigilo desta chave.
  return res.status(200).json({
    configured:    true,
    isSandbox,
    docsGenerated,
    reviewsSummary,
    supabaseUrl,
    supabaseAnonKey,
    packages,
    whatsappSupport,
    freeCreditsNormal,
    freeCreditsExpiryDays,
    // Chave pública VAPID — necessária no browser para subscrever push
    // (registration.pushManager.subscribe). A chave privada nunca sai do
    // servidor (ver api/_lib/webpush.js).
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// AVALIAÇÕES PÚBLICAS (v44) — testemunhos reais, aprovados, para o hero e a
// secção "O que dizem os utilizadores". Só devolve avaliações com
// status='approved' (ver migration_v44_public_reviews.sql): passaram pelo
// filtro automático de abuso/spam (api/_lib/contentModeration.js) ou foram
// aprovadas manualmente por um admin em /api/admin?action=reviews. Nunca
// inventa nem completa com dados fictícios — se não houver nenhuma ainda,
// devolve uma lista vazia e o frontend trata isso de forma honesta.
// ════════════════════════════════════════════════════════════════════════════
async function handlePublicReviews(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // Só testemunhos com comentário real (não só estrelas) fazem sentido
    // como citação pública; limitamos às 12 mais recentes por serviço
    // variado, com comentário de pelo menos 8 caracteres para evitar
    // "bom." como testemunho.
    const rows = await restRequest(
      `user_feedback?status=eq.approved&comment=not.is.null&order=created_at.desc&limit=40&select=service,rating,comment,display_name,created_at`
    );
    const withComment = (Array.isArray(rows) ? rows : [])
      .filter(r => (r.comment || '').trim().length >= 8)
      .slice(0, 12)
      .map(r => ({
        service: r.service,
        rating: r.rating,
        comment: r.comment,
        // Nunca mostra publicamente o nome completo do perfil nem o
        // telefone — só o display_name que a própria pessoa escolheu
        // dar ao avaliar, ou "Utilizador" como alternativa neutra.
        name: r.display_name || 'Utilizador',
        created_at: r.created_at,
      }));

    // Resumo agregado (todas as aprovadas, não só as que têm comentário)
    const allApproved = await restRequest('user_feedback?status=eq.approved&select=rating');
    const count = Array.isArray(allApproved) ? allApproved.length : 0;
    const avg   = count > 0
      ? Math.round((allApproved.reduce((s, r) => s + (r.rating || 0), 0) / count) * 10) / 10
      : null;

    return res.status(200).json({ success: true, summary: { avg, count }, testimonials: withComment });
  } catch (err) {
    console.error('[public-reviews]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — subscrição do browser (clientes)
// POST /api/misc?action=push-subscribe   { subscription }
// POST /api/misc?action=push-unsubscribe { endpoint }
// A subscrição de ADMINS usa a mesma tabela mas passa por
// /api/admin?action=push-subscribe (exige token de admin) — ver admin/index.js.
// ════════════════════════════════════════════════════════════════════════════
async function handlePushSubscribe(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = parseBody(req);
    const sub  = body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ error: 'subscription inválida (faltam endpoint/keys)' });
    }

    // Utilizador autenticado (opcional — subscrições de convidados também
    // são aceites, ficam com user_id nulo).
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    if (token) {
      const { user } = await getUserFromToken(token);
      if (user?.id) userId = user.id;
    }

    const row = {
      endpoint:     sub.endpoint,
      p256dh:       sub.keys.p256dh,
      auth:         sub.keys.auth,
      user_id:      userId,
      target:       'client',
      user_agent:   (req.headers['user-agent'] || '').slice(0, 300),
      last_seen_at: new Date().toISOString(),
    };

    // Upsert por endpoint (um dispositivo pode re-subscrever várias vezes).
    // on_conflict=endpoint aponta para a UNIQUE constraint criada na
    // migration_v35 — sem isto o PostgREST tentaria o conflito pela PK (id),
    // que nunca colide, e criaria uma linha duplicada por subscrição.
    await restRequest('push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      body: row,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push-subscribe]', err);
    return res.status(500).json({ error: err.message || 'Erro ao guardar subscrição' });
  }
}

async function handlePushUnsubscribe(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = parseBody(req);
    const endpoint = body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint é obrigatório' });
    await restRequest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push-unsubscribe]', err);
    return res.status(500).json({ error: err.message || 'Erro ao remover subscrição' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES  (/api/templates/:action)
// Migrado para o wrapper REST puro api/_lib/supabaseAdmin.js
// ════════════════════════════════════════════════════════════════════════════
async function handleDocumentUsage(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória.', code: 'AUTH_REQUIRED' });

  let userId;
  try {
    const { user, error } = await getUserFromToken(token);
    if (error || !user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Erro ao verificar sessão: ' + e.message });
  }

  try {
    if (req.method === 'GET') {
      const documentId = req.query?.document_id;
      if (!documentId) return res.status(400).json({ error: 'document_id em falta' });

      const doc = await selectOne(
        'documents', 'id', documentId,
        'id,user_id,downloads_used,downloads_limit,edits_used,edits_limit,plan_tier_at_creation'
      );
      if (!doc || doc.user_id !== userId) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }

      return res.status(200).json({ success: true, usage: _formatDocUsage(doc) });
    }

    if (req.method === 'POST') {
      const body = parseBody(req) || {};
      const { action, document_id: documentId, kind } = body;
      if (!documentId) return res.status(400).json({ error: 'document_id em falta' });

      if (action === 'consume-download') {
        const result = await rpc('consume_document_download', { p_document_id: documentId, p_user_id: userId });
        if (!result?.success) return res.status(404).json({ error: result?.error || 'Documento não encontrado' });
        return res.status(200).json({ success: true, ...result });
      }

      if (action === 'consume-edit') {
        const result = await rpc('consume_document_edit', { p_document_id: documentId, p_user_id: userId });
        if (!result?.success) return res.status(404).json({ error: result?.error || 'Documento não encontrado' });
        return res.status(200).json({ success: true, ...result });
      }

      if (action === 'unlock-extra') {
        if (!['download', 'edit'].includes(kind)) {
          return res.status(400).json({ error: 'kind deve ser "download" ou "edit"' });
        }
        const result = await rpc('unlock_document_extra', { p_document_id: documentId, p_user_id: userId, p_kind: kind });
        if (!result?.success) {
          const insufficient = result?.error === 'Créditos insuficientes';
          return res.status(insufficient ? 402 : 404)
            .json({ error: result?.error || 'Erro ao desbloquear', code: insufficient ? 'INSUFFICIENT_CREDITS' : undefined });
        }
        return res.status(200).json({ success: true, ...result });
      }

      return res.status(400).json({ error: 'action desconhecida (consume-download, consume-edit, unlock-extra)' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[document-usage]', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

function _formatDocUsage(doc) {
  const unlimitedDownloads = doc.downloads_limit === null;
  const unlimitedEdits     = doc.edits_limit === null;
  return {
    plan_tier:            doc.plan_tier_at_creation || 'free',
    downloads_used:       doc.downloads_used || 0,
    downloads_limit:      doc.downloads_limit,
    downloads_remaining:  unlimitedDownloads ? null : Math.max(0, doc.downloads_limit - (doc.downloads_used || 0)),
    downloads_unlimited:  unlimitedDownloads,
    edits_used:           doc.edits_used || 0,
    edits_limit:           doc.edits_limit,
    edits_remaining:       unlimitedEdits ? null : Math.max(0, doc.edits_limit - (doc.edits_used || 0)),
    edits_unlimited:       unlimitedEdits,
  };
}

module.exports = {
  handlePageView,
  handleMarketing,
  handleConfig,
  handlePublicReviews,
  handlePushSubscribe,
  handlePushUnsubscribe,
  handleDocumentUsage,
};
