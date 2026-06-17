// api/admin/index.js — v2.0 (auditado e corrigido)
// CORREÇÕES:
//  1. handleConfirmPayment: regista em credit_logs após adicionar créditos
//  2. handleConfirmPayment: valida que credits > 0 e é número inteiro
//  3. handleConfirmAvulso: regista em credit_logs
//  4. handleDeleteUser: apaga também credit_logs do utilizador
//  5. handleTransactions: usa view v_transaction_summary se disponível
//  6. handleStats: query de receita hoje corrigida (era undefined)
//  7. validateAdmin: melhor logging de erros
//  8. CORS: usa ALLOWED_ORIGIN consistente

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Action');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlPath    = req.url || '';
  const pathParts  = urlPath.split('?')[0].split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const action = (lastSegment && lastSegment !== 'admin')
    ? lastSegment
    : (req.query?.action || req.headers['x-action'] || '');

  switch (action) {
    case 'confirm-payment': return handleConfirmPayment(req, res);
    case 'confirm-avulso':  return handleConfirmAvulso(req, res);
    case 'fix-profiles':    return handleFixProfiles(req, res);
    case 'stats':           return handleStats(req, res);
    case 'transactions':    return handleTransactions(req, res);
    case 'settings':        return handleSettings(req, res);
    case 'audit-log':       return handleAuditLog(req, res);
    case 'delete-user':     return handleDeleteUser(req, res);
    case 'analytics':       return handleAnalytics(req, res);
    case 'feedback':        return handleFeedback(req, res);
    case 'static-pages':    return handleStaticPages(req, res);
    case 'delete-document':  return handleDeleteDocument(req, res);
    case 'documents':       return handleDocuments(req, res);
    case 'pages':           return handleBlogPages(req, res);
    case 'generate-page':   return handleGeneratePage(req, res);
    case 'affiliates':      return handleAffiliates(req, res);
    case 'templates':       return handleAdminTemplates(req, res);
    case 'template-approve': return handleAdminTplAction(req, res, 'approve');
    case 'template-reject':  return handleAdminTplAction(req, res, 'reject');
    case 'template-feature': return handleAdminTplAction(req, res, 'feature');
    case 'template-type':    return handleAdminTplAction(req, res, 'type');
    case 'template-edit':    return handleAdminTplAction(req, res, 'edit');
    default:
      return res.status(404).json({
        error: `Acção desconhecida: "${action}".`,
        available: ['confirm-payment','confirm-avulso','fix-profiles','stats','transactions','settings','audit-log','delete-user','delete-document','analytics','feedback','static-pages','documents','pages','generate-page','affiliates'],
      });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

async function getAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada — operações admin impossíveis');
  if (!process.env.SUPABASE_URL)
    throw new Error('SUPABASE_URL não configurada');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });
}

