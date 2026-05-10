// api/deduct-credit.js
// Dedução atómica de crédito no servidor — usa JWT do utilizador para autenticar.
// O cliente NUNCA envia o nº de créditos; o servidor lê e debita directamente no Supabase.
// Suporta contas temporárias (is_temp): auto-eliminação ao chegar a 0.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Autenticação via JWT ────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const supabaseUrl     = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey      = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  // Supabase admin client (service role) — para RPC e deleção de utilizadores temp
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  let userId = null;

  if (token) {
    // Verificar JWT e obter userId sem confiar no cliente
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada. Inicie sessão novamente.' });
      }
      userId = user.id;
    } catch (e) {
      return res.status(401).json({ error: 'Erro ao verificar sessão: ' + e.message });
    }
  } else {
    // Sem JWT: não permitido — créditos só para utilizadores autenticados
    return res.status(401).json({
      error: 'Autenticação obrigatória para usar créditos.',
      code: 'AUTH_REQUIRED',
    });
  }

  // ── Dedução atómica via RPC ─────────────────────────────────────────────
  // A função deduct_credit no Supabase:
  //   1. Lê credits e is_temp com FOR UPDATE (lock)
  //   2. Subtrai 1 crédito
  //   3. Se ficou a 0 e is_temp=true → apaga auth.users (CASCADE apaga o resto)
  //   4. Retorna créditos restantes, ou -1 se insuficientes
  try {
    const { data: remaining, error: rpcErr } = await supabaseAdmin
      .rpc('deduct_credit', { user_id: userId });

    if (rpcErr) {
      console.error('[deduct-credit] RPC error:', rpcErr.message);
      // Tentar fallback: ler e decrementar directamente
      return await fallbackDeduct(supabaseAdmin, userId, res);
    }

    if (remaining === -1 || remaining === null) {
      return res.status(402).json({
        error: 'Créditos insuficientes.',
        code: 'INSUFFICIENT_CREDITS',
        credits: 0,
      });
    }

    // Sucesso — devolver créditos restantes vindos do servidor
    return res.status(200).json({
      success: true,
      credits: remaining,         // valor real do servidor
      source: 'supabase_rpc',
    });

  } catch (e) {
    console.error('[deduct-credit] Excepção:', e.message);
    return res.status(500).json({ error: 'Erro interno ao deduzir crédito.' });
  }
};

// Fallback: ler + update se o RPC não estiver disponível
async function fallbackDeduct(supabaseAdmin, userId, res) {
  try {
    const { data: profile, error: selErr } = await supabaseAdmin
      .from('profiles')
      .select('credits, is_temp')
      .eq('id', userId)
      .single();

    if (selErr || !profile) {
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    if (profile.credits < 1) {
      return res.status(402).json({
        error: 'Créditos insuficientes.',
        code: 'INSUFFICIENT_CREDITS',
        credits: 0,
      });
    }

    const newCredits = profile.credits - 1;

    const { error: updErr } = await supabaseAdmin
      .from('profiles')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updErr) throw updErr;

    // Auto-eliminação de conta temporária com 0 créditos
    if (newCredits === 0 && profile.is_temp) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.warn('[deduct-credit] Falha ao eliminar conta temp:', delErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      credits: newCredits,
      source: 'supabase_fallback',
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro no fallback de dedução: ' + e.message });
  }
}
