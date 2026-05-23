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

  // Detect affiliate sub-routes: /api/affiliate/register, /api/affiliate/dashboard …
  const isAffiliate = pathParts.includes('affiliate');
  if (isAffiliate) {
    const action = lastSegment === 'affiliate' ? (req.query?.action || '') : lastSegment;
    return handleAffiliate(action, req, res);
  }

  const action = (lastSegment && lastSegment !== 'misc')
    ? lastSegment
    : (req.query?.action || '');

  if (action === 'page-view')                       return handlePageView(req, res);
  if (action === 'sitemap.xml' || action === 'sitemap') return handleSitemap(req, res);

  return res.status(404).json({ error: `Rota desconhecida: "${action}". Use: page-view, sitemap.xml, affiliate/*` });
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
// AFILIADOS  (/api/affiliate/:action)
// ════════════════════════════════════════════════════════════════════════════
async function handleAffiliate(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = makeClient();

  switch (action) {
    case 'register':  return affRegister(req, res, supabase);
    case 'dashboard': return affDashboard(req, res, supabase);
    case 'click':     return affClick(req, res, supabase);
    case 'withdraw':  return affWithdraw(req, res, supabase);
    case 'check':     return affCheck(req, res, supabase);
    default:          return res.status(404).json({ error: 'Acção de afiliado não encontrada' });
  }
}

// ── Pedir para ser afiliado ───────────────────────────────────────────────
async function affRegister(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase
    .from('profiles').select('ref_code, is_affiliate, full_name').eq('id', user.id).single();

  if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
  if (profile.ref_code)
    return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });

  const { data: codeData } = await supabase.rpc('generate_ref_code');
  const ref_code = codeData;

  await supabase.from('profiles').update({ ref_code, is_affiliate: false }).eq('id', user.id);

  return res.status(200).json({
    success: true,
    ref_code,
    is_affiliate: false,
    message: 'Código criado! Aguarde aprovação para começar a ganhar comissões.',
  });
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

  await supabase.rpc('register_affiliate_click', {
    p_ref_code: refCode,
    p_ip_hash:  ipHash,
    p_page:     page,
  }).catch(() => {});

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
