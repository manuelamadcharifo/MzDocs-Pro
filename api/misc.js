// api/misc.js — router para funções auxiliares (page-view + sitemap)
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const SITE_URL = (process.env.SITE_URL || 'https://mz-docs-pro.vercel.app').replace(/\/$/, '');

const STATIC_PAGES = [
  { loc: '/',           priority: '1.0', changefreq: 'weekly'  },
  { loc: '/legal.html', priority: '0.3', changefreq: 'monthly' },
];

module.exports = async function handler(req, res) {
  const urlPath     = (req.url || '').split('?')[0];
  const pathParts   = urlPath.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];

  const action = (lastSegment && lastSegment !== 'misc')
    ? lastSegment
    : (req.query?.action || '');

  if (action === 'page-view') return handlePageView(req, res);
  if (action === 'sitemap.xml' || action === 'sitemap') return handleSitemap(req, res);

  return res.status(404).json({ error: `Rota desconhecida: "${action}". Use: page-view, sitemap.xml` });
};

async function handlePageView(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { slug } = req.body || {};
  if (!slug || typeof slug !== 'string' || slug.length > 100) {
    return res.status(400).json({ error: 'slug inválido' });
  }

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
    );
    await supabaseAdmin.rpc('increment_page_views', { p_slug: slug });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleSitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  let dynamicPages = [];

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
    );
    const { data } = await supabaseAdmin
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
