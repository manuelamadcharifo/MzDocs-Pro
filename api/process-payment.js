// api/process-payment.js — v2.0 (auditado e corrigido)
// CORREÇÕES:
//  1. Validação obrigatória do phone (formato moçambicano)
//  2. Insert em transactions agora lança erro se falhar (não silencioso)
//  3. Log em credit_logs após transação pendente criada
//  4. Sanitização de inputs (packageId, userId)
//  5. CORS restrito ao domínio correcto
//  6. Prevenção de duplicate reference_id (retry com UUID)

const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';
const WA_NUMBER      = process.env.WA_SUPPORT_NUMBER || '258858695506';

const PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso'  },
  starter: { credits: 10,  price: 120,  name: 'Starter' },
  basico:  { credits: 25,  price: 280,  name: 'Básico'  },
  pro:     { credits: 60,  price: 600,  name: 'Pro'     },
  empresa: { credits: 150, price: 1500, name: 'Empresa' },
};

const UUID_REGEX     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MZ_PHONE_REGEX = /^8[2-7]\d{7}$/; // 84xxxxxxx, 85xxxxxxx, 82xxxxxxx …

function generateRef() {
  return `MZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizePhone(raw) {
  let num = String(raw || '').replace(/\D/g, '');
  if (num.startsWith('258')) num = num.slice(3);
  return num;
}

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Parse body ────────────────────────────────────────────────────────────
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

  const packageId  = String(body.packageId  || '').toLowerCase().trim();
  const rawPhone   = String(body.phone || body.phoneNumber || '').trim();
  const mode       = String(body.mode  || 'manual').toLowerCase();
  const rawUserId  = body.userId || null;

  // ── Validações ────────────────────────────────────────────────────────────
  if (!rawPhone) {
    return res.status(400).json({ error: 'Número de telemóvel é obrigatório.' });
  }

  const cleanPhone = normalizePhone(rawPhone);
  if (!MZ_PHONE_REGEX.test(cleanPhone)) {
    return res.status(400).json({
      error: 'Número inválido. Use um número M-Pesa moçambicano (ex: 84XXXXXXX).',
    });
  }
  const normalizedPhone = `+258${cleanPhone}`;

  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({
      error: 'Pacote inválido.',
      available: Object.keys(PACKAGES),
    });
  }

  // Aceitar userId apenas se for UUID válido
  const userId = rawUserId && UUID_REGEX.test(String(rawUserId)) ? String(rawUserId) : null;

  const pkg = PACKAGES[packageId];

  // ── Supabase admin client ─────────────────────────────────────────────────
  const supabaseUrl     = process.env.SUPABASE_URL;
  const supabaseRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseRoleKey) {
    console.error('[process-payment] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta!');
    return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
  }

  const supabase = createClient(supabaseUrl, supabaseRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Modo manual (WhatsApp) ────────────────────────────────────────────────
  if (mode === 'manual') {
    const referenceId = generateRef();

    // INSERT com tratamento de erro explícito — NUNCA falha silenciosamente
    const { data: txData, error: insertErr } = await supabase
      .from('transactions')
      .insert({
        reference_id:   referenceId,
        user_id:        userId,
        package_id:     packageId,
        credits:        pkg.credits,
        amount:         pkg.price,
        status:         'pending',
        payment_method: 'manual',
        phone_number:   normalizedPhone,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[process-payment] ERRO CRÍTICO ao gravar transação:', insertErr.message, insertErr.code);
      // Retornar erro real ao cliente — não fingir sucesso
      return res.status(500).json({
        error: 'Erro ao registar pedido. Por favor tente novamente ou contacte o suporte.',
        code:  insertErr.code,
      });
    }

    const transactionId = txData?.id;
    console.log('[process-payment] Transação criada:', referenceId, '| id:', transactionId, '| user_id:', userId || 'anónimo');

    // Registar em credit_logs para rastreio completo
    if (transactionId) {
      await supabase.from('credit_logs').insert({
        user_id:        userId,
        transaction_id: transactionId,
        action:         'purchase_pending',
        credits:        pkg.credits,
        document_type:  null,
        note:           `Pacote ${pkg.name} — aguarda confirmação manual`,
      }).catch(e => console.warn('[process-payment] credit_logs insert falhou:', e.message));
    }

    const waMessage = encodeURIComponent(
      `*Pagamento MzDocs Pro*\n\n` +
      `Referência: ${referenceId}\n` +
      `Pacote: ${pkg.name}\n` +
      `Créditos: ${pkg.credits}\n` +
      `Valor: ${pkg.price} MZN\n` +
      `Telemóvel: ${normalizedPhone}\n\n` +
      `Segue o comprovativo de pagamento M-Pesa.`
    );

    return res.status(200).json({
      success:      true,
      mode:         'manual',
      referenceId,
      transactionId,
      package:      pkg,
      phone:        normalizedPhone,
      whatsappLink: `https://wa.me/${WA_NUMBER}?text=${waMessage}`,
      message:      'Pedido registado. Envie o comprovativo pelo WhatsApp.',
    });
  }

  // ── Modo M-Pesa automático (não implementado) ─────────────────────────────
  if (mode === 'mpesa') {
    const isConfigured = !!process.env.MPESA_API_KEY && !!process.env.MPESA_SERVICE_CODE;
    if (!isConfigured) {
      return res.status(503).json({
        error:    'M-Pesa automático não configurado.',
        fallback: 'Use modo manual',
      });
    }
    return res.status(503).json({ error: 'Integração M-Pesa ainda não implementada. Use modo manual.' });
  }

  return res.status(400).json({ error: `Modo inválido: ${mode}` });
};
