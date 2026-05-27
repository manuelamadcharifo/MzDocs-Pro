// api/misc.js — router para funções auxiliares: page-view, sitemap, afiliados
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const ws = require('ws');

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');
const ORIGIN   = SITE_URL;

const STATIC_PAGES = [
  { loc: '/',           priority: '1.0', changefreq: 'weekly'  },
  { loc: '/legal.html', priority: '0.3', changefreq: 'monthly' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function makeClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
  );
}

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

async function getUser(supabase, req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  return data?.user || null;
}

// ── Main router ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const urlPath     = (req.url || '').split('?')[0];
  const pathParts   = urlPath.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const q           = req.query || {};

  // ── Roteamento via query params (_ns = namespace, _a = action) ──────
  // Usado por rewrites do Vercel: /api/affiliate/:action → /api/misc?_ns=affiliate&_a=:action
  if (q._ns === 'affiliate') {
    const action = q._a || lastSegment || '';
    return handleAffiliate(action, req, res);
  }
  if (q._ns === 'templates') {
    const tplAction = q._a || 'list';
    return handleTemplates(tplAction, req, res);
  }

  // ── Roteamento via path (rewrites com path explícito) ───────────────
  const isAffiliate = pathParts.includes('affiliate');
  if (isAffiliate) {
    const action = lastSegment === 'affiliate' ? (q.action || '') : lastSegment;
    return handleAffiliate(action, req, res);
  }
  const isTemplates = pathParts.includes('templates');
  if (isTemplates) {
    const tplAction = lastSegment === 'templates' ? (q.action || 'list') : lastSegment;
    return handleTemplates(tplAction, req, res);
  }

  // ── Rotas simples via lastSegment ───────────────────────────────────
  const action = (lastSegment && lastSegment !== 'misc')
    ? lastSegment
    : (q.action || '');

  if (action === 'page-view')                           return handlePageView(req, res);
  if (action === 'sitemap.xml' || action === 'sitemap') return handleSitemap(req, res);
  if (action === 'ocr-analyze')                         return handleOcrAnalyze(req, res);
  if (action === 'config' || action === 'misc')         return handleConfig(req, res);

  return res.status(404).json({ error: `Rota desconhecida: "${action}". Use: page-view, sitemap.xml, affiliate/*, templates/*` });
};

