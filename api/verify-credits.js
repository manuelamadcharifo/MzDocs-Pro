// api/verify-credits.js — v3.0 (AUDITORIA Junho/2026)
// ALTERAÇÕES v3.0:
//  1. Removido @supabase/supabase-js + require('ws') — usa api/_lib/supabaseAdmin.js
//     (fetch puro contra REST/Auth API). Elimina o risco de crash "Node 20 + ws".
//  2. Lógica de negócio 100% preservada da v2.0.

const { getUserFromToken, selectOne, update, insert } = require('./_lib/supabaseAdmin');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Autenticação obrigatória ──────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Autenticação obrigatória', code: 'AUTH_REQUIRED' });
  }

  const body      = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const rawUserId = body.userId;

  if (!rawUserId || typeof rawUserId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  try {
    // ── Verificar JWT e extrair userId real ───────────────────────────────
    const { user, error: authErr } = await getUserFromToken(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada', code: 'AUTH_REQUIRED' });
    }

    // ── SEGURANÇA: userId do body deve corresponder ao JWT ────────────────
    if (rawUserId !== user.id) {
      console.warn('[verify-credits] userId mismatch — JWT:', user.id.slice(0,8), 'body:', rawUserId.slice(0,8));
      return res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
    }

    // ── Buscar créditos e estado da conta ─────────────────────────────────
    const data = await selectOne(
      'profiles', 'id', user.id,
      'credits,updated_at,credits_expires_at,account_type,is_blocked'
    );

    if (!data) {
      return res.status(200).json({
        success: true,
        credits: 0,
        source:  'supabase',
        message: 'Perfil ainda não criado',
      });
    }

    // Créditos expirados — zerar antes de responder
    let credits = data.credits || 0;
    if (data.credits_expires_at && new Date(data.credits_expires_at) < new Date()) {
      credits = 0;
      // Zerar no servidor (idempotente, fire-and-forget)
      update('profiles', 'id', user.id,
        { credits: 0, updated_at: new Date().toISOString() },
        '&credits=gt.0'
      ).catch(() => {});
    }

    return res.status(200).json({
      success:            true,
      credits,
      account_type:       data.account_type || 'standard',
      is_blocked:         data.is_blocked   || false,
      credits_expires_at: data.credits_expires_at || null,
      source:             'supabase',
      lastSync:           data.updated_at,
    });

  } catch (e) {
    console.error('[verify-credits] Erro:', e.message);
    return res.status(500).json({ error: 'Erro interno ao verificar créditos' });
  }
};
