// api/_services/account.js — Consolidação de Serverless Functions (Ago/2026)
// ──────────────────────────────────────────────────────────────────────────
// Este ficheiro junta 4 endpoints que antes eram 4 Serverless Functions
// separadas na Vercel:
//   api/verify-credits.js         → handleVerifyCredits
//   api/deduct-credit.js          → handleDeductCredit
//   api/delete-temp-account.js    → handleDeleteTempAccount
//   api/cleanup-temp-accounts.js  → handleCleanupTempAccounts
//
// MOTIVO: o plano Vercel Hobby tem um tecto de 12 Serverless Functions, e o
// projecto estava exactamente em 12/12 — sem margem nenhuma para adicionar
// qualquer função nova (ex.: webhook do PaySuite/ClicPay já desenhado mas
// ainda não integrado, dispatch de SMS M-Pesa). Estes 4 endpoints eram
// candidatos naturais à consolidação: mesmo domínio (contas/créditos),
// mesma assinatura (`handler(req, res)`), tamanho pequeno/médio. A rota
// nova é api/account.js (router fino, mesmo padrão já usado em
// api/misc.js e api/admin/index.js), dispatch por `?_op=`.
//
// NENHUMA lógica de negócio foi alterada — o código de cada handler foi
// movido tal como estava (só a assinatura da função e o module.exports
// mudaram, de "export default" para "export nomeado"). As rotas públicas
// (/api/verify-credits, /api/deduct-credit, /api/delete-temp-account,
// /api/cleanup-temp-accounts) continuam a existir e a funcionar de forma
// idêntica — ver os rewrites novos em vercel.json.
// ──────────────────────────────────────────────────────────────────────────

const {
  getUserFromToken,
  selectOne,
  update,
  insert,
  rpc,
  restRequest,
  adminDeleteUser,
} = require('../_lib/supabaseAdmin');
const { checkRateLimit } = require('../_lib/rateLimit');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';

