// api/deduct-credit.js
// Dedução atómica de N créditos no servidor — usa JWT do utilizador para autenticar.
// O cliente NUNCA envia o nº de créditos a ter; apenas envia o custo do serviço.
// O servidor lê e debita directamente no Supabase.
// Suporta contas temporárias (is_temp): auto-eliminação ao chegar a 0 (feita aqui no Node).

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Autenticação via JWT ─────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  if (!token) {
    return res.status(401).json({
      error: 'Autenticação obrigatória para usar créditos.',
      code: 'AUTH_REQUIRED',
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // ── Verificar JWT ────────────────────────────────────────────────────────
  let userId = null;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Inicie sessão novamente.' });
    }
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Erro ao verificar sessão: ' + e.message });
  }

  // ── Ler custo do body (validado e limitado no servidor) ─────────────────
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const rawCost = parseInt(body?.cost) || 1;
  const cost    = Math.max(1, Math.min(rawCost, 10)); // máx. 10 créditos por segurança

  // ── Dedução atómica ─────────────────────────────────────────────────────
  // 1ª tentativa: nova função deduct_credits(UUID, INTEGER) — suporta N créditos
  // 2ª tentativa: função antiga deduct_credit(UUID) — só 1 crédito
  // 3ª tentativa: fallback via SELECT + UPDATE directo
  try {
    let remaining = null;
    let rpcOk     = false;

    const { data: dataN, error: errN } = await supabaseAdmin
      .rpc('deduct_credits', { p_user_id: userId, p_amount: cost });

    if (!errN) {
      remaining = dataN;
      rpcOk     = true;
    } else if (cost === 1) {
      // Fallback para função antiga (1 crédito)
      const { data: data1, error: err1 } = await supabaseAdmin
        .rpc('deduct_credit', { user_id: userId });
      if (!err1) { remaining = data1; rpcOk = true; }
    }

    if (!rpcOk) {
      return await fallbackDeduct(supabaseAdmin, userId, cost, res);
    }

    if (remaining === -1 || remaining === null) {
      return res.status(402).json({
        error: 'Créditos insuficientes.',
        code: 'INSUFFICIENT_CREDITS',
        credits: 0,
      });
    }

    // ── Auto-eliminação de conta temp ao chegar a 0 ──────────────────────
    // Feita aqui no Node com service_role — mais fiável do que dentro do SQL DEFINER
    if (remaining === 0) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('profiles').select('is_temp').eq('id', userId).single();
        if (profile?.is_temp) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          console.log(`[deduct-credit] Conta temp ${userId.slice(0,8)}*** eliminada após 0 créditos`);
        }
      } catch (delErr) {
        console.warn('[deduct-credit] Falha ao eliminar conta temp:', delErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      credits: remaining,
      source: 'supabase_rpc',
    });

  } catch (e) {
    console.error('[deduct-credit] Excepção:', e.message);
    return res.status(500).json({ error: 'Erro interno ao deduzir crédito.' });
  }
};

// ── Fallback: SELECT + UPDATE directo (se os RPCs não existirem) ──────────
async function fallbackDeduct(supabaseAdmin, userId, cost, res) {
  try {
    const { data: profile, error: selErr } = await supabaseAdmin
      .from('profiles')
      .select('credits, is_temp')
      .eq('id', userId)
      .single();

    if (selErr || !profile) {
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    if (profile.credits < cost) {
      return res.status(402).json({
        error: 'Créditos insuficientes.',
        code: 'INSUFFICIENT_CREDITS',
        credits: profile.credits,
      });
    }

    const newCredits = profile.credits - cost;

    const { error: updErr } = await supabaseAdmin
      .from('profiles')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updErr) throw updErr;

    if (newCredits === 0 && profile.is_temp) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        console.log(`[deduct-credit] Conta temp ${userId.slice(0,8)}*** eliminada (fallback)`);
      } catch (delErr) {
        console.warn('[deduct-credit] Falha ao eliminar conta temp (fallback):', delErr.message);
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
