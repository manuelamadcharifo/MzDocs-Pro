// api/cleanup-temp-accounts.js — v8.0
// Cron job diário: remove contas Avulso expiradas e zera créditos de contas normais vencidas.
// Vercel Cron: executa à 00:00 UTC todos os dias (ver vercel.json).
// Protegido por CRON_SECRET para evitar acesso não autorizado.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth:     { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  const results = {
    deleted_zero_credits: 0,
    deleted_expired_7days: 0,
    normal_expired_reset: 0,
    errors: [],
  };

  try {
    // ── Regra 1: Contas Avulso com 0 créditos há mais de 24h ──────────────
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: zeroAccounts, error: zeroErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('account_type', 'avulso')
      .eq('credits', 0)
      .not('last_credit_used_at', 'is', null)
      .lt('last_credit_used_at', cutoff24h);

    if (zeroErr) {
      results.errors.push({ rule: 'zero_credits_24h', error: zeroErr.message });
    } else if (zeroAccounts && zeroAccounts.length > 0) {
      for (const account of zeroAccounts) {
        try {
          const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(account.id);
          if (delErr) throw delErr;
          results.deleted_zero_credits++;
        } catch (delError) {
          // Fallback: remover só da tabela profiles (cascade limpa o resto)
          const { error: profileDelErr } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', account.id);
          if (!profileDelErr) {
            results.deleted_zero_credits++;
          } else {
            results.errors.push({ rule: 'zero_credits_delete', id: account.id, error: profileDelErr.message });
          }
        }
      }
    }

    // ── Regra 2: Contas Avulso criadas há mais de 7 dias ──────────────────
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredAccounts, error: expiredErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('account_type', 'avulso')
      .lt('created_at', cutoff7d);

    if (expiredErr) {
      results.errors.push({ rule: 'expired_7days', error: expiredErr.message });
    } else if (expiredAccounts && expiredAccounts.length > 0) {
      for (const account of expiredAccounts) {
        try {
          const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(account.id);
          if (delErr) throw delErr;
          results.deleted_expired_7days++;
        } catch (delError) {
          const { error: profileDelErr } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', account.id);
          if (!profileDelErr) {
            results.deleted_expired_7days++;
          } else {
            results.errors.push({ rule: 'expired_7days_delete', id: account.id, error: profileDelErr.message });
          }
        }
      }
    }

    // ── Regra 3: Contas normais com créditos expirados — zerar, não deletar ──
    const now = new Date().toISOString();
    const { data: normalExpired, error: normalErr } = await supabaseAdmin
      .from('profiles')
      .update({ credits: 0, credits_expires_at: null, updated_at: now })
      .eq('account_type', 'normal')
      .gt('credits', 0)
      .not('credits_expires_at', 'is', null)
      .lt('credits_expires_at', now)
      .select('id');

    if (normalErr) {
      results.errors.push({ rule: 'normal_expired_reset', error: normalErr.message });
    } else {
      results.normal_expired_reset = normalExpired ? normalExpired.length : 0;
    }

    console.log('[cleanup-temp-accounts] Executado:', JSON.stringify(results));

    return res.status(200).json({
      success:      true,
      executed_at:  new Date().toISOString(),
      results,
    });

  } catch (error) {
    console.error('[cleanup-temp-accounts] Erro:', error.message);
    return res.status(500).json({
      error:   'Erro interno no cleanup',
      message: error.message,
    });
  }
};
