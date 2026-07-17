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
const QRCode = require('qrcode');
const { ACTIVE_PROVIDERS, RESERVE_PROVIDERS, TIER_LABELS } = require('../_lib/aiProvidersCatalog');
const { sendPushToSubscriptions } = require('../_lib/webpush');
const { restRequest: pushRestRequest } = require('../_lib/supabaseAdmin');
const { loadPackagesFromSettings, estimateMznPerCredit } = require('../_lib/packages');

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
    case 'templates':         return handleTemplates(req, res);
    case 'pages':             return handleBlogPages(req, res);
    case 'generate-page':     return handleGeneratePage(req, res);
    case 'blog-queue':        return handleBlogQueue(req, res);
    case 'blog-settings':     return handleBlogSettings(req, res);
    case 'affiliates':        return handleAffiliates(req, res);
    case 'pending-receipts':  return handlePendingReceipts(req, res);
    case 'approve-receipt':   return handleApproveReceipt(req, res);
    case 'ai-providers':      return handleAiProviders(req, res);
    case 'qrcodes':           return handleQrCodes(req, res);
    case 'funnel':            return handleFunnel(req, res);
    case 'user-timeline':     return handleUserTimeline(req, res);
    case 'republish-blog':    return handleRepublishBlog(req, res);
    case 'notifications':     return handleNotifications(req, res);
    case 'campaigns':         return handleCampaigns(req, res);
    case 'goals':             return handleGoals(req, res);
    case 'push-subscribe':    return handlePushSubscribeAdmin(req, res);
    case 'push-send':         return handlePushSend(req, res);
    case 'finance':           return handleFinance(req, res);
    case 'template-withdrawals': return handleTemplateWithdrawals(req, res);
    // v41: Kit de Marketing dos Afiliados (CRUD dos materiais enviados
    // pelo admin — antes só existia o formulário em admin.html, chamando
    // adminApp._openMaterialForm(), que nunca tinha sido implementado no
    // AdminApp.js nem tinha rota correspondente aqui).
    case 'marketing-materials': return handleMarketingMaterials(req, res);
    default:
      return res.status(404).json({
        error: `Acção desconhecida: "${action}".`,
        available: ['confirm-payment','confirm-avulso','fix-profiles','stats','transactions','settings','audit-log','delete-user','delete-document','analytics','feedback','static-pages','documents','templates','pages','generate-page','blog-queue','blog-settings','affiliates','pending-receipts','approve-receipt','ai-providers','qrcodes','funnel','user-timeline','republish-blog','notifications','campaigns','goals','push-subscribe','push-send','finance','template-withdrawals','marketing-materials'],
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

  // CORRIGIDO: garantir que o admin tem uma linha em admin_users.
  // admin_users.id é FK para auth.users(id), e várias tabelas de log/config
  // (system_settings.updated_by, admin_logs.admin_id, etc.) são FK para
  // admin_users.id, não para auth.users(id) directamente. Um utilizador
  // podia tornar-se admin só por profiles.is_admin=true (como acima) e
  // nunca ter sido inserido em admin_users — qualquer escrita que
  // referencie essa FK falhava com "violates foreign key constraint",
  // mesmo com permissões de admin correctas.
  //
  // CORRIGIDO (2ª ronda): a 1ª versão desta correcção usava try/catch à
  // volta do upsert — mas o SDK do Supabase v2 NÃO lança excepção em
  // erros do PostgREST (RLS, CHECK, etc.); devolve sempre {data, error}
  // normalmente. O try/catch nunca via o erro real, e o upsert continuava
  // a falhar silenciosamente (confirmado: admin_users ficou vazia mesmo
  // depois desta "correcção"). Agora o resultado é verificado explicitamente.
  const { error: adminUpsertError } = await supabase.from('admin_users').upsert(
    { id: user.id, email: user.email || `${user.id}@sem-email.local`, full_name: user.user_metadata?.full_name || user.email || '', role: 'admin', is_active: true, last_login_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: false }
  );
  if (adminUpsertError) {
    console.error('[validateAdmin] Falha ao sincronizar admin_users:', adminUpsertError.message, adminUpsertError.details || '');
  }


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
      .select('id, status, package_id, amount, user_id, visitor_id')
      .eq('id', transactionId)
      .single();

    if (txErr || !tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.status !== 'pending') return res.status(400).json({ error: `Transação já processada (status: ${tx.status})` });

    // Se userId não veio do frontend (join RLS bloqueou), usar o da transação
    if (!userId && tx.user_id) userId = tx.user_id;
    if (!userId) return res.status(400).json({ error: 'userId em falta e transação não tem user_id' });

    // Actualizar transação — CORRIGIDO (auditoria, ponto 6): o UPDATE
    // anterior não tinha condição de status, criando uma janela de corrida
    // entre o SELECT (linha acima) e este UPDATE: se duas confirmações
    // chegassem quase simultaneamente, ambas passavam a verificação
    // "status === 'pending'" antes de qualquer uma escrever, resultando em
    // créditos duplicados. Agora o WHERE inclui "AND status = 'pending'",
    // tornando a transição pending→completed atómica a nível de base de
    // dados — só uma das chamadas concorrentes consegue actualizar 1 linha;
    // a outra recebe count=0 e é rejeitada antes de creditar.
    const { error: updateErr, count: updatedCount } = await supabase.from('transactions')
      .update({
        status:       'completed',
        confirmed_by: auth.user.id,
        confirmed_at: new Date().toISOString(),
      }, { count: 'exact' })
      .eq('id', transactionId)
      .eq('status', 'pending');
    if (updateErr) throw updateErr;
    if (!updatedCount) {
      return res.status(409).json({ error: 'Transação já foi processada por outro pedido em paralelo.' });
    }

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
    supabase.rpc('process_affiliate_commission_v2', {
      p_transaction_id: transactionId,
      p_user_id:        tx.user_id || userId,
      p_package_id:     tx.package_id,
      p_amount:         tx.amount,
    }).catch(e => console.warn('[affiliate commission]', e.message));

    // NOVO (Fase 2 — Marketing Analytics): mesma lógica do auto-approval em
    // api/misc.js — só regista se a transacção tiver visitor_id (Fase 1 em
    // diante); transacções antigas ficam de fora, nunca inventamos origem.
    if (tx.visitor_id) {
      supabase.from('marketing_events').insert({
        visitor_id:    tx.visitor_id,
        user_id:       tx.user_id || userId,
        event:         'credit_purchase',
        value:         tx.amount,
        metadata:      { package_id: tx.package_id, credits: creditsInt, verification_method: 'manual' },
      }).then(({ error }) => { if (error) console.warn('[confirm-payment] marketing_events falhou:', error.message); });
    }

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
    // CORRIGIDO (auditoria de dados, v37): a query de receita usava
    // `weekStart` (últimos 7 dias) como janela de leitura, mas depois
    // apresentava o resultado como "Receita Confirmada (30d)". Do dia 8
    // em diante de cada mês, weekStart passa a ser MAIS recente que o
    // início do mês, pelo que a query já vinha sem os dados dos dias
    // 1–(hoje-7) — o card mostrava sempre menos do que a receita real (ou
    // "0 MZN" se não houvesse nenhum pagamento nos últimos 7 dias, mesmo
    // havendo receita mais cedo no mês). Agora a janela de leitura é
    // sempre "últimos 30 dias", que cobre tanto o card de 30d como o
    // gráfico semanal (7 dias), tal como o rótulo já indicava na UI.
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const weekStart     = new Date(now); weekStart.setDate(weekStart.getDate() - 7);

    const [
      { count: totalUsers },
      { count: newUsers24h },
      { count: avulsoUsers },
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
      // CORRIGIDO (v37): o painel mostrava sempre "0 normais · 0 avulso" e
      // "0 Contas Avulso Activas" porque este endpoint nunca calculava
      // users.normal/users.avulso, apesar do front-end (AdminApp.js) já
      // ler esses campos. A fonte de verdade é profiles.account_type
      // ('avulso' vs 'normal'/NULL), tal como usado em handleAffiliates
      // e na secção Utilizadores.
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .eq('account_type', 'avulso'),
      // CORRIGIDO (auditoria de dados, v27): "Documentos Gerados" e o
      // gráfico "Documentos (7 dias)" liam de credit_usage_log, uma tabela
      // que NUNCA é escrita pelo código actual (api/deduct-credit.js só
      // chama as RPCs deduct_credits/deduct_credit/refund_credit, que
      // gravam em credit_logs — não na função deduct_credit_atomic que
      // seria a única a popular credit_usage_log). Resultado: estes
      // contadores mostravam sempre 0, mesmo com documentos reais gerados.
      // A fonte de verdade real é credit_logs com action='consume'.
      supabase.from('credit_logs').select('*', { count: 'exact', head: true })
        .eq('action', 'consume'),
      supabase.from('credit_logs').select('*', { count: 'exact', head: true })
        .eq('action', 'consume').gte('created_at', todayStart),
      supabase.from('transactions').select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('blog_pages').select('*', { count: 'exact', head: true })
        .eq('published', true),
      supabase.from('credit_logs').select('document_type')
        .eq('action', 'consume').gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('transactions').select('amount, created_at')
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('credit_logs').select('created_at')
        .eq('action', 'consume').gte('created_at', thirtyDaysAgo.toISOString()),
    ]);

    // Calcular receita/documentos por dia em JS para o gráfico de 7 dias
    // (subconjunto dos 30 dias já carregados acima — sem 2ª query).
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
        (docsRaw || []).filter(r => r.created_at?.startsWith(dayStr)).length
      );
    }

    // Receita confirmada nos últimos 30 dias (revenueRaw já vem filtrado
    // a partir de thirtyDaysAgo, não precisa de novo filtro).
    const revenue30d  = (revenueRaw || []).reduce((s, r) => s + (r.amount || 0), 0);
    const revenueWeek = (revenueRaw || [])
      .filter(r => r.created_at >= weekStart.toISOString())
      .reduce((s, r) => s + (r.amount || 0), 0);

    const typeCounts = {};
    (typesRaw || []).forEach(r => {
      if (r.document_type) typeCounts[r.document_type] = (typeCounts[r.document_type] || 0) + 1;
    });
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const normalUsers = Math.max(0, (totalUsers || 0) - (avulsoUsers || 0));

    return res.status(200).json({
      success:   true,
      revenue:   {
        month: revenue30d,  // chave "month" mantida por compatibilidade — representa os últimos 30 dias, como o rótulo na UI já indicava
        today: chartRevenue[6] || 0,
        week:  revenueWeek,
      },
      documents: { total: docsTotal || 0, today: docsToday || 0, week: chartDocs.reduce((a, b) => a + b, 0) },
      users:     { total: totalUsers || 0, new_24h: newUsers24h || 0, avulso: avulsoUsers || 0, normal: normalUsers },
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
// FINANÇAS (v37) — "Valor Levantável" e despesas operacionais dinâmicas
// ─────────────────────────────────────────────────────────────────────────────
// "Valor Levantável" = Receita Total Confirmada (transactions.status='completed')
//                     − Saldo reservado para Afiliados (profiles.aff_balance,
//                       dinheiro já ganho pelos afiliados mas ainda por pagar)
//                     − Despesas Operacionais registadas (tabela finance_expenses)
//                     − Já Levantado pelo dono da plataforma (finance_withdrawals)
//
// Os custos recorrentes (domínio, Vercel, providers de IA) são configuráveis
// em system_settings (chaves "finance_*", geridas no separador Finanças do
// admin) e amortizados automaticamente por mês. Nenhum valor de câmbio fica
// fixo no código: a taxa USD→MZN usada para converter os custos em dólar
// (Vercel/IA) é obtida em tempo real de uma API cambial pública e gratuita
// a cada pedido, com um valor de reserva apenas para o caso raro de a API
// estar indisponível nesse momento.
const FX_FALLBACK_USD_MZN = 63.8; // reserva — só usada se a API de câmbio falhar

async function fetchUsdToMznRate() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const rate = Number(j?.rates?.MZN);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Taxa MZN em falta na resposta da API');
    return { rate, source: 'open.er-api.com', fetched_at: new Date().toISOString(), live: true };
  } catch (err) {
    console.warn('[finance] Câmbio ao vivo indisponível, a usar reserva:', err.message);
    return { rate: FX_FALLBACK_USD_MZN, source: 'reserva (API indisponível)', fetched_at: new Date().toISOString(), live: false };
  }
}

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const FINANCE_SETTINGS_KEYS = [
  'finance_domain_provider', 'finance_domain_annual_mzn', 'finance_domain_renewal_date',
  'finance_vercel_plan', 'finance_vercel_monthly_usd',
  'finance_ai_monthly_usd', 'finance_other_monthly_mzn',
];