// ════════════════════════════════════════════════════════════════════════════
// PAGE-VIEW
// ════════════════════════════════════════════════════════════════════════════
async function handlePageView(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { slug } = parseBody(req);
  if (!slug || typeof slug !== 'string' || slug.length > 100)
    return res.status(400).json({ error: 'slug inválido' });

  try {
    await makeClient().rpc('increment_page_views', { p_slug: slug });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SITEMAP
// ════════════════════════════════════════════════════════════════════════════
async function handleSitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  let dynamicPages = [];
  try {
    const { data } = await makeClient()
      .from('blog_pages')
      .select('slug, updated_at')
      .eq('published', true)
      .order('updated_at', { ascending: false });

    dynamicPages = (data || []).map(p => ({
      loc:        `/pages/${p.slug}.html`,
      priority:   '0.8',
      changefreq: 'monthly',
      lastmod:    p.updated_at ? p.updated_at.slice(0, 10) : undefined,
    }));
  } catch (_) {}

  const allPages = [...STATIC_PAGES, ...dynamicPages];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>\n    ` : ''}<changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return res.status(200).send(xml);
}

// ════════════════════════════════════════════════════════════════════════════
// MARKETPLACE DE TEMPLATES  (/api/templates/:action)
// ════════════════════════════════════════════════════════════════════════════
async function handleTemplates(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = makeClient();

  switch (action) {
    case 'list':     return tplList(req, res, supabase);
    case 'submit':   return tplSubmit(req, res, supabase);
    case 'rate':     return tplRate(req, res, supabase);
    case 'download': return tplDownload(req, res, supabase);
    case 'approve':  return tplApprove(req, res, supabase);
    case 'reject':   return tplReject(req, res, supabase);
    case 'pending':  return tplPending(req, res, supabase);
    default:         return res.status(404).json({ error: 'Acção de template não encontrada' });
  }
}

// Listar templates públicos aprovados (opcional: filtrar por service_type)
async function tplList(req, res, supabase) {
  const service = req.query?.service || null;
  const limit   = Math.min(parseInt(req.query?.limit || 50), 100);

  let q = supabase
    .from('templates_custom')
    .select('id,service_type,template_name,description,thumbnail_url,template_css,downloads,likes,rating_sum,rating_count,created_at')
    .eq('status', 'approved')
    .eq('is_public', true)
    .order('downloads', { ascending: false })
    .limit(limit);

  if (service) q = q.eq('service_type', service);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const templates = (data || []).map(t => ({
    ...t,
    avg_rating: t.rating_count > 0 ? Math.round((t.rating_sum / t.rating_count) * 10) / 10 : null,
  }));

  return res.status(200).json({ success: true, templates });
}

// Submeter novo template
async function tplSubmit(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const body = parseBody(req);
  const { service_type, template_name, description, template_css, thumbnail_url, template_file } = body;

  if (!service_type || !template_name || !template_css)
    return res.status(400).json({ error: 'service_type, template_name e template_css são obrigatórios' });

  const { data, error } = await supabase.from('templates_custom').insert({
    user_id:       user.id,
    service_type:  service_type.trim().slice(0, 50),
    template_name: template_name.trim().slice(0, 100),
    description:   (description || '').trim().slice(0, 300),
    template_css:  template_css.slice(0, 20000),
    thumbnail_url: thumbnail_url || null,
    template_file: template_file || null,
    status:        'pending',
    is_public:     false,
  }).select('id').single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ success: true, id: data.id, message: 'Template submetido! Aguarda aprovação.' });
}

// Avaliar template
async function tplRate(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { template_id, rating, comment } = parseBody(req);
  if (!template_id || !rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'template_id e rating (1-5) são obrigatórios' });

  const { data, error } = await supabase.rpc('rate_template', {
    p_template_id: template_id, p_user_id: user.id,
    p_rating: parseInt(rating), p_comment: (comment || '').slice(0, 500),
  });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, ...data });
}

// Registar download
async function tplDownload(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const { template_id, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });

  await supabase.rpc('increment_template_downloads', { p_template_id: template_id }).catch(() => {});
  await supabase.from('template_downloads').insert({ template_id, session_id: session_id || null }).catch(() => {});
  return res.status(200).json({ ok: true });
}

// Admin — aprovar template
async function tplApprove(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });

  const { template_id } = parseBody(req);
  await supabase.rpc('approve_template', { p_template_id: template_id });
  return res.status(200).json({ success: true });
}

// Admin — rejeitar template
async function tplReject(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });

  const { template_id, note } = parseBody(req);
  await supabase.rpc('reject_template', { p_template_id: template_id, p_note: note || '' });
  return res.status(200).json({ success: true });
}

// Admin — listar templates pendentes
async function tplPending(req, res, supabase) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });

  const { data } = await supabase
    .from('templates_custom')
    .select('id,service_type,template_name,description,thumbnail_url,status,created_at,user_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return res.status(200).json({ success: true, templates: data || [] });
}

// ════════════════════════════════════════════════════════════════════════════
// AFILIADOS  (/api/affiliate/:action)
// ════════════════════════════════════════════════════════════════════════════
async function handleAffiliate(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Top-level safety net — garante sempre JSON mesmo em crash inesperado
  try {
    const supabase = makeClient();
    switch (action) {
      case 'register':  return await affRegister(req, res, supabase);
      case 'dashboard': return await affDashboard(req, res, supabase);
      case 'click':     return await affClick(req, res, supabase);
      case 'withdraw':  return await affWithdraw(req, res, supabase);
      case 'check':     return await affCheck(req, res, supabase);
      default:          return res.status(404).json({ error: 'Acção de afiliado não encontrada' });
    }
  } catch (err) {
    console.error('[handleAffiliate] crash:', action, err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

// ── Pedir para ser afiliado ───────────────────────────────────────────────
async function affRegister(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const user = await getUser(supabase, req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida' });

    // Usar select(*) para evitar erro se colunas affiliate ainda não existem na BD
    const { data: profile, error: profileErr } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle();

    if (profileErr) {
      console.error('[affRegister] profile fetch error:', profileErr.message);
      return res.status(500).json({ error: 'Erro ao ler perfil: ' + profileErr.message });
    }

    // Se perfil não existe, criar um básico (pode acontecer se o trigger do Supabase falhou)
    if (!profile) {
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id).catch(() => ({ data: null }));
      const meta = authUser?.user?.user_metadata || {};
      const { error: insertErr } = await supabase.from('profiles').insert({
        id:         user.id,
        email:      user.email || '',
        full_name:  meta.full_name || meta.name || user.email?.split('@')[0] || 'Utilizador',
        phone:      meta.phone || null,
        credits:    0,
        plan:       'free',
        is_admin:   false,
        is_temp:    false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertErr) {
        console.error('[affRegister] profile insert error:', insertErr.message);
        return res.status(500).json({ error: 'Não foi possível criar o perfil: ' + insertErr.message });
      }
      // Reler o perfil recém-criado
      const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!newProfile) return res.status(500).json({ error: 'Perfil criado mas não encontrado. Tente de novo.' });
      Object.assign(profile || {}, newProfile);
      // Reatribuir para continuar o fluxo
      return continueRegister(res, supabase, user, newProfile);
    }

    // Já tem código — devolver directamente
    if (profile.ref_code) {
      return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });
    }

    return continueRegister(res, supabase, user, profile);

  } catch (err) {
    console.error('[affRegister] exception:', err.message);
    return res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
}

// Helper partilhado — gera e guarda o código de referência
async function continueRegister(res, supabase, user, profile) {
  try {
    // Gerar código único sem RPC: 3 letras do nome + 5 dígitos
    const namePart = (profile.full_name || user.email || 'MZD')
      .replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const ref_code = namePart + Math.floor(10000 + Math.random() * 90000);

    // Verificar unicidade
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('ref_code', ref_code).maybeSingle();
    const finalCode = existing ? ref_code + Math.floor(Math.random() * 9) : ref_code;

    // Tentar guardar — se colunas não existem, o SQL abaixo resolve
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ ref_code: finalCode, is_affiliate: false })
      .eq('id', user.id);

    if (updateErr) {
      // Coluna ref_code provavelmente não existe — instruir o utilizador
      console.error('[affRegister] update error:', updateErr.message);
      if (updateErr.message.includes('column') || updateErr.code === '42703') {
        return res.status(500).json({
          error: 'Colunas de afiliado em falta na BD. Execute o SQL de migração no Supabase.',
          sql_needed: true,
        });
      }
      return res.status(500).json({ error: 'Erro ao guardar código: ' + updateErr.message });
    }

    return res.status(200).json({
      success: true,
      ref_code: finalCode,
      is_affiliate: false,
      message: 'Código criado! Aguarde aprovação para começar a ganhar comissões.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar código: ' + err.message });
  }
}

// ── Dashboard do afiliado ─────────────────────────────────────────────────
async function affDashboard(req, res, supabase) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('ref_code, is_affiliate, aff_balance, aff_total_earned, aff_clicks, aff_conversions, full_name, phone')
    .eq('id', user.id).single();

  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  const { data: commissions } = await supabase
    .from('affiliate_commissions')
    .select('id, package_id, sale_amount, commission_mzn, status, created_at')
    .eq('affiliate_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: withdrawals } = await supabase
    .from('affiliate_withdrawals')
    .select('id, amount, mpesa_phone, status, created_at, processed_at')
    .eq('affiliate_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const since30 = new Date(); since30.setDate(since30.getDate() - 30);
  const { data: clicksRaw } = await supabase
    .from('affiliate_clicks')
    .select('created_at, converted')
    .eq('affiliate_id', user.id)
    .gte('created_at', since30.toISOString());

  const clicksByDay = {};
  (clicksRaw || []).forEach(c => {
    const day = c.created_at.split('T')[0];
    if (!clicksByDay[day]) clicksByDay[day] = { clicks: 0, conversions: 0 };
    clicksByDay[day].clicks++;
    if (c.converted) clicksByDay[day].conversions++;
  });

  const { data: settings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['aff_min_withdraw', 'aff_rate_basico', 'aff_rate_pro', 'aff_rate_empresa']);

  const cfg = {};
  (settings || []).forEach(s => { cfg[s.key] = s.value; });

  return res.status(200).json({
    success: true,
    profile: {
      ref_code:        profile.ref_code,
      is_affiliate:    profile.is_affiliate,
      balance:         profile.aff_balance || 0,
      total_earned:    profile.aff_total_earned || 0,
      clicks:          profile.aff_clicks || 0,
      conversions:     profile.aff_conversions || 0,
      link:            `${SITE_URL}/?ref=${profile.ref_code}`,
      conversion_rate: profile.aff_clicks > 0
        ? Math.round((profile.aff_conversions / profile.aff_clicks) * 100)
        : 0,
    },
    commissions:   commissions || [],
    withdrawals:   withdrawals || [],
    clicksByDay,
    config: cfg,
  });
}

// ── Registar clique (deduplicado por hash de IP) ──────────────────────────
async function affClick(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const body    = parseBody(req);
  const refCode = body.ref_code;
  const page    = (body.page || '/').slice(0, 200);
  if (!refCode) return res.status(400).json({ error: 'ref_code em falta' });

  const ip     = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip + refCode).digest('hex').slice(0, 16);

  // Verificar se este IP já clicou hoje (evitar duplicados)
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('affiliate_clicks')
    .select('id')
    .eq('ref_code', refCode)
    .eq('ip_hash', ipHash)
    .gte('created_at', today)
    .maybeSingle()
    .catch(() => ({ data: null }));

  if (!existing) {
    // Registar o clique
    await supabase.from('affiliate_clicks').insert({
      ref_code:   refCode,
      ip_hash:    ipHash,
      page:       page,
      converted:  false,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    // Incrementar contador no perfil
    await supabase.rpc('increment_aff_clicks', { p_ref_code: refCode })
      .catch(async () => {
        // Fallback: update directo se RPC não existir
        await supabase
          .from('profiles')
          .update({ aff_clicks: supabase.sql`aff_clicks + 1` })
          .eq('ref_code', refCode)
          .catch(() => {});
      });
  }

  return res.status(200).json({ ok: true });
}

// ── Pedir levantamento M-Pesa ─────────────────────────────────────────────
async function affWithdraw(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseInt(body.amount || 0);

  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('aff_balance, is_affiliate')
    .eq('id', user.id).single();

  if (!profile?.is_affiliate) return res.status(403).json({ error: 'Não é afiliado aprovado' });

  const { data: minSetting } = await supabase
    .from('system_settings').select('value').eq('key', 'aff_min_withdraw').single();
  const minWithdraw = parseInt(minSetting?.value || '200');

  if (amount < minWithdraw)
    return res.status(400).json({ error: `Valor mínimo de levantamento: ${minWithdraw} MZN` });
  if (amount > (profile.aff_balance || 0))
    return res.status(400).json({ error: 'Saldo insuficiente' });

  const { error } = await supabase.from('affiliate_withdrawals').insert({
    affiliate_id: user.id,
    amount,
    mpesa_phone: phone,
    status: 'pending',
  });
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('profiles')
    .update({ aff_balance: (profile.aff_balance - amount) })
    .eq('id', user.id);

  return res.status(200).json({
    success: true,
    message: `Pedido de ${amount} MZN submetido. Será processado em até 48 horas via M-Pesa.`,
  });
}

// ── Verificar ref_code (público — usado pelo frontend) ────────────────────
async function affCheck(req, res, supabase) {
  const refCode = req.query?.ref || '';
  if (!refCode) return res.status(400).json({ error: 'ref em falta' });

  const { data } = await supabase
    .from('profiles')
    .select('full_name, is_affiliate, ref_code')
    .eq('ref_code', refCode)
    .single();

  if (!data) return res.status(404).json({ error: 'Link inválido' });

  return res.status(200).json({
    valid:        true,
    is_affiliate: data.is_affiliate,
    name:         data.full_name || 'Parceiro MzDocs',
  });
}


// ════════════════════════════════════════════════════════════════════════════
// CONFIG — devolve configuração pública (merged from api/config.js)
// ════════════════════════════════════════════════════════════════════════════
async function handleConfig(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl     = process.env.SUPABASE_URL      || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const isSandbox       = !process.env.MPESA_API_KEY || !process.env.MPESA_SERVICE_CODE;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(200).json({ configured: false, isSandbox, message: 'Supabase não configurado' });
  }

  // Contador público de documentos gerados
  let docsGenerated = null;
  try {
    const { count } = await makeClient()
      .from('credit_usage_log')
      .select('*', { count: 'exact', head: true });
    docsGenerated = count || 0;
  } catch (_) {}

  return res.status(200).json({ configured: true, supabaseUrl, supabaseAnonKey, isSandbox, docsGenerated });
}

// ════════════════════════════════════════════════════════════════════════════
// OCR-ANALYZE — proxy IA para análise de documentos (merged from api/ocr-analyze.js)
// ════════════════════════════════════════════════════════════════════════════
async function handleOcrAnalyze(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const body = parseBody(req);
  const { ocrText = '', schema = [], serviceType = '', imageBase64, mimeType } = body;
  if (!schema.length) return res.status(400).json({ error: 'schema required' });

  const hasImage = !!(imageBase64 && mimeType?.startsWith('image/'));
  const schemaDesc = schema.map(f => `- ${f.id}: "${f.label}" (${f.type})`).join('\n');

  // Prompt robusto: instrui a IA a usar a imagem E o texto para extrair campos
  const userPrompt = `És um especialista em extracção de dados de documentos moçambicanos.
${ocrText ? `TEXTO EXTRAÍDO DO DOCUMENTO:\n${ocrText.slice(0, 2000)}\n` : ''}
TIPO DE DOCUMENTO: ${serviceType}

CAMPOS A EXTRAIR:
${schemaDesc}

INSTRUÇÕES:
- Analisa ${hasImage ? 'a imagem e o texto' : 'o texto'} cuidadosamente
- Para cada campo, extrai o valor exacto que aparece no documento
- Se o campo não existir, inclui-o em "missing"
- Responde APENAS com JSON válido, sem markdown, sem explicações

FORMATO OBRIGATÓRIO:
{"fields":{"id_campo":{"value":"valor encontrado","confidence":0.95,"source":"ocr"}},"missing":["campo_ausente"]}`;

  // ── 1. Groq Vision (modelos actuais 2025/2026) ───────────────────────────
  if (process.env.GROQ_API_KEY) {
    // Modelos vision disponíveis no Groq — tentar por ordem de preferência
    const visionModels = hasImage
      ? ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview', 'meta-llama/llama-4-maverick-17b-128e-instruct']
      : ['llama-3.3-70b-versatile'];

    for (const model of visionModels) {
      try {
        const content = hasImage
          ? [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }, { type: 'text', text: userPrompt }]
          : userPrompt;

        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model, max_tokens: 1500, temperature: 0.1, messages: [{ role: 'user', content }] }),
        });

        if (r.ok) {
          const d = await r.json();
          if (d.error) { console.warn('[ocr-analyze] Groq model error:', model, d.error?.message); continue; }
          const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
          if (parsed?.fields && Object.keys(parsed.fields).length > 0) {
            console.log('[ocr-analyze] Groq OK:', model);
            return res.status(200).json(parsed);
          }
        } else {
          const err = await r.json().catch(() => ({}));
          console.warn('[ocr-analyze] Groq HTTP', r.status, model, err?.error?.message);
        }
      } catch (e) { console.warn('[ocr-analyze] Groq exception:', model, e.message); }
    }
  }

  // ── 2. Gemini Vision ─────────────────────────────────────────────────────
  if (process.env.GEMINI_API_KEY) {
    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    for (const model of geminiModels) {
      try {
        const parts = [];
        if (hasImage) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
        parts.push({ text: userPrompt });

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) }
        );

        if (r.ok) {
          const d = await r.json();
          const parsed = _safeJSON(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          if (parsed?.fields && Object.keys(parsed.fields).length > 0) {
            console.log('[ocr-analyze] Gemini OK:', model);
            return res.status(200).json(parsed);
          }
        } else {
          console.warn('[ocr-analyze] Gemini HTTP', r.status, model);
        }
      } catch (e) { console.warn('[ocr-analyze] Gemini exception:', e.message); }
    }
  }

  // ── 3. OpenRouter fallback (vision via meta-llama ou google) ────────────
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const content = hasImage
        ? [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }, { type: 'text', text: userPrompt }]
        : userPrompt;

      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': SITE_URL,
        },
        body: JSON.stringify({
          model: hasImage ? 'meta-llama/llama-4-scout' : 'meta-llama/llama-3.3-70b-instruct',
          max_tokens: 1500, temperature: 0.1,
          messages: [{ role: 'user', content }],
        }),
      });

      if (r.ok) {
        const d = await r.json();
        const parsed = _safeJSON(d.choices?.[0]?.message?.content || '{}');
        if (parsed?.fields && Object.keys(parsed.fields).length > 0) {
          console.log('[ocr-analyze] OpenRouter OK');
          return res.status(200).json(parsed);
        }
      }
    } catch (e) { console.warn('[ocr-analyze] OpenRouter:', e.message); }
  }

  console.error('[ocr-analyze] Todos os providers falharam. Verificar API keys no Vercel.');
  return res.status(200).json({ fields: {}, missing: schema.map(f => f.id) });
}

function _safeJSON(raw) {
  try { return JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim()); } catch (_) { return null; }
}
