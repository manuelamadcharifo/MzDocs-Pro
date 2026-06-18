// api/misc.js — v3.0 (Verificação automática de comprovativos)
// ALTERAÇÕES v3.0:
//  1. NOVA rota POST /api/verify-receipt — valida comprovativos M-Pesa/e-Mola/mKesh
//     via IA visão (Gemini/OpenRouter), aprovação automática se confidence >= 0.85,
//     fallback para revisão manual admin se confidence < 0.85.
//  2. Helper verifyReceiptInternal() exportado para uso em process-payment.js.
//  3. Rate limit de 3 uploads/IP/min para verify-receipt (anti-fraude).
//  4. Hash SHA-256 do comprovativo para evitar reutilização (anti-fraude).
//  5. Usa api/_lib/visionAI.js em vez de chamadas directas à API Gemini.
//
// Alterações v2.0 mantidas integralmente.

const crypto  = require('crypto');
const { analyzeImage, parseJSON: parseVisionJSON } = require('./_lib/visionAI');

const {
  restRequest,
  rpc,
  getUserFromToken,
  selectOne,
  insert,
  update,
  SUPABASE_URL,
  SERVICE_KEY,
} = require('./_lib/supabaseAdmin');

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');
const ORIGIN   = SITE_URL;

// Instância SDK mínima (SEM ws, SEM realtime) para operações que ainda
// usam métodos do SDK como .rpc(), .auth.getUser() — apenas em funções
// de afiliados e templates, enquanto não forem migradas para fetch puro.
function makeSdkClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth:     { autoRefreshToken: false, persistSession: false },
    realtime: { enabled: false }, // desliga Realtime completamente — sem ws
  });
}

const STATIC_PAGES = [
  { loc: '/',                                            priority: '1.0', changefreq: 'weekly'  },
  { loc: '/pages/',                                      priority: '0.7', changefreq: 'weekly'  },
  { loc: '/pages/como-fazer-cv-mocambique.html',         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-formal-mocambique.html',          priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-recomendacao-mocambique.html',    priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/contrato-arrendamento-mocambique.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-residencia-mocambique.html', priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/plano-negocios-mocambique.html',        priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/procuracao-mocambique.html',            priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/recibo-pagamento-mocambique.html',      priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/requerimento-emprego-mocambique.html',  priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/trabalho-escolar-mocambique.html',      priority: '0.8', changefreq: 'monthly' },
  { loc: '/parceiros.html',                              priority: '0.6', changefreq: 'monthly' },
  { loc: '/legal.html',                                  priority: '0.3', changefreq: 'monthly' },
];

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

async function getUser(supabase, req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  return data?.user || null;
}

// ── Main router ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const urlPath     = (req.url || '').split('?')[0];
  const pathParts   = urlPath.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const q           = req.query || {};

  if (q._ns === 'affiliate') return handleAffiliate(q._a || lastSegment || '', req, res);
  if (q._ns === 'templates') return handleTemplates(q._a || 'list', req, res);

  const isAffiliate = pathParts.includes('affiliate');
  if (isAffiliate) return handleAffiliate(lastSegment === 'affiliate' ? (q.action || '') : lastSegment, req, res);

  const isTemplates = pathParts.includes('templates');
  if (isTemplates) return handleTemplates(lastSegment === 'templates' ? (q.action || 'list') : lastSegment, req, res);

  const action = (lastSegment && lastSegment !== 'misc') ? lastSegment : (q.action || '');

  if (action === 'page-view')                           return handlePageView(req, res);
  if (action === 'sitemap.xml' || action === 'sitemap') return handleSitemap(req, res);
  if (action === 'ocr-analyze')                         return handleOcrAnalyze(req, res);
  if (action === 'config' || action === 'misc')         return handleConfig(req, res);
  if (action === 'verify-receipt')                      return handleVerifyReceipt(req, res);

  return res.status(404).json({ error: `Rota desconhecida: "${action}".` });
};

// ════════════════════════════════════════════════════════════════════════════
// VERIFY-RECEIPT — validação automática de comprovativos por IA
// POST /api/verify-receipt
// ════════════════════════════════════════════════════════════════════════════

const _receiptRateMap = new Map(); // IP → { count, reset }

function checkReceiptRateLimit(ip) {
  const key     = `rl:receipt:${ip}`;
  const limit   = 3;         // max 3 uploads por IP por minuto
  const window  = 60 * 1000; // 1 minuto
  const now     = Date.now();
  const entry   = _receiptRateMap.get(key) || { count: 0, reset: now + window };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window; }
  entry.count++;
  _receiptRateMap.set(key, entry);
  return entry.count <= limit;
}

const PACKAGES = {
  avulso:  { credits: 3,   price: 50   },
  starter: { credits: 10,  price: 120  },
  basico:  { credits: 25,  price: 280  },
  pro:     { credits: 60,  price: 600  },
  empresa: { credits: 150, price: 1500 },
};