async function handleFinance(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const q = req.query || {};

    // ── GET: histórico de despesas operacionais ───────────────────────
    if (req.method === 'GET' && q.sub === 'expenses') {
      const { data, error } = await supabase.from('finance_expenses')
        .select('id, category, description, amount_mzn, is_recurring, occurred_at, created_at')
        .order('occurred_at', { ascending: false }).limit(200);
      if (error) throw error;
      return res.status(200).json({ success: true, expenses: data || [] });
    }

    // ── GET: histórico de levantamentos do dono da plataforma ─────────
    if (req.method === 'GET' && q.sub === 'withdrawals') {
      const { data, error } = await supabase.from('finance_withdrawals')
        .select('id, amount_mzn, note, withdrawn_at, created_at')
        .order('withdrawn_at', { ascending: false }).limit(200);
      if (error) throw error;
      return res.status(200).json({ success: true, withdrawals: data || [] });
    }

    // ── GET: resumo financeiro completo (dashboard + separador Finanças) ─
    if (req.method === 'GET' && (!q.sub || q.sub === 'summary')) {
      const [
        { data: settingsRows },
        { data: revenueRows },
        { data: affRows },
        { data: affPendingWithdrawals },
        { data: tplAuthorRows },
        { data: tplPendingWithdrawals },
        { data: expenseRows },
        { data: withdrawalRows },
      ] = await Promise.all([
        supabase.from('system_settings').select('key, value').in('key', FINANCE_SETTINGS_KEYS),
        supabase.from('transactions').select('amount').eq('status', 'completed'),
        supabase.from('profiles').select('aff_balance').gt('aff_balance', 0),
        // Levantamentos de afiliados já pedidos (o valor já saiu de
        // aff_balance nesse momento) mas ainda não pagos via M-Pesa —
        // continuam a ser dinheiro reservado, não disponível ao dono.
        supabase.from('affiliate_withdrawals').select('amount').eq('status', 'pending'),
        // Royalties de criadores de templates (v38) — mesma lógica dos
        // afiliados: dinheiro já ganho por quem criou um template pago,
        // ainda não levantado, nunca entra no valor levantável do dono.
        supabase.from('profiles').select('template_author_balance').gt('template_author_balance', 0),
        supabase.from('template_withdrawals').select('amount').eq('status', 'pending'),
        supabase.from('finance_expenses').select('amount_mzn'),
        supabase.from('finance_withdrawals').select('amount_mzn'),
      ]);

      const cfg = {};
      (settingsRows || []).forEach(r => { cfg[r.key] = r.value; });
      const num = (v, def = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };

      const domainProvider    = cfg.finance_domain_provider || 'mozdomains.co.mz';
      const domainAnnualMzn   = num(cfg.finance_domain_annual_mzn, 200);
      const domainRenewalDate = cfg.finance_domain_renewal_date || null;
      const vercelPlan        = cfg.finance_vercel_plan || 'Hobby (Grátis)';
      const vercelMonthlyUsd  = num(cfg.finance_vercel_monthly_usd, 0);
      const aiMonthlyUsd      = num(cfg.finance_ai_monthly_usd, 0);
      const otherMonthlyMzn   = num(cfg.finance_other_monthly_mzn, 0);

      const fx = await fetchUsdToMznRate();

      const domainMonthlyMzn   = domainAnnualMzn / 12;
      const vercelMonthlyMzn   = vercelMonthlyUsd * fx.rate;
      const aiMonthlyMzn       = aiMonthlyUsd * fx.rate;
      const totalMonthlyCostMzn = domainMonthlyMzn + vercelMonthlyMzn + aiMonthlyMzn + otherMonthlyMzn;

      const revenueTotal = (revenueRows || []).reduce((s, t) => s + (t.amount || 0), 0);
      const affiliateReserved =
        (affRows || []).reduce((s, p) => s + (p.aff_balance || 0), 0) +
        (affPendingWithdrawals || []).reduce((s, w) => s + (w.amount || 0), 0);
      // v38: royalties de criadores de templates — mesma lógica dos
      // afiliados, dinheiro já ganho mas ainda não levantado nunca conta
      // como disponível para o dono da plataforma.
      const templateAuthorsReserved =
        (tplAuthorRows || []).reduce((s, p) => s + (p.template_author_balance || 0), 0) +
        (tplPendingWithdrawals || []).reduce((s, w) => s + (w.amount || 0), 0);
      const expensesTotal = (expenseRows || []).reduce((s, e) => s + (e.amount_mzn || 0), 0);
      const withdrawnTotal    = (withdrawalRows || []).reduce((s, w) => s + (w.amount_mzn || 0), 0);

      const withdrawableMzn = Math.max(0, revenueTotal - affiliateReserved - templateAuthorsReserved - expensesTotal - withdrawnTotal);

      return res.status(200).json({
        success: true,
        revenue_total_confirmed: revenueTotal,
        affiliate_reserved:      affiliateReserved,
        template_authors_reserved: templateAuthorsReserved,
        expenses_total_logged:   expensesTotal,
        already_withdrawn:       withdrawnTotal,
        withdrawable_mzn:        round2(withdrawableMzn),
        exchange_rate: fx,
        recurring_costs: {
          domain: {
            provider: domainProvider, annual_mzn: domainAnnualMzn,
            monthly_mzn: round2(domainMonthlyMzn), renewal_date: domainRenewalDate,
          },
          vercel: {
            plan: vercelPlan, monthly_usd: vercelMonthlyUsd, monthly_mzn: round2(vercelMonthlyMzn),
          },
          ai_providers: {
            monthly_usd: aiMonthlyUsd, monthly_mzn: round2(aiMonthlyMzn),
            note: 'Os 5 providers de IA activos (Groq, Cerebras, Gemini, OpenRouter, NVIDIA) usam apenas planos grátis — este valor só é > 0 se configurar aqui um orçamento para uma chave paga.',
          },
          other: { monthly_mzn: otherMonthlyMzn },
          total_monthly_mzn: round2(totalMonthlyCostMzn),
        },
      });
    }

    // ── POST: registar despesa / levantamento / guardar configuração ──
    if (req.method === 'POST') {
      const body = parseBody(req);
      if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
      const { op } = body;
      const now = new Date().toISOString();

      if (op === 'add-expense') {
        const amount = parseFloat(body.amount_mzn);
        if (!body.category || !Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ error: 'category e amount_mzn (> 0) são obrigatórios' });
        }
        const { data, error } = await supabase.from('finance_expenses').insert({
          category:     body.category,
          description:  body.description || null,
          amount_mzn:   amount,
          is_recurring: !!body.is_recurring,
          occurred_at:  body.occurred_at || now.split('T')[0],
          created_by:   auth.user.id,
        }).select().single();
        if (error) throw error;
        await supabase.from('admin_logs').insert({
          admin_id: auth.user.id, action: 'finance_add_expense',
          target_type: 'finance_expenses', target_id: data.id, details: body, created_at: now,
        });
        return res.status(200).json({ success: true, expense: data });
      }

      if (op === 'delete-expense') {
        if (!body.id) return res.status(400).json({ error: 'id em falta' });
        const { error } = await supabase.from('finance_expenses').delete().eq('id', body.id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (op === 'add-withdrawal') {
        const amount = parseFloat(body.amount_mzn);
        if (!Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ error: 'amount_mzn (> 0) é obrigatório' });
        }
        const { data, error } = await supabase.from('finance_withdrawals').insert({
          amount_mzn:   amount,
          note:         body.note || null,
          withdrawn_at: body.withdrawn_at || now.split('T')[0],
          created_by:   auth.user.id,
        }).select().single();
        if (error) throw error;
        await supabase.from('admin_logs').insert({
          admin_id: auth.user.id, action: 'finance_add_withdrawal',
          target_type: 'finance_withdrawals', target_id: data.id, details: body, created_at: now,
        });
        return res.status(200).json({ success: true, withdrawal: data });
      }

      if (op === 'delete-withdrawal') {
        if (!body.id) return res.status(400).json({ error: 'id em falta' });
        const { error } = await supabase.from('finance_withdrawals').delete().eq('id', body.id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (op === 'save-config') {
        const updates = {};
        FINANCE_SETTINGS_KEYS.forEach(k => {
          if (body[k] !== undefined && body[k] !== '') updates[k] = String(body[k]);
        });
        if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nenhum campo para guardar' });
        const rows = Object.entries(updates).map(([key, value]) => ({
          key, value, updated_by: auth.user.id, updated_at: now,
        }));
        const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' });
        if (error) throw error;
        await supabase.from('admin_logs').insert({
          admin_id: auth.user.id, action: 'finance_save_config',
          target_type: 'system_settings', details: updates, created_at: now,
        });
        return res.status(200).json({ success: true, updated: rows.length });
      }

      return res.status(400).json({ error: 'op desconhecida (esperado: add-expense, delete-expense, add-withdrawal, delete-withdrawal, save-config)' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/finance]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVANTAMENTOS DE ROYALTIES DE TEMPLATES (v38) — o admin paga/rejeita os
// pedidos feitos pelos criadores de templates via /api/templates/withdraw.
// Mesma lógica de handleAffiliates → process_withdrawal, mas para a tabela
// template_withdrawals / profiles.template_author_balance.
// ─────────────────────────────────────────────────────────────────────────────
async function handleTemplateWithdrawals(req, res) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const status = (req.query?.status || 'pending').trim();
      let q = supabase.from('template_withdrawals')
        .select('id, author_id, amount, mpesa_phone, status, admin_note, processed_at, created_at, profiles(full_name, email, phone)')
        .order('created_at', { ascending: false }).limit(100);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ success: true, withdrawals: data || [] });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const { withdrawal_id, status: newStatus, note } = body || {};
      if (!withdrawal_id) return res.status(400).json({ error: 'withdrawal_id em falta' });
      if (!['completed', 'rejected'].includes(newStatus)) return res.status(400).json({ error: 'status inválido' });

      const { data: wd, error: wErr } = await supabase.from('template_withdrawals')
        .select('author_id, amount, status').eq('id', withdrawal_id).single();
      if (wErr || !wd) return res.status(404).json({ error: 'Levantamento não encontrado' });
      if (wd.status !== 'pending') return res.status(400).json({ error: 'Levantamento não está pendente' });

      const { error } = await supabase.from('template_withdrawals').update({
        status: newStatus, admin_note: note || null, processed_at: new Date().toISOString(),
      }).eq('id', withdrawal_id);
      if (error) throw error;

      // Se rejeitado: devolver saldo ao criador do template
      if (newStatus === 'rejected') {
        const { data: prof } = await supabase.from('profiles')
          .select('template_author_balance').eq('id', wd.author_id).single();
        await supabase.from('profiles')
          .update({ template_author_balance: (prof?.template_author_balance || 0) + wd.amount })
          .eq('id', wd.author_id);
      }

      await supabase.from('admin_logs').insert({
        admin_id: auth.user.id, action: 'process_template_withdrawal',
        target_type: 'template_withdrawals', target_id: withdrawal_id,
        details: { status: newStatus, note }, created_at: new Date().toISOString(),
      });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/template-withdrawals]', err);
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
      receipt_hash,
      receipt_verified,
      receipt_confidence,
      verification_method,
      review_reason,
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

      // NOVO (auditoria de analytics, v27): as páginas de blog nunca
      // incrementavam blog_pages.views — a coluna existe e há uma RPC
      // pronta (increment_page_views) desde a migration_v8_1, mas nunca
      // era chamada porque as páginas estáticas do blog não tinham
      // NENHUM script de tracking (ver _generateStaticPage, corrigido
      // para incluir o snippet abaixo em todo artigo novo).
      const blogSlugMatch = page.match(/^\/?blog\/([^/?#]+)/);
      if (blogSlugMatch) {
        supabase.rpc('increment_page_views', { p_slug: blogSlugMatch[1] }).catch(() => {});
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
    // CORRIGIDO (auditoria de dados, v27): mesma tabela fantasma
    // credit_usage_log — nunca escrita pelo código actual. A fonte real
    // de consumo de créditos por tipo de documento é credit_logs
    // (action='consume'), a mesma usada em handleStats.
    const { data: usageData } = await supabase
      .from('credit_logs').select('document_type')
      .eq('action', 'consume')
      .gte('created_at', monthAgo.toISOString());

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

    // ── NOVO (auditoria de analytics, v27): detalhe pedido — que páginas
    // foram vistas (incluindo artigos do blog um a um), quantos clientes
    // novos e de onde vieram, e cliques de afiliados por segmento
    // (papelaria/cyber/universidade/etc). Antes só existia o total
    // agregado por dia (byDay), sem qualquer discriminação por página.
    const { data: pvBreakdownRaw } = await supabase
      .from('page_views').select('page, views')
      .gte('date', since.toISOString().split('T')[0]);

    const byPage = {};
    (pvBreakdownRaw || []).forEach(r => { byPage[r.page] = (byPage[r.page] || 0) + (r.views || 0); });

    const { data: blogPagesRaw } = await supabase
      .from('blog_pages').select('slug, title, views, published_at');
    const blogBySlug = {};
    (blogPagesRaw || []).forEach(p => { blogBySlug[p.slug] = p; });

    const topPages = Object.entries(byPage)
      .map(([page, views]) => {
        const slug = page.replace(/^\/?blog\/?/, '').replace(/\/$/, '');
        const blogMatch = blogBySlug[slug] || null;
        return {
          page, views,
          type:  blogMatch ? 'blog' : (page === '/' ? 'home' : 'page'),
          title: blogMatch?.title || null,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 30);

    // Blog: cada artigo publicado com as suas próprias visitas totais
    // (coluna views em blog_pages, incrementada a cada leitura) + visitas
    // no período seleccionado (via page_views, quando o slug bate certo).
    const blogPerformance = (blogPagesRaw || [])
      .map(p => ({
        slug: p.slug, title: p.title,
        views_total:  p.views || 0,
        views_period: byPage['/blog/' + p.slug] || byPage[p.slug] || 0,
        published_at: p.published_at,
      }))
      .sort((a, b) => b.views_total - a.views_total);

    // Novos clientes no período + de onde vieram (afiliado vs orgânico),
    // e por segmento do afiliado que os referiu (papelaria/cyber/etc).
    const { data: newProfilesRaw } = await supabase
      .from('profiles').select('id, created_at, referred_by, account_type')
      .gte('created_at', since.toISOString());

    const referrerIds = [...new Set((newProfilesRaw || []).map(p => p.referred_by).filter(Boolean))];
    const referrerSegmentMap = {};
    if (referrerIds.length) {
      const { data: referrers } = await supabase
        .from('profiles').select('id, aff_segment').in('id', referrerIds);
      (referrers || []).forEach(r => { referrerSegmentMap[r.id] = r.aff_segment || 'individual'; });
    }

    let newClientsOrganic = 0, newClientsAvulso = 0;
    const newClientsBySegment = {};
    (newProfilesRaw || []).forEach(p => {
      if (p.account_type === 'avulso') newClientsAvulso++;
      if (p.referred_by) {
        const seg = referrerSegmentMap[p.referred_by] || 'individual';
        newClientsBySegment[seg] = (newClientsBySegment[seg] || 0) + 1;
      } else {
        newClientsOrganic++;
      }
    });

    // Cliques de afiliados por segmento (papelaria/cyber/universidade/
    // explicação/digitador/individual), com taxa de conversão.
    const { data: clicksRaw } = await supabase
      .from('affiliate_clicks').select('affiliate_id, converted, created_at')
      .gte('created_at', since.toISOString());

    const clickAffIds = [...new Set((clicksRaw || []).map(c => c.affiliate_id).filter(Boolean))];
    const clickSegmentMap = { ...referrerSegmentMap };
    const missingIds = clickAffIds.filter(id => !clickSegmentMap[id]);
    if (missingIds.length) {
      const { data: affs } = await supabase.from('profiles').select('id, aff_segment').in('id', missingIds);
      (affs || []).forEach(a => { clickSegmentMap[a.id] = a.aff_segment || 'individual'; });
    }

    const segmentStats = {};
    (clicksRaw || []).forEach(c => {
      const seg = clickSegmentMap[c.affiliate_id] || 'individual';
      if (!segmentStats[seg]) segmentStats[seg] = { clicks: 0, conversions: 0 };
      segmentStats[seg].clicks += 1;
      if (c.converted) segmentStats[seg].conversions += 1;
    });
    const affiliateClicksBySegment = Object.entries(segmentStats).map(([segment, v]) => ({
      segment, clicks: v.clicks, conversions: v.conversions,
      conversion_rate: v.clicks > 0 ? Math.round((v.conversions / v.clicks) * 1000) / 10 : 0,
    })).sort((a, b) => b.clicks - a.clicks);

    // NOVO (Fase 2 — Marketing Analytics): agregação por origem
    // (?src=facebook, ?src=qr001, etc.), usando a view marketing_source_daily
    // criada na Fase 1 (migration_v30) — soma o período pedido em vez de dia
    // a dia, que é o que o dashboard precisa de mostrar.
    // CORRIGIDO: .catch(()=>({data:[]})) aqui é deliberado — se a Fase 1
    // ainda não tiver sido aplicada nalgum ambiente (migration não corrida),
    // este bloco falha em silêncio e o resto do dashboard de Analytics
    // continua a funcionar normalmente, em vez de a página inteira quebrar.
    let marketingSources = [];
    try {
      const { data: mktRows } = await supabase
        .from('marketing_source_daily')
        .select('marketing_source, visits, unique_visitors, signups, buyers, revenue')
        .gte('day', since.toISOString().split('T')[0]);
      const bySource = {};
      (mktRows || []).forEach(r => {
        const s = bySource[r.marketing_source] || { source: r.marketing_source, visits: 0, unique_visitors: 0, signups: 0, buyers: 0, revenue: 0 };
        s.visits          += r.visits          || 0;
        s.unique_visitors += r.unique_visitors  || 0;
        s.signups         += r.signups          || 0;
        s.buyers          += r.buyers           || 0;
        s.revenue         += Number(r.revenue)  || 0;
        bySource[r.marketing_source] = s;
      });
      marketingSources = Object.values(bySource)
        .map(s => ({ ...s, conversion_rate: s.visits > 0 ? Math.round((s.buyers / s.visits) * 1000) / 10 : 0 }))
        .sort((a, b) => b.revenue - a.revenue || b.visits - a.visits);
    } catch (mktErr) {
      console.warn('[admin/analytics] marketing_source_daily indisponível (Fase 1 aplicada?):', mktErr.message);
    }

    return res.status(200).json({
      success: true, visitsByDay: byDay, onlineNow: onlineNow || 0,
      topServices, feedbackList, feedbackSummary,
      // NOVO:
      topPages, blogPerformance,
      newClients: {
        total:      (newProfilesRaw || []).length,
        organic:    newClientsOrganic,
        avulso:     newClientsAvulso,
        bySegment:  newClientsBySegment,
      },
      affiliateClicksBySegment,
      marketingSources,
    });
  } catch (err) {
    console.error('[admin/analytics]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNIL (Fase 4) — visitas → registos → documentos gerados → compras,
// com taxa de conversão em cada passo. Usa a view marketing_funnel_daily
// (migration_v33), agregada por dia — soma o período pedido e calcula as
// taxas globais, mais a série diária para o gráfico.
// ─────────────────────────────────────────────────────────────────────────────
async function handleFunnel(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = await getAdminClient();
    const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const days  = Math.min(Math.max(parseInt(req.query?.days || '30', 10) || 30, 1), 365);
    const since = new Date(); since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    let rows = [];
    try {
      const { data, error } = await supabase
        .from('marketing_funnel_daily')
        .select('day, visits, unique_visitors, signups, doc_generators, buyers, revenue')
        .gte('day', sinceStr)
        .order('day', { ascending: true });
      if (error) throw error;
      rows = data || [];
    } catch (viewErr) {
      // Degrada sem rebentar se a migration_v33 ainda não tiver sido
      // aplicada neste ambiente — mesmo padrão usado em marketing_source_daily.
      console.warn('[admin/funnel] marketing_funnel_daily indisponível (v33 aplicada?):', viewErr.message);
      return res.status(200).json({
        success: true, applied: false,
        message: 'A view marketing_funnel_daily ainda não existe. Corra migration_v33_funnel_crm.sql no Supabase.',
        totals: null, daily: [],
      });
    }

    // Totais do período (soma dia a dia — cada dia já é uma contagem
    // DISTINCT de visitor_id dentro desse dia, por isso somar dias é
    // seguro para o funil, tal como na marketing_source_daily).
    const totals = rows.reduce((acc, r) => {
      acc.visits          += r.visits          || 0;
      acc.unique_visitors += r.unique_visitors  || 0;
      acc.signups         += r.signups          || 0;
      acc.doc_generators  += r.doc_generators   || 0;
      acc.buyers          += r.buyers           || 0;
      acc.revenue         += Number(r.revenue)  || 0;
      return acc;
    }, { visits: 0, unique_visitors: 0, signups: 0, doc_generators: 0, buyers: 0, revenue: 0 });

    const rate = (num, den) => den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    // Taxas passo-a-passo (o que interessa para ver ONDE se perdem clientes)
    // + taxa acumulada (visita → compra), que é o número que mais importa
    // para decidir onde investir em marketing.
    const conversion = {
      visit_to_signup: rate(totals.signups, totals.unique_visitors),
      signup_to_doc:   rate(totals.doc_generators, totals.signups),
      doc_to_buyer:    rate(totals.buyers, totals.doc_generators),
      overall_visit_to_buyer: rate(totals.buyers, totals.unique_visitors),
    };

    const daily = rows.map(r => ({
      day: r.day,
      visits: r.visits || 0,
      unique_visitors: r.unique_visitors || 0,
      signups: r.signups || 0,
      doc_generators: r.doc_generators || 0,
      buyers: r.buyers || 0,
      revenue: Number(r.revenue) || 0,
    }));

    return res.status(200).json({ success: true, applied: true, days, totals, conversion, daily });
  } catch (err) {
    console.error('[admin/funnel]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE / CRM POR UTILIZADOR (Fase 4) — histórico completo de um cliente
// específico: eventos de negócio (marketing_events) ligados tanto por
// user_id (actividade depois do login) como por visitor_id (actividade
// anónima antes de ter conta, ligada ao perfil via profiles.visitor_id
// gravado no signup — migration_v33). Sem essa ligação, a timeline só
// mostraria a actividade a partir do momento em que o utilizador criou
// conta, perdendo tudo o que motivou a conversão (de onde veio, quantas
// visitas fez antes de se registar, etc.).
// ─────────────────────────────────────────────────────────────────────────────
async function handleUserTimeline(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = await getAdminClient();
    const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const userId = (req.query?.userId || '').toString().trim();
    if (!userId || userId.length !== 36) {
      return res.status(400).json({ error: 'userId inválido' });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email, created_at, visitor_id, credits, account_type, is_admin, is_blocked, referred_by, total_documents')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    // OR por user_id / visitor_id — quando visitor_id ainda não existir
    // neste perfil (contas criadas antes da migration_v33), a timeline
    // simplesmente fica limitada à actividade pós-login, sem rebentar.
    const orFilter = profile.visitor_id
      ? `user_id.eq.${userId},visitor_id.eq.${profile.visitor_id}`
      : `user_id.eq.${userId}`;

    const { data: events, error: evErr } = await supabase
      .from('marketing_events')
      .select('event, document_type, value, metadata, created_at, visitor_id, user_id')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(200);

    if (evErr) {
      console.error('[admin/user-timeline] eventos:', evErr.message);
      return res.status(500).json({ error: 'Erro ao carregar histórico' });
    }

    const timeline = (events || []).map(e => ({
      event:         e.event,
      document_type: e.document_type || null,
      value:         e.value != null ? Number(e.value) : null,
      metadata:      e.metadata || {},
      created_at:    e.created_at,
      // marca se este evento é de antes do registo (só tem visitor_id, sem
      // user_id) — útil para o front distinguir visualmente na timeline.
      pre_signup:    !e.user_id,
    }));

    return res.status(200).json({
      success: true,
      profile: {
        id: profile.id, full_name: profile.full_name, phone: profile.phone,
        email: profile.email, created_at: profile.created_at,
        credits: profile.credits, account_type: profile.account_type,
        is_admin: profile.is_admin, is_blocked: profile.is_blocked,
        has_visitor_link: !!profile.visitor_id,
      },
      timeline,
    });
  } catch (err) {
    console.error('[admin/user-timeline]', err);
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
// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO DE TEMPLATES DA GALERIA (preço/créditos definidos pelo admin)
// ─────────────────────────────────────────────────────────────────────────────
// CORRIGIDO: não existia nenhuma forma, fora do SQL Editor do Supabase, de
// o admin ver os templates da galeria e ajustar o preço (credit_cost),
// destaque (is_featured) ou aprovação (status) de cada um. Esta rota cobre
// isso: GET lista (com filtro de texto/tipo), PUT actualiza um ou mais
// templates de uma vez. A complexidade de cada template (extensão do
// template_html/template_css) é devolvida em GET como `complexity_score`
// — uma estimativa objectiva (não vinculativa) para ajudar o admin a
// decidir o preço; a decisão final continua sempre manual.
async function handleTemplates(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const limit  = Math.min(parseInt(req.query?.limit || '100'), 200);
      const search = (req.query?.q || '').trim();
      const type   = (req.query?.type || '').trim();
      // CORRIGIDO (v38): faltava filtro por status. O front-end (secção
      // Templates do admin) precisa de listar "pending"/"approved"/
      // "rejected" separadamente — sem este filtro só era possível
      // trazer tudo e filtrar no browser, e nem isso funcionava porque
      // esta rota nunca chegou a ser usada pelo front-end (ver AdminApp.js).
      const status = (req.query?.status || '').trim();
      let q = supabase.from('templates_custom')
        // CORRIGIDO: 'avg_rating' não é uma coluna real de templates_custom
        // (só existe como CASE calculado na view v_templates_gallery,
        // migration_v12/v23) — o select directo causava
        // "column templates_custom.avg_rating does not exist" e partia a
        // página inteira de moderação de templates. Selecciona-se
        // rating_sum/rating_count reais e calcula-se avg_rating abaixo.
        // CORRIGIDO (v39): 'price_mzn' foi removida de templates_custom
        // pela migration_v39_template_credits_only.sql — o preço passou a
        // ser SEMPRE credit_cost, com o equivalente em MZN calculado ao
        // vivo (ver mzn_per_credit/mzn_equivalent abaixo). Seleccionar
        // price_mzn directamente causava "column templates_custom.price_mzn
        // does not exist" e partia esta página inteira.
        .select('id, user_id, service_type, template_name, description, template_type, status, is_featured, is_public, credit_cost, author_share_percent, use_count, downloads, rating_sum, rating_count, rejection_note, template_html, template_css, created_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (search) q = q.ilike('template_name', `%${search}%`);
      if (type)   q = q.eq('template_type', type);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;

      // v39: taxa dinâmica MZN/crédito, a mesma fonte de verdade usada no
      // checkout (api/_lib/packages.js) — nunca um valor fixo no código.
      // O AdminApp.js já espera `mzn_per_credit` (para o "≈ X MZN" ao
      // vivo enquanto o admin altera os créditos) e `mzn_equivalent` por
      // template; esta rota nunca chegou a devolver nenhum dos dois.
      const packages     = await loadPackagesFromSettings();
      const mznPerCredit = estimateMznPerCredit(packages);

      const templates = (data || []).map(t => {
        // Estimativa simples de complexidade: tamanho combinado do HTML+CSS
        // e número de regras CSS — serve só de sugestão visual para o
        // admin, nunca define o preço automaticamente.
        const size = (t.template_html?.length || 0) + (t.template_css?.length || 0);
        const rules = (t.template_css?.match(/\{/g) || []).length;
        const complexity_score = Math.min(10, Math.round((size / 600) + (rules / 8)));
        const avg_rating = t.rating_count > 0 ? Math.round((t.rating_sum / t.rating_count) * 10) / 10 : null;
        const mzn_equivalent = Math.round((t.credit_cost || 0) * mznPerCredit * 100) / 100;
        const { template_html, template_css, ...rest } = t;
        return { ...rest, avg_rating, complexity_score, mzn_equivalent };
      });
      return res.status(200).json({ success: true, templates, mzn_per_credit: Math.round(mznPerCredit * 100) / 100 });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body    = parseBody(req);
      const updates = body?.updates; // [{ id, credit_cost?, is_featured?, status?, template_type?, author_share_percent? }]
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: 'updates (array) é obrigatório' });
      }
      // CORRIGIDO (v38): esta lista já suportava status/is_public, mas
      // faltavam rejection_note (usado ao rejeitar) e author_share_percent
      // (novos campos da repartição de vendas com o criador do template).
      // CORRIGIDO (v39): removido 'price_mzn' — a coluna já não existe na
      // base de dados (ver nota no GET acima); gravar este campo causava
      // sempre erro 500 ao aprovar/editar qualquer template.
      const ALLOWED_FIELDS = ['credit_cost', 'is_featured', 'status', 'template_type', 'is_public', 'rejection_note', 'author_share_percent'];
      const results = [];
      for (const u of updates) {
        if (!u?.id) { results.push({ id: u?.id, ok: false, error: 'id obrigatório' }); continue; }
        const patch = {};
        for (const f of ALLOWED_FIELDS) if (u[f] !== undefined) patch[f] = u[f];
        if (patch.credit_cost !== undefined) {
          const c = parseInt(patch.credit_cost);
          if (!Number.isFinite(c) || c < 0 || c > 50) { results.push({ id: u.id, ok: false, error: 'credit_cost inválido (0-50)' }); continue; }
          patch.credit_cost = c;
        }
        if (patch.author_share_percent !== undefined) {
          // Regra de negócio pedida: a repartição da venda tem SEMPRE de
          // ficar entre 60%-70% para o criador do template e 30%-40% para
          // a plataforma. Validado aqui (além do CHECK constraint na
          // base de dados) para devolver um erro claro em vez de um erro
          // SQL genérico.
          const s = parseFloat(patch.author_share_percent);
          if (!Number.isFinite(s) || s < 60 || s > 70) { results.push({ id: u.id, ok: false, error: 'author_share_percent deve estar entre 60 e 70' }); continue; }
          patch.author_share_percent = s;
        }
        // Ao aprovar/rejeitar, carimbar automaticamente a data — antes o
        // front-end tentava gravar approved_at/rejected_at directamente,
        // colunas que nunca existiram na base de dados (erro SQL sempre).
        if (patch.status === 'approved') { patch.is_public = patch.is_public ?? true;  patch.approved_at = new Date().toISOString(); patch.rejection_note = null; }
        if (patch.status === 'rejected') { patch.is_public = patch.is_public ?? false; patch.rejected_at = new Date().toISOString(); }
        if (!Object.keys(patch).length) { results.push({ id: u.id, ok: false, error: 'nenhum campo válido' }); continue; }
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from('templates_custom').update(patch).eq('id', u.id);
        results.push({ id: u.id, ok: !error, error: error?.message });
      }
      await supabase.from('admin_logs').insert({
        admin_id:    auth.user.id,
        action:      'update_templates',
        target_type: 'templates_custom',
        details:     { updates },
        created_at:  new Date().toISOString(),
      });
      return res.status(200).json({ success: true, results });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/templates]', err);
    return res.status(500).json({ error: err.message });
  }
}

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
    try {
      // CORRIGIDO: 'audit_log' não existe na base de dados (confirmado —
      // só 'admin_logs' existe, criada na migration_v8_2). Esta chamada
      // falhava sempre, silenciosamente (try/catch best-effort já cobria
      // o erro, mas o registo nunca era de facto guardado).
      await supabase.from('admin_logs').insert({
        admin_id:    auth.user.id,
        action:      'delete_document',
        target_type: 'document',
        target_id:   docId,
        details:     { deleted_by: auth.user.email || auth.user.id },
        created_at:  new Date().toISOString(),
      });
    } catch (_) { /* log é best-effort */ }

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
        .insert({
          slug: cleanSlug, title, meta_description, content_html, published, ai_generated, author_id: auth.user.id,
          // Sem isto, published_at fica sempre NULL — e como a listagem
          // pública (/blog) ordena por published_at, artigos publicados
          // por aqui nunca apareciam como "recentes", por mais novos que
          // fossem (ficavam sempre no fim, por causa do nullslast).
          published_at: published ? new Date().toISOString() : null,
        })
        .select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma página com este slug' });
        throw error;
      }
      if (published) {
        try {
          await _generateStaticPage(data, SITE_URL);
        } catch (pubErr) {
          console.error('[admin/pages] _generateStaticPage falhou:', pubErr.message);
          await supabase.from('admin_notifications').insert({
            type: 'blog_publish_failed',
            title: '⚠️ Falha ao publicar página no GitHub',
            message: `"${data.title}" (slug: ${data.slug}) foi gravada mas a publicação estática falhou: ${pubErr.message}`,
            link: '#blog',
          }).catch(() => {});
        }
      }
      return res.status(201).json({ success: true, page: data });
    }

    if (req.method === 'PUT') {
      const { id, slug, title, meta_description, content_html, published, ai_generated } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      // Se a página vai passar a publicada, vemos primeiro se já tinha uma
      // data de publicação real — só a definimos na PRIMEIRA vez que fica
      // publicada, nunca sobrescrevendo a data original em edições depois.
      let needsPublishedAt = false;
      if (published === true) {
        const { data: existing } = await supabase.from('blog_pages').select('published_at').eq('id', id).single();
        needsPublishedAt = !existing?.published_at;
      }

      const updates = {};
      if (slug !== undefined)             updates.slug             = _slugify(slug);
      if (title !== undefined)            updates.title            = title;
      if (meta_description !== undefined) updates.meta_description = meta_description;
      if (content_html !== undefined)     updates.content_html     = content_html;
      if (published !== undefined)        updates.published        = published;
      if (ai_generated !== undefined)     updates.ai_generated     = ai_generated;
      if (needsPublishedAt)                updates.published_at    = new Date().toISOString();

      const { data, error } = await supabase.from('blog_pages').update(updates).eq('id', id).select().single();
      if (error) throw error;
      if (data?.published) {
        try {
          await _generateStaticPage(data, SITE_URL);
        } catch (pubErr) {
          console.error('[admin/pages] _generateStaticPage falhou:', pubErr.message);
          await supabase.from('admin_notifications').insert({
            type: 'blog_publish_failed',
            title: '⚠️ Falha ao publicar página no GitHub',
            message: `"${data.title}" (slug: ${data.slug}) foi actualizada mas a publicação estática falhou: ${pubErr.message}`,
            link: '#blog',
          }).catch(() => {});
        }
      }
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

    const { title, keywords = '', tone = 'informativo', word_count = 600, avoid_titles = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'title é obrigatório' });

    const avoidBlock = Array.isArray(avoid_titles) && avoid_titles.length
      ? `\n\nJÁ EXISTEM estes artigos — o teu deve abordar um ângulo/subtema DIFERENTE, sem repetir o que já foi coberto:\n${avoid_titles.slice(0, 60).map(t => `- ${t}`).join('\n')}`
      : '';

    const prompt = `És um especialista em SEO e redacção de conteúdo para o mercado moçambicano.\n\nEscreve um artigo de blog completo sobre: "${title}"\nPalavras-chave a incluir naturalmente: ${keywords || 'documentos, Moçambique'}\nTom: ${tone}\nExtensão aproximada: ${word_count} palavras${avoidBlock}\n\nREGRAS OBRIGATÓRIAS:\n- Escreve em português europeu (não brasileiro)\n- Conteúdo específico para Moçambique (exemplos locais, instituições moçambicanas, M-Pesa, etc.)\n- Inclui H2 e H3, e uma secção FAQ com 3-4 perguntas no final\n- Menciona que o MzDocs Pro pode ajudar a criar estes documentos rapidamente com IA\n- NÃO incluis <html>, <head>, <body> ou <!DOCTYPE> — apenas conteúdo do artigo\n- Devolve APENAS HTML válido: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>\n- Não uses Markdown, apenas HTML puro\n\nComeça directamente com o conteúdo HTML, sem preâmbulo.`;

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
// BLOG SCHEDULE QUEUE — títulos agendados (manuais ou de IA) à espera de
// serem publicados por /api/misc?action=blog-cron
// ─────────────────────────────────────────────────────────────────────────────
async function handleBlogQueue(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('blog_schedule_queue')
        .select('id, title, keywords, source, scheduled_at, status, blog_page_id, error_note, created_at')
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    if (req.method === 'POST') {
      // Body esperado: { items: [{ title, keywords? }], startDate: ISO, intervalDays: N }
      // OU items com scheduled_at próprio já definido por linha.
      const { items, startDate, intervalDays } = req.body || {};
      if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: 'items (array de títulos) é obrigatório' });
      }
      if (items.length > 200) {
        return res.status(400).json({ error: 'Máximo de 200 títulos por importação' });
      }

      const base = startDate ? new Date(startDate) : new Date();
      const step = Math.max(1, parseInt(intervalDays, 10) || 7);

      const rows = items.map((it, i) => {
        const title = typeof it === 'string' ? it.trim() : String(it.title || '').trim();
        const keywords = typeof it === 'object' ? (it.keywords || null) : null;
        let scheduledAt;
        if (typeof it === 'object' && it.scheduled_at) {
          scheduledAt = new Date(it.scheduled_at);
        } else {
          scheduledAt = new Date(base); scheduledAt.setDate(scheduledAt.getDate() + i * step);
        }
        return {
          title, keywords, source: 'manual', scheduled_at: scheduledAt.toISOString(),
          status: 'pending', created_by: auth.user.id,
        };
      }).filter(r => r.title.length > 0);

      if (!rows.length) return res.status(400).json({ error: 'Nenhum título válido encontrado' });

      const { data, error } = await supabase.from('blog_schedule_queue').insert(rows).select('id, title, scheduled_at');
      if (error) throw error;

      return res.status(200).json({ success: true, inserted: data.length, data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || req.query || {};
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const { error } = await supabase.from('blog_schedule_queue').delete().eq('id', id).eq('status', 'pending');
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[admin/blog-queue]', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOG AUTOGEN SETTINGS — activar/desactivar geração automática por IA e
// definir o intervalo (dias). Lido/escrito pelo cron em api/misc.js.
// ─────────────────────────────────────────────────────────────────────────────
async function handleBlogSettings(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('system_settings').select('key, value')
        .in('key', ['blog_autogen_enabled', 'blog_autogen_interval_days', 'blog_autogen_last_run']);
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return res.status(200).json({
        success: true,
        enabled:      map.blog_autogen_enabled === 'true',
        intervalDays: parseInt(map.blog_autogen_interval_days, 10) || 7,
        lastRun:      map.blog_autogen_last_run || null,
      });
    }

    if (req.method === 'POST') {
      const { enabled, intervalDays } = req.body || {};
      const updates = [];
      if (typeof enabled === 'boolean') {
        updates.push(supabase.from('system_settings')
          .upsert({ key: 'blog_autogen_enabled', value: enabled ? 'true' : 'false' }, { onConflict: 'key' }));
      }
      if (intervalDays) {
        const n = Math.max(1, parseInt(intervalDays, 10) || 7);
        updates.push(supabase.from('system_settings')
          .upsert({ key: 'blog_autogen_interval_days', value: String(n) }, { onConflict: 'key' }));
      }
      await Promise.all(updates);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[admin/blog-settings]', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
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

    const q = req.query || {};

    // ── GET: listagem de afiliados ────────────────────────────────────────
    if (req.method === 'GET' && !q.sub) {
      const { data, error } = await supabase.from('profiles')
        .select('id,full_name,email,phone,ref_code,is_affiliate,aff_clicks,aff_conversions,aff_balance,aff_total_earned,aff_segment,aff_tier,aff_business_name,aff_city,aff_phone_mpesa,aff_is_blocked,aff_block_reason,aff_joined_at,created_at')
        .not('ref_code', 'is', null)
        .order('aff_total_earned', { ascending: false });
      if (error) throw error;

      // Fraud flags count por afiliado
      const { data: fraudData } = await supabase.from('affiliate_fraud_flags')
        .select('affiliate_id').eq('resolved', false);
      const fraudCount = {};
      (fraudData || []).forEach(f => { fraudCount[f.affiliate_id] = (fraudCount[f.affiliate_id] || 0) + 1; });

      // Levantamentos pendentes count
      const { data: wPending } = await supabase.from('affiliate_withdrawals')
        .select('affiliate_id').eq('status', 'pending');
      const wCount = {};
      (wPending || []).forEach(w => { wCount[w.affiliate_id] = (wCount[w.affiliate_id] || 0) + 1; });

      return res.status(200).json({
        affiliates: (data || []).map(a => ({
          ...a,
          fraud_flags: fraudCount[a.id] || 0,
          pending_withdrawals: wCount[a.id] || 0,
        })),
      });
    }

    // ── GET: levantamentos pendentes ──────────────────────────────────────
    if (req.method === 'GET' && q.sub === 'withdrawals') {
      const status = q.status || 'pending';
      const { data, error } = await supabase.from('affiliate_withdrawals')
        .select('id,affiliate_id,amount,mpesa_phone,status,admin_note,created_at,processed_at')
        .eq('status', status).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      // Enriquecer com nome do afiliado
      const ids = [...new Set((data || []).map(w => w.affiliate_id))];
      const { data: pnames } = await supabase.from('profiles').select('id,full_name,email,phone,aff_tier').in('id', ids);
      const pm = {};
      (pnames || []).forEach(p => { pm[p.id] = p; });
      return res.status(200).json({
        withdrawals: (data || []).map(w => ({ ...w, affiliate: pm[w.affiliate_id] || {} })),
      });
    }

    // ── GET: flags de fraude ──────────────────────────────────────────────
    if (req.method === 'GET' && q.sub === 'fraud') {
      const { data, error } = await supabase.from('affiliate_fraud_flags')
        .select('id,affiliate_id,flag_type,description,severity,resolved,created_at')
        .eq('resolved', false).order('severity', { ascending: false }).limit(50);
      if (error) throw error;
      const ids = [...new Set((data || []).map(f => f.affiliate_id))];
      const { data: pnames } = await supabase.from('profiles').select('id,full_name,ref_code').in('id', ids);
      const pm = {};
      (pnames || []).forEach(p => { pm[p.id] = p; });
      return res.status(200).json({
        flags: (data || []).map(f => ({ ...f, affiliate: pm[f.affiliate_id] || {} })),
      });
    }

    // ── GET: ranking do mês ───────────────────────────────────────────────
    if (req.method === 'GET' && q.sub === 'ranking') {
      const month = q.month || new Date().toISOString().slice(0, 7);
      const { data, error } = await supabase.from('affiliate_ranking')
        .select('affiliate_id,rank_position,conversions,revenue_mzn,commission_mzn,tier')
        .eq('month', month).order('rank_position', { ascending: true }).limit(20);
      if (error) throw error;
      const ids = (data || []).map(r => r.affiliate_id);
      const { data: pnames } = await supabase.from('profiles').select('id,full_name,aff_segment,ref_code').in('id', ids);
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

    // ── POST: acções admin ────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { action, user_id, withdrawal_id, flag_id, note, amount } = body;

      // Aprovar / revogar afiliado
      if (action === 'approve' || action === 'revoke') {
        if (!user_id) return res.status(400).json({ error: 'user_id em falta' });
        const updates = { is_affiliate: action === 'approve' };
        if (action === 'approve') updates.aff_joined_at = new Date().toISOString();
        const { error } = await supabase.from('profiles').update(updates).eq('id', user_id);
        if (error) throw error;
        // Notificação ao afiliado
        if (action === 'approve') {
          try {
            await supabase.from('affiliate_notifications').insert({
              affiliate_id: user_id, type: 'commission',
              title: '🎉 Candidatura Aprovada!',
              body: 'A sua conta de afiliado MzDocs Pro foi aprovada. Comece a partilhar o seu link e ganhe comissões!',
            });
          } catch (_) { /* notificação é best-effort — não deve bloquear a aprovação */ }
        }
        return res.status(200).json({ success: true, message: action === 'approve' ? 'Afiliado aprovado.' : 'Aprovação revogada.' });
      }

      // Bloquear / desbloquear afiliado
      if (action === 'block' || action === 'unblock') {
        if (!user_id) return res.status(400).json({ error: 'user_id em falta' });
        const updates = { aff_is_blocked: action === 'block' };
        if (action === 'block') updates.aff_block_reason = note || 'Conta suspensa por actividade suspeita.';
        else updates.aff_block_reason = null;
        const { error } = await supabase.from('profiles').update(updates).eq('id', user_id);
        if (error) throw error;
        return res.status(200).json({ success: true, message: action === 'block' ? 'Conta suspensa.' : 'Conta reactivada.' });
      }

      // Processar levantamento
      if (action === 'process_withdrawal') {
        if (!withdrawal_id) return res.status(400).json({ error: 'withdrawal_id em falta' });
        const newStatus = body.status || 'completed';
        if (!['completed','rejected'].includes(newStatus)) return res.status(400).json({ error: 'status inválido' });
        const { data: wd, error: wErr } = await supabase.from('affiliate_withdrawals')
          .select('affiliate_id,amount,status').eq('id', withdrawal_id).single();
        if (wErr || !wd) return res.status(404).json({ error: 'Levantamento não encontrado' });
        if (wd.status !== 'pending') return res.status(400).json({ error: 'Levantamento não está pendente' });
        const { error } = await supabase.from('affiliate_withdrawals').update({
          status: newStatus, admin_note: note || null, processed_at: new Date().toISOString(),
        }).eq('id', withdrawal_id);
        if (error) throw error;
        // Se rejeitado: devolver saldo
        if (newStatus === 'rejected') {
          const { data: prof } = await supabase.from('profiles').select('aff_balance').eq('id', wd.affiliate_id).single();
          await supabase.from('profiles').update({ aff_balance: (prof?.aff_balance || 0) + wd.amount }).eq('id', wd.affiliate_id);
        }
        // Notificação ao afiliado
        try {
          await supabase.from('affiliate_notifications').insert({
            affiliate_id: wd.affiliate_id, type: 'withdrawal',
            title: newStatus === 'completed' ? '✅ Levantamento Pago!' : '❌ Levantamento Rejeitado',
            body: newStatus === 'completed'
              ? `O seu levantamento de ${wd.amount} MZN foi processado via M-Pesa.`
              : `O seu pedido de ${wd.amount} MZN foi rejeitado. ${note ? 'Motivo: ' + note : 'Contacte o suporte.'}`,
          });
        } catch (_) { /* notificação é best-effort */ }
        return res.status(200).json({ success: true, message: 'Levantamento actualizado.' });
      }

      // Resolver flag de fraude
      if (action === 'resolve_fraud') {
        if (!flag_id) return res.status(400).json({ error: 'flag_id em falta' });
        const { error } = await supabase.from('affiliate_fraud_flags').update({
          resolved: true, resolved_at: new Date().toISOString(),
        }).eq('id', flag_id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // Gerar ranking mensal
      if (action === 'generate_ranking') {
        const month = body.month || new Date().toISOString().slice(0, 7);
        await supabase.rpc('generate_monthly_ranking', { p_month: month }).catch(e => { throw e; });
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
  // Antes: construía HTML "cru" (só <h1>+conteúdo, sem header/CSS/CTA) e
  // nunca verificava a resposta do PUT ao GitHub (falha silenciosa). Agora
  // usa a mesma lib partilhada que o blog-cron (api/_lib/blogTemplate.js),
  // com o template completo e erros que já não desaparecem sem aviso.
  const { publishBlogPageToGithub } = require('../_lib/blogTemplate');
  await publishBlogPageToGithub({
    slug: page.slug,
    title: page.title,
    metaDescription: page.meta_description,
    contentHtml: page.content_html,
    SITE_URL,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPUBLICAR TODOS OS ARTIGOS JÁ PUBLICADOS — usado uma única vez depois de
// corrigir o template do blog (blogTemplate.js), para os artigos que já
// estavam no ar (criados ANTES da correcção) passarem a ter os links com
// ?src=... e a notificação IndexNow. Artigos novos/agendados a partir de
// agora já saem correctos automaticamente — este botão só serve para pôr
// o histórico em dia. Processa em lotes (não tudo de uma vez) para não
// estourar o limite de 30s da função nem o rate-limit secundário do
// GitHub; o admin pode clicar de novo para continuar de onde ficou.
// GET /api/admin/republish-blog?offset=0&limit=15
// ─────────────────────────────────────────────────────────────────────────────
async function handleRepublishBlog(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const offset = Math.max(parseInt(req.query?.offset || '0', 10) || 0, 0);
    const limit  = Math.min(Math.max(parseInt(req.query?.limit  || '15', 10) || 15, 1), 30);
    const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

    const { data: pages, count, error } = await supabase
      .from('blog_pages')
      .select('slug, title, meta_description, content_html', { count: 'exact' })
      .eq('published', true)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const { publishBlogPageToGithub } = require('../_lib/blogTemplate');
    const results = { ok: [], failed: [] };
    for (const p of (pages || [])) {
      try {
        await publishBlogPageToGithub({
          slug: p.slug, title: p.title, metaDescription: p.meta_description,
          contentHtml: p.content_html, SITE_URL,
        });
        results.ok.push(p.slug);
      } catch (pubErr) {
        console.error('[admin/republish-blog]', p.slug, pubErr.message);
        results.failed.push({ slug: p.slug, error: pubErr.message });
      }
    }

    const processedSoFar = offset + (pages || []).length;
    return res.status(200).json({
      success: true,
      total: count || 0,
      processed_this_batch: (pages || []).length,
      processed_so_far: processedSoFar,
      remaining: Math.max((count || 0) - processedSoFar, 0),
      next_offset: processedSoFar,
      results,
    });
  } catch (err) {
    console.error('[admin/republish-blog]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING-RECEIPTS — lista transacções a aguardar revisão manual
// GET /api/admin/pending-receipts
// ─────────────────────────────────────────────────────────────────────────────
async function handlePendingReceipts(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    // Buscar transacções com status review_needed ordenadas por data (mais antigas primeiro)
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id,
        reference_id,
        user_id,
        package_id,
        amount,
        credits,
        status,
        phone_number,
        receipt_confidence,
        review_reason,
        created_at,
        profiles!transactions_user_id_fkey(full_name, email, phone)
      `)
      .eq('status', 'review_needed')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      // Fallback sem join se FK não estiver registada
      const { data: simple, error: simpleErr } = await supabase
        .from('transactions')
        .select('id,reference_id,user_id,package_id,amount,credits,status,phone_number,receipt_confidence,review_reason,created_at')
        .eq('status', 'review_needed')
        .order('created_at', { ascending: true })
        .limit(50);
      if (simpleErr) throw simpleErr;
      return res.status(200).json({ success: true, data: simple || [], total: (simple || []).length });
    }

    return res.status(200).json({ success: true, data: data || [], total: (data || []).length });
  } catch (err) {
    console.error('[admin/pending-receipts]', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE-RECEIPT — admin aprova manualmente um comprovativo em revisão
// POST /api/admin/approve-receipt
// Body: { transactionId, approved: boolean, note?: string }
// ─────────────────────────────────────────────────────────────────────────────
async function handleApproveReceipt(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
    catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const { transactionId, approved, note } = body;
    if (!transactionId || approved === undefined) {
      return res.status(400).json({ error: 'transactionId e approved são obrigatórios' });
    }

    // Buscar transacção
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id,user_id,package_id,credits,status,reference_id,phone_number,amount,visitor_id')
      .eq('id', transactionId)
      .in('status', ['review_needed', 'pending'])
      .single();

    if (txErr || !tx) {
      return res.status(404).json({ error: 'Transacção não encontrada ou já processada.' });
    }

    if (!approved) {
      // REJEITAR
      await supabase.from('transactions').update({
        status:              'failed',
        confirmed_by:        auth.user.id,
        confirmed_at:        new Date().toISOString(),
        verification_method: 'manual',
        review_reason:       note || 'Rejeitado pelo admin',
      }).eq('id', transactionId);

      // Log de auditoria
      try {
        // CORRIGIDO: 'admin_audit_log' não existe na base de dados —
        // redireccionado para 'admin_logs' (a única tabela de log real).
        await supabase.from('admin_logs').insert({
          admin_id:    auth.user.id,
          action:      'reject_receipt',
          target_type: 'transaction',
          target_id:   String(transactionId),
          details:     { reference_id: tx.reference_id, note: note || '' },
        });
      } catch (_) { /* log é best-effort */ }

      return res.status(200).json({ success: true, approved: false, message: 'Comprovativo rejeitado.' });
    }

    // APROVAR
    const creditsInt = parseInt(tx.credits) || 0;
    if (creditsInt <= 0) {
      return res.status(400).json({ error: 'Créditos inválidos na transacção.' });
    }

    // 1. Atualizar transacção
    // CORRIGIDO: estava a gravar status 'confirmed', que handleStats (e o
    // badge da UI em AdminTransactions.js) não reconhece — só 'completed'
    // conta como receita confirmada no dashboard. Ver migration_v25.
    await supabase.from('transactions').update({
      status:              'completed',
      confirmed_by:        auth.user.id,
      confirmed_at:        new Date().toISOString(),
      receipt_verified:    true,
      verification_method: 'manual',
      review_reason:       note || null,
    }).eq('id', transactionId);

    // 2. Adicionar créditos via RPC — ou, se for "avulso" sem conta ligada
    // (CORRIGIDO: antes disto os créditos ficavam por atribuir a ninguém
    // quando tx.user_id era null, exigindo que o admin criasse a conta à
    // parte com o botão "🎫 Criar Conta"), criar a conta temporária aqui
    // mesmo e devolver as credenciais na resposta.
    let newCredits  = creditsInt;
    let accountInfo = null;
    if (tx.user_id) {
      const { data: creditData } = await supabase
        .rpc('add_credits', { user_id: tx.user_id, amount: creditsInt });
      newCredits = creditData || creditsInt;

      // 3. Registar credit_logs
      await supabase.from('credit_logs').insert({
        user_id:        tx.user_id,
        transaction_id: transactionId,
        action:         'bonus',
        credits:        creditsInt,
        document_type:  null,
        note:           `Comprovativo aprovado manualmente pelo admin ${auth.user.id.slice(0, 8)} — pacote ${tx.package_id}${note ? ' | ' + note : ''}`,
      }).catch(e => console.warn('[approve-receipt] credit_logs:', e.message));

    } else if (tx.package_id === 'avulso' && creditsInt > 0) {
      try {
        const ref        = tx.reference_id || ('AV' + Date.now());
        const tempEmail  = `temp_${ref.toLowerCase()}@mzdocs.temp`;
        const tempPass   = _genPassword();

        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: tempEmail, password: tempPass, email_confirm: true,
          user_metadata: { full_name: `Avulso ${ref}`, is_temp: true, temp_ref: ref, phone: tx.phone_number || '' },
        });
        if (createErr) throw new Error('Erro ao criar conta temp: ' + createErr.message);

        const tempUserId = newUser.user.id;
        await supabase.from('profiles').update({
          is_temp: true, temp_ref: ref, temp_password: tempPass,
          credits: creditsInt, plan: 'free', account_type: 'avulso',
          full_name: `Avulso ${ref}`, phone: tx.phone_number || null,
          updated_at: new Date().toISOString(),
        }).eq('id', tempUserId);

        await supabase.from('transactions').update({ user_id: tempUserId }).eq('id', transactionId);

        await supabase.from('credit_logs').insert({
          user_id: tempUserId, transaction_id: transactionId, action: 'purchase_confirmed',
          credits: creditsInt,
          note: `Conta avulso criada automaticamente ao aprovar comprovativo em revisão — admin ${auth.user.id.slice(0, 8)}`,
        }).catch(e => console.warn('[approve-receipt] credit_logs:', e.message));

        accountInfo = { tempEmail, tempPass, tempUserId };
      } catch (accErr) {
        console.error('[approve-receipt] Falha ao criar conta avulso:', accErr.message);
        // Não bloquear a aprovação — o pagamento já foi marcado completed.
        await supabase.from('transactions').update({
          review_reason: 'FALHA_CRIACAO_CONTA_AVULSO: ' + accErr.message,
        }).eq('id', transactionId);
      }
    }

    // CORRIGIDO (auditoria de pagamentos v3.2): esta rota também aprovava
    // pagamentos sem nunca chamar process_affiliate_commission — só
    // handleConfirmPayment o fazia. Qualquer venda aprovada aqui (revisão
    // manual de comprovativo com confiança baixa) nunca gerava comissão.
    const commissionUserId = tx.user_id || accountInfo?.tempUserId || null;
    if (commissionUserId) {
      supabase.rpc('process_affiliate_commission_v2', {
        p_transaction_id: transactionId,
        p_user_id:        commissionUserId,
        p_package_id:     tx.package_id,
        p_amount:         tx.amount,
      }).catch(e => console.warn('[approve-receipt] process_affiliate_commission falhou:', e.message));
    }

    // NOVO (Fase 2 — Marketing Analytics): mesma regra dos outros dois
    // pontos de confirmação (auto-approval em api/misc.js e confirmação
    // manual directa acima) — só regista se houver visitor_id.
    if (commissionUserId && tx.visitor_id) {
      supabase.from('marketing_events').insert({
        visitor_id: tx.visitor_id,
        user_id:    commissionUserId,
        event:      'credit_purchase',
        value:      tx.amount,
        metadata:   { package_id: tx.package_id, credits: creditsInt, verification_method: 'manual_review' },
      }).then(({ error }) => { if (error) console.warn('[approve-receipt] marketing_events falhou:', error.message); });
    }

    // 4. Log de auditoria
    try {
      // CORRIGIDO: 'admin_audit_log' não existe na base de dados —
      // redireccionado para 'admin_logs' (a única tabela de log real).
      await supabase.from('admin_logs').insert({
        admin_id:    auth.user.id,
        action:      'approve_receipt',
        target_type: 'transaction',
        target_id:   String(transactionId),
        details:     { reference_id: tx.reference_id, credits: creditsInt, user_id: tx.user_id },
      });
    } catch (_) { /* log é best-effort */ }

    console.log('[admin/approve-receipt] Aprovado:', transactionId, 'créditos:', creditsInt, 'user:', tx.user_id);

    return res.status(200).json({
      success:     true,
      approved:    true,
      creditsAdded: creditsInt,
      newCredits,
      message:     `${creditsInt} créditos adicionados com sucesso.`,
      ...(accountInfo ? {
        tempEmail:  accountInfo.tempEmail,
        tempPass:   accountInfo.tempPass,
        tempUserId: accountInfo.tempUserId,
      } : {}),
    });

  } catch (err) {
    console.error('[admin/approve-receipt]', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IA PROVIDERS — NOVO (painel de monitorização dos 5 providers de IA)
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/ai-providers            → estado + consumo dos providers
// POST /api/admin/ai-providers            → { toggleReserve: 'sambanova' }
//                                             marca/desmarca um provider de
//                                             reserva como "activado" (apenas
//                                             anotação no painel — ligar de
//                                             facto o provider ainda exige
//                                             código novo em generate-document.js)
async function handleAiProviders(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = parseBody(req);
      const toggleId = body?.toggleReserve;
      if (!toggleId) return res.status(400).json({ error: 'toggleReserve é obrigatório' });

      const { data: row } = await supabase
        .from('system_settings').select('value').eq('key', 'ai_reserve_activated').maybeSingle();
      let list = [];
      try { list = JSON.parse(row?.value || '[]'); } catch { list = []; }
      if (!Array.isArray(list)) list = [];

      const idx = list.indexOf(toggleId);
      if (idx >= 0) list.splice(idx, 1); else list.push(toggleId);

      await supabase.from('system_settings').upsert({
        key: 'ai_reserve_activated',
        value: JSON.stringify(list),
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      await supabase.from('admin_logs').insert({
        admin_id:    auth.user.id,
        action:      'toggle_ai_reserve_provider',
        target_type: 'ai_provider',
        target_id:   toggleId,
        details:     { activated: list.includes(toggleId) },
        created_at:  new Date().toISOString(),
      });

      return res.status(200).json({ success: true, activated: list });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // ── Consumo dos últimos 7 dias (histórico para gráfico) ──────────────
    const today = new Date();
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const todayStr = today.toISOString().split('T')[0];
    const sinceStr = sevenDaysAgo.toISOString().split('T')[0];

    const { data: usageRows, error: usageErr } = await supabase
      .from('ai_provider_daily_usage')
      .select('day, provider, requests_ok, requests_fail, tokens_prompt, tokens_completion, last_model, last_success_at, last_error_at, last_error_message')
      .gte('day', sinceStr)
      .order('day', { ascending: true });

    // Tabela pode ainda não existir se a migration v27 não foi corrida —
    // não deixar o painel todo em erro por isso, apenas devolver vazio.
    const rows = usageErr ? [] : (usageRows || []);
    if (usageErr) console.warn('[admin/ai-providers] tabela indisponível (correr migration_v27?):', usageErr.message);

    const { data: reserveRow } = await supabase
      .from('system_settings').select('value').eq('key', 'ai_reserve_activated').maybeSingle();
    let reserveActivated = [];
    try { reserveActivated = JSON.parse(reserveRow?.value || '[]'); } catch { reserveActivated = []; }

    // ── Construir resposta por provider activo ───────────────────────────
    const providers = ACTIVE_PROVIDERS.map(meta => {
      const todayRow = rows.find(r => r.day === todayStr && r.provider === meta.id) || null;
      const history7d = rows.filter(r => r.provider === meta.id);

      const tokensToday   = todayRow ? (Number(todayRow.tokens_prompt) + Number(todayRow.tokens_completion)) : 0;
      const requestsToday = todayRow ? (todayRow.requests_ok + todayRow.requests_fail) : 0;
      const tokens7d      = history7d.reduce((s, r) => s + Number(r.tokens_prompt) + Number(r.tokens_completion), 0);
      const configured    = !!process.env[meta.envVar];

      let status;
      if (!configured) {
        status = 'sem_chave';
      } else if (!todayRow) {
        status = 'sem_uso_hoje';
      } else {
        const lastSuccess = todayRow.last_success_at ? new Date(todayRow.last_success_at).getTime() : 0;
        const lastError   = todayRow.last_error_at   ? new Date(todayRow.last_error_at).getTime()   : 0;
        if (lastSuccess && lastSuccess >= lastError)      status = 'online';
        else if (lastError && !lastSuccess)               status = 'offline';
        else                                              status = 'degradado';
      }

      const dailyLimit = meta.dailyLimit || null;
      const usedForPct = meta.limitType === 'tokens' ? tokensToday : requestsToday;
      const usagePct   = dailyLimit ? Math.min(100, Math.round((usedForPct / dailyLimit) * 100)) : null;

      return {
        id: meta.id,
        name: meta.name,
        tier: meta.tier,
        tierLabel: TIER_LABELS[meta.tier]?.label || meta.tier,
        configured,
        status, // online | degradado | offline | sem_uso_hoje | sem_chave
        signupUrl: meta.signupUrl,
        limitType: meta.limitType,
        limitLabel: meta.limitLabel,
        dailyLimit,
        usagePct,
        today: {
          requestsOk:   todayRow?.requests_ok || 0,
          requestsFail: todayRow?.requests_fail || 0,
          tokensPrompt: todayRow ? Number(todayRow.tokens_prompt) : 0,
          tokensCompletion: todayRow ? Number(todayRow.tokens_completion) : 0,
          tokensTotal:  tokensToday,
          lastModel:    todayRow?.last_model || null,
          lastSuccessAt: todayRow?.last_success_at || null,
          lastErrorAt:   todayRow?.last_error_at || null,
          lastErrorMessage: todayRow?.last_error_message || null,
        },
        last7Days: {
          tokensTotal: tokens7d,
          byDay: history7d.map(r => ({
            day: r.day,
            tokens: Number(r.tokens_prompt) + Number(r.tokens_completion),
            requestsOk: r.requests_ok,
            requestsFail: r.requests_fail,
          })),
        },
      };
    });

    const reserve = RESERVE_PROVIDERS.map(r => ({
      ...r,
      activated: reserveActivated.includes(r.id),
    }));

    const tiers = Object.entries(TIER_LABELS)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, meta]) => ({ id, ...meta }));

    return res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      tiers,
      providers,
      reserve,
      migrationApplied: !usageErr,
    });
  } catch (err) {
    console.error('[admin/ai-providers]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QR CODES — Fase 3 do Marketing Analytics
// GET  /api/admin/qrcodes                → lista com estatísticas
// POST /api/admin/qrcodes  {op:'create'}  → cria um novo QR
// POST /api/admin/qrcodes  {op:'toggle'}  → activa/desactiva
// ─────────────────────────────────────────────────────────────────────────────
function _slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'qr';
}

async function handleQrCodes(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'POST') {
      const body = parseBody(req);
      const op   = body?.op || 'create';

      if (op === 'toggle') {
        const { id, active } = body;
        if (!id) return res.status(400).json({ error: 'id é obrigatório' });
        const { error } = await supabase.from('marketing_qrcodes').update({ active: !!active }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // op === 'create'
      const name       = (body.name || '').toString().trim().slice(0, 100);
      const location    = (body.location || '').toString().trim().slice(0, 150) || null;
      const targetPath  = (body.targetPath || '/').toString().trim() || '/';
      if (!name) return res.status(400).json({ error: 'name é obrigatório' });

      // Código único, legível: slug do nome + sufixo curto caso já exista
      let code = _slugify(name);
      const { data: clash } = await supabase.from('marketing_qrcodes').select('code').eq('code', code).maybeSingle();
      if (clash) code = `${code}_${Math.random().toString(36).slice(2, 6)}`;

      const { data: qr, error: insErr } = await supabase.from('marketing_qrcodes').insert({
        code, name, location, target_path: targetPath, created_by: auth.user.id,
      }).select('*').single();
      if (insErr) throw insErr;

      // Reaproveita marketing_sources (Fase 1) — assim entra automaticamente
      // em toda a agregação já construída (marketing_source_daily) sem
      // precisar de lógica nova para "somar visitas de QR".
      await supabase.from('marketing_sources').upsert(
        { code, name: `QR — ${name}`, type: 'qr', description: location },
        { onConflict: 'code' }
      );

      // Gera o PNG do QR já apontando para o URL final com ?src=<code>.
      const siteUrl  = process.env.SITE_URL || 'https://mzdocs.co.mz';
      const fullUrl  = `${siteUrl}${targetPath}${targetPath.includes('?') ? '&' : '?'}src=${code}`;
      const pngDataUrl = await QRCode.toDataURL(fullUrl, { width: 600, margin: 2, color: { dark: '#07101F', light: '#FFFFFF' } });

      await supabase.from('admin_logs').insert({
        admin_id: auth.user.id, action: 'create_qrcode', target_type: 'marketing_qrcode',
        target_id: qr.id, details: { code, name, location, targetPath },
      });

      return res.status(200).json({ success: true, qrcode: qr, url: fullUrl, png: pngDataUrl });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // ── Listagem com estatísticas (reaproveita marketing_source_daily) ────
    const { data: qrcodes, error: listErr } = await supabase
      .from('marketing_qrcodes').select('*').order('created_at', { ascending: false });
    if (listErr) throw listErr;

    if (!qrcodes || !qrcodes.length) {
      return res.status(200).json({ success: true, qrcodes: [] });
    }

    const codes = qrcodes.map(q => q.code);
    const since30d = new Date(); since30d.setDate(since30d.getDate() - 30);

    const [{ data: dailyRows }, { data: lastVisits }] = await Promise.all([
      supabase.from('marketing_source_daily')
        .select('marketing_source, visits, signups, buyers, revenue')
        .in('marketing_source', codes)
        .gte('day', since30d.toISOString().split('T')[0]),
      supabase.from('marketing_visits')
        .select('marketing_source, created_at')
        .in('marketing_source', codes)
        .order('created_at', { ascending: false }),
    ]);

    const statsBySource = {};
    (dailyRows || []).forEach(r => {
      const s = statsBySource[r.marketing_source] || { visits: 0, signups: 0, buyers: 0, revenue: 0 };
      s.visits  += r.visits  || 0;
      s.signups += r.signups || 0;
      s.buyers  += r.buyers  || 0;
      s.revenue += Number(r.revenue) || 0;
      statsBySource[r.marketing_source] = s;
    });
    const lastVisitBySource = {};
    (lastVisits || []).forEach(v => {
      if (!lastVisitBySource[v.marketing_source]) lastVisitBySource[v.marketing_source] = v.created_at; // já vem ordenado desc
    });

    const enriched = qrcodes.map(q => {
      const s = statsBySource[q.code] || { visits: 0, signups: 0, buyers: 0, revenue: 0 };
      return {
        ...q,
        scans:           s.visits,
        signups:         s.signups,
        purchases:       s.buyers,
        revenue:         s.revenue,
        conversion_rate: s.visits > 0 ? Math.round((s.buyers / s.visits) * 1000) / 10 : 0,
        last_scan_at:    lastVisitBySource[q.code] || null,
      };
    });

    return res.status(200).json({ success: true, qrcodes: enriched });
  } catch (err) {
    console.error('[admin/qrcodes]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KIT DE MARKETING DOS AFILIADOS (v41) — CRUD dos materiais (panfletos/
// banners/etc.) que o admin envia e que cada afiliado vê na sua área de
// Marketing (afiliado.html), já com o SEU QR code pessoal e/ou código
// colado por cima (composição feita no browser do afiliado — ver
// affMaterials/affQrcode em api/misc.js).
// GET    /api/admin/marketing-materials            → lista tudo (activos e inactivos)
// POST   /api/admin/marketing-materials             → cria um novo material
// PUT    /api/admin/marketing-materials  {id, ...}   → actualiza um material
// DELETE /api/admin/marketing-materials?id=...       → apaga um material
// ─────────────────────────────────────────────────────────────────────────────
const MAX_MATERIAL_IMAGE_BYTES = 4 * 1024 * 1024; // ~4MB de base64 (imagem ~3MB)

async function handleMarketingMaterials(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('marketing_materials')
        .select('id, title, description, category, media_type, file_data, external_url, width_px, height_px, qr_zone, text_zone, is_active, sort_order, created_at, updated_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ success: true, materials: data || [] });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const title = (body.title || '').toString().trim().slice(0, 150);
      if (!title) return res.status(400).json({ error: 'O título é obrigatório.' });

      const category   = (body.category || 'panfleto').toString().trim();
      const media_type  = (body.media_type || 'image').toString().trim();
      const description = (body.description || '').toString().trim().slice(0, 300) || null;

      if (media_type === 'image') {
        if (!body.file_data) return res.status(400).json({ error: 'É obrigatório enviar a imagem do material.' });
        if (body.file_data.length > MAX_MATERIAL_IMAGE_BYTES) {
          return res.status(400).json({ error: 'Imagem demasiado grande (máx. ~3MB).' });
        }
      } else if (!body.external_url) {
        return res.status(400).json({ error: 'É obrigatório indicar o link do ficheiro.' });
      }

      const insertRow = {
        title, description, category, media_type,
        file_data:    media_type === 'image' ? body.file_data : null,
        external_url: media_type !== 'image' ? (body.external_url || '').toString().trim().slice(0, 500) : null,
        width_px:     body.width_px  || null,
        height_px:    body.height_px || null,
        qr_zone:      media_type === 'image' ? (body.qr_zone || null) : null,
        text_zone:    media_type === 'image' ? (body.text_zone || null) : null,
        is_active:    body.is_active !== false,
        sort_order:   Number.isFinite(body.sort_order) ? body.sort_order : 0,
        created_by:   auth.user.id,
      };

      const { data, error } = await supabase.from('marketing_materials').insert(insertRow).select('*').single();
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: auth.user.id, action: 'create_marketing_material', target_type: 'marketing_materials',
        target_id: data.id, details: { title, category, media_type },
      });

      return res.status(200).json({ success: true, material: data });
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      const id   = body.id;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      const patch = { updated_at: new Date().toISOString() };
      const ALLOWED = ['title', 'description', 'category', 'media_type', 'file_data', 'external_url', 'width_px', 'height_px', 'qr_zone', 'text_zone', 'is_active', 'sort_order'];
      ALLOWED.forEach(f => { if (body[f] !== undefined) patch[f] = body[f]; });
      if (patch.title !== undefined) patch.title = (patch.title || '').toString().trim().slice(0, 150);
      if (patch.file_data && patch.file_data.length > MAX_MATERIAL_IMAGE_BYTES) {
        return res.status(400).json({ error: 'Imagem demasiado grande (máx. ~3MB).' });
      }

      const { data, error } = await supabase.from('marketing_materials').update(patch).eq('id', id).select('*').single();
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: auth.user.id, action: 'update_marketing_material', target_type: 'marketing_materials', target_id: id, details: patch,
      });

      return res.status(200).json({ success: true, material: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || parseBody(req)?.id;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      const { error } = await supabase.from('marketing_materials').delete().eq('id', id);
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: auth.user.id, action: 'delete_marketing_material', target_type: 'marketing_materials', target_id: id,
      });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[admin/marketing-materials]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES ADMINISTRATIVAS (Fase 5) — central de avisos para o admin.
// Alimentada por vários pontos do código (ver _notifyAdmin em api/misc.js e
// api/_lib/blogTemplate.js): comprovativo a precisar de revisão, pedido de
// levantamento de afiliado, candidatura a afiliado, falha de publicação,
// meta atingida.
// ─────────────────────────────────────────────────────────────────────────────
async function handleNotifications(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('id, type, title, message, link, read, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const unread = (data || []).filter(n => !n.read).length;
      return res.status(200).json({ success: true, notifications: data || [], unread });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (body.markAll) {
        const { error } = await supabase.from('admin_notifications').update({ read: true }).eq('read', false);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      if (Array.isArray(body.ids) && body.ids.length) {
        const { error } = await supabase.from('admin_notifications').update({ read: true }).in('id', body.ids);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'ids (array) ou markAll (bool) é obrigatório' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[admin/notifications]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPANHAS DE MARKETING (Fase 5) — reaproveita marketing_source_daily
// (Fase 2), tal como os QR Codes (Fase 3): o source_tag da campanha É o
// valor usado em ?src=<source_tag>, por isso não há nenhuma agregação nova
// para manter — só filtramos a view já existente pelo intervalo de datas
// da campanha.
// ─────────────────────────────────────────────────────────────────────────────
async function handleCampaigns(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'POST') {
      const body = parseBody(req);
      const op   = body?.op || 'create';

      if (op === 'toggle') {
        const { id, active } = body;
        if (!id) return res.status(400).json({ error: 'id é obrigatório' });
        const { error } = await supabase.from('marketing_campaigns').update({ active: !!active }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (op === 'delete') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'id é obrigatório' });
        const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // op === 'create'
      const name        = (body.name || '').toString().trim().slice(0, 100);
      const description  = (body.description || '').toString().trim().slice(0, 300) || null;
      const startDate    = body.start_date;
      const endDate      = body.end_date || null;
      const goalRevenue  = Number(body.goal_revenue) || 0;
      const goalSignups  = parseInt(body.goal_signups) || 0;
      if (!name)      return res.status(400).json({ error: 'name é obrigatório' });
      if (!startDate) return res.status(400).json({ error: 'start_date é obrigatório' });

      let sourceTag = _slugify(name);
      const { data: clash } = await supabase.from('marketing_campaigns').select('id').eq('source_tag', sourceTag).maybeSingle();
      if (clash) sourceTag = `${sourceTag}_${Math.random().toString(36).slice(2, 6)}`;

      const { data: campaign, error: insErr } = await supabase.from('marketing_campaigns').insert({
        name, source_tag: sourceTag, description,
        start_date: startDate, end_date: endDate,
        goal_revenue: goalRevenue, goal_signups: goalSignups,
        created_by: auth.user.id,
      }).select('*').single();
      if (insErr) throw insErr;

      // Reaproveita marketing_sources (Fase 1) para aparecer com nome
      // legível no dashboard de "Origens de Marketing", tal como os QR Codes.
      await supabase.from('marketing_sources').upsert(
        { code: sourceTag, name: `Campanha — ${name}`, type: 'campaign', description },
        { onConflict: 'code' }
      );

      const siteUrl = process.env.SITE_URL || 'https://mzdocs.co.mz';
      return res.status(200).json({
        success: true, campaign,
        link_example: `${siteUrl}/?src=${sourceTag}`,
      });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const { data: campaigns, error: listErr } = await supabase
      .from('marketing_campaigns').select('*').order('start_date', { ascending: false });
    if (listErr) throw listErr;

    if (!campaigns || !campaigns.length) {
      return res.status(200).json({ success: true, campaigns: [] });
    }

    const tags = campaigns.map(c => c.source_tag);
    const { data: dailyRows } = await supabase
      .from('marketing_source_daily')
      .select('marketing_source, day, visits, signups, buyers, revenue')
      .in('marketing_source', tags);

    const enriched = campaigns.map(c => {
      const rows = (dailyRows || []).filter(r =>
        r.marketing_source === c.source_tag &&
        r.day >= c.start_date &&
        (!c.end_date || r.day <= c.end_date)
      );
      const stats = rows.reduce((acc, r) => {
        acc.visits  += r.visits  || 0;
        acc.signups += r.signups || 0;
        acc.buyers  += r.buyers  || 0;
        acc.revenue += Number(r.revenue) || 0;
        return acc;
      }, { visits: 0, signups: 0, buyers: 0, revenue: 0 });

      const today = new Date().toISOString().split('T')[0];
      const isRunning = c.active && c.start_date <= today && (!c.end_date || c.end_date >= today);
      const isEnded   = c.end_date && c.end_date < today;

      return {
        ...c,
        stats,
        status: !c.active ? 'inactive' : isEnded ? 'ended' : isRunning ? 'running' : 'scheduled',
        revenue_progress: c.goal_revenue > 0 ? Math.min(Math.round((stats.revenue / c.goal_revenue) * 1000) / 10, 999) : null,
        signups_progress: c.goal_signups > 0 ? Math.min(Math.round((stats.signups / c.goal_signups) * 1000) / 10, 999) : null,
      };
    });

    return res.status(200).json({ success: true, campaigns: enriched });
  } catch (err) {
    console.error('[admin/campaigns]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// METAS MENSAIS (Fase 5) — Receita e Novos Registos. O progresso vem sempre
// de marketing_funnel_daily (Fase 4, já agrega tudo por dia, independente
// da origem) — nunca é guardado um "valor actual", só a meta; assim o
// número apresentado é sempre a verdade da tabela de eventos, nunca fica
// desactualizado.
// ─────────────────────────────────────────────────────────────────────────────
async function handleGoals(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'POST') {
      const body = parseBody(req);
      const metric = body.metric;
      const targetValue = Number(body.target_value);
      const month = (body.period_month || '').slice(0, 7); // 'YYYY-MM'
      if (!['revenue', 'signups'].includes(metric)) return res.status(400).json({ error: 'metric deve ser "revenue" ou "signups"' });
      if (!targetValue || targetValue <= 0)          return res.status(400).json({ error: 'target_value deve ser > 0' });
      if (!/^\d{4}-\d{2}$/.test(month))              return res.status(400).json({ error: 'period_month inválido (esperado YYYY-MM)' });

      const periodMonth = `${month}-01`;
      const { data: goal, error } = await supabase.from('admin_goals')
        .upsert({ metric, period_month: periodMonth, target_value: targetValue, created_by: auth.user.id },
                { onConflict: 'metric,period_month' })
        .select('*').single();
      if (error) throw error;
      return res.status(200).json({ success: true, goal });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // Mês pedido (default: mês actual)
    const now = new Date();
    const monthParam = (req.query?.month || '').toString();
    const targetMonth = /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const periodMonth = `${targetMonth}-01`;
    const [y, m] = targetMonth.split('-').map(Number);
    const monthStart = periodMonth;
    const monthEnd   = new Date(y, m, 0).toISOString().split('T')[0]; // último dia do mês

    const { data: goals } = await supabase.from('admin_goals')
      .select('*').eq('period_month', periodMonth);

    let progress = { revenue: 0, signups: 0 };
    try {
      const { data: rows, error: funnelErr } = await supabase
        .from('marketing_funnel_daily')
        .select('day, signups, revenue')
        .gte('day', monthStart).lte('day', monthEnd);
      if (funnelErr) throw funnelErr;
      progress = (rows || []).reduce((acc, r) => {
        acc.signups += r.signups || 0;
        acc.revenue += Number(r.revenue) || 0;
        return acc;
      }, { revenue: 0, signups: 0 });
    } catch (viewErr) {
      console.warn('[admin/goals] marketing_funnel_daily indisponível (v33 aplicada?):', viewErr.message);
    }

    const result = ['revenue', 'signups'].map(metric => {
      const goal = (goals || []).find(g => g.metric === metric);
      const current = progress[metric] || 0;
      const target = goal?.target_value || null;
      return {
        metric,
        target,
        current,
        percent: target ? Math.round((current / target) * 1000) / 10 : null,
        achieved: target ? current >= target : false,
      };
    });

    // Notificar o admin uma única vez quando uma meta é atingida — dedupe
    // simples: só insere se ainda não existir notificação 'goal_reached'
    // para este mês+métrica (evita spam a cada refresh do dashboard).
    for (const r of result) {
      if (r.achieved) {
        const { data: already } = await supabase.from('admin_notifications')
          .select('id').eq('type', 'goal_reached')
          .ilike('message', `%${targetMonth}%${r.metric}%`).limit(1);
        if (!already || !already.length) {
          const label = r.metric === 'revenue' ? 'Receita' : 'Novos Registos';
          await supabase.from('admin_notifications').insert({
            type: 'goal_reached',
            title: `🎯 Meta atingida: ${label}`,
            message: `A meta de ${label} para ${targetMonth} (${r.metric}) foi atingida: ${r.current} / ${r.target}.`,
            link: '#funnel',
          }).catch(() => {});
        }
      }
    }

    return res.status(200).json({ success: true, month: targetMonth, goals: result });
  } catch (err) {
    console.error('[admin/goals]', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS (admin) — subscrever o próprio browser do admin, e
// enviar notificações push reais (Android/Chrome) para clientes e/ou admins.
// Reaproveita a mesma tabela push_subscriptions dos clientes (migration_v35),
// apenas com target='admin'.
// ─────────────────────────────────────────────────────────────────────────────
async function handlePushSubscribeAdmin(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const body = parseBody(req);
    const sub  = body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ error: 'subscription inválida (faltam endpoint/keys)' });
    }

    const row = {
      endpoint:     sub.endpoint,
      p256dh:       sub.keys.p256dh,
      auth:         sub.keys.auth,
      user_id:      auth.user.id,
      target:       'admin',
      user_agent:   (req.headers['user-agent'] || '').slice(0, 300),
      last_seen_at: new Date().toISOString(),
    };

    await pushRestRequest('push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      body: row,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/push-subscribe]', err);
    return res.status(500).json({ error: err.message || 'Erro ao guardar subscrição' });
  }
}

async function handlePushSend(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  try {
    const supabase = await getAdminClient();
    const auth     = await validateAdmin(supabase, token);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const body   = parseBody(req);
    const title  = (body.title || '').trim();
    const message = (body.body || '').trim();
    const url    = body.url || '/';
    const target = ['client', 'admin', 'all'].includes(body.target) ? body.target : 'client';
    if (!title || !message) return res.status(400).json({ error: 'title e body são obrigatórios' });

    const targetFilter = target === 'all' ? '' : `&target=eq.${target}`;
    const subs = await pushRestRequest(`push_subscriptions?select=id,endpoint,p256dh,auth${targetFilter}`);
    if (!Array.isArray(subs) || !subs.length) {
      return res.status(200).json({ success: true, sent: 0, failed: 0, pruned: 0, message: 'Sem subscrições para este alvo.' });
    }

    const result = await sendPushToSubscriptions(subs, { title, body: message, url });

    // Fica registado no feed interno de admin também, para histórico.
    await supabase.from('admin_notifications').insert({
      type: 'push_sent',
      title: `📤 Push enviado: ${title}`,
      message: `Alvo: ${target} · ${result.sent} entregues, ${result.failed} falhas, ${result.pruned} subscrições expiradas removidas.`,
      link: '#dashboard',
    }).catch(() => {});

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[admin/push-send]', err);
    const status = err.code === 'VAPID_NOT_CONFIGURED' ? 500 : 500;
    return res.status(status).json({ error: err.message || 'Erro ao enviar notificações' });
  }
}