// ══════════════════════════════════════════════════════════════════════════
// 1. VERIFY-CREDITS (ex-api/verify-credits.js, v3.0)
// ══════════════════════════════════════════════════════════════════════════
async function handleVerifyCredits(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // ── Autenticação obrigatória ──────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Autenticação obrigatória', code: 'AUTH_REQUIRED' });
  }

  const body      = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const rawUserId = body.userId;

  if (!rawUserId || typeof rawUserId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  try {
    // ── Verificar JWT e extrair userId real ───────────────────────────────
    const { user, error: authErr } = await getUserFromToken(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada', code: 'AUTH_REQUIRED' });
    }

    // ── SEGURANÇA: userId do body deve corresponder ao JWT ────────────────
    if (rawUserId !== user.id) {
      console.warn('[verify-credits] userId mismatch — JWT:', user.id.slice(0,8), 'body:', rawUserId.slice(0,8));
      return res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
    }

    // ── Buscar créditos e estado da conta ─────────────────────────────────
    const data = await selectOne(
      'profiles', 'id', user.id,
      'credits,updated_at,credits_expires_at,account_type,is_blocked'
    );

    if (!data) {
      return res.status(200).json({
        success: true,
        credits: 0,
        source:  'supabase',
        message: 'Perfil ainda não criado',
      });
    }

    // Créditos expirados — zerar antes de responder
    let credits = data.credits || 0;
    if (data.credits_expires_at && new Date(data.credits_expires_at) < new Date()) {
      credits = 0;
      // Zerar no servidor (idempotente, fire-and-forget)
      update('profiles', 'id', user.id,
        { credits: 0, updated_at: new Date().toISOString() },
        '&credits=gt.0'
      ).catch(() => {});
    }

    return res.status(200).json({
      success:            true,
      credits,
      account_type:       data.account_type || 'standard',
      is_blocked:         data.is_blocked   || false,
      credits_expires_at: data.credits_expires_at || null,
      source:             'supabase',
      lastSync:           data.updated_at,
    });

  } catch (e) {
    console.error('[verify-credits] Erro:', e.message);
    return res.status(500).json({ error: 'Erro interno ao verificar créditos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 1.5. MY-PACKAGES (NOVO v65) — pacotes exclusivos por categoria de
//      parceiro/afiliado ("... os créditos e preço que aparecer para eles
//      têm de ser diferentes de acordo com a sua categoria", pedido
//      explícito do cliente). Endpoint autenticado, à parte de
//      /api/config (que é público e fica em cache partilhado na CDN — ver
//      nota em handleConfig, site.js): a categoria é sempre resolvida a
//      partir do TOKEN, nunca de um valor enviado pelo cliente.
// ══════════════════════════════════════════════════════════════════════════
async function handleMyPackages(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Nunca cachear — é uma resposta pessoal, diferente por utilizador.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    // Visitante sem sessão simplesmente não tem pacotes exclusivos —
    // não é um erro, é o estado normal de quem ainda não é parceiro.
    return res.status(200).json({ success: true, segment: null, exclusivePackages: {} });
  }

  try {
    const { user, error: authErr } = await getUserFromToken(token);
    if (authErr || !user) {
      return res.status(200).json({ success: true, segment: null, exclusivePackages: {} });
    }

    const { loadPackagesFromSettings, resolveUserPricingSegment, filterPackagesForSegment } = require('../_lib/packages');
    const segment = await resolveUserPricingSegment(user.id);
    if (!segment) {
      return res.status(200).json({ success: true, segment: null, exclusivePackages: {} });
    }

    const allPackages       = await loadPackagesFromSettings();
    const exclusivePackages = filterPackagesForSegment(allPackages, segment);
    // filterPackagesForSegment também deixa passar os pacotes públicos
    // (partnerSegment nulo) — esses já vêm de /api/config, por isso
    // filtram-se aqui só os que são mesmo exclusivos desta categoria.
    const onlyExclusive = {};
    for (const [id, pkg] of Object.entries(exclusivePackages)) {
      if (pkg.partnerSegment === segment) onlyExclusive[id] = pkg;
    }

    return res.status(200).json({ success: true, segment, exclusivePackages: onlyExclusive });
  } catch (e) {
    console.error('[my-packages] Erro:', e.message);
    // Falhar em aberto para "sem pacotes exclusivos" — nunca bloquear o
    // resto do checkout por causa desta funcionalidade extra.
    return res.status(200).json({ success: true, segment: null, exclusivePackages: {} });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2. DEDUCT-CREDIT (ex-api/deduct-credit.js, v3.0)
// ══════════════════════════════════════════════════════════════════════════
// CORRIGIDO (P20 — Master Hardening, Set/2026): VALID_COSTS ficou reduzido a
// um intervalo de sanidade só para a via de REEMBOLSO (ver nota mais abaixo,
// junto de `_refundCredit`) — a via de COBRANÇA já não usa `body.cost` para
// nada. O preço oficial de cada operação vem sempre de
// api/_lib/pricingRegistry.js, nunca do cliente. Ver esse ficheiro para o
// detalhe completo do problema e da correcção.
const VALID_COSTS = Array.from({ length: 10 }, (_, i) => i + 1); // 1 a 10 créditos por operação
const { resolveOfficialCost, CLIENT_ESTIMATED_SERVICES } = require('../_lib/pricingRegistry');

async function handleDeductCredit(req, res) {
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

  // CORRIGIDO (P20): `legacyCost` só é usado na via de REEMBOLSO abaixo —
  // devolver créditos com base no valor que o próprio cliente diz ter sido
  // cobrado é um risco menor e distinto (o pior caso é reembolsar a mais,
  // nunca cobrar de menos) e já está mitigado pela idempotência por
  // operationId (deduct_credits_idempotent/refund_credit_idempotent, ver
  // migration_v60) — não faz parte do âmbito do P20. Mantido tal como
  // estava para não alterar esse comportamento nesta ronda.
  const rawCost    = parseInt(body?.cost);
  const legacyCost = VALID_COSTS.includes(rawCost) ? rawCost : 1;

  const documentType = typeof body?.documentType === 'string'
    ? body.documentType.slice(0, 50).replace(/[^a-z0-9_-]/gi, '')
    : null;

  // operationId gerado pelo CLIENTE, uma única vez por tentativa de geração e
  // reenviado sem alterações em qualquer retry dessa MESMA tentativa (ver
  // Services.js/_callBackend). Permite ao servidor reconhecer um pedido
  // repetido (rede instável, duplo-clique, resposta perdida) e devolver o
  // resultado já processado em vez de debitar/reembolsar duas vezes.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const operationId = typeof body?.operationId === 'string' && UUID_RE.test(body.operationId)
    ? body.operationId
    : null;

  // ── MODO REEMBOLSO ───────────────────────────────────────────────────────
  // Mantém o comportamento anterior (usa o valor enviado pelo cliente,
  // dentro do intervalo de sanidade 1-10) — ver nota acima sobre `legacyCost`.
  if (body?.refund === true) {
    return await _refundCredit(userId, legacyCost, documentType, res, operationId);
  }

  // ── NOVO (P20): custo OFICIAL da cobrança — nunca vindo do cliente ───────
  // `body.cost` é ignorado a partir daqui, EXCEPTO para os serviços em
  // CLIENT_ESTIMATED_SERVICES (ver api/_lib/pricingRegistry.js — hoje só
  // "transcricao": custo por página OCR, um dado que só existe no cliente,
  // limitação pré-existente e documentada, não uma regressão desta ronda).
  // `chargeType` só reconhece 'extra_page' explicitamente (ver
  // LongDocumentEngine.js) — qualquer outro valor (incluindo ausência) é
  // tratado como cobrança inicial normal.
  const chargeType = body?.chargeType === 'extra_page' ? 'extra_page' : 'initial';
  let cost = await resolveOfficialCost({ documentType, chargeType, selectOne });
  if (cost === null && chargeType === 'initial' && documentType && CLIENT_ESTIMATED_SERVICES.has(documentType)) {
    cost = legacyCost;
  }
  if (cost === null) {
    return res.status(400).json({
      error: 'Tipo de cobrança inválido para este serviço.',
      code:  'INVALID_CHARGE_TYPE',
    });
  }

  // ── Verificar se conta está bloqueada / créditos expirados ────────────────
  let creditSource = 'paid'; // valor por omissão seguro (5 downloads/5 edições)
  try {
    const profileCheck = await selectOne('profiles', 'id', userId, 'is_blocked,credits_expires_at,account_type,free_credit_used');

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

    if (profileCheck && profileCheck.free_credit_used !== true) {
      creditSource = 'free';
    } else {
      try {
        const lastTx = await restRequest(
          `transactions?user_id=eq.${userId}&status=eq.completed&order=created_at.desc&limit=1&select=package_id`
        );
        if (Array.isArray(lastTx) && lastTx[0]?.package_id === 'empresa') {
          creditSource = 'enterprise';
        }
      } catch (e) {
        console.warn('[deduct-credit] Falha ao ler última transação (assume paid):', e.message);
      }
    }
  } catch (e) {
    console.warn('[deduct-credit] Falha ao verificar perfil:', e.message);
  }

  // ── NOVO (v66): documento(s) inicial(is) totalmente grátis ────────────────
  // "quero que o primeiro documento seja grátis não 1 crédito como antes...
  // os créditos e preço que aparecer para eles têm de ser diferentes..." —
  // pedido explícito do cliente. Diferença face ao antigo "1 crédito grátis
  // no registo": aquele só cobria um documento se custasse exactamente 1
  // crédito (alguns custam mais — VALID_COSTS vai até 10); isto cobre
  // sempre o custo REAL do primeiro documento, sem tocar em profiles.credits.
  //
  // NUNCA se aplica à compra de templates pagos do marketplace — "os
  // modelos pagos têm que permanecer pagos" — reconhecidos pelo mesmo
  // prefixo já usado em TemplatePicker.js/templates.html
  // ("template_<serviceKey>", ver migration_v64/v65).
  const isTemplatePurchase = typeof documentType === 'string' && documentType.startsWith('template_');
  if (!isTemplatePurchase) {
    try {
      const granted = await rpc('grant_free_document', {
        p_user_id:       userId,
        p_operation_id:  operationId,
        p_document_type: documentType,
      });
      if (granted === true) {
        let remainingCredits = 0;
        try {
          const p = await selectOne('profiles', 'id', userId, 'credits');
          remainingCredits = p?.credits || 0;
        } catch (e) { /* saldo só é informativo aqui — não bloqueia a resposta */ }
        return res.status(200).json({
          success:     true,
          credits:     remainingCredits,
          free:        true,
          creditSource: 'free_first_document',
        });
      }
    } catch (e) {
      // grant_free_document indisponível (migração ainda não corrida) ou
      // falhou por outro motivo — nunca bloquear o utilizador por causa
      // desta funcionalidade extra, segue para a dedução paga normal.
      console.warn('[deduct-credit] grant_free_document falhou/indisponível:', e.message);
    }
  }

  // ── Dedução atómica via RPC ───────────────────────────────────────────────
  try {
    let remaining = null;
    let rpcOk     = false;
    let replayed  = false;

    if (operationId) {
      try {
        const rows = await rpc('deduct_credits_idempotent', {
          p_user_id:       userId,
          p_amount:        cost,
          p_operation_id:  operationId,
          p_document_type: documentType,
          p_credit_source: creditSource,
        });
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row && typeof row.remaining_credits === 'number') {
          remaining = row.remaining_credits;
          replayed  = !!row.replayed;
          rpcOk     = true;
        }
      } catch (errIdem) {
        console.warn('[deduct-credit] deduct_credits_idempotent indisponível, a usar caminho sem idempotência:', errIdem.message);
      }
    }

    if (!rpcOk) {
      try {
        const dataN = await rpc('deduct_credits', { p_user_id: userId, p_amount: cost });
        if (dataN !== undefined && dataN !== null) {
          remaining = dataN;
          rpcOk     = true;
        }
      } catch (errN) {
        if (cost === 1) {
          try {
            const data1 = await rpc('deduct_credit', { user_id: userId });
            if (data1 !== undefined && data1 !== null) {
              remaining = data1;
              rpcOk     = true;
            }
          } catch (err1) { /* segue para fallback manual */ }
        }
      }
    }

    if (!rpcOk) {
      return await _fallbackDeductWithLock(userId, cost, documentType, creditSource, res);
    }

    if (remaining === -1 || remaining === null) {
      return res.status(402).json({
        error:   'Créditos insuficientes.',
        code:    'INSUFFICIENT_CREDITS',
        credits: 0,
      });
    }

    if (!operationId) {
      try {
        await insert('credit_logs', {
          user_id:       userId,
          action:        'consume',
          credits:       -cost,
          document_type: documentType,
          credit_source: creditSource,
          note:          `Dedução de ${cost} crédito(s) via RPC`,
        });
      } catch (e) { console.warn('[deduct-credit] credit_logs falhou:', e.message); }
    }

    if (remaining === 0) {
      _tryDeleteAvulsoAccount(userId);
    }

    return res.status(200).json({
      success:       true,
      credits:       remaining,
      source:        'supabase_rpc',
      credit_source: creditSource,
      replayed,
    });

  } catch (e) {
    console.error('[deduct-credit] Excepção:', e.message, e.stack);
    return res.status(500).json({ error: 'Erro interno ao deduzir crédito.' });
  }
}

// ── Fallback com optimistic locking manual ────────────────────────────────
async function _fallbackDeductWithLock(userId, cost, documentType, creditSource, res) {
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
        credit_source: creditSource,
        note:          `Dedução fallback de ${cost} crédito(s)`,
      });
    } catch (e) { console.warn('[deduct-credit] credit_logs fallback falhou:', e.message); }

    if (newCredits === 0) {
      _tryDeleteAvulsoAccount(userId, profile);
    }

    return res.status(200).json({
      success:       true,
      credits:       newCredits,
      source:        'supabase_fallback',
      credit_source: creditSource,
    });
  } catch (e) {
    console.error('[deduct-credit] Fallback excepção:', e.message);
    return res.status(500).json({ error: 'Erro no fallback de dedução: ' + e.message });
  }
}

