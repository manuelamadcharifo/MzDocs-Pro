// api/process-payment.js — v5.0 (Verificação automática de comprovativos)
//
// ALTERAÇÕES v5.0:
//  1. NOVO: campo opcional receiptImage (base64) no body.
//     Se presente, chama verifyReceiptInternal() de misc.js directamente.
//  2. FIX: duplicate check (409) agora devolve transactionId do registo existente.
//  3. Se receiptImage ausente → status "pending", utilizador faz upload a seguir.
//  4. Resposta inclui nextStep: "upload_receipt" | "completed" | "awaiting_review".
//  5. Mantidas todas as correcções da v4.0 (rate limit, REST puro, erros sanitizados).

const { insert, restRequest, getUserFromToken } = require('./_lib/supabaseAdmin');
const { verifyReceiptInternal } = require('./misc');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';
const WA_NUMBER      = process.env.WA_SUPPORT_NUMBER || '258858695506';

// ── Rate limit (partilha o mesmo padrão de generate-document.js) ─────────────
const _paymentRateMap = new Map();

async function checkPaymentRateLimit(req) {
  const ip  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = `rl:pay:${ip}`;
  const limit = 3;      // máx 3 pedidos de pagamento por IP por hora
  const windowSec = 3600;

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const headers = { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' };
      const incrRes  = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers });
      const count    = (await incrRes.json()).result;
      if (count === 1) await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSec}`, { method: 'POST', headers });
      return count <= limit;
    } catch (_) {}
  }

  const now   = Date.now();
  const entry = _paymentRateMap.get(key) || { count: 0, reset: now + windowSec * 1000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowSec * 1000; }
  entry.count++;
  _paymentRateMap.set(key, entry);
  return entry.count <= limit;
}



// Preços/créditos dos pacotes: única fonte de verdade em _lib/packages.js
// (ver esse ficheiro para o porquê — corrige duplicação em 5 locais).
const { loadPackagesFromSettings } = require('./_lib/packages');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Qualquer número móvel moçambicano válido (8X XXXXXXX):
//  82/83 = mCel (mKesh) · 84/85 = Vodacom (M-Pesa) · 86/87 = Movitel (e-Mola)
const MZ_PHONE_REGEX = /^8[2-7]\d{7}$/;

function generateRef() {
  return `MZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizePhone(raw) {
  let num = String(raw || '').replace(/\D/g, '');
  if (num.startsWith('258')) num = num.slice(3);
  return num;
}

