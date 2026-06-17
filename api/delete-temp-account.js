// api/delete-temp-account.js — v9.0 (AUDITORIA Junho/2026)
// ALTERAÇÕES v9.0:
//  1. Removido @supabase/supabase-js + require('ws') — usa api/_lib/supabaseAdmin.js.
//  2. Lógica de negócio 100% preservada da v8.0.

const {
  getUserFromToken,
  selectOne,
  restRequest,
  adminDeleteUser,
} = require('./_lib/supabaseAdmin');

const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  try {
    // 1. Verificar token e obter utilizador
    const { user, error: authErr } = await getUserFromToken(token);
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

    // 2. Confirmar que é conta avulso
    const profile = await selectOne(
      'profiles', 'id', user.id,
      'account_type,credits,last_credit_used_at,created_at'
    );

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    if (profile.account_type !== 'avulso') {
      return res.status(200).json({ deleted: false, reason: 'not_avulso_account' });
    }

    if (profile.credits > 0) {
      return res.status(200).json({ deleted: false, reason: 'has_credits', credits: profile.credits });
    }

    // Verificar janelas de graça
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

    // 3. Eliminar conta via Auth Admin API
    const deleted = await adminDeleteUser(user.id);
    if (!deleted) {
      // Fallback: eliminar directamente o profile
      try {
        await restRequest(`profiles?id=eq.${user.id}`, { method: 'DELETE' });
      } catch (profileDelErr) {
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
