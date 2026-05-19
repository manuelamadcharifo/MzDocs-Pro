// api/sitemap.xml.js — v8.1
// Gera sitemap.xml dinâmico com as páginas publicadas do blog.
// Cacheado 1h no CDN da Vercel.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const SITE_URL = (process.env.SITE_URL || 'https://mz-docs-pro.vercel.app').replace(/\/$/, '');

// Páginas estáticas sempre presentes
const STATIC_PAGES = [
  { loc: '/',           priority: '1.0', changefreq: 'weekly'  },
  { loc: '/legal.html', priority: '0.3', changefreq: 'monthly' },
];

module.exports = async function handler(req, res) {
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
  } catch (_) {
    // Falha silenciosa — devolve sitemap só com páginas estáticas
  }

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
};
