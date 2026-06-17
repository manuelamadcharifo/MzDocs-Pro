// api/cleanup-temp-accounts.js — v9.0 (AUDITORIA Junho/2026)
// ALTERAÇÕES v9.0:
//  1. Removido @supabase/supabase-js + require('ws') — usa api/_lib/supabaseAdmin.js.
//  2. Lógica de negócio 100% preservada da v8.0.

const {
  restRequest,
  adminDeleteUser,
} = require('./_lib/supabaseAdmin');

const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-cron-secret, x-cron-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // Autenticação via segredo de cron
  const cronSecret = req.headers['x-vercel-cron-secret'] || req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  const results = {
    deleted_zero_credits:  0,
    deleted_expired_7days: 0,
    normal_expired_reset:  0,
    errors:                [],
  };

  async function tryDelete(accountId, rule) {
    const ok = await adminDeleteUser(accountId);
    if (ok) return true;
    // Fallback: remover directamente da tabela profiles
    try {
      await restRequest(`profiles?id=eq.${accountId}`, { method: 'DELETE' });
      return true;
    } catch (err) {
      results.errors.push({ rule, id: accountId, error: err.message });
      return false;
    }
  }

  try {
    // ── Regra 1: Contas Avulso com 0 créditos há mais de 24h ──────────────
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const zeroAccounts = await restRequest(
        `profiles?account_type=eq.avulso&credits=eq.0&last_credit_used_at=not.is.null&last_credit_used_at=lt.${encodeURIComponent(cutoff24h)}&select=id`
      );
      for (const account of (Array.isArray(zeroAccounts) ? zeroAccounts : [])) {
        if (await tryDelete(account.id, 'zero_credits_24h')) results.deleted_zero_credits++;
      }
    } catch (err) {
      results.errors.push({ rule: 'zero_credits_24h', error: err.message });
    }

    // ── Regra 2: Contas Avulso criadas há mais de 7 dias ──────────────────
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const expiredAccounts = await restRequest(
        `profiles?account_type=eq.avulso&created_at=lt.${encodeURIComponent(cutoff7d)}&select=id`
      );
      for (const account of (Array.isArray(expiredAccounts) ? expiredAccounts : [])) {
        if (await tryDelete(account.id, 'expired_7days')) results.deleted_expired_7days++;
      }
    } catch (err) {
      results.errors.push({ rule: 'expired_7days', error: err.message });
    }

    // ── Regra 3: Contas normais com créditos expirados — zerar ───────────
    const now = new Date().toISOString();
    try {
      const normalExpired = await restRequest(
        `profiles?account_type=eq.normal&credits=gt.0&credits_expires_at=not.is.null&credits_expires_at=lt.${encodeURIComponent(now)}&select=id`,
        {
          method: 'PATCH',
          body: { credits: 0, credits_expires_at: null, updated_at: now },
          prefer: 'return=representation',
        }
      );
      results.normal_expired_reset = Array.isArray(normalExpired) ? normalExpired.length : 0;
    } catch (err) {
      results.errors.push({ rule: 'normal_expired_reset', error: err.message });
    }

    console.log('[cleanup-temp-accounts] Executado:', JSON.stringify(results));

    return res.status(200).json({
      success:     true,
      executed_at: new Date().toISOString(),
      results,
    });

  } catch (error) {
    console.error('[cleanup-temp-accounts] Erro:', error.message);
    return res.status(500).json({ error: 'Erro interno no cleanup', message: error.message });
  }
};