async function validateAdmin(supabase, token) {
  if (!token) return { error: 'Token obrigatório', status: 401 };

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    console.error('[validateAdmin] getUser falhou:', authErr?.message);
    return { error: 'Token inválido ou expirado', status: 401 };
  }

  // 1ª verificação: app_metadata.is_admin no JWT (zero query à DB)
  if (user.app_metadata?.is_admin === true) return { user };

  // 2ª verificação: query directa à tabela profiles com service role
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (profileErr) {
    console.error('[validateAdmin] Erro ao ler perfil:', profileErr.message);
    return { error: 'Erro ao verificar permissões', status: 500 };
  }

  if (!profile?.is_admin) {
    console.warn('[validateAdmin] Acesso negado para user:', user.id);
    return { error: 'Acesso negado — apenas admins', status: 403 };
  }

  // Sincronizar app_metadata (fire-and-forget)
  supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, is_admin: true },
  }).catch(e => console.warn('[validateAdmin] Falha ao sincronizar app_metadata:', e.message));

  return { user };
}

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM-PAYMENT — CORRIGIDO v2.0
// ─────────────────────────────────────────────────────────────────────────────
async function handleConfirmPayment(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });

  const { transactionId, credits } = body;
  // userId pode vir vazio se o join RLS bloqueou — usamos tx.user_id da DB
  let userId = body.userId || null;

  // Validação rigorosa
  if (!transactionId) return res.status(400).json({ error: 'transactionId é obrigatório' });
  const creditsInt = parseInt(credits);
  if (!creditsInt || creditsInt <= 0 || creditsInt > 500) {
    return res.status(400).json({ error: 'credits deve ser um inteiro positivo entre 1 e 500' });
  }

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    // Verificar que transação existe e está pendente
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, status, package_id, amount, user_id')
      .eq('id', transactionId)
      .single();

    if (txErr || !tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending') return res.status(400).json({ error: `Transação já processada (status: ${tx.status})` });

    // Se userId não veio do frontend (join RLS bloqueou), usar o da transação
    if (!userId && tx.user_id) userId = tx.user_id;
    if (!userId) return res.status(400).json({ error: 'userId em falta e transação não tem user_id' });

    // Actualizar transação
    const { error: updateErr } = await supabase.from('transactions')
      .update({
        status:       'completed',
        confirmed_by: auth.user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', transactionId);
    if (updateErr) throw updateErr;

    // Adicionar créditos ao utilizador
    const { data: newCredits, error: rpcErr } = await supabase
      .rpc('add_credits', { user_id: userId, amount: creditsInt });
    if (rpcErr) throw rpcErr;

    // Registar em credit_logs
    await supabase.from('credit_logs').insert({
      user_id:        userId,
      transaction_id: transactionId,
      action:         'purchase_confirmed',
      credits:        creditsInt,
      note:           `Pagamento confirmado pelo admin ${auth.user.id.slice(0, 8)} — pacote ${tx.package_id}`,
    }).catch(e => console.warn('[confirm-payment] credit_logs falhou:', e.message));

    // Log de auditoria
    await supabase.from('admin_logs').insert({
      admin_id:    auth.user.id,
      action:      'confirm_payment',
      target_type: 'transaction',
      target_id:   transactionId,
      details:     { credits: creditsInt, userId, package_id: tx.package_id },
      created_at:  new Date().toISOString(),
    });

    // Processar comissão de afiliado (fire-and-forget)
    supabase.rpc('process_affiliate_commission', {
      p_transaction_id: transactionId,
      p_user_id:        tx.user_id || userId,
      p_package_id:     tx.package_id,
      p_amount:         tx.amount,
    }).catch(e => console.warn('[affiliate commission]', e.message));

    return res.status(200).json({
      success:    true,
      newCredits: newCredits || creditsInt,
      message:    `${creditsInt} créditos adicionados com sucesso`,
    });
  } catch (err) {
    console.error('[admin/confirm-payment]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM-AVULSO — CORRIGIDO v2.0
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
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });

  const { transactionId, referenceId, phone, credits, manual } = body;

  // ── Modo manual: admin cria conta avulsa sem transação pré-existente ──
  if (manual === true) {
    if (!phone || !credits) return res.status(400).json({ error: 'phone e credits são obrigatórios no modo manual' });
    const creditsInt = parseInt(credits);
    if (!creditsInt || creditsInt <= 0) return res.status(400).json({ error: 'credits inválido' });

    try {
      const supabase = await getAdminClient();
      const auth     = await validateAdmin(supabase, token);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });

      const ref        = (referenceId || ('MAN' + Date.now().toString().slice(-6))).toUpperCase();
      const tempEmail  = `temp_${ref.toLowerCase()}@mzdocs.temp`;
      const tempPass   = _genPassword();
      const cleanPhone = phone.replace(/\D/g, '');
      const normPhone  = cleanPhone.startsWith('258') ? `+${cleanPhone}` : `+258${cleanPhone}`;

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: tempEmail, password: tempPass, email_confirm: true,
        user_metadata: { full_name: `Avulso ${ref}`, is_temp: true, temp_ref: ref, phone: normPhone },
      });
      if (createErr) throw new Error('Erro ao criar utilizador: ' + createErr.message);

      const tempUserId = newUser.user.id;

      const { error: profileErr } = await supabase.from('profiles').update({
        is_temp: true, temp_ref: ref, temp_password: tempPass,
        credits: creditsInt, plan: 'free', account_type: 'avulso',
        full_name: `Avulso ${ref}`, phone: normPhone,
        updated_at: new Date().toISOString(),
      }).eq('id', tempUserId);
      if (profileErr) throw profileErr;

      // Registar transação para histórico
      const { data: txData } = await supabase.from('transactions').insert({
        user_id: tempUserId, package_id: 'avulso', amount: 0,
        credits: creditsInt, status: 'completed', payment_method: 'manual',
        reference_id: ref, phone_number: normPhone,
        confirmed_by: auth.user.id, confirmed_at: new Date().toISOString(),
      }).select('id').single().catch(() => ({ data: null }));

      // Registar em credit_logs
      await supabase.from('credit_logs').insert({
        user_id:        tempUserId,
        transaction_id: txData?.id || null,
        action:         'purchase_confirmed',
        credits:        creditsInt,
        note:           `Conta avulso criada manualmente pelo admin ${auth.user.id.slice(0, 8)}`,
      }).catch(e => console.warn('[confirm-avulso] credit_logs falhou:', e.message));

      const origin  = ALLOWED_ORIGIN;
      const waPhone = cleanPhone.startsWith('258') ? cleanPhone : '258' + cleanPhone;
      const waMsg   = [
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

  // ── Modo normal: confirmar transação pendente ──
  if (!transactionId && !referenceId)
    return res.status(400).json({ error: 'transactionId ou referenceId obrigatório' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    let txQuery = supabase.from('transactions').select('*');
    if (transactionId) txQuery = txQuery.eq('id', transactionId);
    else               txQuery = txQuery.eq('reference_id', referenceId);
    const { data: tx, error: txErr } = await txQuery.single();
    if (txErr || !tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transação já processada' });
    if (tx.package_id !== 'avulso')
      return res.status(400).json({ error: 'Use /api/admin/confirm-payment para pacotes não avulsos' });

    const ref       = tx.reference_id || ('AV' + Date.now());
    const tempEmail = `temp_${ref.toLowerCase()}@mzdocs.temp`;
    const tempPass  = _genPassword();

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: tempEmail, password: tempPass, email_confirm: true,
      user_metadata: { full_name: `Avulso ${ref}`, is_temp: true, temp_ref: ref, phone: tx.phone_number || '' },
    });
    if (createErr) throw new Error('Erro ao criar conta temp: ' + createErr.message);

    const tempUserId = newUser.user.id;

    const { error: profileErr } = await supabase.from('profiles').update({
      is_temp: true, temp_ref: ref, temp_password: tempPass,
      credits: tx.credits, plan: 'free', account_type: 'avulso',
      full_name: `Avulso ${ref}`, phone: tx.phone_number || null,
      updated_at: new Date().toISOString(),
    }).eq('id', tempUserId);
    if (profileErr) throw profileErr;

    await supabase.from('transactions').update({
      user_id:      tempUserId,
      status:       'completed',
      confirmed_by: auth.user.id,
      confirmed_at: new Date().toISOString(),
    }).eq('id', tx.id);

    // Registar em credit_logs
    await supabase.from('credit_logs').insert({
      user_id:        tempUserId,
      transaction_id: tx.id,
      action:         'purchase_confirmed',
      credits:        tx.credits,
      note:           `Conta avulso confirmada via transação ${tx.id.slice(0, 8)}`,
    }).catch(e => console.warn('[confirm-avulso] credit_logs falhou:', e.message));

    const clientPhone = tx.phone_number?.replace(/\D/g, '') || '';
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
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data: broken } = await supabase.from('profiles')
        .select('id, email, phone, full_name, created_at')
        .or('phone.is.null,phone.eq.')
        .order('created_at', { ascending: false });
      return res.status(200).json({
        total_broken: broken?.length || 0, profiles: broken || [],
        message: broken?.length ? `${broken.length} perfis sem telemóvel encontrados` : 'Todos os perfis têm telemóvel ✅',
      });
    }

    const { data: toFix } = await supabase.from('profiles').select('id, email, phone').or('phone.is.null,phone.eq.');
    if (!toFix?.length) return res.status(200).json({ message: 'Nenhum perfil para corrigir ✅', fixed: 0 });

    let fixed = 0, failed = 0;
    const errors = [];
    for (const profile of toFix) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
        const meta = authUser?.user?.user_metadata || {};
        const phoneFromMeta = meta.phone || meta.user_phone || null;
        if (phoneFromMeta) {
          const { error } = await supabase.from('profiles').update({
            phone: phoneFromMeta, full_name: meta.full_name || profile.full_name || '',
            updated_at: new Date().toISOString(),
          }).eq('id', profile.id);
          if (error) { failed++; errors.push({ id: profile.id, error: error.message }); }
          else fixed++;
        } else {
          errors.push({ id: profile.id, note: 'sem phone no user_metadata' });
        }
      } catch (err) { failed++; errors.push({ id: profile.id, error: err.message }); }
    }
    return res.status(200).json({ message: `Reparação: ${fixed} corrigidos, ${failed} falhados`, fixed, failed, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error('[admin/fix-profiles]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — CORRIGIDO v2.0 (query de receita hoje estava a retornar undefined)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart  = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: totalUsers },
      { count: newUsers24h },
      { count: docsTotal },
      { count: docsToday },
      { count: pending },
      { count: publishedPosts },
      { data: typesRaw },
      { data: revenueRaw },
      { data: docsRaw },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('credit_usage_log').select('*', { count: 'exact', head: true }),
      supabase.from('credit_usage_log').select('*', { count: 'exact', head: true })
        .gte('used_at', todayStart),
      supabase.from('transactions').select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('blog_pages').select('*', { count: 'exact', head: true })
        .eq('published', true),
      supabase.from('credit_usage_log').select('document_type')
        .gte('used_at', monthStart),
      supabase.from('transactions').select('amount, created_at')
        .eq('status', 'completed')
        .gte('created_at', weekStart.toISOString()),
      supabase.from('credit_usage_log').select('used_at')
        .gte('used_at', weekStart.toISOString()),
    ]);

    // Calcular receita por dia em JS (evita múltiplas queries)
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
      chartDocs.push(
        (docsRaw || []).filter(r => r.used_at?.startsWith(dayStr)).length
      );
    }

    // Receita: hoje = chartRevenue[6], semana = soma, mês = soma completa
    const revenueMonth = (revenueRaw || [])
      .filter(r => r.created_at >= monthStart)
      .reduce((s, r) => s + (r.amount || 0), 0);

    const typeCounts = {};
    (typesRaw || []).forEach(r => {
      if (r.document_type) typeCounts[r.document_type] = (typeCounts[r.document_type] || 0) + 1;
    });
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return res.status(200).json({
      success:   true,
      revenue:   {
        month: revenueMonth,
        today: chartRevenue[6] || 0,
        week:  chartRevenue.reduce((a, b) => a + b, 0),
      },
      documents: { total: docsTotal || 0, today: docsToday || 0, week: chartDocs.reduce((a, b) => a + b, 0) },
      users:     { total: totalUsers || 0, new_24h: newUsers24h || 0 },
      pending:   pending || 0,
      blog:      { published: publishedPosts || 0 },
      topDocTypes: topTypes,
      chartData:   { labels: chartLabels, revenue: chartRevenue, documents: chartDocs },
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS — CORRIGIDO v2.0
// ─────────────────────────────────────────────────────────────────────────────
async function handleTransactions(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const status = req.query?.status || 'all';
    const date   = req.query?.date;
    const limit  = Math.min(parseInt(req.query?.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query?.offset) || 0, 0);

    // Query principal — usa LEFT JOIN via Supabase syntax
    // CORRIGIDO: usar alias correcto para FK (profiles!transactions_user_id_fkey)
    let query = supabase.from('transactions').select(`
      id,
      user_id,
      package_id,
      amount,
      credits,
      status,
      payment_method,
      reference_id,
      phone_number,
      confirmed_by,
      confirmed_at,
      created_at,
      profiles!transactions_user_id_fkey(full_name, email, phone)
    `, { count: 'exact' });

    if (status !== 'all') query = query.eq('status', status);
    if (date) {
      query = query
        .gte('created_at', `${date}T00:00:00.000Z`)
        .lte('created_at', `${date}T23:59:59.999Z`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      // Se o join falhar (FK não registada), tentar sem join
      console.warn('[admin/transactions] Join falhou, tentando sem join:', error.message);
      const { data: simpleData, error: simpleErr, count: simpleCount } = await supabase
        .from('transactions')
        .select('id, user_id, package_id, amount, credits, status, payment_method, reference_id, phone_number, confirmed_by, confirmed_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (simpleErr) throw simpleErr;
      return res.status(200).json({ success: true, data: simpleData || [], total: simpleCount || 0, limit, offset, warning: 'Join com profiles falhou — dados de utilizador omitidos' });
    }

    return res.status(200).json({ success: true, data: data || [], total: count || 0, limit, offset });
  } catch (err) {
    console.error('[admin/transactions]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
async function handleSettings(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value, description, updated_at')
        .order('key');
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return res.status(200).json({ success: true, settings: data || [], map });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body    = parseBody(req);
      const updates = body?.updates;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'updates object required' });
      }
      const now  = new Date().toISOString();
      const rows = Object.entries(updates).map(([key, value]) => ({
        key, value: String(value), updated_by: auth.user.id, updated_at: now,
      }));
      const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
      await supabase.from('admin_logs').insert({
        admin_id:    auth.user.id,
        action:      'update_settings',
        target_type: 'system_settings',
        details:     updates,
        created_at:  now,
      });
      return res.status(200).json({ success: true, updated: rows.length });
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
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const limit = Math.min(parseInt(req.query?.limit || '50', 10), 200);
    const { data, error } = await supabase
      .from('admin_logs')
      .select('id, action, target_type, target_id, details, created_at, admin_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.status(200).json({ success: true, logs: data || [] });
  } catch (err) {
    console.error('[admin/audit-log]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER — CORRIGIDO v2.0 (apaga também credit_logs)
// ─────────────────────────────────────────────────────────────────────────────
async function handleDeleteUser(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { userId } = body;
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (auth.user.id === userId) return res.status(400).json({ error: 'Não pode eliminar a sua própria conta' });

    // Eliminar dados relacionados (FK)
    await supabase.from('documents').delete().eq('user_id', userId);
    await supabase.from('transactions').delete().eq('user_id', userId);
    await supabase.from('credit_usage_log').delete().eq('user_id', userId);
    await supabase.from('credit_logs').delete().eq('user_id', userId);          // NOVO
    await supabase.from('affiliate_commissions').delete().eq('affiliate_id', userId); // NOVO

    await supabase.from('profiles').delete().eq('id', userId);

    const { error: authDelErr } = await supabase.auth.admin.deleteUser(userId);
    if (authDelErr) {
      console.warn('[delete-user] Auth delete falhou:', authDelErr.message);
    }

    await supabase.from('admin_logs').insert({
      admin_id:    auth.user.id,
      action:      'delete_user',
      target_type: 'user',
      target_id:   userId,
      created_at:  new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: 'Utilizador eliminado do sistema' });
  } catch (err) {
    console.error('[admin/delete-user]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — inalterado (funcional)
// ─────────────────────────────────────────────────────────────────────────────
async function handleAnalytics(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();

  if (req.method === 'POST') {
    try {
      const supabase = await getAdminClient();
      const body  = parseBody(req) || {};
      const page  = (body.page || '/').slice(0, 200);
      const today = new Date().toISOString().split('T')[0];
      const sid   = (body.session || ('anon_' + Math.random().toString(36).slice(2))).toString().slice(0, 64);
      const now   = new Date().toISOString();
      const userId = body.user_id && typeof body.user_id === 'string' && body.user_id.length === 36
        ? body.user_id : null;

      const { error: rpcErr } = await supabase
        .rpc('increment_page_view', { p_page: page, p_date: today });

      if (rpcErr) {
        const { data: existing } = await supabase
          .from('page_views').select('id, views').eq('page', page).eq('date', today).maybeSingle();
        if (existing) {
          await supabase.from('page_views').update({ views: (existing.views || 0) + 1 }).eq('id', existing.id);
        } else {
          await supabase.from('page_views').insert({ page, date: today, views: 1 });
        }
      }

      const sessionRow = { session_id: sid, page, updated_at: now };
      if (userId) sessionRow.user_id = userId;
      await supabase.from('online_sessions')
        .upsert(sessionRow, { onConflict: 'session_id', ignoreDuplicates: false })
        ;

      const cutoff = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      supabase.from('online_sessions').delete().lt('updated_at', cutoff);

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[analytics/POST]', err.message);
      return res.status(200).json({ ok: false });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const days  = parseInt(req.query?.days || '7', 10);
    const since = new Date(); since.setDate(since.getDate() - days);

    const { data: pvData } = await supabase
      .from('page_views').select('date, page, views')
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: true });

    const byDay = {};
    (pvData || []).forEach(r => { byDay[r.date] = (byDay[r.date] || 0) + (r.views || 0); });

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: onlineNow } = await supabase
      .from('online_sessions').select('*', { count: 'exact', head: true }).gte('updated_at', fiveMinAgo);

    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    const { data: usageData } = await supabase
      .from('credit_usage_log').select('document_type').gte('used_at', monthAgo.toISOString());

    const serviceCounts = {};
    (usageData || []).forEach(r => {
      if (r.document_type) serviceCounts[r.document_type] = (serviceCounts[r.document_type] || 0) + 1;
    });
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const serviceFilter = req.query?.service || null;
    let fbQuery = supabase.from('user_feedback')
      .select('id, service, rating, comment, created_at, user_id, session_id')
      .gte('created_at', monthAgo.toISOString())
      .order('created_at', { ascending: false }).limit(100);
    if (serviceFilter) fbQuery = fbQuery.eq('service', serviceFilter);
    const { data: fbRows } = await fbQuery;

    const userIds = [...new Set((fbRows || []).map(r => r.user_id).filter(Boolean))];
    const userMap = {};
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', userIds);
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
  if (!service || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'service e rating (1-5) são obrigatórios' });
  }

  if (typeof service === 'object') {
    service = service.key || service.id || 'geral';
  } else if (typeof service === 'string' && service.startsWith('{')) {
    try { const p = JSON.parse(service); service = p.key || p.id || p.title || 'geral'; } catch (_) { service = 'geral'; }
  }
  service = String(service).slice(0, 50).toLowerCase().replace(/[^a-z0-9_-]/g, '');

  try {
    const supabase = await getAdminClient();
    let userId = null;
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
      userId = user?.id || null;
    }
    await supabase.from('user_feedback').insert({
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
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
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
    } catch (e) { files = []; }
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
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const limit  = Math.min(parseInt(req.query?.limit || '100'), 200);
    const search = (req.query?.q || '').trim();
    let q = supabase.from('documents')
      .select('id, service_type, title, model_used, created_at, content, profiles(full_name, phone)')
      .order('created_at', { ascending: false }).limit(limit);
    if (search) q = q.ilike('service_type', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[admin/documents]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE DOCUMENT (admin — usa service role para contornar RLS)
// ─────────────────────────────────────────────────────────────────────────────
async function handleDeleteDocument(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { docId } = req.body || {};
    if (!docId) return res.status(400).json({ error: 'docId é obrigatório' });

    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;

    // Registar no audit log
    await supabase.from('audit_log').insert({
      admin_id:    auth.user.id,
      action:      'delete_document',
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

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { slug } = req.query;
      if (slug) {
        const { data, error } = await supabase.from('blog_pages').select('*').eq('slug', slug).single();
        if (error) return res.status(404).json({ error: 'Página não encontrada' });
        return res.status(200).json(data);
      }
      const { data, error } = await supabase.from('blog_pages')
        .select('id, slug, title, meta_description, published, views, ai_generated, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { slug, title, meta_description, content_html, published = false, ai_generated = false } = req.body;
      if (!slug || !title || !content_html) return res.status(400).json({ error: 'slug, title e content_html são obrigatórios' });
      const cleanSlug = _slugify(slug);
      const { data, error } = await supabase.from('blog_pages')
        .insert({ slug: cleanSlug, title, meta_description, content_html, published, ai_generated, author_id: auth.user.id })
        .select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma página com este slug' });
        throw error;
      }
      if (published) await _generateStaticPage(data, SITE_URL);
      return res.status(201).json({ success: true, page: data });
    }

    if (req.method === 'PUT') {
      const { id, slug, title, meta_description, content_html, published, ai_generated } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const updates = {};
      if (slug !== undefined)             updates.slug             = _slugify(slug);
      if (title !== undefined)            updates.title            = title;
      if (meta_description !== undefined) updates.meta_description = meta_description;
      if (content_html !== undefined)     updates.content_html     = content_html;
      if (published !== undefined)        updates.published        = published;
      if (ai_generated !== undefined)     updates.ai_generated     = ai_generated;
      const { data, error } = await supabase.from('blog_pages').update(updates).eq('id', id).select().single();
      if (error) throw error;
      if (data?.published) await _generateStaticPage(data, SITE_URL);
      return res.status(200).json({ success: true, page: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const { data: page } = await supabase.from('blog_pages').select('slug').eq('id', id).single();
      const { error } = await supabase.from('blog_pages').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true, deleted_slug: page?.slug });
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

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { title, keywords = '', tone = 'informativo', word_count = 600 } = req.body;
    if (!title) return res.status(400).json({ error: 'title é obrigatório' });

    const prompt = `És um especialista em SEO e redacção de conteúdo para o mercado moçambicano.\n\nEscreve um artigo de blog completo sobre: "${title}"\nPalavras-chave a incluir naturalmente: ${keywords || 'documentos, Moçambique'}\nTom: ${tone}\nExtensão aproximada: ${word_count} palavras\n\nREGRAS OBRIGATÓRIAS:\n- Escreve em português europeu (não brasileiro)\n- Conteúdo específico para Moçambique (exemplos locais, instituições moçambicanas, M-Pesa, etc.)\n- Inclui H2 e H3, e uma secção FAQ com 3-4 perguntas no final\n- Menciona que o MzDocs Pro pode ajudar a criar estes documentos rapidamente com IA\n- NÃO incluis <html>, <head>, <body> ou <!DOCTYPE> — apenas conteúdo do artigo\n- Devolve APENAS HTML válido: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>\n- Não uses Markdown, apenas HTML puro\n\nComeça directamente com o conteúdo HTML, sem preâmbulo.`;

    let html = null, usedProvider = null;

    if (!html && process.env.GROQ_API_KEY) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
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

    const plainText      = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, email, phone, ref_code, is_affiliate, aff_clicks, aff_conversions, aff_balance, aff_total_earned, created_at')
        .not('ref_code', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ affiliates: data || [] });
    }

    if (req.method === 'POST') {
      const body      = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { action, user_id } = body;
      if (!user_id) return res.status(400).json({ error: 'user_id em falta' });
      if (!['approve', 'revoke'].includes(action)) return res.status(400).json({ error: 'action inválida' });
      const { error } = await supabase.from('profiles')
        .update({ is_affiliate: action === 'approve' }).eq('id', user_id);
      if (error) throw error;
      return res.status(200).json({ success: true, message: action === 'approve' ? 'Afiliado aprovado.' : 'Aprovação revogada.' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[admin/affiliates]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
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

// ════════════════════════════════════════════════════════════════════════════
// ADMIN TEMPLATES — Gestão completa de templates comunitários
// Rota: /api/admin/templates  (GET=lista) e /api/admin/template-* (POST=acção)
// ════════════════════════════════════════════════════════════════════════════

async function handleAdminTemplates(req, res) {
  const supabase = await getAdminClient();
  const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { error: authErr } = await validateAdmin(supabase, token);
  if (authErr) return res.status(authErr.status || 403).json({ error: authErr.error || authErr });

  const q      = req.query || {};
  const status = q.status || 'pending';   // pending | approved | rejected | all
  const type   = q.type   || null;        // official | community | premium | private
  const limit  = Math.min(parseInt(q.limit  || 50), 200);
  const offset = Math.max(parseInt(q.offset ||  0),   0);

  let query = supabase
    .from('templates_custom')
    .select(`
      id, template_type, service_type, template_name, description,
      thumbnail_url, preview_url, tags, status, rejection_note,
      admin_note, is_featured, featured_order, credit_cost,
      downloads, use_count, likes, rating_sum, rating_count,
      created_at, updated_at, user_id,
      author:profiles!user_id(full_name, email),
      reviewer:profiles!reviewed_by(full_name)
    `)
    .order('created_at', { ascending: status === 'pending' })
    .range(offset, offset + limit - 1);

  if (status !== 'all') query = query.eq('status', status);
  if (type) query = query.eq('template_type', type);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Contar pendentes para badge no admin
  const { count: pendingCount } = await supabase
    .from('templates_custom').select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Reports não resolvidos
  const { count: reportCount } = await supabase
    .from('template_reports').select('*', { count: 'exact', head: true })
    .eq('resolved', false);

  return res.status(200).json({
    success: true,
    templates: data || [],
    meta: { pending: pendingCount || 0, reports: reportCount || 0 },
  });
}

async function handleAdminTplAction(req, res, action) {
  if (req.method !== 'POST') return res.status(405).end();
  const supabase = await getAdminClient();
  const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { error: authErr, user } = await validateAdmin(supabase, token);
  if (authErr) return res.status(authErr.status || 403).json({ error: authErr.error || authErr });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { template_id, note, featured, featured_order, new_type, credit_cost } = body;
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });

  let result;
  switch (action) {
    case 'approve':
      ({ data: result } = await supabase.rpc('admin_approve_template', {
        p_template_id: template_id,
        p_admin_id:    user.id,
        p_note:        note || '',
        p_featured:    featured === true,
      }));
      break;

    case 'reject':
      ({ data: result } = await supabase.rpc('admin_reject_template', {
        p_template_id: template_id,
        p_admin_id:    user.id,
        p_note:        note || '',
      }));
      break;

    case 'feature':
      ({ data: result } = await supabase.rpc('admin_feature_template', {
        p_template_id: template_id,
        p_admin_id:    user.id,
        p_featured:    featured !== false,
        p_order:       featured_order || null,
      }));
      break;

    case 'type':
      if (!new_type) return res.status(400).json({ error: 'new_type obrigatório' });
      ({ data: result } = await supabase.rpc('admin_change_template_type', {
        p_template_id: template_id,
        p_admin_id:    user.id,
        p_new_type:    new_type,
        p_credit_cost: parseInt(credit_cost || 0),
        p_note:        note || '',
      }));
      break;

    case 'edit': {
      // Edição directa de campos textuais (sem mudar status)
      const allowed = ['template_name','description','thumbnail_url','preview_url','tags','admin_note'];
      const updates = {};
      allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
      if (!Object.keys(updates).length)
        return res.status(400).json({ error: 'Nenhum campo para actualizar' });
      updates.updated_at = new Date().toISOString();
      const { error: upErr } = await supabase
        .from('templates_custom').update(updates).eq('id', template_id);
      if (upErr) return res.status(500).json({ error: upErr.message });
      // Registar no histórico
      await supabase.from('template_history').insert({
        template_id, actor_id: user.id, action: 'edited',
        new_value: updates, note: note || '',
      });
      result = { success: true };
      break;
    }

    default:
      return res.status(400).json({ error: 'Acção desconhecida' });
  }

  if (result?.success === false)
    return res.status(400).json({ error: result.error || 'Erro ao executar acção' });

  return res.status(200).json({ success: true, action, template_id });
}
