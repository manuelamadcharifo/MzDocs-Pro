// api/deduct-credit.js — v3.0
// ──────────────────────────────────────────────────────────────────────────
// CORREÇÕES v3.0 (AUDITORIA Junho/2026):
//  1. Removido @supabase/supabase-js e require('ws'). Este ficheiro passou a
//     usar api/_lib/supabaseAdmin.js, que fala directamente com a REST API
//     do Supabase via fetch puro. Isto elimina por completo o erro
//     "Node.js 20 detected without native WebSocket" e o cenário em que o
//     crédito era debitado mas a função rebentava antes de responder.
//  2. NOVO: suporta `{ refund: true, cost, documentType }` — devolve créditos
//     a um utilizador quando /api/generate-document falha após a dedução
//     (chamado automaticamente pelo servidor em generate-document.js).
//  3. Lógica de negócio (verificação de conta bloqueada/expirada, RPC
//     deduct_credits, fallback com optimistic locking, eliminação de contas
//     avulso a 0 créditos) mantida igual à v2.3.
// ──────────────────────────────────────────────────────────────────────────

const {
  getUserFromToken,
  selectOne,
  update,
  insert,
  rpc,
  adminDeleteUser,
} = require('./_lib/supabaseAdmin');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';
// CORRIGIDO: limite fixo de [1, 2] impedia cobrar templates premium da
// galeria comunitária com preço mais alto (ex.: um template muito
// elaborado que o admin decida valer 5 créditos) — qualquer custo fora
// dessa lista caía silenciosamente no fallback de 1 crédito (ver linha
// "VALID_COSTS.includes(rawCost) ? rawCost : 1" abaixo), cobrando menos
// do que o admin definiu. Passa a aceitar-se 1-10, faixa suficiente para
// a variação de preço de templates (a validação em api/admin/index.js
// → handleTemplates limita credit_cost a 0-50 na definição do preço, mas
// o consumo normal de documentos/templates nunca deve exceder 10 créditos
// numa única operação — isto continua a proteger contra valores anómalos
// vindos de um cliente comprometido).
const VALID_COSTS    = Array.from({ length: 10 }, (_, i) => i + 1); // 1 a 10 créditos por operação

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

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor.' });
  }

  // ── Verificar JWT ─────────────────────────────────────────────────────────
  let userId;
  try {
    const { user, error } = await getUserFromToken(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Inicie sessão novamente.' });
    }
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Erro ao verificar sessão: ' + e.message });
  }

  // ── Ler corpo do pedido ──────────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const rawCost = parseInt(body?.cost);
  const cost    = VALID_COSTS.includes(rawCost) ? rawCost : 1;

  const documentType = typeof body?.documentType === 'string'
    ? body.documentType.slice(0, 50).replace(/[^a-z0-9_-]/gi, '')
    : null;

  // ── MODO REEMBOLSO ───────────────────────────────────────────────────────
  // Usado quando /api/generate-document falhou DEPOIS de o crédito já ter
  // sido debitado (todos os provedores de IA indisponíveis, etc.).
  if (body?.refund === true) {
    return await _refundCredit(userId, cost, documentType, res);
  }

  // ── Verificar se conta está bloqueada / créditos expirados ────────────────
  try {
    const profileCheck = await selectOne('profiles', 'id', userId, 'is_blocked,credits_expires_at,account_type');

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
      await update('profiles', 'id', userId, { credits: 0, updated_at: new Date().toISOString() }, '&credits=gt.0');

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
    try {
      const dataN = await rpc('deduct_credits', { p_user_id: userId, p_amount: cost });
      if (dataN !== undefined && dataN !== null) {
        remaining = dataN;
        rpcOk     = true;
      }
    } catch (errN) {
      if (cost === 1) {
        // Fallback para função antiga (1 crédito)
        try {
          const data1 = await rpc('deduct_credit', { user_id: userId });
          if (data1 !== undefined && data1 !== null) {
            remaining = data1;
            rpcOk     = true;
          }
        } catch (err1) { /* segue para fallback manual */ }
      }
    }

    if (!rpcOk) {
      // Fallback manual com optimistic locking
      return await _fallbackDeductWithLock(userId, cost, documentType, res);
    }

    if (remaining === -1 || remaining === null) {
      return res.status(402).json({
        error:   'Créditos insuficientes.',
        code:    'INSUFFICIENT_CREDITS',
        credits: 0,
      });
    }

    // ── Registar no credit_logs ────────────────────────────────────────────
    try {
      await insert('credit_logs', {
        user_id:       userId,
        action:        'consume',
        credits:       -cost,
        document_type: documentType,
        note:          `Dedução de ${cost} crédito(s) via RPC`,
      });
    } catch (e) { console.warn('[deduct-credit] credit_logs falhou:', e.message); }

    if (remaining === 0) {
      _tryDeleteAvulsoAccount(userId);
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
async function _fallbackDeductWithLock(userId, cost, documentType, res) {
  try {
    const profile = await selectOne('profiles', 'id', userId, 'credits,is_temp,account_type');

    if (!profile) {
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

    // Optimistic lock: só actualiza se 'credits' ainda for o valor lido.
    const updData = await update(
      'profiles', 'id', userId,
      { credits: newCredits, updated_at: new Date().toISOString() },
      `&credits=eq.${profile.credits}`
    );

    const affectedRows = Array.isArray(updData) ? updData.length : 0;
    if (affectedRows === 0) {
      return res.status(409).json({
        error: 'Conflito de actualização — tente novamente.',
        code:  'RACE_CONDITION',
      });
    }

    try {
      await insert('credit_logs', {
        user_id:       userId,
        action:        'consume',
        credits:       -cost,
        document_type: documentType,
        note:          `Dedução fallback de ${cost} crédito(s)`,
      });
    } catch (e) { console.warn('[deduct-credit] credit_logs fallback falhou:', e.message); }

    if (newCredits === 0) {
      _tryDeleteAvulsoAccount(userId, profile);
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

// ── Reembolso automático (NOVO v3.0) ──────────────────────────────────────
// Chamado quando /api/generate-document falha por completo após o crédito
// já ter sido debitado. Devolve `cost` créditos ao utilizador e regista o
// motivo em credit_logs.
async function _refundCredit(userId, cost, documentType, res) {
  try {
    let newCredits = null;
    let usedRpc    = false;

    try {
      const data = await rpc('refund_credit', { p_user_id: userId, p_amount: cost });
      if (data !== undefined && data !== null) {
        newCredits = data;
        usedRpc    = true;
      }
    } catch (e) {
      console.warn('[deduct-credit] RPC refund_credit indisponível, a usar fallback:', e.message);
    }

    if (!usedRpc) {
      // Fallback manual: ler créditos actuais e somar
      const profile = await selectOne('profiles', 'id', userId, 'credits');
      if (!profile) {
        return res.status(404).json({ error: 'Perfil não encontrado.' });
      }
      newCredits = (profile.credits || 0) + cost;
      await update('profiles', 'id', userId, { credits: newCredits, updated_at: new Date().toISOString() });

      try {
        await insert('credit_logs', {
          user_id:       userId,
          action:        'refund',
          credits:       cost,
          document_type: documentType,
          note:          'Reembolso automático (fallback) — geração falhou após dedução',
        });
      } catch (e) { console.warn('[deduct-credit] credit_logs refund fallback falhou:', e.message); }
    }

    return res.status(200).json({
      success:  true,
      refunded: true,
      credits:  newCredits,
    });
  } catch (e) {
    console.error('[deduct-credit] Excepção no reembolso:', e.message);
    return res.status(500).json({ error: 'Erro ao reembolsar crédito.' });
  }
}

// ── Auto-eliminar conta avulso (fire-and-forget) ──────────────────────────
async function _tryDeleteAvulsoAccount(userId, knownProfile = null) {
  try {
    const profile = knownProfile || await selectOne('profiles', 'id', userId, 'account_type,is_temp');

    if (profile?.is_temp || profile?.account_type === 'avulso') {
      await adminDeleteUser(userId);
      console.log('[deduct-credit] Conta avulso eliminada após 0 créditos:', userId.slice(0, 8) + '***');
    }
  } catch (e) {
    console.warn('[deduct-credit] Falha ao eliminar conta avulso:', e.message);
  }
}