// ── Reembolso automático ──────────────────────────────────────────────────
async function _refundCredit(userId, cost, documentType, res, operationId = null) {
  try {
    let newCredits = null;
    let usedRpc    = false;
    let replayed   = false;

    if (operationId) {
      try {
        const rows = await rpc('refund_credit_idempotent', {
          p_user_id:       userId,
          p_amount:        cost,
          p_operation_id:  operationId,
          p_document_type: documentType,
        });
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row && typeof row.remaining_credits === 'number') {
          newCredits = row.remaining_credits;
          replayed   = !!row.replayed;
          usedRpc    = true;
        }
      } catch (e) {
        console.warn('[deduct-credit] RPC refund_credit_idempotent indisponível, a usar caminho antigo:', e.message);
      }
    }

    if (!usedRpc) {
      try {
        const data = await rpc('refund_credit', { p_user_id: userId, p_amount: cost });
        if (data !== undefined && data !== null) {
          newCredits = data;
          usedRpc    = true;
        }
      } catch (e) {
        console.warn('[deduct-credit] RPC refund_credit indisponível, a usar fallback:', e.message);
      }
    }

    if (!usedRpc) {
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
      replayed,
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

// ══════════════════════════════════════════════════════════════════════════
// 3. DELETE-TEMP-ACCOUNT (ex-api/delete-temp-account.js, v10.0)
// ══════════════════════════════════════════════════════════════════════════
function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim() || 'unknown';
}

async function handleDeleteTempAccount(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
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

  // Eliminação de conta é uma acção rara e sensível, 5 tentativas/hora por
  // IP é mais do que suficiente para uso legítimo.
  const ip = getClientIp(req);
  const rlOk = await checkRateLimit('delete-account', ip, { limit: 5, windowSec: 3600 });
  if (!rlOk) return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente mais tarde.' });

  try {
    // 1. Verificar token e obter utilizador
    const { user, error: authErr } = await getUserFromToken(token);
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

    // 2. Confirmar tipo de conta
    const profile = await selectOne(
      'profiles', 'id', user.id,
      'account_type,credits,last_credit_used_at,created_at'
    );

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    // LPD/RGPD — direito ao esquecimento: contas normais podem pedir
    // eliminação definitiva e imediata a qualquer momento, desde que o
    // pedido confirme explicitamente a intenção.
    if (profile.account_type !== 'avulso') {
      const body = parseJsonBody(req);
      if (!body || body.confirmDeletion !== true) {
        return res.status(400).json({
          deleted: false,
          reason: 'confirmation_required',
          message: 'Para eliminar definitivamente a sua conta, reenvie o pedido com { "confirmDeletion": true }.',
        });
      }
      return handleFullAccountErasure(res, user.id);
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
}

function parseJsonBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return null; }
}

// ELIMINAÇÃO DEFINITIVA — contas normais (direito ao esquecimento). Ordem
// importa: transactions.user_id NÃO tem ON DELETE CASCADE de propósito
// (registos financeiros têm de sobreviver por obrigação legal/fiscal), por
// isso anonimiza-se transactions primeiro, só depois se apaga o utilizador.
// documents.user_id TEM ON DELETE CASCADE, não precisa de passo manual.
async function handleFullAccountErasure(res, userId) {
  try {
    try {
      await restRequest(`transactions?user_id=eq.${userId}`, {
        method: 'PATCH',
        body:   { user_id: null },
        prefer: 'return=minimal',
      });
    } catch (txErr) {
      console.warn('[delete-temp-account] Falha ao anonimizar transactions:', txErr.message);
    }

    const deleted = await adminDeleteUser(userId);
    if (!deleted) {
      try {
        await restRequest(`profiles?id=eq.${userId}`, { method: 'DELETE' });
      } catch (profileDelErr) {
        return res.status(500).json({ error: 'Falha ao eliminar conta: ' + profileDelErr.message });
      }
    }

    console.log('[delete-temp-account] Conta normal ' + userId.slice(0, 8) + '*** eliminada (pedido do utilizador — direito ao esquecimento)');
    return res.status(200).json({ deleted: true, deleted_at: new Date().toISOString() });
  } catch (err) {
    console.error('[delete-temp-account] Excepção na eliminação definitiva:', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 4. CLEANUP-TEMP-ACCOUNTS (ex-api/cleanup-temp-accounts.js, v10.0 — cron)
// ══════════════════════════════════════════════════════════════════════════
async function handleCleanupTempAccounts(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
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

    // ── Regra 3: expirar créditos por LOTE via credit_ledger ──────────────
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
}

module.exports = {
  handleVerifyCredits,
  handleDeductCredit,
  handleDeleteTempAccount,
  handleCleanupTempAccounts,
  handleMyPackages,
};