const RECEIPT_PROMPT = (wallet) =>
  `Analisa este comprovativo de transferência ${wallet}. ` +
  `Extrai os dados e responde APENAS em JSON válido (sem markdown, sem texto extra): ` +
  `{"valid":boolean,"amount":number,"reference":"string","recipient_phone":"string","status":"string","transaction_date":"string","confidence":0.0}. ` +
  `"valid" é true se a transferência foi bem-sucedida. ` +
  `"status" deve ser um de: SUCESSO, CONFIRMADO, PENDENTE, FALHA. ` +
  `"confidence" é a tua certeza de 0.0 a 1.0 de que extraíste os dados correctamente. ` +
  `"amount" é o valor em MZN como número. ` +
  `"reference" é o código/número de referência da transacção. ` +
  `"recipient_phone" é o número do destinatário. ` +
  `"transaction_date" é a data/hora no formato ISO 8601.`;

/**
 * verifyReceiptInternal — lógica de verificação reutilizável.
 * Chamado por handleVerifyReceipt e por process-payment.js directamente.
 *
 * @param {object} params
 * @param {string} params.imageBase64
 * @param {string} params.mimeType
 * @param {string} params.reference    — referência da transacção em transactions
 * @param {string} params.phone        — número normalizado (+258...)
 * @param {number} params.amount       — valor esperado em MZN
 * @param {string} params.wallet       — 'M-Pesa' | 'e-Mola' | 'mKesh'
 * @param {string} params.userId       — UUID do utilizador (pode ser null)
 * @param {string} params.transactionId — ID da linha em transactions
 * @param {string} params.packageId    — chave do pacote (avulso/starter/...)
 * @returns {Promise<object>} resultado da verificação
 */
