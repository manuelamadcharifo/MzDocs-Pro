// api/delete-temp-account.js
// Elimina contas temporárias quando os créditos chegam a zero.
// Chamado pelo Models.js no cliente após applyServerDeduction() detectar saldo zero numa conta temp.
// NOTA: A eliminação principal é feita pelo deduct-credit.js no servidor.
// Este endpoint serve de fallback quando o cliente detecta a situação primeiro.

const { createClient } = require('@supabase/supabase-js');

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
  if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: 'Supabase não configurado' });

  const supabase      = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY || serviceKey);
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // 1. Verificar token e obter user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

    // 2. Confirmar que é conta temporária (segurança — não eliminar contas reais)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('is_temp, credits')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    if (!profile.is_temp) {
      // Conta real — não eliminar, apenas reportar OK para não causar erros no cliente
      return res.status(200).json({ deleted: false, reason: 'not_temp_account' });
    }

    if (profile.credits > 0) {
      // Ainda tem créditos — não eliminar
      return res.status(200).json({ deleted: false, reason: 'has_credits', credits: profile.credits });
    }

    // 3. Eliminar conta temporária (Auth + profile via CASCADE)
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('[delete-temp-account] Erro ao eliminar:', delErr.message);
      return res.status(500).json({ error: 'Falha ao eliminar conta: ' + delErr.message });
    }

    console.log(`[delete-temp-account] Conta temp ${user.id.slice(0,8)}*** eliminada (créditos = 0)`);
    return res.status(200).json({ deleted: true });

  } catch (err) {
    console.error('[delete-temp-account] Excepção:', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
