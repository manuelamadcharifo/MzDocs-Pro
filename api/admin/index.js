// api/admin/index.js — v3.0 (CORRIGIDO — eliminado @supabase/supabase-js + ws)
// CORRECÇÕES v3.0 (auditoria 27/Jun/2026):
//  C-1: Eliminado require('@supabase/supabase-js') e require('ws').
//       Todas as operações migradas para api/_lib/supabaseAdmin.js (REST puro).
//       getAdminClient() substituído por helpers directos (restRequest, rpc, etc.).
//  C-2: validateAdmin() reescrito com getUserFromToken() + restRequest (sem SDK).
//  C-3: upsert admin_users reescrito com restRequest (Prefer: resolution=merge-duplicates).
//  C-4: add_credits, auth.admin.createUser, auth.admin.deleteUser — via Auth Admin REST API.
//  Todas as correcções da v2.0 mantidas integralmente.

const {
  SUPABASE_URL,
  SERVICE_KEY,
  assertConfigured,
  getUserFromToken,
  restRequest,
  selectOne,
  update,
  insert,
  rpc,
  adminDeleteUser,
} = require('../_lib/supabaseAdmin');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';

// ─── Auth Admin helpers (REST puro) ─────────────────────────────────────────
// Usados em vez de supabase.auth.admin.* do SDK

async function authAdminGet(path, method = 'GET', body = undefined) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey:        SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.message || data.msg)) || `Auth Admin HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Cria utilizador via Auth Admin REST API. Devolve { user }. */
async function adminCreateUser(payload) {
  const data = await authAdminGet('users', 'POST', payload);
  return { user: data };
}

/** Actualiza metadados de utilizador via Auth Admin REST API. */
async function adminUpdateUserById(userId, payload) {
  return authAdminGet(`users/${userId}`, 'PUT', payload);
}

/** Lê dados de utilizador via Auth Admin REST API. Devolve { user }. */
async function adminGetUserById(userId) {
  const data = await authAdminGet(`users/${userId}`, 'GET');
  return { user: data };
}

// ─── validateAdmin (sem SDK) ─────────────────────────────────────────────────
async function validateAdmin(token) {
  if (!token) return { error: 'Token obrigatório', status: 401 };
  assertConfigured();

  const { user, error: authErr } = await getUserFromToken(token);
  if (authErr || !user) {
    console.error('[validateAdmin] getUser falhou:', authErr?.message);
    return { error: 'Token inválido ou expirado', status: 401 };
  }

  // 1ª verificação: app_metadata.is_admin no JWT (zero query à DB)
  if (user.app_metadata?.is_admin === true) return { user };

  // 2ª verificação: query directa à tabela profiles com service_role
  let profile;
  try {
    profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  } catch (err) {
    console.error('[validateAdmin] Erro ao ler perfil:', err.message);
    return { error: 'Erro ao verificar permissões', status: 500 };
  }

  if (!profile?.is_admin) {
    console.warn('[validateAdmin] Acesso negado para user:', user.id);
    return { error: 'Acesso negado — apenas admins', status: 403 };
  }

  // Sincronizar app_metadata (fire-and-forget)
  adminUpdateUserById(user.id, {
    app_metadata: { ...(user.app_metadata || {}), is_admin: true },
  }).catch(e => console.warn('[validateAdmin] Falha ao sincronizar app_metadata:', e.message));

  // Garantir linha em admin_users (upsert REST puro)
  restRequest('admin_users', {
    method: 'POST',
    body: {
      id:           user.id,
      email:        user.email || `${user.id}@sem-email.local`,
      full_name:    user.user_metadata?.full_name || user.email || '',
      role:         'admin',
      is_active:    true,
      last_login_at: new Date().toISOString(),
    },
    prefer: 'resolution=merge-duplicates,return=minimal',
  }).catch(e => console.error('[validateAdmin] Falha ao sincronizar admin_users:', e.message));

  return { user };
}

// ─── parseBody ───────────────────────────────────────────────────────────────
function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return null; }
}

// ─── Helpers REST genéricos ──────────────────────────────────────────────────

/** SELECT com filtros simples, ex: "table?col=eq.val&select=*&limit=50" */
async function dbSelect(table, params = '') {
  return restRequest(`${table}${params ? '?' + params : ''}`);
}

/** SELECT com count exacto */
async function dbCount(table, params = '') {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'count=exact',
      'Range-Unit': 'items',
      'Range': '0-0',
    },
  });
  const cr = res.headers.get('Content-Range') || '';
  const total = parseInt((cr.split('/')[1] || '0').trim(), 10);
  return isNaN(total) ? 0 : total;
}

/** UPDATE simples */
async function dbUpdate(table, matchCol, matchVal, patch) {
  return restRequest(
    `${table}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    { method: 'PATCH', body: patch, prefer: 'return=representation' }
  );
}

/** INSERT */
async function dbInsert(table, row) {
  return insert(table, row);
}