async function verifyReceiptInternal({ imageBase64, mimeType, reference, phone, amount, wallet, userId, transactionId, packageId }) {

  // ── 1. Sanitizar imagem ────────────────────────────────────────────────
  const MAX_B64 = 2 * 1024 * 1024 * 1.37; // ~2MB em base64 (~2.74MB string)
  if (!imageBase64 || imageBase64.length > MAX_B64) {
    return { success: false, error: 'Imagem inválida ou demasiado grande (máx 2MB)' };
  }
  const imgMime = (mimeType || 'image/jpeg');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(imgMime)) {
    return { success: false, error: 'Formato de imagem não suportado. Use JPEG ou PNG.' };
  }

  // ── 2. Hash do comprovativo (anti-fraude: evita reutilização) ──────────
  const receiptHash = crypto.createHash('sha256').update(imageBase64.slice(0, 5000)).digest('hex');

  // Verificar se este hash já foi processado com sucesso
  try {
    const existing = await restRequest(
      `transactions?receipt_hash=eq.${receiptHash}&status=eq.confirmed&select=reference_id&limit=1`
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return {
        success:      false,
        verified:     false,
        autoApproved: false,
        error:        'Este comprovativo já foi utilizado anteriormente.',
        code:         'DUPLICATE_RECEIPT',
      };
    }
  } catch (_) { /* coluna pode não existir ainda — ignorar */ }

  // ── 3. Chamar IA visão ─────────────────────────────────────────────────
  let aiResult;
  try {
    const rawText = await analyzeImage(imageBase64, RECEIPT_PROMPT(wallet || 'móvel'), {
      mimeType:  imgMime,
      logPrefix: 'verify-receipt',
    });
    aiResult = parseVisionJSON(rawText);
  } catch (aiErr) {
    console.error('[verify-receipt] IA falhou:', aiErr.message);
    // Falha da IA → colocar em revisão manual sem rejeitar automaticamente
    await _markReviewNeeded(transactionId, receiptHash, 0, 'Falha de IA: ' + aiErr.message);
    return {
      success:      true,
      verified:     false,
      autoApproved: false,
      nextStep:     'awaiting_review',
      message:      'Não foi possível validar automaticamente. Receberá confirmação em até 15 min.',
    };
  }

  const confidence = Number(aiResult.confidence) || 0;
  const aiAmount   = Number(aiResult.amount) || 0;
  const aiStatus   = String(aiResult.status || '').toUpperCase();
  const aiRef      = String(aiResult.reference || '');
  const aiDate     = aiResult.transaction_date || '';

  console.log('[verify-receipt] IA resultado:', { confidence, aiAmount, aiStatus, aiRef });

  // ── 4. Validações de negócio ───────────────────────────────────────────
  const pkg = PACKAGES[packageId];

  // 4a. Verificar se referência já confirmada noutras transacções
  let alreadyConfirmed = false;
  if (aiRef) {
    try {
      const refs = await restRequest(
        `transactions?receipt_ref=eq.${encodeURIComponent(aiRef)}&status=eq.confirmed&select=id&limit=1`
      );
      alreadyConfirmed = Array.isArray(refs) && refs.length > 0;
    } catch (_) {}
  }

  // 4b. Verificar data (máx 60 min de tolerância — cobre erros de relógio)
  let dateOk = false;
  if (aiDate) {
    try {
      const txTime   = new Date(aiDate).getTime();
      const diffMins = (Date.now() - txTime) / 60000;
      dateOk = diffMins >= 0 && diffMins <= 60;
    } catch (_) {}
  }

  // 4c. Valor corresponde ao pacote esperado (tolerância de 1 MZN)
  const amountOk = pkg ? Math.abs(aiAmount - pkg.price) <= 1 : false;

  // 4d. Status de sucesso
  const statusOk = ['SUCESSO', 'CONFIRMADO', 'APPROVED', 'SUCCESS'].includes(aiStatus);

  const allChecksPass = !alreadyConfirmed && dateOk && amountOk && statusOk;

  // ── 5. Decisão: aprovação automática ou revisão manual ─────────────────
  if (confidence >= 0.85 && allChecksPass) {
    // ── APROVAÇÃO AUTOMÁTICA ───────────────────────────────────────────
    try {
      const credits = pkg ? pkg.credits : 0;

      // 5a. Atualizar transacção → confirmed
      await restRequest(
        `transactions?id=eq.${transactionId}`,
        {
          method: 'PATCH',
          body: {
            status:              'confirmed',
            confirmed_at:        new Date().toISOString(),
            receipt_hash:        receiptHash,
            receipt_verified:    true,
            receipt_confidence:  confidence,
            verification_method: 'auto',
            receipt_ref:         aiRef || null,
          },
          prefer: 'return=minimal',
        }
      );

      // 5b. Adicionar créditos ao utilizador
      if (userId && credits > 0) {
        await rpc('add_credits', { user_id: userId, amount: credits });

        // 5c. Registar em credit_logs
        await insert('credit_logs', {
          user_id:        userId,
          transaction_id: transactionId,
          action:         'bonus',
          credits:        credits,
          document_type:  null,
          note:           `Pagamento auto-verificado — pacote ${packageId} (confidence: ${confidence.toFixed(2)})`,
        }).catch(e => console.warn('[verify-receipt] credit_logs insert:', e.message));
      }

      console.log('[verify-receipt] AUTO-APROVADO:', transactionId, 'créditos:', credits);

      return {
        success:      true,
        verified:     true,
        autoApproved: true,
        creditsAdded: credits,
        nextStep:     'completed',
        message:      `Pagamento confirmado! ${credits} créditos adicionados à sua conta.`,
      };

    } catch (confirmErr) {
      console.error('[verify-receipt] Erro ao confirmar transacção:', confirmErr.message);
      // Falha ao gravar → revisão manual como fallback seguro
      await _markReviewNeeded(transactionId, receiptHash, confidence, 'Erro ao confirmar: ' + confirmErr.message);
      return {
        success:      true,
        verified:     false,
        autoApproved: false,
        nextStep:     'awaiting_review',
        message:      'Pagamento validado mas ocorreu um erro técnico. A equipa irá confirmar em 15 min.',
      };
    }

  } else {
    // ── REVISÃO MANUAL ─────────────────────────────────────────────────
    const reason = !allChecksPass
      ? [
          alreadyConfirmed ? 'referência já usada' : null,
          !dateOk          ? 'data fora do intervalo' : null,
          !amountOk        ? `valor incorreto (esperado ${pkg?.price} MZN, detectado ${aiAmount})` : null,
          !statusOk        ? `status inválido (${aiStatus})` : null,
        ].filter(Boolean).join('; ')
      : `confidence baixa (${confidence.toFixed(2)})`;

    await _markReviewNeeded(transactionId, receiptHash, confidence, reason);

    return {
      success:      true,
      verified:     false,
      autoApproved: false,
      nextStep:     'awaiting_review',
      message:      confidence < 0.4
        ? 'Imagem pouco nítida. Tente uma foto mais clara ou aguarde revisão manual (até 15 min).'
        : 'Comprovativo recebido. A equipa irá verificar em até 15 minutos.',
    };
  }
}

async function _markReviewNeeded(transactionId, receiptHash, confidence, reason) {
  try {
    await restRequest(
      `transactions?id=eq.${transactionId}`,
      {
        method: 'PATCH',
        body: {
          status:              'review_needed',
          receipt_hash:        receiptHash || null,
          receipt_confidence:  confidence || 0,
          verification_method: 'pending',
          review_reason:       reason || null,
        },
        prefer: 'return=minimal',
      }
    );
    console.log('[verify-receipt] marcado review_needed:', transactionId, reason);
  } catch (e) {
    console.error('[verify-receipt] _markReviewNeeded falhou:', e.message);
  }
}

