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
const { buscarArtigosRelevantes } = require('./_lib/legalSearch');

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

// ATENÇÃO: ao adicionar novas páginas estáticas em /pages/, acrescentar aqui também.
// Páginas geradas pelo admin (blog_pages) são lidas automaticamente da BD — não precisam
// de estar nesta lista.
const STATIC_PAGES = [
  { loc: '/',                                                                    priority: '1.0', changefreq: 'weekly'  },
  { loc: '/pages/',                                                              priority: '0.7', changefreq: 'weekly'  },
  // Páginas SEO estáticas — ficheiros físicos em /pages/
  { loc: '/pages/como-fazer-cv-mocambique.html',                                 priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/cv-licenciado-mocambique.html',                                 priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/cv-sem-experiencia-mocambique.html',                            priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/como-fazer-um-cv-de-um-licenciado-em-mocambique/',              priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/carta-candidatura-emprego-mocambique.html',                     priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-formal-mocambique.html',                                  priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-recomendacao-mocambique.html',                            priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/contrato-arrendamento-mocambique.html',                         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-residencia-mocambique.html',                         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-rendimentos-mocambique.html',                        priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/plano-negocios-mocambique.html',                                priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/procuracao-mocambique.html',                                    priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/recibo-pagamento-mocambique.html',                              priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/requerimento-emprego-mocambique.html',                          priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/trabalho-escolar-mocambique.html',                              priority: '0.8', changefreq: 'monthly' },
  // Outras páginas públicas
  { loc: '/parceiros.html',                                                      priority: '0.6', changefreq: 'monthly' },
  { loc: '/templates.html',                                                      priority: '0.6', changefreq: 'weekly'  },
  { loc: '/legal.html',                                                          priority: '0.3', changefreq: 'monthly' },
];

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

