const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
// api/admin/index.js
// ws é passado explicitamente para compatibilidade com Node.js 20
// Router único para todas as funções admin.
// Elimina a necessidade de 5 funções separadas (Vercel Hobby limit = 12).
//
// Rotas (param ?action=<action> ou header X-Action):
//   confirm-payment  → confirma pagamento e adiciona créditos
//   confirm-avulso   → cria conta temporária para pacote avulso
//   fix-profiles     → diagnóstico/reparação de perfis sem phone
//   stats            → estatísticas agregadas do dashboard
//   transactions     → lista de transações

const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Action');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Determinar a acção a partir do path, query string ou header
  // Suporta: /api/admin/confirm-payment  → action = confirm-payment
  //          /api/admin?action=stats      → action = stats
  const urlPath = req.url || '';
  const pathParts = urlPath.split('?')[0].split('/').filter(Boolean);
  // pathParts ex: ['api', 'admin', 'confirm-payment']
  const lastSegment = pathParts[pathParts.length - 1];

  // Se o último segmento é "admin" (i.e. /api/admin) usar query ou header
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
    case 'documents':       return handleDocuments(req, res);
    default:
      return res.status(404).json({ error: `Acção desconhecida: "${action}". Use: confirm-payment, confirm-avulso, fix-profiles, stats, transactions` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

async function getAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada — operações admin impossíveis');
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

  // 1ª verificação: app_metadata.is_admin no JWT (zero query à DB, zero recursão RLS)
  //    Populado pelo EMERGENCIA_fix_recursion.sql ou pelo trigger de promoção de admin
  const isAdminJwt = user.app_metadata?.is_admin === true;
  if (isAdminJwt) return { user };

  // 2ª verificação: query directa à tabela profiles com service role (bypassa RLS)
  //    Fallback para quem ainda não tem app_metadata actualizado
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
    console.warn('[validateAdmin] Utilizador não é admin:', user.id);
    return { error: 'Acesso negado — apenas admins', status: 403 };
  }

  // Admin confirmado pela DB — sincronizar app_metadata para futuras chamadas (fire-and-forget)
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
// CONFIRM-PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
async function handleConfirmPayment(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { transactionId, userId, credits } = body;
  if (!transactionId || !userId || !credits)
    return res.status(400).json({ error: 'transactionId, userId e credits são obrigatórios' });
  try {
    const supabase = await getAdminClient();
    const auth = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { data: tx, error: txErr } = await supabase.from('transactions').select('id, status').eq('id', transactionId).single();
    if (txErr || !tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Transação já processada' });
    const { error: updateErr } = await supabase.from('transactions')
      .update({ status: 'completed', confirmed_by: auth.user.id, confirmed_at: new Date().toISOString() })
      .eq('id', transactionId);
    if (updateErr) throw updateErr;
    const { data: newCredits, error: rpcErr } = await supabase.rpc('add_credits', { user_id: userId, amount: credits });
    if (rpcErr) throw rpcErr;
    return res.status(200).json({ success: true, newCredits: newCredits || credits, message: `${credits} créditos adicionados com sucesso` });
  } catch (err) {
    console.error('[admin/confirm-payment]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM-AVULSO
// ─────────────────────────────────────────────────────────────────────────────
function _genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '0123456789';
  let pass = '';
  for (let i = 0; i < 4; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) pass += digits[Math.floor(Math.random() * digits.length)];
  return pass;
}

async function handleConfirmAvulso(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { transactionId, referenceId, phone, credits, manual } = body;

  // ── Modo manual: admin cria conta avulsa sem transação pré-existente ──
  if (manual === true) {
    if (!phone || !credits) return res.status(400).json({ error: 'phone e credits são obrigatórios no modo manual' });
    try {
      const supabase = await getAdminClient();
      const auth = await validateAdmin(supabase, token);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });
      const ref       = (referenceId || ('MAN' + Date.now().toString().slice(-6))).toUpperCase();
      const tempEmail = `temp_${ref.toLowerCase()}@mzdocs.temp`;
      const tempPass  = _genPassword();
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
        credits: parseInt(credits), plan: 'free', full_name: `Avulso ${ref}`,
        phone: normPhone, updated_at: new Date().toISOString(),
      }).eq('id', tempUserId);
      if (profileErr) throw profileErr;
      // Registar transação para histórico
      await supabase.from('transactions').insert({
        user_id: tempUserId, package_id: 'avulso', amount: 0,
        credits: parseInt(credits), status: 'completed', payment_method: 'manual',
        reference_id: ref, phone_number: normPhone,
        confirmed_by: auth.user.id, confirmed_at: new Date().toISOString(),
      });
      const origin  = req.headers.origin || req.headers.referer?.split('/').slice(0,3).join('/') || 'https://mzdocs.co.mz';
      const waPhone = cleanPhone.startsWith('258') ? cleanPhone : '258' + cleanPhone;
      const waMsg   = [
        `✅ *Conta MzDocs Pro criada — Referência ${ref}*`, ``,
        `💎 Créditos: ${credits}`,
        `🔑 *Acesso:* ${origin}`,
        `📧 *Utilizador:* ${tempEmail}`,
        `🔐 *Password:* ${tempPass}`, ``,
        `⚠️ Conta temporária — eliminada quando os créditos acabarem.`,
      ].join('\n');
      const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;
      return res.status(200).json({ success: true, tempEmail, tempPass, tempUserId, credits: parseInt(credits), waLink });
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
    const auth = await validateAdmin(supabase, token);
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
      credits: tx.credits, plan: 'free', full_name: `Avulso ${ref}`,
      phone: tx.phone_number || null, updated_at: new Date().toISOString(),
    }).eq('id', tempUserId);
    if (profileErr) throw profileErr;
    await supabase.from('transactions').update({
      user_id: tempUserId, status: 'completed',
      confirmed_by: auth.user.id, confirmed_at: new Date().toISOString(),
    }).eq('id', tx.id);
    const clientPhone = tx.phone_number?.replace(/\D/g, '') || '';
    const waTarget = clientPhone
      ? (clientPhone.startsWith('258') ? clientPhone : '258' + clientPhone)
      : null;
    const waMsg = [
      `✅ *Pagamento Confirmado — MzDocs Pro*`, ``,
      `📦 Pacote: Avulso (${tx.credits} créditos)`, `🆔 Referência: ${ref}`, ``,
      `A sua conta temporária foi criada:`,
      `🔑 *Acesso:* ${origin}`, `📧 *Utilizador:* ${tempEmail}`, `🔐 *Password:* ${tempPass}`, ``,
      `⚠️ Esta conta é eliminada automaticamente quando os ${tx.credits} créditos acabarem.`,
      `   Considere criar uma conta permanente para guardar os seus documentos.`,
    ].join('\n');
    const waLink = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(waMsg)}` : null;
    return res.status(200).json({ success: true, tempEmail, tempPass, tempUserId, credits: tx.credits, waLink, message: `Conta temporária criada: ${tempEmail} / ${tempPass}` });
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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const supabase = await getAdminClient();
    const auth = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    if (req.method === 'GET') {
      const { data: broken } = await supabase.from('profiles').select('id, email, phone, full_name, created_at')
        .or('phone.is.null,phone.eq.').order('created_at', { ascending: false });
      return res.status(200).json({
        total_broken: broken?.length || 0, profiles: broken || [],
        message: broken?.length ? `${broken.length} perfis sem telemóvel encontrados` : 'Todos os perfis têm telemóvel ✅',
      });
    }
    // POST: repair
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
    return res.status(200).json({ message: `Reparação concluída: ${fixed} corrigidos, ${failed} falhados`, fixed, failed, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error('[admin/fix-profiles]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — optimizado: máx 12 queries paralelas, sem loop sequencial
// ─────────────────────────────────────────────────────────────────────────────
async function handleStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const supabase = await getAdminClient();
    const auth = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart  = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Helper receita
    const rev = async (from) => {
      const { data } = await supabase.from('transactions').select('amount')
        .eq('status', 'completed').gte('created_at', from);
      return data?.reduce((s, t) => s + (t.amount || 0), 0) || 0;
    };

    // ── Todas as queries em paralelo (sem loop) ──────────────────────────
    const [
      revenueMonth,
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
      rev(monthStart.toISOString()),

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

      // Top tipos (últimos 30 dias)
      supabase.from('credit_usage_log').select('document_type')
        .gte('used_at', monthStart.toISOString()),

      // Revenue últimos 7 dias (uma query só)
      supabase.from('transactions').select('amount,created_at')
        .eq('status', 'completed').gte('created_at', weekStart.toISOString()),

      // Docs últimos 7 dias (uma query só)
      supabase.from('credit_usage_log').select('used_at')
        .gte('used_at', weekStart.toISOString()),
    ]);

    // ── Chart data calculado em JS (sem mais queries) ─────────────────────
    const dayLabels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const chartLabels = [], chartRevenue = [], chartDocs = [];
    for (let i = 6; i >= 0; i--) {
      const d       = new Date(); d.setDate(d.getDate() - i);
      const dayStr  = d.toISOString().split('T')[0];
      chartLabels.push(dayLabels[d.getDay()]);
      chartRevenue.push(
        (revenueRaw || []).filter(r => r.created_at?.startsWith(dayStr))
          .reduce((s, r) => s + (r.amount || 0), 0)
      );
      chartDocs.push(
        (docsRaw || []).filter(r => r.used_at?.startsWith(dayStr)).length
      );
    }

    // ── Top tipos ────────────────────────────────────────────────────────
    const typeCounts = {};
    (typesRaw || []).forEach(r => {
      if (r.document_type) typeCounts[r.document_type] = (typeCounts[r.document_type] || 0) + 1;
    });
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return res.status(200).json({
      success:   true,
      revenue:   { month: revenueMonth, today: chartRevenue[6] || 0, week: chartRevenue.reduce((a,b)=>a+b,0) },
      documents: { total: docsTotal || 0, today: docsToday || 0, week: chartDocs.reduce((a,b)=>a+b,0) },
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
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function handleTransactions(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const supabase = await getAdminClient();
    const auth = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const status = req.query?.status || 'all';
    const date   = req.query?.date;
    const limit  = Math.min(parseInt(req.query?.limit) || 50, 100);
    const offset = parseInt(req.query?.offset) || 0;
    let query = supabase.from('transactions').select(`
      id, user_id, package_id, amount, credits, status, payment_method,
      reference_id, phone_number, confirmed_by, confirmed_at, created_at,
      profiles:user_id (full_name, email, phone)
    `, { count: 'exact' });
    if (status !== 'all') query = query.eq('status', status);
    if (date) {
      query = query.gte('created_at', `${date}T00:00:00.000Z`).lte('created_at', `${date}T23:59:59.999Z`);
    }
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return res.status(200).json({ success: true, data: data || [], total: count || 0, limit, offset });
  } catch (err) {
    console.error('[admin/transactions]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — GET all / PUT one key
// ─────────────────────────────────────────────────────────────────────────────
async function handleSettings(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
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
      // Convert array to key-value map for convenience
      const map = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return res.status(200).json({ success: true, settings: data || [], map });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { updates } = req.body; // { key: value, ... }
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'updates object required' });
      }
      const now = new Date().toISOString();
      const rows = Object.entries(updates).map(([key, value]) => ({
        key, value: String(value), updated_by: auth.user.id, updated_at: now,
      }));
      const { error } = await supabase
        .from('system_settings')
        .upsert(rows, { onConflict: 'key' });
      if (error) throw error;

      // Log the action
      await supabase.from('admin_logs').insert({
        admin_id:    auth.user.id,
        action:      'update_settings',
        target_type: 'system_settings',
        details:     updates,
        created_at:  now,
      }).catch(() => {});

      return res.status(200).json({ success: true, updated: rows.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/settings]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG — GET recent entries
// ─────────────────────────────────────────────────────────────────────────────
async function handleAuditLog(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '');
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
// DELETE USER — elimina do Auth + DB (service_role)
// ─────────────────────────────────────────────────────────────────────────────
async function handleDeleteUser(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  const body  = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { userId } = body;
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    // Impedir auto-eliminação
    if (auth.user.id === userId) return res.status(400).json({ error: 'Não pode eliminar a sua própria conta' });

    // Eliminar dados relacionados primeiro (FK)
    await supabase.from('documents').delete().eq('user_id', userId);
    await supabase.from('transactions').delete().eq('user_id', userId);
    await supabase.from('credit_usage_log').delete().eq('user_id', userId);

    // Eliminar perfil da tabela profiles
    await supabase.from('profiles').delete().eq('id', userId);

    // Eliminar do Supabase Auth (requer service_role)
    const { error: authDelErr } = await supabase.auth.admin.deleteUser(userId);
    if (authDelErr) {
      console.warn('[delete-user] Auth delete falhou (perfil já removido):', authDelErr.message);
      // Não falhar: o perfil já foi eliminado; o utilizador não consegue autenticar
    }

    // Log da acção
    await supabase.from('admin_logs').insert({
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
// ANALYTICS — visitas por dia, online agora, serviços mais usados
// ─────────────────────────────────────────────────────────────────────────────
async function handleAnalytics(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();

  // ── POST: registo de visita — PÚBLICO, sem autenticação necessária ────────
  if (req.method === 'POST') {
    try {
      const supabase = await getAdminClient();
      const body  = parseBody(req) || {};
      const page  = (body.page || '/').slice(0, 200);
      const today = new Date().toISOString().split('T')[0];
      const sid   = (body.session || 'anon').slice(0, 64);
      await supabase.rpc('increment_page_view', { p_page: page, p_date: today }).catch(() => {});
      await supabase.from('online_sessions').upsert(
        { session_id: sid, page, updated_at: new Date().toISOString() },
        { onConflict: 'session_id' }
      ).catch(() => {});
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(200).json({ ok: false }); // falha silenciosa — não interromper o utilizador
    }
  }

  // ── GET: painel de analytics — apenas admin ───────────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const days  = parseInt(req.query?.days || '7', 10);
    const since = new Date(); since.setDate(since.getDate() - days);

      // Visitas por dia (últimos N dias)
      const { data: pvData } = await supabase
        .from('page_views')
        .select('date, page, views')
        .gte('date', since.toISOString().split('T')[0])
        .order('date', { ascending: true });

      // Agrupar por dia
      const byDay = {};
      (pvData || []).forEach(r => {
        byDay[r.date] = (byDay[r.date] || 0) + (r.views || 0);
      });

      // Online agora (sessões actualizadas nos últimos 5 min)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count: onlineNow } = await supabase
        .from('online_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', fiveMinAgo);

      // Serviços mais usados (credit_usage_log — últimos 30 dias)
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
      const { data: usageData } = await supabase
        .from('credit_usage_log')
        .select('document_type')
        .gte('used_at', monthAgo.toISOString());

      const serviceCounts = {};
      (usageData || []).forEach(r => {
        if (r.document_type) serviceCounts[r.document_type] = (serviceCounts[r.document_type] || 0) + 1;
      });
      const topServices = Object.entries(serviceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));

      // Feedback resumo
      const { data: fbData } = await supabase
        .from('user_feedback')
        .select('service, rating')
        .gte('created_at', monthAgo.toISOString());

      const fbByService = {};
      (fbData || []).forEach(r => {
        if (!fbByService[r.service]) fbByService[r.service] = { total: 0, count: 0 };
        fbByService[r.service].total += r.rating;
        fbByService[r.service].count += 1;
      });
      const feedbackSummary = Object.entries(fbByService).map(([service, v]) => ({
        service,
        avg: Math.round((v.total / v.count) * 10) / 10,
        count: v.count,
      })).sort((a, b) => b.count - a.count);

      return res.status(200).json({
        success: true,
        visitsByDay: byDay,
        onlineNow:   onlineNow || 0,
        topServices,
        feedbackSummary,
      });
  } catch (err) {
    console.error('[admin/analytics]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK — guardar reacção/rating do utilizador
// ─────────────────────────────────────────────────────────────────────────────
async function handleFeedback(req, res) {
  // Este endpoint é público (não requer admin)
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body inválido' });
  const { service, rating, comment, session_id } = body;
  if (!service || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'service e rating (1-5) são obrigatórios' });
  }

  try {
    const supabase = await getAdminClient();
    // Tentar obter user_id do token (opcional)
    let userId = null;
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
      userId = user?.id || null;
    }

    await supabase.from('user_feedback').insert({
      service,
      rating:     parseInt(rating),
      comment:    (comment || '').slice(0, 500),
      user_id:    userId,
      session_id: session_id || null,
      created_at: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[feedback]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC PAGES — lista as páginas .html da pasta /pages (ficheiros no repo)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStaticPages(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const token = req.headers.authorization?.replace('Bearer ', '');
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
          filename: f,
          slug:     f.replace(/\.html$/, ''),
          url:      '/pages/' + f,
          size:     fs.statSync(path.join(dir, f)).size,
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
// DOCUMENTS — lista server-side com service_role (evita RLS)
// ─────────────────────────────────────────────────────────────────────────────
async function handleDocuments(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const limit  = Math.min(parseInt(req.query?.limit || '100'), 200);
    const search = (req.query?.q || '').trim();

    let q = supabase
      .from('documents')
      .select('id, service_type, title, model_used, created_at, content, profiles(full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) q = q.ilike('service_type', `%${search}%`);

    const { data, error } = await q;
    if (error) throw error;

    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[admin/documents]', err);
    return res.status(500).json({ error: err.message });
  }
}