async function handleVerifyReceipt(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // Rate limit: 3 uploads/IP/min
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!checkReceiptRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados pedidos. Aguarde um minuto e tente de novo.', code: 'RATE_LIMITED' });
  }

  const body = parseBody(req);
  const { imageBase64, mimeType, reference, phone, amount, wallet, userId, transactionId, packageId } = body;

  if (!imageBase64 || !transactionId || !packageId) {
    return res.status(400).json({ error: 'imageBase64, transactionId e packageId são obrigatórios.' });
  }

  // Verificar que a transacção existe e está pendente
  try {
    const rows = await restRequest(
      `transactions?id=eq.${transactionId}&status=in.(pending,review_needed)&select=id,package_id,amount,user_id&limit=1`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Transacção não encontrada ou já processada.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao verificar transacção.' });
  }

  try {
    const result = await verifyReceiptInternal({
      imageBase64, mimeType, reference, phone,
      amount: Number(amount) || (PACKAGES[packageId]?.price || 0),
      wallet: wallet || 'móvel',
      userId, transactionId, packageId,
    });
    return res.status(result.success === false ? 400 : 200).json(result);
  } catch (err) {
    console.error('[verify-receipt] erro inesperado:', err.message);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}

// Exportar para uso directo em process-payment.js (sem HTTP round-trip)
module.exports.verifyReceiptInternal = verifyReceiptInternal;

// ════════════════════════════════════════════════════════════════════════════
// PAGE-VIEW
// ════════════════════════════════════════════════════════════════════════════
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
    return res.status(500).json({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SITEMAP
// ════════════════════════════════════════════════════════════════════════════
async function handleSitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  let dynamicPages = [];
  try {
    const data = await restRequest('blog_pages?published=eq.true&select=slug,updated_at&order=updated_at.desc');
    dynamicPages = (Array.isArray(data) ? data : []).map(p => ({
      loc:        `/pages/${p.slug}.html`,
      priority:   '0.8',
      changefreq: 'monthly',
      lastmod:    p.updated_at ? p.updated_at.slice(0, 10) : undefined,
    }));
  } catch (_) {}

  const allPages = [...STATIC_PAGES, ...dynamicPages];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allPages.map(p =>
    `  <url>\n    <loc>${SITE_URL}${p.loc}</loc>\n    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>\n    ` : ''}<changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n')}\n</urlset>`;

  return res.status(200).send(xml);
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG — CORRIGIDO (C-1): NÃO expõe supabaseAnonKey no JSON público
// ════════════════════════════════════════════════════════════════════════════
async function handleConfig(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
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
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/credit_usage_log?select=id`,
        {
          method: 'HEAD',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Prefer': 'count=exact',
          },
        }
      );
      const countHeader = countRes.headers.get('content-range');
      if (countHeader) docsGenerated = parseInt(countHeader.split('/')[1]) || 0;
    }
  } catch (_) {}

  // SEGURANÇA (C-1): Não expor supabaseAnonKey.
  // O frontend (AuthManager.js) deve receber a chave via variável de ambiente
  // injectada no build (scripts/inject-version.js) ou via import directo de
  // process.env em funções server-side. Se o frontend precisar da chave,
  // ela deve estar em NEXT_PUBLIC_* ou injectada estáticamente — nunca
  // trazida dinamicamente de uma API pública sem autenticação.
  return res.status(200).json({
    configured:    true,
    isSandbox,
    docsGenerated,
    supabaseUrl,
    supabaseAnonKey,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES  (/api/templates/:action)
// Ainda usa SDK (sem ws) — migração para fetch puro em sprint futuro
// ════════════════════════════════════════════════════════════════════════════
async function handleTemplates(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Para templates list (GET público) usa REST puro — sem SDK
  if (action === 'list') return tplList(req, res);

  const supabase = makeSdkClient();
  switch (action) {
    case 'submit':   return tplSubmit(req, res, supabase);
    case 'rate':     return tplRate(req, res, supabase);
    case 'download': return tplDownload(req, res, supabase);
    case 'approve':  return tplApprove(req, res, supabase);
    case 'reject':   return tplReject(req, res, supabase);
    case 'pending':  return tplPending(req, res, supabase);
    default:         return res.status(404).json({ error: 'Acção de template não encontrada' });
  }
}

async function tplList(req, res) {
  const service = req.query?.service || null;
  const limit   = Math.min(parseInt(req.query?.limit || 50), 100);
  const fields  = 'id,service_type,template_name,description,thumbnail_url,template_css,downloads,likes,rating_sum,rating_count,created_at';
  let path = `templates_custom?status=eq.approved&is_public=eq.true&order=downloads.desc&limit=${limit}&select=${fields}`;
  if (service) path += `&service_type=eq.${encodeURIComponent(service)}`;
  try {
    const data = await restRequest(path);
    const templates = (Array.isArray(data) ? data : []).map(t => ({
      ...t,
      avg_rating: t.rating_count > 0 ? Math.round((t.rating_sum / t.rating_count) * 10) / 10 : null,
    }));
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function tplSubmit(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body = parseBody(req);
  const { service_type, template_name, description, template_css, thumbnail_url, template_file } = body;
  if (!service_type || !template_name || !template_css)
    return res.status(400).json({ error: 'service_type, template_name e template_css são obrigatórios' });
  const { data, error } = await supabase.from('templates_custom').insert({
    user_id: user.id,
    service_type:  service_type.trim().slice(0, 50),
    template_name: template_name.trim().slice(0, 100),
    description:   (description || '').trim().slice(0, 300),
    template_css:  template_css.slice(0, 20000),
    thumbnail_url: thumbnail_url || null,
    template_file: template_file || null,
    status:        'pending',
    is_public:     false,
  }).select('id').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ success: true, id: data.id, message: 'Template submetido! Aguarda aprovação.' });
}

async function tplRate(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, rating, comment } = parseBody(req);
  if (!template_id || !rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'template_id e rating (1-5) são obrigatórios' });
  const { data, error } = await supabase.rpc('rate_template', {
    p_template_id: template_id, p_user_id: user.id,
    p_rating: parseInt(rating), p_comment: (comment || '').slice(0, 500),
  });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, ...data });
}

async function tplDownload(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const { template_id, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  await supabase.rpc('increment_template_downloads', { p_template_id: template_id }).catch(() => {});
  await supabase.from('template_downloads').insert({ template_id, session_id: session_id || null }).catch(() => {});
  return res.status(200).json({ ok: true });
}

async function tplApprove(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id } = parseBody(req);
  await supabase.rpc('approve_template', { p_template_id: template_id });
  return res.status(200).json({ success: true });
}

async function tplReject(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id, note } = parseBody(req);
  await supabase.rpc('reject_template', { p_template_id: template_id, p_note: note || '' });
  return res.status(200).json({ success: true });
}

async function tplPending(req, res, supabase) {
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { data } = await supabase
    .from('templates_custom')
    .select('id,service_type,template_name,description,thumbnail_url,status,created_at,user_id')
    .eq('status', 'pending').order('created_at', { ascending: true });
  return res.status(200).json({ success: true, templates: data || [] });
}

// ════════════════════════════════════════════════════════════════════════════
// AFILIADOS  (/api/affiliate/:action) — v2 Pro (segmentos, ranking, antifraude)
// ════════════════════════════════════════════════════════════════════════════
async function handleAffiliate(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const supabase = makeSdkClient();
    switch (action) {
      case 'register':      return await affRegister(req, res, supabase);
      case 'dashboard':     return await affDashboard(req, res, supabase);
      case 'click':         return await affClick(req, res, supabase);
      case 'withdraw':      return await affWithdraw(req, res, supabase);
      case 'check':         return await affCheck(req, res, supabase);
      case 'ranking':       return await affRanking(req, res, supabase);
      case 'notifications': return await affNotifications(req, res, supabase);
      default:              return res.status(404).json({ error: 'Acção não encontrada' });
    }
  } catch (err) {
    console.error('[handleAffiliate] crash:', action, err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

async function affRegister(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const user = await getUser(supabase, req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida' });
    const body = parseBody(req);
    const segment     = ['papelaria','cyber','universidade','explicacao','digitador','individual'].includes(body.segment) ? body.segment : 'individual';
    const businessName = (body.business_name || '').trim().slice(0, 100) || null;
    const city         = (body.city || '').trim().slice(0, 60) || null;
    const mpesaPhone   = (body.mpesa_phone || '').replace(/\s/g, '').slice(0, 20) || null;

    const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (profileErr) return res.status(500).json({ error: 'Erro ao ler perfil: ' + profileErr.message });
    if (!profile) {
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id).catch(() => ({ data: null }));
      const meta = authUser?.user?.user_metadata || {};
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: user.id, email: user.email || '', full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Utilizador',
        phone: meta.phone || null, credits: 0, plan: 'free', is_admin: false, is_temp: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (insertErr) return res.status(500).json({ error: 'Não foi possível criar o perfil: ' + insertErr.message });
      const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!newProfile) return res.status(500).json({ error: 'Perfil criado mas não encontrado. Tente de novo.' });
      return continueRegister(res, supabase, user, newProfile, { segment, businessName, city, mpesaPhone });
    }
    if (profile.ref_code) {
      // Já registado — actualizar segmento/info extra se fornecido
      const updates = { aff_segment: segment };
      if (businessName) updates.aff_business_name = businessName;
      if (city) updates.aff_city = city;
      if (mpesaPhone) updates.aff_phone_mpesa = mpesaPhone;
      await supabase.from('profiles').update(updates).eq('id', user.id);
      return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });
    }
    return continueRegister(res, supabase, user, profile, { segment, businessName, city, mpesaPhone });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
}

async function continueRegister(res, supabase, user, profile, extra = {}) {
  try {
    const namePart = (profile.full_name || user.email || 'MZD').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const ref_code = namePart + Math.floor(10000 + Math.random() * 90000);
    const { data: existing } = await supabase.from('profiles').select('id').eq('ref_code', ref_code).maybeSingle();
    const finalCode = existing ? ref_code + Math.floor(Math.random() * 9) : ref_code;
    const updates = {
      ref_code: finalCode,
      is_affiliate: false,
      aff_segment:  extra.segment || 'individual',
      aff_joined_at: new Date().toISOString(),
    };
    if (extra.businessName) updates.aff_business_name = extra.businessName;
    if (extra.city)         updates.aff_city          = extra.city;
    if (extra.mpesaPhone)   updates.aff_phone_mpesa   = extra.mpesaPhone;
    const { error: updateErr } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (updateErr) {
      if (updateErr.message.includes('column') || updateErr.code === '42703')
        return res.status(500).json({ error: 'Colunas em falta. Execute o SQL de migração v14.', sql_needed: true });
      return res.status(500).json({ error: 'Erro ao guardar código: ' + updateErr.message });
    }
    return res.status(200).json({ success: true, ref_code: finalCode, is_affiliate: false, message: 'Candidatura enviada! Aguarde aprovação em 24-48h.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar código: ' + err.message });
  }
}

async function affDashboard(req, res, supabase) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase.from('profiles')
    .select('ref_code,is_affiliate,aff_balance,aff_total_earned,aff_clicks,aff_conversions,full_name,phone,aff_segment,aff_tier,aff_business_name,aff_city,aff_phone_mpesa,aff_is_blocked,aff_block_reason')
    .eq('id', user.id).single();
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  const { data: commissions } = await supabase.from('affiliate_commissions')
    .select('id,package_id,sale_amount,commission_mzn,status,created_at').eq('affiliate_id', user.id)
    .order('created_at', { ascending: false }).limit(20);

  const { data: withdrawals } = await supabase.from('affiliate_withdrawals')
    .select('id,amount,mpesa_phone,status,created_at,processed_at').eq('affiliate_id', user.id)
    .order('created_at', { ascending: false }).limit(10);

  // Ranking do mês actual
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const { data: rankingRaw } = await supabase.from('affiliate_ranking')
    .select('affiliate_id,rank_position,conversions,commission_mzn,tier')
    .eq('month', currentMonth)
    .order('rank_position', { ascending: true })
    .limit(10);

  // Enriquecer ranking com nomes
  let ranking = [];
  if (rankingRaw && rankingRaw.length > 0) {
    const ids = rankingRaw.map(r => r.affiliate_id);
    const { data: pnames } = await supabase.from('profiles')
      .select('id,full_name,aff_segment,ref_code').in('id', ids);
    const nameMap = {};
    (pnames || []).forEach(p => { nameMap[p.id] = p; });
    ranking = rankingRaw.map(r => ({
      ...r,
      name: nameMap[r.affiliate_id]?.full_name?.split(' ')[0] + ' ' + (nameMap[r.affiliate_id]?.full_name?.split(' ')[1]?.[0] || '') + '.' || 'Parceiro',
      segment: nameMap[r.affiliate_id]?.aff_segment || 'individual',
      ref_code: nameMap[r.affiliate_id]?.ref_code || '',
    }));
  }

  // Notificações não lidas
  const { data: notifs, count: unreadCount } = await supabase.from('affiliate_notifications')
    .select('id,type,title,body,created_at', { count: 'exact' })
    .eq('affiliate_id', user.id).eq('is_read', false)
    .order('created_at', { ascending: false }).limit(5);

  const { data: settings } = await supabase.from('system_settings').select('key,value')
    .in('key', ['aff_min_withdraw', 'aff_rate_basico', 'aff_rate_pro', 'aff_rate_empresa', 'aff_bonus_papelaria', 'aff_bonus_cyber', 'aff_bonus_universidade']);
  const cfg = {};
  (settings || []).forEach(s => { cfg[s.key] = s.value; });

  return res.status(200).json({
    success: true,
    profile: {
      ref_code:     profile.ref_code,
      is_affiliate: profile.is_affiliate,
      is_blocked:   profile.aff_is_blocked || false,
      block_reason: profile.aff_block_reason || null,
      balance:      profile.aff_balance || 0,
      total_earned: profile.aff_total_earned || 0,
      clicks:       profile.aff_clicks || 0,
      conversions:  profile.aff_conversions || 0,
      name:         profile.full_name || 'Parceiro',
      mpesa_phone:  profile.aff_phone_mpesa || profile.phone || '',
      segment:      profile.aff_segment || 'individual',
      tier:         profile.aff_tier || 'bronze',
      link:         `${SITE_URL}/?ref=${profile.ref_code}`,
      conversion_rate: profile.aff_clicks > 0 ? Math.round((profile.aff_conversions / profile.aff_clicks) * 100) : 0,
    },
    commissions:  commissions || [],
    withdrawals:  withdrawals || [],
    ranking,
    notifications: notifs || [],
    unread_notifications: unreadCount || 0,
    config: cfg,
  });
}

async function affClick(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const body    = parseBody(req);
  const refCode = (body.ref_code || '').trim().toUpperCase();
  const page    = (body.page || '/').slice(0, 200);
  if (!refCode) return res.status(400).json({ error: 'ref_code em falta' });
  const ip     = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip + refCode).digest('hex').slice(0, 16);
  // Antifraude: verificar burst de cliques antes de registar
  const { data: recentClicks } = await supabase.from('affiliate_clicks')
    .select('id', { count: 'exact' })
    .eq('ip_hash', ipHash)
    .gte('created_at', new Date(Date.now() - 3600000).toISOString());
  const clickCount = recentClicks?.length || 0;
  if (clickCount >= 30) {
    // Burst detectado — registar fraude mas retornar ok silenciosamente
    const { data: aff } = await supabase.from('profiles').select('id').eq('ref_code', refCode).maybeSingle();
    if (aff) {
      await supabase.from('affiliate_fraud_flags').insert({
        affiliate_id: aff.id, flag_type: 'ip_burst',
        description: 'IP com ' + (clickCount+1) + ' cliques na última hora', severity: 'critical',
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true });
  }
  const { error } = await supabase.rpc('register_affiliate_click', { p_ref_code: refCode, p_ip_hash: ipHash, p_page: page });
  if (error) console.error('[affClick] error:', error.message);
  return res.status(200).json({ ok: true });
}

async function affWithdraw(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseInt(body.amount || 0);
  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });
  const { data: profile } = await supabase.from('profiles')
    .select('aff_balance,is_affiliate,aff_is_blocked,aff_tier').eq('id', user.id).single();
  if (!profile?.is_affiliate) return res.status(403).json({ error: 'Apenas afiliados aprovados podem levantar' });
  if (profile.aff_is_blocked) return res.status(403).json({ error: 'Conta suspensa. Contacte o suporte.' });
  const { data: minSetting } = await supabase.from('system_settings').select('value').eq('key', 'aff_min_withdraw').single();
  let minWithdraw = parseInt(minSetting?.value || '200');
  // Diamante tem mínimo reduzido
  if (profile.aff_tier === 'diamante') minWithdraw = Math.max(50, Math.floor(minWithdraw * 0.5));
  if (amount < minWithdraw) return res.status(400).json({ error: `Valor mínimo: ${minWithdraw} MZN` });
  if (amount > (profile.aff_balance || 0)) return res.status(400).json({ error: 'Saldo insuficiente' });
  // Verificar levantamento pendente em duplicado
  const { data: pendingW } = await supabase.from('affiliate_withdrawals')
    .select('id').eq('affiliate_id', user.id).eq('status', 'pending').limit(1);
  if (pendingW && pendingW.length > 0)
    return res.status(400).json({ error: 'Já tem um levantamento pendente. Aguarde a conclusão.' });
  const { error } = await supabase.from('affiliate_withdrawals')
    .insert({ affiliate_id: user.id, amount, mpesa_phone: phone, status: 'pending' });
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('profiles').update({ aff_balance: (profile.aff_balance || 0) - amount }).eq('id', user.id);
  // Notificação
  await supabase.from('affiliate_notifications').insert({
    affiliate_id: user.id, type: 'withdrawal',
    title: '💸 Pedido de Levantamento',
    body: `Pedido de ${amount} MZN submetido. Processado em até 48h via M-Pesa.`,
  }).catch(() => {});
  return res.status(200).json({ success: true, message: `Pedido de ${amount} MZN submetido. Processado em até 48 horas via M-Pesa.` });
}

async function affCheck(req, res, supabase) {
  const refCode = req.query?.ref || '';
  if (!refCode) return res.status(400).json({ error: 'ref em falta' });
  const { data } = await supabase.from('profiles')
    .select('full_name,is_affiliate,ref_code,aff_segment').eq('ref_code', refCode).single();
  if (!data) return res.status(404).json({ error: 'Link inválido' });
  return res.status(200).json({
    valid: true, is_affiliate: data.is_affiliate,
    name: data.full_name || 'Parceiro MzDocs',
    segment: data.aff_segment || 'individual',
  });
}

async function affRanking(req, res, supabase) {
  if (req.method !== 'GET') return res.status(405).end();
  const month = req.query?.month || new Date().toISOString().slice(0, 7);
  const { data: ranking } = await supabase.from('affiliate_ranking')
    .select('affiliate_id,rank_position,conversions,revenue_mzn,commission_mzn,tier')
    .eq('month', month).order('rank_position', { ascending: true }).limit(20);
  if (!ranking || !ranking.length) return res.status(200).json({ success: true, ranking: [], month });
  const ids = ranking.map(r => r.affiliate_id);
  const { data: profiles } = await supabase.from('profiles')
    .select('id,full_name,aff_segment').in('id', ids);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return res.status(200).json({
    success: true, month,
    ranking: ranking.map(r => ({
      ...r,
      name: pm[r.affiliate_id]?.full_name?.split(' ').slice(0,2).join(' ') || 'Parceiro',
      segment: pm[r.affiliate_id]?.aff_segment || 'individual',
    })),
  });
}

async function affNotifications(req, res, supabase) {
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  if (req.method === 'POST') {
    // Marcar como lidas
    await supabase.from('affiliate_notifications')
      .update({ is_read: true }).eq('affiliate_id', user.id).eq('is_read', false);
    return res.status(200).json({ success: true });
  }
  const { data } = await supabase.from('affiliate_notifications')
    .select('id,type,title,body,is_read,created_at')
    .eq('affiliate_id', user.id).order('created_at', { ascending: false }).limit(20);
  return res.status(200).json({ success: true, notifications: data || [] });
}
// ════════════════════════════════════════════════════════════════════════════
// OCR-ANALYZE — proxy IA (preservado integralmente da v1.0)
// ════════════════════════════════════════════════════════════════════════════
async function handleOcrAnalyze(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const body = parseBody(req);
  const { ocrText = '', schema = [], serviceType = '', imageBase64, mimeType } = body;
  if (!schema.length) return res.status(400).json({ error: 'schema required' });

  const hasImage  = !!(imageBase64 && mimeType?.startsWith('image/'));
  const schemaDesc = schema.map(f => `- ${f.id}: "${f.label}" (${f.type})`).join('\n');
  const userPrompt = `És um especialista em extracção de dados de documentos moçambicanos.\n${ocrText ? `TEXTO EXTRAÍDO DO DOCUMENTO:\n${ocrText.slice(0, 2000)}\n` : ''}\nTIPO DE DOCUMENTO: ${serviceType}\n\nCAMPOS A EXTRAIR:\n${schemaDesc}\n\nINSTRUÇÕES:\n- Analisa ${hasImage ? 'a imagem e o texto' : 'o texto'} cuidadosamente\n- Para cada campo, extrai o valor exacto que aparece no documento\n- Se o campo não existir, inclui-o em "missing"\n- Responde APENAS com JSON válido, sem markdown, sem explicações\n\nFORMATO OBRIGATÓRIO:\n{"fields":{"id_campo":{"value":"valor encontrado","confidence":0.95,"source":"ocr"}},"missing":["campo_ausente"]}`;

  if (process.env.GROQ_API_KEY) {
    const visionModels = hasImage
      ? ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview', 'meta-llama/llama-4-maverick-17b-128e-instruct']
      : ['llama-3.3-70b-versatile'];
    for (const model of visionModels) {
      try {
        const content = hasImage
          ? [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }, { type: 'text', text: userPrompt }]
          : userPrompt;
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model, max_tokens: 1500, temperature: 0.1, messages: [{ role: 'user', content }] }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.error) { console.warn('[ocr-analyze] Groq model error:', model, d.error?.message); continue; }
          const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
          if (parsed?.fields && Object.keys(parsed.fields).length > 0) return res.status(200).json(parsed);
        }
      } catch (e) { console.warn('[ocr-analyze] Groq exception:', model, e.message); }
    }
  }

  if (process.env.GEMINI_API_KEY) {
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']) {
      try {
        const parts = [];
        if (hasImage) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
        parts.push({ text: userPrompt });
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
        if (r.ok) {
          const d = await r.json();
          const parsed = _safeJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          if (parsed?.fields && Object.keys(parsed.fields).length > 0) return res.status(200).json(parsed);
        }
      } catch (e) { console.warn('[ocr-analyze] Gemini exception:', e.message); }
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const content = hasImage
        ? [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }, { type: 'text', text: userPrompt }]
        : userPrompt;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': SITE_URL },
        body: JSON.stringify({ model: hasImage ? 'meta-llama/llama-4-scout' : 'meta-llama/llama-3.3-70b-instruct', max_tokens: 1500, temperature: 0.1, messages: [{ role: 'user', content }] }),
      });
      if (r.ok) {
        const d = await r.json();
        const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
        if (parsed?.fields && Object.keys(parsed.fields).length > 0) return res.status(200).json(parsed);
      }
    } catch (e) { console.warn('[ocr-analyze] OpenRouter:', e.message); }
  }

  console.error('[ocr-analyze] Todos os providers falharam.');
  return res.status(200).json({ fields: {}, missing: schema.map(f => f.id) });
}

function _safeJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch (_) { return null; }
}
