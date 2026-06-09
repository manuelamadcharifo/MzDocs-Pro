// api/deduct-credit.js — v2.2 (ws restaurado; fallback count corrigido)
// CORREÇÕES v2.2:
//  1. Restaurado require('ws') e realtime: { transport: ws } — obrigatório em Node.js 20
//     com supabase-js v2.49+ (o supabase instancia RealtimeClient no construtor mesmo
//     que nunca seja usado; sem ws, crasha com "Node.js 20 detected without native WebSocket")
//  2. Corrigido _fallbackDeductWithLock: count vinha sempre null (.select() sem { count:'exact' })

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws'); // obrigatório em Node 20 para supabase-js v2.49+

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';
const VALID_COSTS    = [1, 2]; // custo máximo por operação

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Autenticação via JWT ──────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Autenticação obrigatória.', code: 'AUTH_REQUIRED' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor.' });
  }

  // CORRECÇÃO v2.2: restaurado realtime: { transport: ws } — obrigatório em Node.js 20
  // O supabase-js v2.49+ instancia o RealtimeClient no construtor.
  // Em Node < 22 sem WebSocket nativo é necessário fornecer o pacote 'ws'.
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // ── Verificar JWT ─────────────────────────────────────────────────────────
  let userId;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Inicie sessão novamente.' });
    }
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Erro ao verificar sessão: ' + e.message });
  }

  // ── Ler custo do body — validação estrita ─────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const rawCost = parseInt(body?.cost);
  const cost    = VALID_COSTS.includes(rawCost) ? rawCost : 1;

  const documentType = typeof body?.documentType === 'string'
    ? body.documentType.slice(0, 50).replace(/[^a-z0-9_-]/gi, '')
    : null;

  // ── Verificar se conta está bloqueada ─────────────────────────────────────
  try {
    const { data: profileCheck } = await supabaseAdmin
      .from('profiles')
      .select('is_blocked, credits_expires_at, account_type')
      .eq('id', userId)
      .single();

    if (profileCheck?.is_blocked) {
      return res.status(403).json({
        error: 'Conta bloqueada. Contacte o suporte.',
        code:  'ACCOUNT_BLOCKED',
      });
    }

    if (
      profileCheck?.credits_expires_at &&
      new Date(profileCheck.credits_expires_at) < new Date()
    ) {
      await supabaseAdmin
        .from('profiles')
        .update({ credits: 0, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .gt('credits', 0);

      return res.status(402).json({
        error:        'Créditos expirados.',
        code:         'CREDITS_EXPIRED',
        account_type: profileCheck.account_type,
        credits:      0,
      });
    }
  } catch (e) {
    console.warn('[deduct-credit] Falha ao verificar perfil:', e.message);
  }

  // ── Dedução atómica via RPC ───────────────────────────────────────────────
  try {
    let remaining = null;
    let rpcOk     = false;

    // Tentar função deduct_credits (suporta N créditos)
    const { data: dataN, error: errN } = await supabaseAdmin
      .rpc('deduct_credits', { p_user_id: userId, p_amount: cost });

    if (!errN && dataN !== undefined && dataN !== null) {
      remaining = dataN;
      rpcOk     = true;
    } else if (cost === 1) {
      // Fallback para função antiga (1 crédito)
      const { data: data1, error: err1 } = await supabaseAdmin
        .rpc('deduct_credit', { user_id: userId });
      if (!err1 && data1 !== undefined && data1 !== null) {
        remaining = data1;
        rpcOk     = true;
      }
    }

    if (!rpcOk) {
      // Fallback manual com optimistic locking
      return await _fallbackDeductWithLock(supabaseAdmin, userId, cost, documentType, res);
    }

    if (remaining === -1 || remaining === null) {
      return res.status(402).json({
        error:   'Créditos insuficientes.',
        code:    'INSUFFICIENT_CREDITS',
        credits: 0,
      });
    }

    // ── Registar no credit_logs ────────────────────────────────────────────
    await supabaseAdmin.from('credit_logs').insert({
      user_id:       userId,
      action:        'consume',
      credits:       -cost,
      document_type: documentType,
      note:          `Dedução de ${cost} crédito(s) via RPC`,
    }).catch(e => console.warn('[deduct-credit] credit_logs falhou:', e.message));

    if (remaining === 0) {
      _tryDeleteAvulsoAccount(supabaseAdmin, userId);
    }

    return res.status(200).json({
      success: true,
      credits: remaining,
      source:  'supabase_rpc',
    });

  } catch (e) {
    console.error('[deduct-credit] Excepção:', e.message, e.stack);
    return res.status(500).json({ error: 'Erro interno ao deduzir crédito.' });
  }
};

// ── Fallback com optimistic locking manual ────────────────────────────────
async function _fallbackDeductWithLock(supabaseAdmin, userId, cost, documentType, res) {
  try {
    const { data: profile, error: selErr } = await supabaseAdmin
      .from('profiles')
      .select('credits, is_temp, account_type')
      .eq('id', userId)
      .single();

    if (selErr || !profile) {
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    if (profile.credits < cost) {
      return res.status(402).json({
        error:   'Créditos insuficientes.',
        code:    'INSUFFICIENT_CREDITS',
        credits: profile.credits,
      });
    }

    const newCredits = profile.credits - cost;

    // CORRECÇÃO: usar { count: 'exact' } para obter contagem real de linhas afectadas
    const { data: updData, error: updErr, count } = await supabaseAdmin
      .from('profiles')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('credits', profile.credits) // optimistic lock
      .select('id', { count: 'exact' });

    if (updErr) throw updErr;

    // Verificar se a linha foi actualizada (count pode ser null em algumas versões)
    // Usar data length como alternativa segura
    const affectedRows = count ?? (Array.isArray(updData) ? updData.length : 0);
    if (affectedRows === 0) {
      return res.status(409).json({
        error: 'Conflito de actualização — tente novamente.',
        code:  'RACE_CONDITION',
      });
    }

    await supabaseAdmin.from('credit_logs').insert({
      user_id:       userId,
      action:        'consume',
      credits:       -cost,
      document_type: documentType,
      note:          `Dedução fallback de ${cost} crédito(s)`,
    }).catch(e => console.warn('[deduct-credit] credit_logs fallback falhou:', e.message));

    if (newCredits === 0) {
      _tryDeleteAvulsoAccount(supabaseAdmin, userId, profile);
    }

    return res.status(200).json({
      success: true,
      credits: newCredits,
      source:  'supabase_fallback',
    });
  } catch (e) {
    console.error('[deduct-credit] Fallback excepção:', e.message);
    return res.status(500).json({ error: 'Erro no fallback de dedução: ' + e.message });
  }
}

// ── Auto-eliminar conta avulso (fire-and-forget) ──────────────────────────
async function _tryDeleteAvulsoAccount(supabaseAdmin, userId, knownProfile = null) {
  try {
    const profile = knownProfile || (await supabaseAdmin
      .from('profiles')
      .select('account_type, is_temp')
      .eq('id', userId)
      .single()
    ).data;

    if (profile?.is_temp || profile?.account_type === 'avulso') {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.log('[deduct-credit] Conta avulso eliminada após 0 créditos:', userId.slice(0, 8) + '***');
    }
  } catch (e) {
    console.warn('[deduct-credit] Falha ao eliminar conta avulso:', e.message);
  }
}