/** DELETE */
async function dbDelete(table, matchCol, matchVal) {
  return restRequest(
    `${table}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    { method: 'DELETE' }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Action');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlPath     = req.url || '';
  const pathParts   = urlPath.split('?')[0].split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const action = (lastSegment && lastSegment !== 'admin')
    ? lastSegment
    : (req.query?.action || req.headers['x-action'] || '');

  switch (action) {
    case 'confirm-payment':   return handleConfirmPayment(req, res);
    case 'confirm-avulso':    return handleConfirmAvulso(req, res);
    case 'fix-profiles':      return handleFixProfiles(req, res);
    case 'stats':             return handleStats(req, res);
    case 'transactions':      return handleTransactions(req, res);
    case 'settings':          return handleSettings(req, res);
    case 'audit-log':         return handleAuditLog(req, res);
    case 'delete-user':       return handleDeleteUser(req, res);
    case 'analytics':         return handleAnalytics(req, res);
    case 'feedback':          return handleFeedback(req, res);
    case 'static-pages':      return handleStaticPages(req, res);
    case 'delete-document':   return handleDeleteDocument(req, res);
    case 'documents':         return handleDocuments(req, res);
    case 'pages':             return handleBlogPages(req, res);
    case 'generate-page':     return handleGeneratePage(req, res);
    case 'affiliates':        return handleAffiliates(req, res);
    case 'pending-receipts':  return handlePendingReceipts(req, res);
    case 'approve-receipt':   return handleApproveReceipt(req, res);
    default:
      return res.status(404).json({
        error: `Acção desconhecida: "${action}".`,
        available: ['confirm-payment','confirm-avulso','fix-profiles','stats','transactions',
          'settings','audit-log','delete-user','delete-document','analytics','feedback',
          'static-pages','documents','pages','generate-page','affiliates',
          'pending-receipts','approve-receipt'],
      });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM-PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
async function handleConfirmPayment(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });

  const { transactionId, credits } = body;
  let userId = body.userId || null;

  if (!transactionId) return res.status(400).json({ error: 'transactionId é obrigatório' });
  const creditsInt = parseInt(credits);
  if (!creditsInt || creditsInt <= 0 || creditsInt > 500)
    return res.status(400).json({ error: 'credits deve ser um inteiro positivo entre 1 e 500' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const rows = await dbSelect('transactions',
      `id=eq.${transactionId}&select=id,status,package_id,amount,user_id&limit=1`);
    const tx = Array.isArray(rows) ? rows[0] : null;
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending')
      return res.status(400).json({ error: `Transação já processada (status: ${tx.status})` });

    if (!userId && tx.user_id) userId = tx.user_id;
    if (!userId) return res.status(400).json({ error: 'userId em falta e transação não tem user_id' });

    await dbUpdate('transactions', 'id', transactionId, {
      status:       'completed',
      confirmed_by: auth.user.id,
      confirmed_at: new Date().toISOString(),
    });

    const newCredits = await rpc('add_credits', { user_id: userId, amount: creditsInt });

    // credit_logs (best-effort)
    dbInsert('credit_logs', {
      user_id:        userId,
      transaction_id: transactionId,
      action:         'purchase_confirmed',
      credits:        creditsInt,
      note:           `Pagamento confirmado pelo admin ${auth.user.id.slice(0, 8)} — pacote ${tx.package_id}`,
    }).catch(e => console.warn('[confirm-payment] credit_logs:', e.message));

    // audit log (best-effort)
    dbInsert('admin_logs', {
      admin_id:    auth.user.id,
      action:      'confirm_payment',
      target_type: 'transaction',
      target_id:   transactionId,
      details:     { credits: creditsInt, userId, package_id: tx.package_id },
      created_at:  new Date().toISOString(),
    }).catch(() => {});

    // comissão afiliado (fire-and-forget)
    rpc('process_affiliate_commission', {
      p_transaction_id: transactionId,
      p_user_id:        tx.user_id || userId,
      p_package_id:     tx.package_id,
      p_amount:         tx.amount,
    }).catch(e => console.warn('[affiliate commission]', e.message));

    return res.status(200).json({
      success: true,
      newCredits: newCredits || creditsInt,
      message: `${creditsInt} créditos adicionados com sucesso`,
    });
  } catch (err) {
    console.error('[admin/confirm-payment]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM-AVULSO
// ─────────────────────────────────────────────────────────────────────────────
function _genPassword() {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '0123456789';
  let pass = '';
  for (let i = 0; i < 4; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) pass += digits[Math.floor(Math.random() * digits.length)];
  return pass;
}

async function handleConfirmAvulso(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });

  const { transactionId, referenceId, phone, credits, manual } = body;

  // ── Modo manual ──────────────────────────────────────────────────────────
  if (manual === true) {
    if (!phone || !credits) return res.status(400).json({ error: 'phone e credits são obrigatórios no modo manual' });
    const creditsInt = parseInt(credits);
    if (!creditsInt || creditsInt <= 0) return res.status(400).json({ error: 'credits inválido' });

    try {
      const auth = await validateAdmin(token);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });

      const ref        = (referenceId || ('MAN' + Date.now().toString().slice(-6))).toUpperCase();
      const tempEmail  = `temp_${ref.toLowerCase()}@mzdocs.temp`;
      const tempPass   = _genPassword();
      const cleanPhone = phone.replace(/\D/g, '');
      const normPhone  = cleanPhone.startsWith('258') ? `+${cleanPhone}` : `+258${cleanPhone}`;

      const newUser = await adminCreateUser({
        email: tempEmail, password: tempPass, email_confirm: true,
        user_metadata: { full_name: `Avulso ${ref}`, is_temp: true, temp_ref: ref, phone: normPhone },
      });
      if (!newUser?.user?.id) throw new Error('Erro ao criar utilizador');
      const tempUserId = newUser.user.id;

      await dbUpdate('profiles', 'id', tempUserId, {
        is_temp: true, temp_ref: ref, temp_password: tempPass,
        credits: creditsInt, plan: 'free', account_type: 'avulso',
        full_name: `Avulso ${ref}`, phone: normPhone,
        updated_at: new Date().toISOString(),
      });

      const txData = await dbInsert('transactions', {
        user_id: tempUserId, package_id: 'avulso', amount: 0,
        credits: creditsInt, status: 'completed', payment_method: 'manual',
        reference_id: ref, phone_number: normPhone,
        confirmed_by: auth.user.id, confirmed_at: new Date().toISOString(),
      }).catch(() => null);

      dbInsert('credit_logs', {
        user_id:        tempUserId,
        transaction_id: txData?.id || null,
        action:         'purchase_confirmed',
        credits:        creditsInt,
        note:           `Conta avulso criada manualmente pelo admin ${auth.user.id.slice(0, 8)}`,
      }).catch(e => console.warn('[confirm-avulso] credit_logs:', e.message));

      const origin  = ALLOWED_ORIGIN;
      const waPhone = cleanPhone.startsWith('258') ? cleanPhone : '258' + cleanPhone;
      const waMsg = [
        `✅ *Conta MzDocs Pro criada — Referência ${ref}*`, ``,
        `💎 Créditos: ${creditsInt}`,
        `🔑 *Acesso:* ${origin}`,
        `📧 *Utilizador:* ${tempEmail}`,
        `🔐 *Password:* ${tempPass}`, ``,
        `⚠️ Conta temporária — eliminada quando os créditos acabarem.`,
      ].join('\n');
      const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;

      return res.status(200).json({ success: true, tempEmail, tempPass, tempUserId, credits: creditsInt, waLink });
    } catch (err) {
      console.error('[admin/confirm-avulso/manual]', err);
      return res.status(500).json({ error: err.message || 'Erro interno' });
    }
  }

  // ── Modo normal: confirmar transação pendente ─────────────────────────────
  if (!transactionId && !referenceId)
    return res.status(400).json({ error: 'transactionId ou referenceId obrigatório' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    let txRows;
    if (transactionId) {
      txRows = await dbSelect('transactions', `id=eq.${transactionId}&limit=1`);
    } else {
      txRows = await dbSelect('transactions', `reference_id=eq.${encodeURIComponent(referenceId)}&limit=1`);
    }
    const tx = Array.isArray(txRows) ? txRows[0] : null;
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transação já processada' });
    if (tx.package_id !== 'avulso')
      return res.status(400).json({ error: 'Use /api/admin/confirm-payment para pacotes não avulsos' });

    const ref       = tx.reference_id || ('AV' + Date.now());
    const tempEmail = `temp_${ref.toLowerCase()}@mzdocs.temp`;
    const tempPass  = _genPassword();

    const newUser = await adminCreateUser({
      email: tempEmail, password: tempPass, email_confirm: true,
      user_metadata: { full_name: `Avulso ${ref}`, is_temp: true, temp_ref: ref, phone: tx.phone_number || '' },
    });
    if (!newUser?.user?.id) throw new Error('Erro ao criar conta temp');
    const tempUserId = newUser.user.id;

    await dbUpdate('profiles', 'id', tempUserId, {
      is_temp: true, temp_ref: ref, temp_password: tempPass,
      credits: tx.credits, plan: 'free', account_type: 'avulso',
      full_name: `Avulso ${ref}`, phone: tx.phone_number || null,
      updated_at: new Date().toISOString(),
    });

    await dbUpdate('transactions', 'id', tx.id, {
      user_id:      tempUserId,
      status:       'completed',
      confirmed_by: auth.user.id,
      confirmed_at: new Date().toISOString(),
    });

    dbInsert('credit_logs', {
      user_id:        tempUserId,
      transaction_id: tx.id,
      action:         'purchase_confirmed',
      credits:        tx.credits,
      note:           `Conta avulso confirmada via transação ${tx.id.slice(0, 8)}`,
    }).catch(e => console.warn('[confirm-avulso] credit_logs:', e.message));

    const clientPhone = (tx.phone_number || '').replace(/\D/g, '');
    const waTarget = clientPhone
      ? (clientPhone.startsWith('258') ? clientPhone : '258' + clientPhone)
      : null;
    const waMsg = [
      `✅ *Pagamento Confirmado — MzDocs Pro*`, ``,
      `📦 Pacote: Avulso (${tx.credits} créditos)`, `🆔 Referência: ${ref}`, ``,
      `A sua conta temporária foi criada:`,
      `🔑 *Acesso:* ${ALLOWED_ORIGIN}`,
      `📧 *Utilizador:* ${tempEmail}`,
      `🔐 *Password:* ${tempPass}`, ``,
      `⚠️ Esta conta é eliminada automaticamente quando os ${tx.credits} créditos acabarem.`,
    ].join('\n');
    const waLink = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(waMsg)}` : null;

    return res.status(200).json({
      success: true, tempEmail, tempPass, tempUserId,
      credits: tx.credits, waLink,
      message: `Conta temporária criada: ${tempEmail} / ${tempPass}`,
    });
  } catch (err) {
    console.error('[admin/confirm-avulso]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-PROFILES
// ─────────────────────────────────────────────────────────────────────────────
async function handleFixProfiles(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const broken = await dbSelect('profiles',
        'select=id,email,phone,full_name,created_at&or=(phone.is.null,phone.eq.)&order=created_at.desc');
      return res.status(200).json({
        total_broken: (broken || []).length,
        profiles: broken || [],
        message: (broken || []).length
          ? `${broken.length} perfis sem telemóvel encontrados`
          : 'Todos os perfis têm telemóvel ✅',
      });
    }

    const toFix = await dbSelect('profiles', 'select=id,email,phone&or=(phone.is.null,phone.eq.)');
    if (!toFix?.length) return res.status(200).json({ message: 'Nenhum perfil para corrigir ✅', fixed: 0 });

    let fixed = 0, failed = 0;
    const errors = [];
    for (const profile of toFix) {
      try {
        const authUser = await adminGetUserById(profile.id).catch(() => ({ user: null }));
        const meta = authUser?.user?.user_metadata || {};
        const phoneFromMeta = meta.phone || meta.user_phone || null;
        if (phoneFromMeta) {
          await dbUpdate('profiles', 'id', profile.id, {
            phone: phoneFromMeta,
            full_name: meta.full_name || profile.full_name || '',
            updated_at: new Date().toISOString(),
          });
          fixed++;
        } else {
          errors.push({ id: profile.id, note: 'sem phone no user_metadata' });
        }
      } catch (err) {
        failed++;
        errors.push({ id: profile.id, error: err.message });
      }
    }
    return res.status(200).json({
      message: `Reparação: ${fixed} corrigidos, ${failed} falhados`,
      fixed, failed, errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('[admin/fix-profiles]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — com cache 60s em memória
// ─────────────────────────────────────────────────────────────────────────────
let _statsCache = null;
let _statsCacheAt = 0;
const STATS_TTL = 60 * 1000; // 60 segundos

async function handleStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    // Devolver cache se ainda válido
    if (_statsCache && (Date.now() - _statsCacheAt) < STATS_TTL) {
      return res.status(200).json({ ..._statsCache, cached: true });
    }

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo    = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const h24Ago     = new Date(now.getTime() - 86400000).toISOString();

    const [
      totalUsers, newUsers24h, docsTotal, docsToday, pending, publishedPosts,
      typesRaw, revenueRaw, docsRaw,
    ] = await Promise.all([
      dbCount('profiles'),
      dbCount('profiles', `created_at=gte.${encodeURIComponent(h24Ago)}`),
      dbCount('credit_usage_log'),
      dbCount('credit_usage_log', `used_at=gte.${encodeURIComponent(todayStart)}`),
      dbCount('transactions', 'status=eq.pending'),
      dbCount('blog_pages', 'published=eq.true'),
      dbSelect('credit_usage_log', `select=document_type&used_at=gte.${encodeURIComponent(monthStart)}`),
      dbSelect('transactions', `select=amount,created_at&status=eq.completed&created_at=gte.${encodeURIComponent(weekAgo)}`),
      dbSelect('credit_usage_log', `select=used_at&used_at=gte.${encodeURIComponent(weekAgo)}`),
    ]);

    const dayLabels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const chartLabels = [], chartRevenue = [], chartDocs = [];
    for (let i = 6; i >= 0; i--) {
      const d      = new Date(); d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      chartLabels.push(dayLabels[d.getDay()]);
      chartRevenue.push(
        (revenueRaw || []).filter(r => r.created_at?.startsWith(dayStr))
          .reduce((s, r) => s + (r.amount || 0), 0)
      );
      chartDocs.push((docsRaw || []).filter(r => r.used_at?.startsWith(dayStr)).length);
    }

    const revenueMonth = (revenueRaw || [])
      .filter(r => r.created_at >= monthStart)
      .reduce((s, r) => s + (r.amount || 0), 0);

    const typeCounts = {};
    (typesRaw || []).forEach(r => {
      if (r.document_type) typeCounts[r.document_type] = (typeCounts[r.document_type] || 0) + 1;
    });
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const payload = {
      success:   true,
      revenue:   { month: revenueMonth, today: chartRevenue[6] || 0, week: chartRevenue.reduce((a, b) => a + b, 0) },
      documents: { total: totalUsers || 0, today: docsToday || 0, week: chartDocs.reduce((a, b) => a + b, 0) },
      users:     { total: totalUsers || 0, new_24h: newUsers24h || 0 },
      pending:   pending || 0,
      blog:      { published: publishedPosts || 0 },
      topDocTypes: topTypes,
      chartData:   { labels: chartLabels, revenue: chartRevenue, documents: chartDocs },
    };

    _statsCache = payload;
    _statsCacheAt = Date.now();

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[admin/stats]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function handleTransactions(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const status = req.query?.status || 'all';
    const date   = req.query?.date;
    const limit  = Math.min(parseInt(req.query?.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query?.offset) || 0, 0);

    const fields = 'id,user_id,package_id,amount,credits,status,payment_method,reference_id,phone_number,confirmed_by,confirmed_at,created_at,receipt_hash,receipt_verified,receipt_confidence,verification_method,review_reason';
    let params = `select=${fields}&order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (status !== 'all') params += `&status=eq.${status}`;
    if (date) {
      params += `&created_at=gte.${encodeURIComponent(date + 'T00:00:00.000Z')}`;
      params += `&created_at=lte.${encodeURIComponent(date + 'T23:59:59.999Z')}`;
    }

    // Tentar com join — PostgREST suporta embed via ?select=*,profiles(...)
    let data, total;
    try {
      assertConfigured();
      const joinParams = `select=${fields},profiles!transactions_user_id_fkey(full_name,email,phone)&order=created_at.desc&limit=${limit}&offset=${offset}` +
        (status !== 'all' ? `&status=eq.${status}` : '') +
        (date ? `&created_at=gte.${encodeURIComponent(date + 'T00:00:00.000Z')}&created_at=lte.${encodeURIComponent(date + 'T23:59:59.999Z')}` : '');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${joinParams}`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'count=exact',
        },
      });
      const cr = r.headers.get('Content-Range') || '';
      total = parseInt((cr.split('/')[1] || '0').trim(), 10) || 0;
      const text = await r.text();
      data = text ? JSON.parse(text) : [];
      if (!r.ok) throw new Error('Join falhou');
    } catch {
      // Fallback sem join
      console.warn('[admin/transactions] Tentando sem join...');
      const rows = await dbSelect('transactions', params);
      data  = rows || [];
      total = data.length;
    }

    return res.status(200).json({ success: true, data: data || [], total, limit, offset });
  } catch (err) {
    console.error('[admin/transactions]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
async function handleSettings(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const data = await dbSelect('system_settings', 'select=key,value,description,updated_at&order=key');
      const map = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return res.status(200).json({ success: true, settings: data || [], map });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body    = parseBody(req);
      const updates = body?.updates;
      if (!updates || typeof updates !== 'object')
        return res.status(400).json({ error: 'updates object required' });
      const now  = new Date().toISOString();
      for (const [key, value] of Object.entries(updates)) {
        await restRequest('system_settings', {
          method: 'POST',
          body: { key, value: String(value), updated_by: auth.user.id, updated_at: now },
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
      }
      dbInsert('admin_logs', {
        admin_id:    auth.user.id,
        action:      'update_settings',
        target_type: 'system_settings',
        details:     updates,
        created_at:  now,
      }).catch(() => {});
      return res.status(200).json({ success: true, updated: Object.keys(updates).length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/settings]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
async function handleAuditLog(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const limit = Math.min(parseInt(req.query?.limit || '50', 10), 200);
    const data = await dbSelect('admin_logs',
      `select=id,action,target_type,target_id,details,created_at,admin_id&order=created_at.desc&limit=${limit}`);
    return res.status(200).json({ success: true, logs: data || [] });
  } catch (err) {
    console.error('[admin/audit-log]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER
// ─────────────────────────────────────────────────────────────────────────────
async function handleDeleteUser(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { userId } = body;
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    if (auth.user.id === userId)
      return res.status(400).json({ error: 'Não pode eliminar a sua própria conta' });

    // Eliminar dados relacionados
    await dbDelete('documents', 'user_id', userId);
    await dbDelete('transactions', 'user_id', userId);
    await dbDelete('credit_usage_log', 'user_id', userId);
    await dbDelete('credit_logs', 'user_id', userId);
    await dbDelete('affiliate_commissions', 'affiliate_id', userId);
    await dbDelete('profiles', 'id', userId);

    const deleted = await adminDeleteUser(userId);
    if (!deleted) console.warn('[delete-user] Auth delete falhou para', userId);

    dbInsert('admin_logs', {
      admin_id:    auth.user.id,
      action:      'delete_user',
      target_type: 'user',
      target_id:   userId,
      created_at:  new Date().toISOString(),
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Utilizador eliminado do sistema' });
  } catch (err) {
    console.error('[admin/delete-user]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
async function handleAnalytics(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();

  if (req.method === 'POST') {
    try {
      const body   = parseBody(req) || {};
      const page   = (body.page || '/').slice(0, 200);
      const today  = new Date().toISOString().split('T')[0];
      const sid    = (body.session || ('anon_' + Math.random().toString(36).slice(2))).toString().slice(0, 64);
      const now    = new Date().toISOString();
      const userId = body.user_id && typeof body.user_id === 'string' && body.user_id.length === 36
        ? body.user_id : null;

      try {
        await rpc('increment_page_view', { p_page: page, p_date: today });
      } catch {
        const existing = await dbSelect('page_views', `select=id,views&page=eq.${encodeURIComponent(page)}&date=eq.${today}&limit=1`)
          .then(r => r?.[0]).catch(() => null);
        if (existing) {
          await dbUpdate('page_views', 'id', existing.id, { views: (existing.views || 0) + 1 });
        } else {
          await dbInsert('page_views', { page, date: today, views: 1 });
        }
      }

      const sessionRow = { session_id: sid, page, updated_at: now };
      if (userId) sessionRow.user_id = userId;
      await restRequest('online_sessions', {
        method: 'POST',
        body: sessionRow,
        prefer: 'resolution=merge-duplicates,return=minimal',
      }).catch(() => {});

      const cutoff = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      dbDelete('online_sessions', `updated_at=lt.${encodeURIComponent(cutoff)}`).catch(() => {});

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[analytics/POST]', err.message);
      return res.status(200).json({ ok: false });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const days  = parseInt(req.query?.days || '7', 10);
    const since = new Date(); since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().split('T')[0];

    const pvData = await dbSelect('page_views',
      `select=date,page,views&date=gte.${sinceDate}&order=date.asc`);
    const byDay = {};
    (pvData || []).forEach(r => { byDay[r.date] = (byDay[r.date] || 0) + (r.views || 0); });

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const onlineNow = await dbCount('online_sessions', `updated_at=gte.${encodeURIComponent(fiveMinAgo)}`);

    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    const usageData = await dbSelect('credit_usage_log',
      `select=document_type&used_at=gte.${encodeURIComponent(monthAgo.toISOString())}`);
    const serviceCounts = {};
    (usageData || []).forEach(r => {
      if (r.document_type) serviceCounts[r.document_type] = (serviceCounts[r.document_type] || 0) + 1;
    });
    const topServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const serviceFilter = req.query?.service || null;
    let fbParams = `select=id,service,rating,comment,created_at,user_id,session_id&created_at=gte.${encodeURIComponent(monthAgo.toISOString())}&order=created_at.desc&limit=100`;
    if (serviceFilter) fbParams += `&service=eq.${encodeURIComponent(serviceFilter)}`;
    const fbRows = await dbSelect('user_feedback', fbParams);

    const userIds = [...new Set((fbRows || []).map(r => r.user_id).filter(Boolean))];
    const userMap = {};
    if (userIds.length) {
      const profiles = await dbSelect('profiles',
        `select=id,full_name,phone&id=in.(${userIds.map(encodeURIComponent).join(',')})`);
      (profiles || []).forEach(p => { userMap[p.id] = p; });
    }

    const feedbackList = (fbRows || []).map(r => {
      const profile = r.user_id ? userMap[r.user_id] : null;
      return {
        id: r.id, service: r.service, rating: r.rating, comment: r.comment || '',
        created_at: r.created_at,
        user_name:  profile?.full_name || (r.session_id ? 'Visitante' : 'Anónimo'),
        user_phone: profile?.phone || null, is_logged: !!r.user_id,
      };
    });

    const fbByService = {};
    (fbRows || []).forEach(r => {
      if (!fbByService[r.service]) fbByService[r.service] = { total: 0, count: 0 };
      fbByService[r.service].total += r.rating;
      fbByService[r.service].count += 1;
    });
    const feedbackSummary = Object.entries(fbByService).map(([service, v]) => ({
      service, avg: Math.round((v.total / v.count) * 10) / 10, count: v.count,
    })).sort((a, b) => b.count - a.count);

    return res.status(200).json({
      success: true, visitsByDay: byDay, onlineNow: onlineNow || 0,
      topServices, feedbackList, feedbackSummary,
    });
  } catch (err) {
    console.error('[admin/analytics]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
async function handleFeedback(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body inválido' });
  let { service, rating, comment, session_id } = body;
  if (!service || !rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'service e rating (1-5) são obrigatórios' });

  if (typeof service === 'object') {
    service = service.key || service.id || 'geral';
  } else if (typeof service === 'string' && service.startsWith('{')) {
    try { const p = JSON.parse(service); service = p.key || p.id || p.title || 'geral'; } catch { service = 'geral'; }
  }
  service = String(service).slice(0, 50).toLowerCase().replace(/[^a-z0-9_-]/g, '');

  try {
    let userId = null;
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (token) {
      const { user } = await getUserFromToken(token).catch(() => ({ user: null }));
      userId = user?.id || null;
    }
    await dbInsert('user_feedback', {
      service, rating: parseInt(rating), comment: (comment || '').slice(0, 500),
      user_id: userId, session_id: session_id || null, created_at: new Date().toISOString(),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[feedback]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC PAGES
// ─────────────────────────────────────────────────────────────────────────────
async function handleStaticPages(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const fs   = require('fs');
    const path = require('path');
    const dir  = path.join(process.cwd(), 'pages');
    let files  = [];
    try {
      files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== '_template.html')
        .map(f => ({
          filename: f, slug: f.replace(/\.html$/, ''), url: '/pages/' + f,
          size: fs.statSync(path.join(dir, f)).size,
          modified: fs.statSync(path.join(dir, f)).mtime.toISOString(),
        }));
    } catch { files = []; }
    return res.status(200).json({ success: true, pages: files });
  } catch (err) {
    console.error('[static-pages]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────
async function handleDocuments(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const limit  = Math.min(parseInt(req.query?.limit || '100'), 200);
    const search = (req.query?.q || '').trim();
    let params = `select=id,service_type,title,model_used,created_at,content,profiles(full_name,phone)&order=created_at.desc&limit=${limit}`;
    if (search) params += `&service_type=ilike.${encodeURIComponent('%' + search + '%')}`;
    const data = await dbSelect('documents', params);
    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[admin/documents]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────
async function handleDeleteDocument(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { docId } = parseBody(req) || {};
    if (!docId) return res.status(400).json({ error: 'docId é obrigatório' });
    await dbDelete('documents', 'id', docId);
    dbInsert('admin_logs', {
      admin_id:    auth.user.id,
      action:      'delete_document',
      target_type: 'document',
      target_id:   docId,
      details:     { deleted_by: auth.user.email || auth.user.id },
      created_at:  new Date().toISOString(),
    }).catch(() => {});
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/delete-document]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOG PAGES
// ─────────────────────────────────────────────────────────────────────────────
async function handleBlogPages(req, res) {
  const SITE_URL = ALLOWED_ORIGIN;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { slug } = req.query || {};
      if (slug) {
        const rows = await dbSelect('blog_pages', `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`);
        if (!rows?.[0]) return res.status(404).json({ error: 'Página não encontrada' });
        return res.status(200).json(rows[0]);
      }
      const data = await dbSelect('blog_pages',
        'select=id,slug,title,meta_description,published,views,ai_generated,created_at,updated_at&order=updated_at.desc');
      return res.status(200).json(data || []);
    }

    const body = parseBody(req) || {};

    if (req.method === 'POST') {
      const { slug, title, meta_description, content_html, published = false, ai_generated = false } = body;
      if (!slug || !title || !content_html)
        return res.status(400).json({ error: 'slug, title e content_html são obrigatórios' });
      const data = await dbInsert('blog_pages', {
        slug: _slugify(slug), title, meta_description, content_html,
        published, ai_generated, author_id: auth.user.id,
      });
      if (published) await _generateStaticPage(data, SITE_URL);
      return res.status(201).json({ success: true, page: data });
    }

    if (req.method === 'PUT') {
      const { id, slug, title, meta_description, content_html, published, ai_generated } = body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const updates = {};
      if (slug !== undefined)             updates.slug             = _slugify(slug);
      if (title !== undefined)            updates.title            = title;
      if (meta_description !== undefined) updates.meta_description = meta_description;
      if (content_html !== undefined)     updates.content_html     = content_html;
      if (published !== undefined)        updates.published        = published;
      if (ai_generated !== undefined)     updates.ai_generated     = ai_generated;
      const rows = await dbUpdate('blog_pages', 'id', id, updates);
      const page = Array.isArray(rows) ? rows[0] : rows;
      if (page?.published) await _generateStaticPage(page, SITE_URL);
      return res.status(200).json({ success: true, page });
    }

    if (req.method === 'DELETE') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const slugRows = await dbSelect('blog_pages', `select=slug&id=eq.${id}&limit=1`);
      await dbDelete('blog_pages', 'id', id);
      return res.status(200).json({ success: true, deleted_slug: slugRows?.[0]?.slug });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[admin/pages]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE PAGE
// ─────────────────────────────────────────────────────────────────────────────
async function handleGeneratePage(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { title, keywords = '', tone = 'informativo', word_count = 600 } = parseBody(req) || {};
    if (!title) return res.status(400).json({ error: 'title é obrigatório' });

    const prompt = `És um especialista em SEO e redacção de conteúdo para o mercado moçambicano.\n\nEscreve um artigo de blog completo sobre: "${title}"\nPalavras-chave a incluir naturalmente: ${keywords || 'documentos, Moçambique'}\nTom: ${tone}\nExtensão aproximada: ${word_count} palavras\n\nREGRAS OBRIGATÓRIAS:\n- Escreve em português europeu (não brasileiro)\n- Conteúdo específico para Moçambique\n- Inclui H2 e H3, e uma secção FAQ com 3-4 perguntas no final\n- Menciona que o MzDocs Pro pode ajudar a criar estes documentos rapidamente com IA\n- NÃO incluis <html>, <head>, <body> ou <!DOCTYPE> — apenas conteúdo do artigo\n- Devolve APENAS HTML válido: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>\n- Não uses Markdown, apenas HTML puro\n\nComeça directamente com o conteúdo HTML, sem preâmbulo.`;

    let html = null, usedProvider = null;

    if (!html && process.env.GROQ_API_KEY) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.4 }),
        });
        const d = await r.json();
        const text = d.choices?.[0]?.message?.content;
        if (text?.length > 200) { html = _extractHTML(text); usedProvider = 'groq'; }
      } catch (_) {}
    }

    if (!html && process.env.GEMINI_API_KEY) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const d = await r.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text?.length > 200) { html = _extractHTML(text); usedProvider = 'gemini'; }
      } catch (_) {}
    }

    if (!html) return res.status(503).json({ error: 'Nenhum provider de IA disponível.' });

    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const meta_description = plainText.slice(0, 155).trim() + (plainText.length > 155 ? '…' : '');
    const slug = _slugify(title);

    return res.status(200).json({ success: true, title, slug, meta_description, content_html: html, ai_generated: true, provider: usedProvider });
  } catch (err) {
    console.error('[admin/generate-page]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AFFILIATES
// ─────────────────────────────────────────────────────────────────────────────
async function handleAffiliates(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const q = req.query || {};

    if (req.method === 'GET' && !q.sub) {
      const data = await dbSelect('profiles',
        'select=id,full_name,email,phone,ref_code,is_affiliate,aff_clicks,aff_conversions,aff_balance,aff_total_earned,aff_segment,aff_tier,aff_business_name,aff_city,aff_phone_mpesa,aff_is_blocked,aff_block_reason,aff_joined_at,created_at&ref_code=not.is.null&order=aff_total_earned.desc');
      const fraudData = await dbSelect('affiliate_fraud_flags', 'select=affiliate_id&resolved=eq.false');
      const fraudCount = {};
      (fraudData || []).forEach(f => { fraudCount[f.affiliate_id] = (fraudCount[f.affiliate_id] || 0) + 1; });
      const wPending = await dbSelect('affiliate_withdrawals', 'select=affiliate_id&status=eq.pending');
      const wCount = {};
      (wPending || []).forEach(w => { wCount[w.affiliate_id] = (wCount[w.affiliate_id] || 0) + 1; });
      return res.status(200).json({
        affiliates: (data || []).map(a => ({
          ...a, fraud_flags: fraudCount[a.id] || 0, pending_withdrawals: wCount[a.id] || 0,
        })),
      });
    }

    if (req.method === 'GET' && q.sub === 'withdrawals') {
      const status = q.status || 'pending';
      const data = await dbSelect('affiliate_withdrawals',
        `select=id,affiliate_id,amount,mpesa_phone,status,admin_note,created_at,processed_at&status=eq.${status}&order=created_at.desc&limit=50`);
      const ids = [...new Set((data || []).map(w => w.affiliate_id))];
      const pnames = ids.length
        ? await dbSelect('profiles', `select=id,full_name,email,phone,aff_tier&id=in.(${ids.join(',')})`)
        : [];
      const pm = {};
      (pnames || []).forEach(p => { pm[p.id] = p; });
      return res.status(200).json({
        withdrawals: (data || []).map(w => ({ ...w, affiliate: pm[w.affiliate_id] || {} })),
      });
    }

    if (req.method === 'GET' && q.sub === 'fraud') {
      const data = await dbSelect('affiliate_fraud_flags',
        'select=id,affiliate_id,flag_type,description,severity,resolved,created_at&resolved=eq.false&order=severity.desc&limit=50');
      const ids = [...new Set((data || []).map(f => f.affiliate_id))];
      const pnames = ids.length
        ? await dbSelect('profiles', `select=id,full_name,ref_code&id=in.(${ids.join(',')})`)
        : [];
      const pm = {};
      (pnames || []).forEach(p => { pm[p.id] = p; });
      return res.status(200).json({
        flags: (data || []).map(f => ({ ...f, affiliate: pm[f.affiliate_id] || {} })),
      });
    }

    if (req.method === 'GET' && q.sub === 'ranking') {
      const month = q.month || new Date().toISOString().slice(0, 7);
      const data = await dbSelect('affiliate_ranking',
        `select=affiliate_id,rank_position,conversions,revenue_mzn,commission_mzn,tier&month=eq.${month}&order=rank_position.asc&limit=20`);
      const ids = (data || []).map(r => r.affiliate_id);
      const pnames = ids.length
        ? await dbSelect('profiles', `select=id,full_name,aff_segment,ref_code&id=in.(${ids.join(',')})`)
        : [];
      const pm = {};
      (pnames || []).forEach(p => { pm[p.id] = p; });
      return res.status(200).json({
        month, ranking: (data || []).map(r => ({
          ...r,
          name: pm[r.affiliate_id]?.full_name || 'Parceiro',
          segment: pm[r.affiliate_id]?.aff_segment || 'individual',
          ref_code: pm[r.affiliate_id]?.ref_code || '',
        })),
      });
    }

    if (req.method === 'POST') {
      const body = parseBody(req) || {};
      const { action, user_id, withdrawal_id, flag_id, note } = body;

      if (action === 'approve' || action === 'revoke') {
        if (!user_id) return res.status(400).json({ error: 'user_id em falta' });
        const updates = { is_affiliate: action === 'approve' };
        if (action === 'approve') updates.aff_joined_at = new Date().toISOString();
        await dbUpdate('profiles', 'id', user_id, updates);
        if (action === 'approve') {
          dbInsert('affiliate_notifications', {
            affiliate_id: user_id, type: 'commission',
            title: '🎉 Candidatura Aprovada!',
            body: 'A sua conta de afiliado MzDocs Pro foi aprovada. Comece a partilhar o seu link e ganhe comissões!',
          }).catch(() => {});
        }
        return res.status(200).json({ success: true, message: action === 'approve' ? 'Afiliado aprovado.' : 'Aprovação revogada.' });
      }

      if (action === 'block' || action === 'unblock') {
        if (!user_id) return res.status(400).json({ error: 'user_id em falta' });
        const updates = { aff_is_blocked: action === 'block' };
        if (action === 'block') updates.aff_block_reason = note || 'Conta suspensa por actividade suspeita.';
        else updates.aff_block_reason = null;
        await dbUpdate('profiles', 'id', user_id, updates);
        return res.status(200).json({ success: true, message: action === 'block' ? 'Conta suspensa.' : 'Conta reactivada.' });
      }

      if (action === 'process_withdrawal') {
        if (!withdrawal_id) return res.status(400).json({ error: 'withdrawal_id em falta' });
        const newStatus = body.status || 'completed';
        if (!['completed','rejected'].includes(newStatus)) return res.status(400).json({ error: 'status inválido' });
        const wdRows = await dbSelect('affiliate_withdrawals',
          `select=affiliate_id,amount,status&id=eq.${withdrawal_id}&limit=1`);
        const wd = wdRows?.[0];
        if (!wd) return res.status(404).json({ error: 'Levantamento não encontrado' });
        if (wd.status !== 'pending') return res.status(400).json({ error: 'Levantamento não está pendente' });
        await dbUpdate('affiliate_withdrawals', 'id', withdrawal_id, {
          status: newStatus, admin_note: note || null, processed_at: new Date().toISOString(),
        });
        if (newStatus === 'rejected') {
          const profRows = await dbSelect('profiles', `select=aff_balance&id=eq.${wd.affiliate_id}&limit=1`);
          const bal = profRows?.[0]?.aff_balance || 0;
          await dbUpdate('profiles', 'id', wd.affiliate_id, { aff_balance: bal + wd.amount });
        }
        dbInsert('affiliate_notifications', {
          affiliate_id: wd.affiliate_id, type: 'withdrawal',
          title: newStatus === 'completed' ? '✅ Levantamento Pago!' : '❌ Levantamento Rejeitado',
          body: newStatus === 'completed'
            ? `O seu levantamento de ${wd.amount} MZN foi processado via M-Pesa.`
            : `O seu pedido de ${wd.amount} MZN foi rejeitado. ${note ? 'Motivo: ' + note : 'Contacte o suporte.'}`,
        }).catch(() => {});
        return res.status(200).json({ success: true, message: 'Levantamento actualizado.' });
      }

      if (action === 'resolve_fraud') {
        if (!flag_id) return res.status(400).json({ error: 'flag_id em falta' });
        await dbUpdate('affiliate_fraud_flags', 'id', flag_id, {
          resolved: true, resolved_at: new Date().toISOString(),
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'generate_ranking') {
        const month = body.month || new Date().toISOString().slice(0, 7);
        await rpc('generate_monthly_ranking', { p_month: month });
        return res.status(200).json({ success: true, message: `Ranking de ${month} gerado.` });
      }

      return res.status(400).json({ error: 'action desconhecida: ' + action });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[admin/affiliates]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING-RECEIPTS
// ─────────────────────────────────────────────────────────────────────────────
async function handlePendingReceipts(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    let data;
    try {
      assertConfigured();
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/transactions?select=id,reference_id,user_id,package_id,amount,credits,status,phone_number,receipt_confidence,review_reason,created_at,profiles!transactions_user_id_fkey(full_name,email,phone)&status=eq.review_needed&order=created_at.asc&limit=50`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' } }
      );
      const text = await r.text();
      data = text ? JSON.parse(text) : [];
      if (!r.ok) throw new Error('Join falhou');
    } catch {
      data = await dbSelect('transactions',
        'select=id,reference_id,user_id,package_id,amount,credits,status,phone_number,receipt_confidence,review_reason,created_at&status=eq.review_needed&order=created_at.asc&limit=50');
    }

    return res.status(200).json({ success: true, data: data || [], total: (data || []).length });
  } catch (err) {
    console.error('[admin/pending-receipts]', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE-RECEIPT
// ─────────────────────────────────────────────────────────────────────────────
async function handleApproveReceipt(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  try {
    const auth = await validateAdmin(token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
    const { transactionId, approved, note } = body;
    if (!transactionId || approved === undefined)
      return res.status(400).json({ error: 'transactionId e approved são obrigatórios' });

    const txRows = await dbSelect('transactions',
      `select=id,user_id,package_id,credits,status,reference_id&id=eq.${transactionId}&status=in.(review_needed,pending)&limit=1`);
    const tx = txRows?.[0];
    if (!tx) return res.status(404).json({ error: 'Transacção não encontrada ou já processada.' });

    if (!approved) {
      await dbUpdate('transactions', 'id', transactionId, {
        status: 'failed', confirmed_by: auth.user.id,
        confirmed_at: new Date().toISOString(),
        verification_method: 'manual',
        review_reason: note || 'Rejeitado pelo admin',
      });
      dbInsert('admin_logs', {
        admin_id: auth.user.id, action: 'reject_receipt',
        target_type: 'transaction', target_id: String(transactionId),
        details: { reference_id: tx.reference_id, note: note || '' },
      }).catch(() => {});
      return res.status(200).json({ success: true, approved: false, message: 'Comprovativo rejeitado.' });
    }

    const creditsInt = parseInt(tx.credits) || 0;
    if (creditsInt <= 0) return res.status(400).json({ error: 'Créditos inválidos na transacção.' });

    await dbUpdate('transactions', 'id', transactionId, {
      status: 'confirmed', confirmed_by: auth.user.id,
      confirmed_at: new Date().toISOString(),
      receipt_verified: true, verification_method: 'manual',
      review_reason: note || null,
    });

    let newCredits = creditsInt;
    if (tx.user_id) {
      newCredits = await rpc('add_credits', { user_id: tx.user_id, amount: creditsInt }) || creditsInt;
      dbInsert('credit_logs', {
        user_id: tx.user_id, transaction_id: transactionId,
        action: 'bonus', credits: creditsInt, document_type: null,
        note: `Comprovativo aprovado manualmente pelo admin ${auth.user.id.slice(0, 8)} — pacote ${tx.package_id}${note ? ' | ' + note : ''}`,
      }).catch(e => console.warn('[approve-receipt] credit_logs:', e.message));
    }

    dbInsert('admin_logs', {
      admin_id: auth.user.id, action: 'approve_receipt',
      target_type: 'transaction', target_id: String(transactionId),
      details: { reference_id: tx.reference_id, credits: creditsInt, user_id: tx.user_id },
    }).catch(() => {});

    return res.status(200).json({
      success: true, approved: true,
      creditsAdded: creditsInt, newCredits,
      message: `${creditsInt} créditos adicionados com sucesso.`,
    });
  } catch (err) {
    console.error('[admin/approve-receipt]', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities partilhados
// ─────────────────────────────────────────────────────────────────────────────
function _slugify(str) {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

function _extractHTML(text) {
  return text.replace(/```html?\n?/gi, '').replace(/```\n?/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '').trim();
}

async function _generateStaticPage(page, SITE_URL) {
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) { console.warn('[_generateStaticPage] GitHub env vars em falta'); return; }
  function escHtml(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const html = `<!DOCTYPE html><html lang="pt-MZ"><head><meta charset="UTF-8"/><title>${escHtml(page.title)} — MzDocs Pro</title><meta name="description" content="${escHtml(page.meta_description||'')}"/><link rel="canonical" href="${SITE_URL}/pages/${page.slug}"/></head><body><h1>${escHtml(page.title)}</h1>${page.content_html}</body></html>`;
  const githubPath = `pages/${page.slug}/index.html`;
  const apiUrl     = `https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}`;
  let sha;
  try {
    const ex = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (ex.ok) sha = (await ex.json()).sha;
  } catch (_) {}
  await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Gerar página: ${page.slug}`, content: Buffer.from(html).toString('base64'), sha }),
  });
}

// Sobrescrever dbDelete para suportar filtros compostos (ex: "updated_at=lt.X")
// O dbDelete original apenas suporta matchCol=matchVal simples.
// Para o caso analytics (delete por data), usa restRequest directamente.
async function _deleteWhere(tableOrFilter, matchCol, matchVal) {
  if (matchVal === undefined) {
    // Chamado com filtro composto como primeiro argumento
    return restRequest(`${tableOrFilter}`, { method: 'DELETE' });
  }
  return restRequest(
    `${tableOrFilter}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    { method: 'DELETE' }
  );
}
// Redefinir dbDelete para suportar ambos os casos
async function dbDeleteOverride(tableOrFilter, matchCol, matchVal) {
  if (matchVal === undefined && matchCol === undefined) {
    return restRequest(tableOrFilter, { method: 'DELETE' });
  }
  return restRequest(
    `${tableOrFilter}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    { method: 'DELETE' }
  );
}