async function getUser(_unused, req) {
  // Migrado para REST puro — argumento supabase ignorado (compatibilidade)
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { user } = await getUserFromToken(token);
  return user || null;
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
  if (action === 'legal-search')                        return handleLegalSearch(req, res);
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

// Preços/créditos dos pacotes: única fonte de verdade em _lib/packages.js
// (ver esse ficheiro para o porquê — corrige duplicação em 5 locais e o
// bug de a verificação automática de comprovativos nunca reflectir
// alterações de preço feitas no painel de admin).
const { loadPackagesFromSettings } = require('./_lib/packages');

const RECEIPT_PROMPT = (wallet) =>
  `És um verificador de comprovativos de transferência bancária moçambicana (M-Pesa, e-Mola, mKesh). ` +
  `Analisa esta imagem com MUITO RIGOR. ` +
  `PRIMEIRO verifica: esta imagem É um comprovativo/recibo de transferência de dinheiro? ` +
  `Se NÃO for (ex: selfie, paisagem, documento qualquer, screenshot aleatório, imagem escura, imagem ilegível, etc.), ` +
  `devolve imediatamente: {"valid":false,"amount":0,"reference":"","recipient_phone":"","status":"NAO_COMPROVATIVO","transaction_date":"","confidence":0.0,"rejection_reason":"Imagem não é um comprovativo de transferência"}. ` +
  `Se FOR um comprovativo ${wallet}, extrai os dados e responde APENAS em JSON válido (sem markdown, sem texto extra): ` +
  `{"valid":boolean,"amount":number,"reference":"string","recipient_phone":"string","status":"string","transaction_date":"string","confidence":0.0,"rejection_reason":""}. ` +
  `"status" deve ser EXACTAMENTE um de: SUCESSO, CONFIRMADO, PENDENTE, FALHA. ` +
  `"confidence" é a tua certeza de 0.0 a 1.0 de que extraíste os dados correctamente — se a imagem estiver desfocada ou ilegível, usa 0.0. ` +
  `"amount" é o valor em MZN como número. "reference" é o código de transacção. ` +
  `"rejection_reason" é vazio se válido, ou o motivo de rejeição se inválido.`;

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

  const confidence      = Number(aiResult.confidence) || 0;
  const aiAmount        = Number(aiResult.amount) || 0;
  const aiStatus        = String(aiResult.status || '').toUpperCase();
  const aiRef           = String(aiResult.reference || '');
  const aiDate          = aiResult.transaction_date || '';
  const rejectionReason = aiResult.rejection_reason || '';

  console.log('[verify-receipt] IA resultado:', { confidence, aiAmount, aiStatus, aiRef, rejectionReason });

  // ── Rejeição explícita: não é comprovativo ─────────────────────────────
  if (aiStatus === 'NAO_COMPROVATIVO' || (rejectionReason && confidence === 0)) {
    return {
      success:      false,
      verified:     false,
      autoApproved: false,
      error:        rejectionReason || 'A imagem enviada não é um comprovativo de transferência. Por favor envie o screenshot do M-Pesa, e-Mola ou mKesh após o pagamento.',
      code:         'NOT_A_RECEIPT',
    };
  }
  // ── 4. Validações de negócio ───────────────────────────────────────────
  // CORRIGIDO: PACKAGES[packageId] hard-coded fazia a verificação automática
  // de comprovativos comparar sempre contra o preço antigo, mesmo depois de
  // o admin alterar o preço em Configurações — ver api/_lib/packages.js.
  const currentPackages = await loadPackagesFromSettings();
  const pkg = currentPackages[packageId];

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
    const fallbackPackages = await loadPackagesFromSettings();
    const result = await verifyReceiptInternal({
      imageBase64, mimeType, reference, phone,
      amount: Number(amount) || (fallbackPackages[packageId]?.price || 0),
      wallet: wallet || 'móvel',
      userId, transactionId, packageId,
    });
    // Sempre 200 — success:false é resposta de negócio, não erro HTTP.
    // O frontend distingue pelos campos success/code/nextStep.
    return res.status(200).json(result);
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
    console.error('[handlePageView] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível registar a visualização.' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SITEMAP
// ════════════════════════════════════════════════════════════════════════════
async function handleSitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  // Páginas dinâmicas criadas pelo admin (blog_pages publicadas na BD).
  //
  // FORMATO DA URL:
  //   - O admin publica via GitHub commit em pages/<slug>/index.html
  //     (ver handleGeneratePage em api/admin/index.js).
  //   - Logo a URL pública é /pages/<slug>/ (cleanUrls no vercel.json),
  //     NÃO /pages/<slug>.html como estava antes (bug anterior).
  //
  // DEDUPLICAÇÃO:
  //   - Se uma página dinâmica tiver o mesmo slug de uma estática já listada
  //     em STATIC_PAGES (ex: como-fazer-cv-mocambique), a entrada estática
  //     tem prioridade. Isto evita duplicados no sitemap quando uma página
  //     estática foi posteriormente republicada pelo admin.
  let dynamicPages = [];
  try {
    const data = await restRequest(
      'blog_pages?published=eq.true&select=slug,updated_at,title&order=updated_at.desc&limit=500'
    );

    // Conjunto de slugs já cobertos pelas páginas estáticas
    const staticSlugs = new Set(
      STATIC_PAGES
        .map(p => {
          // Extrai o slug do loc: /pages/foo.html → foo | /pages/foo/ → foo
          const m = p.loc.match(/\/pages\/([^/]+?)(?:\.html|\/?$)/);
          return m ? m[1] : null;
        })
        .filter(Boolean)
    );

    dynamicPages = (Array.isArray(data) ? data : [])
      .filter(p => p.slug && !staticSlugs.has(p.slug))
      .map(p => ({
        loc:        `/pages/${p.slug}/`,   // cleanUrls → index.html servido em /slug/
        priority:   '0.8',
        changefreq: 'monthly',
        lastmod:    p.updated_at ? p.updated_at.slice(0, 10) : undefined,
      }));
  } catch (_) {
    // Falha silenciosa: o sitemap serve as páginas estáticas mesmo sem BD
  }

  const allPages = [...STATIC_PAGES, ...dynamicPages];

  const urlEntries = allPages.map(p => {
    const lines = [
      `  <url>`,
      `    <loc>${SITE_URL}${p.loc}</loc>`,
      p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>` : null,
      `    <changefreq>${p.changefreq}</changefreq>`,
      `    <priority>${p.priority}</priority>`,
      `  </url>`,
    ].filter(Boolean);
    return lines.join('\n');
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;

  return res.status(200).send(xml);
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG — CORRIGIDO (C-1): NÃO expõe supabaseAnonKey no JSON público
// ════════════════════════════════════════════════════════════════════════════
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
    packages,
    whatsappSupport,
    freeCreditsNormal,
    freeCreditsExpiryDays,
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

  switch (action) {
    case 'submit':      return tplSubmit(req, res);
    case 'rate':        return tplRate(req, res);
    case 'download':    return tplDownload(req, res);
    case 'approve':     return tplApprove(req, res);
    case 'reject':      return tplReject(req, res);
    case 'pending':     return tplPending(req, res);
    // ── Acções que faltavam (rotas já existiam no vercel.json e o
    // frontend templates.html já as chamava — só a implementação aqui
    // estava em falta). Usam REST puro (rpc/restRequest), sem o SDK
    // antigo, seguindo a função match_legal_chunks e tplList como
    // referência de estilo. Dependem das funções/views criadas na
    // migration_v12_community_templates.sql.
    case 'gallery':     return tplGallery(req, res);
    case 'mine':        return tplMine(req, res);
    case 'saved':       return tplSaved(req, res);
    case 'save':        return tplSave(req, res);
    case 'use':         return tplUse(req, res);
    case 'report':      return tplReport(req, res);
    case 'share-token': return tplShareToken(req, res);
    case 'by-token':    return tplByToken(req, res);
    case 'delete':      return tplDelete(req, res);
    default:            return res.status(404).json({ error: 'Acção de template não encontrada' });
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
    console.error('[tplList] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os modelos. Tente novamente.' });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers REST para templates e afiliados (substituem makeSdkClient)
// ─────────────────────────────────────────────────────────────────────────────

/** Valida token e devolve user, ou null. */
async function getAuthUserFromToken(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { user } = await getUserFromToken(token);
  return user || null;
}

/** SELECT REST com filtro simples. */
async function _select(table, params = '') {
  return restRequest(`${table}${params ? '?' + params : ''}`);
}

/** INSERT REST — devolve linha criada. */
async function _insert(table, row) {
  return insert(table, row);
}

/** UPDATE REST. */
async function _update(table, matchCol, matchVal, patch) {
  return update(table, matchCol, matchVal, patch);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE handlers — migrados de SDK para REST puro (C-2 fix)
// ─────────────────────────────────────────────────────────────────────────────

async function tplSubmit(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body = parseBody(req);
  const { service_type, template_name, description, template_css, thumbnail_url, template_file } = body;
  if (!service_type || !template_name || !template_css)
    return res.status(400).json({ error: 'service_type, template_name e template_css são obrigatórios' });
  try {
    const data = await _insert('templates_custom', {
      user_id:       user.id,
      service_type:  service_type.trim().slice(0, 50),
      template_name: template_name.trim().slice(0, 100),
      description:   (description || '').trim().slice(0, 300),
      template_css:  template_css.slice(0, 20000),
      thumbnail_url: thumbnail_url || null,
      template_file: template_file || null,
      status:        'pending',
      is_public:     false,
    });
    return res.status(201).json({ success: true, id: data?.id, message: 'Template submetido! Aguarda aprovação.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function tplRate(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, rating, comment } = parseBody(req);
  if (!template_id || !rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'template_id e rating (1-5) são obrigatórios' });
  try {
    const data = await rpc('rate_template', {
      p_template_id: template_id,
      p_user_id:     user.id,
      p_rating:      parseInt(rating),
      p_comment:     (comment || '').slice(0, 500),
    });
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function tplDownload(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { template_id, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  rpc('increment_template_downloads', { p_template_id: template_id }).catch(() => {});
  _insert('template_downloads', { template_id, session_id: session_id || null }).catch(() => {});
  return res.status(200).json({ ok: true });
}

async function tplApprove(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const rows = await _select('profiles', `select=is_admin&id=eq.${user.id}&limit=1`);
  if (!rows?.[0]?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id } = parseBody(req);
  await rpc('approve_template', { p_template_id: template_id });
  return res.status(200).json({ success: true });
}

async function tplReject(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const rows = await _select('profiles', `select=is_admin&id=eq.${user.id}&limit=1`);
  if (!rows?.[0]?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id, note } = parseBody(req);
  await rpc('reject_template', { p_template_id: template_id, p_note: note || '' });
  return res.status(200).json({ success: true });
}

async function tplPending(req, res) {
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const rows = await _select('profiles', `select=is_admin&id=eq.${user.id}&limit=1`);
  if (!rows?.[0]?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const data = await _select('templates_custom',
    'select=id,service_type,template_name,description,thumbnail_url,status,created_at,user_id&status=eq.pending&order=created_at.asc');
  return res.status(200).json({ success: true, templates: data || [] });
}

async function getAuthUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { user } = await getUserFromToken(token);
  return user;
}

// GET /api/templates/gallery?sort=&limit=&offset=&type=
// Usa a view v_templates_gallery (migration_v12) — já calcula avg_rating
// e popularity_score, e já filtra status='approved' AND is_public=true.
async function tplGallery(req, res) {
  const limit  = Math.min(parseInt(req.query?.limit || 24), 50);
  const offset = Math.max(parseInt(req.query?.offset || 0), 0);
  const sort   = req.query?.sort || 'popular';
  const type   = req.query?.type || null;

  const sortColumn = {
    popular: 'popularity_score',
    recent:  'created_at',
    rating:  'avg_rating',
    downloads: 'downloads',
  }[sort] || 'popularity_score';

  let path = `v_templates_gallery?order=${sortColumn}.desc.nullslast&limit=${limit}&offset=${offset}`;
  if (type) path += `&template_type=eq.${encodeURIComponent(type)}`;

  try {
    const templates = await restRequest(path);
    return res.status(200).json({ success: true, templates: Array.isArray(templates) ? templates : [] });
  } catch (err) {
    console.error('[tplGallery] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar a galeria. Tente novamente.' });
  }
}

// GET /api/templates/mine — templates submetidos pelo utilizador autenticado.
// Usa a view v_my_templates (já filtra por auth.uid() no lado do Postgres,
// mas como chamamos com a service_role key — que ignora RLS — filtramos
// explicitamente por user_id aqui em vez de confiar em auth.uid()).
async function tplMine(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    const templates = await restRequest(
      `templates_custom?user_id=eq.${user.id}&order=created_at.desc&select=id,service_type,template_name,description,thumbnail_url,status,rejection_note,use_count,downloads,is_featured,created_at,share_token`
    );
    return res.status(200).json({ success: true, templates: Array.isArray(templates) ? templates : [] });
  } catch (err) {
    console.error('[tplMine] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os seus templates.' });
  }
}

// GET /api/templates/saved — templates guardados pelo utilizador na sua
// colecção pessoal (tabela template_saves, join com templates_custom).
async function tplSaved(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    const saves = await restRequest(
      `template_saves?user_id=eq.${user.id}&select=template_id,templates_custom(id,service_type,template_name,description,thumbnail_url,downloads,use_count,likes,rating_count,template_type,created_at)`
    );
    const templates = (Array.isArray(saves) ? saves : [])
      .map(s => s.templates_custom)
      .filter(Boolean);
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error('[tplSaved] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os templates guardados.' });
  }
}

// POST /api/templates/save  { template_id }
// Alterna guardar/remover da colecção pessoal — usa toggle_save_template
// (migration_v12), que já trata o INSERT/DELETE atomicamente.
async function tplSave(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('toggle_save_template', { p_template_id: template_id, p_user_id: user.id });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplSave] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível guardar o template.' });
  }
}

// POST /api/templates/use  { template_id, service_key }
// Regista que o template foi efectivamente aplicado a um documento
// (diferente de 'download' — ver comentário em template_uses na
// migration_v12). Login não é exigido aqui pelo frontend (templates.html
// já valida currentUser antes de chamar, mas mantemos tolerante a
// session_id para não bloquear o fluxo de geração caso a sessão expire).
async function tplUse(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  const { template_id, service_key, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('use_template', {
      p_template_id: template_id,
      p_user_id: user?.id || null,
      p_session_id: session_id || null,
      p_service_key: service_key || '',
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplUse] erro:', err.message);
    // Não bloquear o fluxo de aplicação do template por falha no registo
    // de uso — o utilizador já está a navegar para a página de geração
    // quando isto é chamado (ver templates.html → useTemplate()).
    return res.status(200).json({ success: false });
  }
}

// POST /api/templates/report  { template_id, reason, detail? }
// reason deve ser um dos valores aceites pelo CHECK de template_reports:
// 'spam' | 'inappropriate' | 'copyright' | 'poor_quality' | 'other'
async function tplReport(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, reason, detail } = parseBody(req);
  const motivosValidos = ['spam', 'inappropriate', 'copyright', 'poor_quality', 'other'];
  if (!template_id || !motivosValidos.includes(reason)) {
    return res.status(400).json({ error: 'template_id e reason (spam|inappropriate|copyright|poor_quality|other) são obrigatórios' });
  }
  try {
    await insert('template_reports', {
      template_id,
      reporter_id: user.id,
      reason,
      detail: (detail || '').slice(0, 500),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tplReport] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível enviar o relatório.' });
  }
}

// POST /api/templates/share-token  { template_id }
// Gera (ou regenera) o token de partilha de um template privado — só o
// dono pode fazê-lo (verificado dentro de regenerate_share_token, SQL).
async function tplShareToken(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('regenerate_share_token', { p_template_id: template_id, p_user_id: user.id });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplShareToken] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível gerar o link de partilha.' });
  }
}

// GET /api/templates/by-token?token=...
// Acesso público a um template privado partilhado por link directo —
// não exige autenticação (o token É a autorização).
async function tplByToken(req, res) {
  const token = req.query?.token || '';
  if (!token) return res.status(400).json({ error: 'token obrigatório' });
  try {
    const rows = await restRequest(
      `templates_custom?share_token=eq.${encodeURIComponent(token)}&select=id,service_type,template_name,description,template_html,template_css,thumbnail_url,downloads,use_count&limit=1`
    );
    const template = Array.isArray(rows) ? rows[0] : null;
    if (!template) return res.status(404).json({ error: 'Link inválido ou expirado' });
    return res.status(200).json({ success: true, template });
  } catch (err) {
    console.error('[tplByToken] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar o template.' });
  }
}

// POST /api/templates/delete  { template_id }
// Só o dono pode apagar o seu próprio template — verificado explicitamente
// aqui (não delegado a uma função RPC) porque é uma operação destrutiva e
// simples o suficiente para validar directamente.
async function tplDelete(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const rows = await restRequest(`templates_custom?id=eq.${template_id}&select=user_id`);
    const tpl = Array.isArray(rows) ? rows[0] : null;
    if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado' });
    if (tpl.user_id !== user.id) return res.status(403).json({ success: false, error: 'Não autorizado' });
    await restRequest(`templates_custom?id=eq.${template_id}`, { method: 'DELETE' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tplDelete] erro:', err.message);
    return res.status(500).json({ success: false, error: 'Não foi possível apagar o template.' });
  }
}


// ════════════════════════════════════════════════════════════════════════════
// AFILIADOS  (/api/affiliate/:action) — v2 Pro (segmentos, ranking, antifraude)
// Migrado de SDK para REST puro (C-2 fix — 27/Jun/2026)
// ════════════════════════════════════════════════════════════════════════════
async function handleAffiliate(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    switch (action) {
      case 'register':      return await affRegister(req, res);
      case 'dashboard':     return await affDashboard(req, res);
      case 'click':         return await affClick(req, res);
      case 'withdraw':      return await affWithdraw(req, res);
      case 'check':         return await affCheck(req, res);
      case 'ranking':       return await affRanking(req, res);
      case 'notifications': return await affNotifications(req, res);
      default:              return res.status(404).json({ error: 'Acção não encontrada' });
    }
  } catch (err) {
    console.error('[handleAffiliate] crash:', action, err.message);
    return res.status(500).json({ error: 'Não foi possível concluir o registo. Por favor, tente novamente dentro de alguns instantes.' });
  }
}

async function affRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const user = await getAuthUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida' });
    const body        = parseBody(req);
    const segment     = ['papelaria','cyber','universidade','explicacao','digitador','individual'].includes(body.segment) ? body.segment : 'individual';
    const businessName = (body.business_name || '').trim().slice(0, 100) || null;
    const city         = (body.city || '').trim().slice(0, 60) || null;
    const mpesaPhone   = (body.mpesa_phone || '').replace(/\s/g, '').slice(0, 20) || null;

    const rows = await _select('profiles', `select=*&id=eq.${user.id}&limit=1`);
    let profile = rows?.[0] || null;

    if (!profile) {
      // Criar perfil via Auth Admin REST
      let meta = {};
      try {
        const authUser = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        });
        if (authUser.ok) {
          const d = await authUser.json();
          meta = d.user_metadata || {};
        }
      } catch (_) {}
      await _insert('profiles', {
        id:         user.id,
        email:      user.email || '',
        full_name:  meta.full_name || meta.name || (user.email || '').split('@')[0] || 'Utilizador',
        phone:      meta.phone || null,
        credits:    0,
        plan:       'free',
        is_admin:   false,
        is_temp:    false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const newRows = await _select('profiles', `select=*&id=eq.${user.id}&limit=1`);
      profile = newRows?.[0];
      if (!profile) return res.status(500).json({ error: 'Perfil criado mas não encontrado. Tente de novo.' });
      return continueRegister(res, user, profile, { segment, businessName, city, mpesaPhone });
    }

    if (profile.ref_code) {
      const updates = { aff_segment: segment };
      if (businessName) updates.aff_business_name = businessName;
      if (city)         updates.aff_city          = city;
      if (mpesaPhone)   updates.aff_phone_mpesa   = mpesaPhone;
      await _update('profiles', 'id', user.id, updates);
      return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });
    }
    return continueRegister(res, user, profile, { segment, businessName, city, mpesaPhone });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
}

async function continueRegister(res, user, profile, extra = {}) {
  try {
    const namePart = (profile.full_name || user.email || 'MZD').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const ref_code = namePart + Math.floor(10000 + Math.random() * 90000);
    const existing = await _select('profiles', `select=id&ref_code=eq.${ref_code}&limit=1`);
    const finalCode = existing?.length ? ref_code + Math.floor(Math.random() * 9) : ref_code;
    const updates = {
      ref_code:      finalCode,
      is_affiliate:  false,
      aff_segment:   extra.segment || 'individual',
      aff_joined_at: new Date().toISOString(),
    };
    if (extra.businessName) updates.aff_business_name = extra.businessName;
    if (extra.city)         updates.aff_city          = extra.city;
    if (extra.mpesaPhone)   updates.aff_phone_mpesa   = extra.mpesaPhone;
    await _update('profiles', 'id', user.id, updates);
    return res.status(200).json({
      success:      true,
      ref_code:     finalCode,
      is_affiliate: false,
      message:      'Candidatura enviada! Aguarde aprovação em 24-48h.',
    });
  } catch (err) {
    console.error('[affRegister] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível concluir o registo. Por favor, tente novamente dentro de alguns instantes.' });
  }
}

async function affDashboard(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const fields = 'ref_code,is_affiliate,aff_balance,aff_total_earned,aff_clicks,aff_conversions,full_name,phone,aff_segment,aff_tier,aff_business_name,aff_city,aff_phone_mpesa,aff_is_blocked,aff_block_reason';
  const profRows = await _select('profiles', `select=${fields}&id=eq.${user.id}&limit=1`);
  const profile  = profRows?.[0];
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  const commissions = await _select('affiliate_commissions',
    `select=id,package_id,sale_amount,commission_mzn,status,created_at&affiliate_id=eq.${user.id}&order=created_at.desc&limit=20`);

  const withdrawals = await _select('affiliate_withdrawals',
    `select=id,amount,mpesa_phone,status,created_at,processed_at&affiliate_id=eq.${user.id}&order=created_at.desc&limit=10`);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const rankingRaw = await _select('affiliate_ranking',
    `select=affiliate_id,rank_position,conversions,commission_mzn,tier&month=eq.${currentMonth}&order=rank_position.asc&limit=10`);

  let ranking = [];
  if (rankingRaw?.length) {
    const ids = rankingRaw.map(r => r.affiliate_id).join(',');
    const pnames = await _select('profiles', `select=id,full_name,aff_segment,ref_code&id=in.(${ids})`);
    const nameMap = {};
    (pnames || []).forEach(p => { nameMap[p.id] = p; });
    ranking = rankingRaw.map(r => ({
      ...r,
      name:     (nameMap[r.affiliate_id]?.full_name || 'Parceiro').split(' ').slice(0, 2).join(' '),
      segment:  nameMap[r.affiliate_id]?.aff_segment || 'individual',
      ref_code: nameMap[r.affiliate_id]?.ref_code || '',
    }));
  }

  // Notificações — usar restRequest com count
  const notifRes = await fetch(
    `${SUPABASE_URL}/rest/v1/affiliate_notifications?select=id,type,title,body,created_at&affiliate_id=eq.${user.id}&is_read=eq.false&order=created_at.desc&limit=5`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'count=exact' } }
  );
  const notifCR    = notifRes.headers.get('Content-Range') || '';
  const unreadCount = parseInt((notifCR.split('/')[1] || '0').trim(), 10) || 0;
  const notifs     = notifRes.ok ? await notifRes.json() : [];

  const settingsRows = await _select('system_settings',
    'select=key,value&key=in.(aff_min_withdraw,aff_rate_basico,aff_rate_pro,aff_rate_empresa,aff_bonus_papelaria,aff_bonus_cyber,aff_bonus_universidade)');
  const cfg = {};
  (settingsRows || []).forEach(s => { cfg[s.key] = s.value; });

  return res.status(200).json({
    success: true,
    profile: {
      ref_code:        profile.ref_code,
      is_affiliate:    profile.is_affiliate,
      is_blocked:      profile.aff_is_blocked || false,
      block_reason:    profile.aff_block_reason || null,
      balance:         profile.aff_balance || 0,
      total_earned:    profile.aff_total_earned || 0,
      clicks:          profile.aff_clicks || 0,
      conversions:     profile.aff_conversions || 0,
      name:            profile.full_name || 'Parceiro',
      mpesa_phone:     profile.aff_phone_mpesa || profile.phone || '',
      segment:         profile.aff_segment || 'individual',
      tier:            profile.aff_tier || 'bronze',
      link:            `${SITE_URL}/?ref=${profile.ref_code}`,
      conversion_rate: profile.aff_clicks > 0 ? Math.round((profile.aff_conversions / profile.aff_clicks) * 100) : 0,
    },
    commissions:          commissions || [],
    withdrawals:          withdrawals || [],
    ranking,
    notifications:        notifs || [],
    unread_notifications: unreadCount,
    config:               cfg,
  });
}

async function affClick(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body    = parseBody(req);
  const refCode = (body.ref_code || '').trim().toUpperCase();
  const page    = (body.page || '/').slice(0, 200);
  if (!refCode) return res.status(400).json({ error: 'ref_code em falta' });

  const crypto = require('crypto');
  const ip     = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip + refCode).digest('hex').slice(0, 16);

  // Antifraude: verificar burst de cliques
  const recentClicks = await _select('affiliate_clicks',
    `select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}`);
  const clickCount = (recentClicks || []).length;

  if (clickCount >= 30) {
    const affRows = await _select('profiles', `select=id&ref_code=eq.${refCode}&limit=1`);
    if (affRows?.[0]) {
      _insert('affiliate_fraud_flags', {
        affiliate_id: affRows[0].id,
        flag_type:    'ip_burst',
        description:  `IP com ${clickCount + 1} cliques na última hora`,
        severity:     'critical',
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true });
  }

  rpc('register_affiliate_click', { p_ref_code: refCode, p_ip_hash: ipHash, p_page: page })
    .catch(e => console.error('[affClick]', e.message));
  return res.status(200).json({ ok: true });
}

async function affWithdraw(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseInt(body.amount || 0);

  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });

  const profRows = await _select('profiles',
    `select=aff_balance,is_affiliate,aff_is_blocked,aff_tier&id=eq.${user.id}&limit=1`);
  const profile = profRows?.[0];
  if (!profile?.is_affiliate) return res.status(403).json({ error: 'Apenas afiliados aprovados podem levantar' });
  if (profile.aff_is_blocked) return res.status(403).json({ error: 'Conta suspensa. Contacte o suporte.' });

  const minRows = await _select('system_settings', 'select=value&key=eq.aff_min_withdraw&limit=1');
  let minWithdraw = parseInt(minRows?.[0]?.value || '200');
  if (profile.aff_tier === 'diamante') minWithdraw = Math.max(50, Math.floor(minWithdraw * 0.5));

  if (amount < minWithdraw) return res.status(400).json({ error: `Valor mínimo: ${minWithdraw} MZN` });
  if (amount > (profile.aff_balance || 0)) return res.status(400).json({ error: 'Saldo insuficiente' });

  const pendingW = await _select('affiliate_withdrawals',
    `select=id&affiliate_id=eq.${user.id}&status=eq.pending&limit=1`);
  if (pendingW?.length)
    return res.status(400).json({ error: 'Já tem um levantamento pendente. Aguarde a conclusão.' });

  await _insert('affiliate_withdrawals', {
    affiliate_id: user.id, amount, mpesa_phone: phone, status: 'pending',
  });
  await _update('profiles', 'id', user.id, { aff_balance: (profile.aff_balance || 0) - amount });

  _insert('affiliate_notifications', {
    affiliate_id: user.id, type: 'withdrawal',
    title: '💸 Pedido de Levantamento',
    body:  `Pedido de ${amount} MZN submetido. Processado em até 48h via M-Pesa.`,
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: `Pedido de ${amount} MZN submetido. Processado em até 48 horas via M-Pesa.`,
  });
}

async function affCheck(req, res) {
  const refCode = req.query?.ref || '';
  if (!refCode) return res.status(400).json({ error: 'ref em falta' });
  const rows = await _select('profiles',
    `select=full_name,is_affiliate,ref_code,aff_segment&ref_code=eq.${refCode}&limit=1`);
  const data = rows?.[0];
  if (!data) return res.status(404).json({ error: 'Link inválido' });
  return res.status(200).json({
    valid: true, is_affiliate: data.is_affiliate,
    name:    data.full_name || 'Parceiro MzDocs',
    segment: data.aff_segment || 'individual',
  });
}

async function affRanking(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const month = req.query?.month || new Date().toISOString().slice(0, 7);
  const ranking = await _select('affiliate_ranking',
    `select=affiliate_id,rank_position,conversions,revenue_mzn,commission_mzn,tier&month=eq.${month}&order=rank_position.asc&limit=20`);
  if (!ranking?.length) return res.status(200).json({ success: true, ranking: [], month });
  const ids = ranking.map(r => r.affiliate_id).join(',');
  const profiles = await _select('profiles', `select=id,full_name,aff_segment&id=in.(${ids})`);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return res.status(200).json({
    success: true, month,
    ranking: ranking.map(r => ({
      ...r,
      name:    (pm[r.affiliate_id]?.full_name || 'Parceiro').split(' ').slice(0, 2).join(' '),
      segment: pm[r.affiliate_id]?.aff_segment || 'individual',
    })),
  });
}

async function affNotifications(req, res) {
  const user = await getAuthUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  if (req.method === 'POST') {
    await restRequest(
      `affiliate_notifications?affiliate_id=eq.${user.id}&is_read=eq.false`,
      { method: 'PATCH', body: { is_read: true }, prefer: 'return=minimal' }
    );
    return res.status(200).json({ success: true });
  }
  const data = await _select('affiliate_notifications',
    `select=id,type,title,body,is_read,created_at&affiliate_id=eq.${user.id}&order=created_at.desc&limit=20`);
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

// ════════════════════════════════════════════════════════════════════════════
// LEGAL-SEARCH — busca semântica de artigos de lei (Fase 2: Motor Jurídico)
// POST /api/legal-search
//
// Substitui as citações estáticas (hard-coded) nos prompts de
// assets/js/services/prompts/{arrendamento,requerimento,residencia,
// procuracao,acta}.js por artigos REAIS recuperados da base vectorial —
// ver docs/legal/VERIFICACAO-LEGAL.md para o histórico de erros que esta
// mudança visa evitar (citações de leis inexistentes, artigos trocados).
//
// O frontend chama isto ANTES de montar o prompt final para
// generate-document.js, e injecta o resultado na secção "BASE LEGAL" —
// ver assets/js/services/LegalContext.js.
// ════════════════════════════════════════════════════════════════════════════

const _legalSearchRateMap = new Map(); // IP → { count, reset }

function checkLegalSearchRateLimit(ip) {
  const key    = `rl:legal-search:${ip}`;
  const limit  = 20;         // max 20 buscas por IP por minuto — generoso para uso normal
  const window = 60 * 1000;
  const now    = Date.now();
  const entry  = _legalSearchRateMap.get(key) || { count: 0, reset: now + window };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window; }
  entry.count++;
  _legalSearchRateMap.set(key, entry);
  return entry.count <= limit;
}

// Mapeia cada serviço jurídico aos diplomas relevantes — restringir a
// busca evita que, por exemplo, uma procuração receba por engano um
// artigo do Código Penal sobre crimes fiscais só porque a frase tem
// alguma semelhança semântica incidental. Quando um serviço não está
// aqui, a busca corre sobre TODOS os diplomas confirmados.
const DIPLOMAS_POR_SERVICO = {
  arrendamento: ['codigo-civil'],
  procuracao:   ['codigo-civil', 'codigo-notariado', 'estatuto-oam'],
  requerimento: ['lei-proteccao-social', 'lei-orgaos-locais', 'lei-estrangeiros', 'lei-sistema-tributario'],
  residencia:   ['codigo-civil', 'codigo-penal'],
  acta:         ['codigo-civil', 'lei-actividades-comerciais', 'lei-associacoes'],
};

async function handleLegalSearch(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (ip && !checkLegalSearchRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente dentro de 1 minuto.' });
  }

  const body = parseBody(req);
  const { query = '', serviceType = '' } = body;

  if (!query.trim()) {
    return res.status(400).json({ error: 'query é obrigatório (descrição do que se procura, ex: "procuração para venda de imóvel").' });
  }
  if (query.length > 500) {
    return res.status(400).json({ error: 'query demasiado longa (máx. 500 caracteres).' });
  }

  const diplomaSlugs = DIPLOMAS_POR_SERVICO[serviceType] || null;

  try {
    const { resultados, avisoQualidade } = await buscarArtigosRelevantes(query, { diplomaSlugs });
    return res.status(200).json({ resultados, avisoQualidade, encontrado: resultados.length > 0 });
  } catch (err) {
    console.error('[legal-search] erro:', err.message);
    // Falhar de forma graciosa: o frontend trata "encontrado: false" como
    // "sem base legal recuperada" e cai no texto genérico de fallback
    // (ver LegalContext.js) — nunca bloqueia a geração do documento por
    // a busca jurídica ter falhado.
    return res.status(200).json({ resultados: [], avisoQualidade: false, encontrado: false, erro: 'busca_indisponivel' });
  }
}
