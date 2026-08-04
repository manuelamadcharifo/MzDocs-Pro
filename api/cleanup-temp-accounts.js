// api/cleanup-temp-accounts.js — v10.0 (P2 — expiração real de créditos por lote)
// ALTERAÇÕES v10.0:
//  1. NOVO: a antiga "Regra 3" zerava profiles.credits POR COMPLETO quando
//     uma única data (credits_expires_at, escrita só no registo) passava —
//     o que também apagava créditos comprados depois dessa data, sem
//     relação com a data real de compra. Substituída pela chamada à nova
//     função expire_credit_batches() (migration_v52_credit_ledger.sql), que
//     expira cada LOTE de créditos 30 dias após a SUA própria data de
//     aquisição (grátis, compra, referência, reembolso — ver migração para
//     o detalhe completo), sem tocar em créditos de lotes ainda válidos.
//  2. Preservada 100% a lógica das Regras 1 e 2 (contas Avulso).
const {
  restRequest,
  adminDeleteUser,
  rpc,
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
    accounts_credits_expired: 0,
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

    // ── Regra 3 (P2 — v52): expirar créditos por LOTE via credit_ledger ───
    // Substitui o antigo reset total de profiles.credits numa única data;
    // ver nota v10.0 no cabeçalho e migration_v52_credit_ledger.sql.
    try {
      const accountsAffected = await rpc('expire_credit_batches', {});
      results.accounts_credits_expired = typeof accountsAffected === 'number' ? accountsAffected : 0;
    } catch (err) {
      results.errors.push({ rule: 'expire_credit_batches', error: err.message });
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
