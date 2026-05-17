// api/delete-temp-account.js — v8.0
// Elimina contas temporárias (account_type = 'avulso') quando os créditos chegam a zero.
// A eliminação principal é feita por deduct-credit.js; este endpoint serve de fallback
// quando o cliente detecta a situação primeiro, ou quando o cron cleanup não apanhou a conta.
//
// Regras:
//   – Conta só pode ser eliminada se account_type === 'avulso'
//   – Deve ter credits === 0 E last_credit_used_at > 24h atrás, OU created_at > 7 dias atrás

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  const supabase      = createClient(supabaseUrl, anonKey || serviceKey, { realtime: { transport: ws } });
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth:     { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  try {
    // 1. Verificar token e obter utilizador
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

    // 2. Confirmar que é conta avulso
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('account_type, credits, last_credit_used_at, created_at')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    // Contas normais não são eliminadas por este endpoint
    if (profile.account_type !== 'avulso') {
      return res.status(200).json({ deleted: false, reason: 'not_avulso_account' });
    }

    // Ainda tem créditos — não eliminar
    if (profile.credits > 0) {
      return res.status(200).json({ deleted: false, reason: 'has_credits', credits: profile.credits });
    }

    // Verificar regras de tempo (janelas de graça)
    const now       = Date.now();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();

    const zeroCreditsExpired = profile.last_credit_used_at && profile.last_credit_used_at < cutoff24h;
    const createdExpired     = profile.created_at && profile.created_at < cutoff7d;

    if (!zeroCreditsExpired && !createdExpired) {
      const graceEnds = profile.last_credit_used_at
        ? new Date(new Date(profile.last_credit_used_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      return res.status(200).json({
        deleted:           false,
        reason:            'within_grace_period',
        grace_period_ends: graceEnds,
      });
    }

    // 3. Eliminar conta (Auth cascade deleta profiles se configurado)
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('[delete-temp-account] Erro ao eliminar Auth:', delErr.message);
      // Fallback: eliminar directamente o profile
      const { error: profileDelErr } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', user.id);
      if (profileDelErr) {
        return res.status(500).json({ error: 'Falha ao eliminar conta: ' + profileDelErr.message });
      }
    }

    console.log('[delete-temp-account] Conta avulso ' + user.id.slice(0, 8) + '*** eliminada');
    return res.status(200).json({ deleted: true, deleted_at: new Date().toISOString() });

  } catch (err) {
    console.error('[delete-temp-account] Excepção:', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
