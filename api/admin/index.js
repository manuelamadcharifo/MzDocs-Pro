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

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

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
      const origin  = req.headers.origin || req.headers.referer?.split('/').slice(0,3).join('/') || 'https://mz-docs-pro.vercel.app';
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
// STATS
// ─────────────────────────────────────────────────────────────────────────────
async function handleStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    const supabase = await getAdminClient();
    const auth = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart  = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rev = async (from) => {
      const { data } = await supabase.from('transactions').select('amount').eq('status', 'completed').gte('created_at', from);
      return data?.reduce((s, t) => s + (t.amount || 0), 0) || 0;
    };
    const cnt = async (table, from) => {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', from);
      return count || 0;
    };
    const [revenueToday, revenueWeek, revenueMonth] = await Promise.all([rev(todayStart), rev(weekStart.toISOString()), rev(monthStart.toISOString())]);
    const [docsToday, docsWeek, docsMonth]   = await Promise.all([cnt('documents', todayStart), cnt('documents', weekStart.toISOString()), cnt('documents', monthStart.toISOString())]);
    const [usersToday, usersWeek, usersMonth] = await Promise.all([cnt('profiles', todayStart), cnt('profiles', weekStart.toISOString()), cnt('profiles', monthStart.toISOString())]);
    const { count: usersTotal } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: pending }    = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const chartLabels = [], chartRevenue = [], chartDocs = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      chartLabels.push(dayLabels[d.getDay()]);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
      const { data: dr } = await supabase.from('transactions').select('amount').eq('status', 'completed').gte('created_at', dayStart).lte('created_at', dayEnd);
      chartRevenue.push(dr?.reduce((s, t) => s + (t.amount || 0), 0) || 0);
      const { count: dd } = await supabase.from('documents').select('*', { count: 'exact', head: true }).gte('created_at', dayStart).lte('created_at', dayEnd);
      chartDocs.push(dd || 0);
    }
    return res.status(200).json({
      success: true,
      revenue:   { today: revenueToday, week: revenueWeek, month: revenueMonth },
      documents: { today: docsToday,    week: docsWeek,    month: docsMonth    },
      users:     { today: usersToday,   week: usersWeek,   month: usersMonth, total: usersTotal || 0 },
      pending: pending || 0,
      chartData: { labels: chartLabels, revenue: chartRevenue, documents: chartDocs },
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