// Detecta a carteira móvel pelo prefixo do número, apenas para
// referência humana na mensagem de WhatsApp (qualquer uma é aceite).
function detectWallet(cleanPhone) {
  const prefix = cleanPhone.slice(0, 2);
  if (prefix === '84' || prefix === '85') return 'M-Pesa (Vodacom)';
  if (prefix === '86' || prefix === '87') return 'e-Mola (Movitel)';
  if (prefix === '82' || prefix === '83') return 'mKesh (mCel)';
  return 'Carteira móvel';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Rate limit: 3 pedidos/IP/hora (C-3) ──────────────────────────────────
  const allowed = await checkPaymentRateLimit(req);
  if (!allowed) {
    return res.status(429).json({
      error: 'Demasiados pedidos. Aguarde antes de tentar novamente.',
      code:  'RATE_LIMITED',
    });
  }

  try {

  // ── Parse body ────────────────────────────────────────────────────────────
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const packageId        = String(body.packageId  || '').toLowerCase().trim();
  const rawPhone         = String(body.phone || body.phoneNumber || '').trim();
  const mode             = String(body.mode  || 'manual').toLowerCase();
  const rawUserId        = body.userId || null;
  const receiptImage     = body.receiptImage    || null; // base64, opcional
  const receiptMimeType  = body.receiptMimeType || 'image/jpeg';

  // ── Validações ────────────────────────────────────────────────────────────
  if (!rawPhone) {
    return res.status(400).json({ error: 'Número de telemóvel é obrigatório.' });
  }

  const cleanPhone = normalizePhone(rawPhone);
  if (!MZ_PHONE_REGEX.test(cleanPhone)) {
    return res.status(400).json({
      error: 'Número inválido. Use um número moçambicano válido (M-Pesa, e-Mola ou mKesh — ex: 84XXXXXXX, 86XXXXXXX).',
    });
  }
  const normalizedPhone = `+258${cleanPhone}`;
  const wallet = detectWallet(cleanPhone);

  const PACKAGES = await loadPackagesFromSettings();

  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({
      error:     'Pacote inválido.',
      available: Object.keys(PACKAGES),
    });
  }

  const userId = rawUserId && UUID_REGEX.test(String(rawUserId)) ? String(rawUserId) : null;
  const pkg    = PACKAGES[packageId];

  // ── Supabase configurado? ─────────────────────────────────────────────────
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[process-payment] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta!');
    return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
  }

  // ── Modo manual (WhatsApp) ────────────────────────────────────────────────
  if (mode === 'manual') {
    const referenceId = generateRef();

    let txData;
    try {
      // ── Verificar pending duplicado (mesmo userId + pacote nos últimos 30min) ─
      if (userId) {
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const existing = await restRequest(
          `transactions?user_id=eq.${userId}&package_id=eq.${packageId}&status=in.(pending,review_needed)&created_at=gte.${encodeURIComponent(cutoff)}&select=id,reference_id&limit=1`
        ).catch(() => null);
        if (Array.isArray(existing) && existing.length > 0) {
          // FIX v5.0: devolve transactionId para que o frontend possa fazer upload
          // do comprovativo sem criar uma nova transacção duplicada.
          const existingTx  = existing[0];
          const waMsg = encodeURIComponent(`*MzDocs Pro — Pagamento Pendente*\nReferência: ${existingTx.reference_id}\nPackage: ${packageId}`);
          return res.status(200).json({
            success:       true,
            mode:          'manual',
            duplicate:     true,
            referenceId:   existingTx.reference_id,
            transactionId: existingTx.id,
            nextStep:      'upload_receipt',
            message:       'Já tem um pedido pendente para este pacote. Envie o comprovativo abaixo para confirmar.',
            whatsappLink:  `https://wa.me/${WA_NUMBER}?text=${waMsg}`,
          });
        }
      }

      txData = await insert('transactions', {
        reference_id:   referenceId,
        user_id:        userId,
        package_id:     packageId,
        credits:        pkg.credits,
        amount:         pkg.price,
        status:         'pending',
        payment_method: 'manual',
        phone_number:   normalizedPhone,
      });
    } catch (insertErr) {
      // CORRIGIDO (auditoria 3.5): detalhes internos do Supabase (mensagem,
      // código, hint, nomes de colunas/constraints) ficam apenas no log do
      // servidor — nunca são devolvidos ao cliente.
      console.error('[process-payment] ERRO ao gravar transação:', insertErr.message, insertErr.code, insertErr.hint);
      return res.status(500).json({
        error:      'Erro ao registar o pedido. Por favor tente novamente.',
        referenceId, // permite ao suporte localizar a tentativa nos logs, sem expor detalhes do esquema
      });
    }

    const transactionId = txData?.id;
    console.log('[process-payment] Transação criada:', referenceId, '| id:', transactionId, '| user_id:', userId || 'anónimo');

    // Registar em credit_logs — fire-and-forget, nunca bloqueia o fluxo principal
    if (transactionId) {
      try {
        await insert('credit_logs', {
          user_id:        userId,
          transaction_id: transactionId,
          action:         'purchase_pending',
          credits:        pkg.credits,
          document_type:  null,
          note:           `Pacote ${pkg.name} — aguarda confirmação manual (${wallet})`,
        });
      } catch (logErr) {
        console.warn('[process-payment] credit_logs insert falhou (não crítico):', logErr.message);
      }
    }

    const waMessage = encodeURIComponent(
      `*Pagamento MzDocs Pro*\n\n` +
      `Referência: ${referenceId}\n` +
      `Pacote: ${pkg.name}\n` +
      `Créditos: ${pkg.credits}\n` +
      `Valor: ${pkg.price} MZN\n` +
      `Telemóvel: ${normalizedPhone} (${wallet})\n\n` +
      `Segue o comprovativo de pagamento.`
    );
    const whatsappLink = `https://wa.me/${WA_NUMBER}?text=${waMessage}`;

    // ── Verificação automática via IA (se receiptImage enviado junto) ─────
    if (receiptImage && transactionId) {
      const MAX_B64 = 2 * 1024 * 1024 * 1.37;
      if (receiptImage.length > MAX_B64) {
        return res.status(400).json({ error: 'Imagem demasiado grande (máx 2MB).', referenceId, transactionId });
      }
      let verifyResult;
      try {
        verifyResult = await verifyReceiptInternal({
          imageBase64:   receiptImage,
          mimeType:      receiptMimeType,
          reference:     referenceId,
          phone:         normalizedPhone,
          amount:        pkg.price,
          wallet,
          userId,
          transactionId,
          packageId,
        });
      } catch (e) {
        verifyResult = { success: true, verified: false, autoApproved: false, nextStep: 'awaiting_review', message: 'Erro na verificação. A equipa confirma em 15 min.' };
      }
      return res.status(200).json({
        success: true, mode: 'auto_verify', referenceId, transactionId,
        package: pkg, phone: normalizedPhone, wallet, whatsappLink,
        autoVerified: verifyResult.autoApproved || false,
        verified:     verifyResult.verified     || false,
        creditsAdded: verifyResult.creditsAdded || 0,
        nextStep:     verifyResult.nextStep     || 'awaiting_review',
        message:      verifyResult.message      || 'A processar pagamento.',
      });
    }

    // ── Sem imagem: registar pedido e pedir upload ─────────────────────────
    return res.status(200).json({
      success:      true,
      mode:         'manual',
      referenceId,
      transactionId,
      package:      pkg,
      phone:        normalizedPhone,
      wallet,
      autoVerified: false,
      nextStep:     'upload_receipt',
      whatsappLink,
      message:      'Pedido registado. Envie o comprovativo abaixo para confirmação automática.',
    });
  }

  // ── Modo M-Pesa automático (não implementado) ─────────────────────────────
  if (mode === 'mpesa') {
    const isConfigured = !!process.env.MPESA_API_KEY && !!process.env.MPESA_SERVICE_CODE;
    if (!isConfigured) {
      return res.status(503).json({
        error:    'Pagamento automático ainda não disponível. O pagamento é processado manualmente via WhatsApp.',
        fallback: 'Use modo manual',
      });
    }
    return res.status(503).json({ error: 'Integração automática ainda não implementada. Use modo manual.' });
  }

  return res.status(400).json({ error: `Modo inválido: ${mode}` });

  } catch (unexpectedErr) {
    console.error('[process-payment] ERRO INESPERADO:', unexpectedErr.message);
    return res.status(500).json({
      error: 'Erro interno do servidor. Tente novamente.',
    });
  }
};
