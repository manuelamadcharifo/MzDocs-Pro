// api/admin/pages.js — v8.1
// CRUD de páginas do blog. Apenas administradores autenticados.
// Métodos: GET (lista/detalhe) · POST (criar) · PUT (actualizar) · DELETE (eliminar)
// Após criar/actualizar uma página publicada, gera automaticamente
// uma página estática SEO-friendly no GitHub (/pages/slug/index.html).

const { createClient } = require('@supabase/supabase-js');
const ws  = require('ws');

const SITE_URL = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth ────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: 'Supabase não configurado' });

  const supabase      = createClient(supabaseUrl, anonKey || serviceKey, { realtime: { transport: ws } });
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // Verificar utilizador e permissão de admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });

  try {
    // ── GET — listar todas ou buscar por slug ──────────────────────────────
    if (req.method === 'GET') {
      const { slug } = req.query;
      if (slug) {
        const { data, error } = await supabaseAdmin
          .from('blog_pages').select('*').eq('slug', slug).single();
        if (error) return res.status(404).json({ error: 'Página não encontrada' });
        return res.status(200).json(data);
      }
      const { data, error } = await supabaseAdmin
        .from('blog_pages')
        .select('id, slug, title, meta_description, published, views, ai_generated, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // ── POST — criar nova página ───────────────────────────────────────────
    if (req.method === 'POST') {
      const { slug, title, meta_description, content_html, published = false, ai_generated = false } = req.body;

      if (!slug || !title || !content_html) {
        return res.status(400).json({ error: 'slug, title e content_html são obrigatórios' });
      }

      const cleanSlug = slugify(slug);
      const { data, error } = await supabaseAdmin
        .from('blog_pages')
        .insert({ slug: cleanSlug, title, meta_description, content_html, published, ai_generated, author_id: user.id })
        .select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma página com este slug' });
        throw error;
      }

      if (published) {
        await generateStaticPage(data);
      }

      return res.status(201).json({ success: true, page: data });
    }

    // ── PUT — actualizar página existente ─────────────────────────────────
    if (req.method === 'PUT') {
      const { id, slug, title, meta_description, content_html, published, ai_generated } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      const updates = {};
      if (slug             !== undefined) updates.slug             = slugify(slug);
      if (title            !== undefined) updates.title            = title;
      if (meta_description !== undefined) updates.meta_description = meta_description;
      if (content_html     !== undefined) updates.content_html     = content_html;
      if (published        !== undefined) updates.published        = published;
      if (ai_generated     !== undefined) updates.ai_generated     = ai_generated;

      const { data, error } = await supabaseAdmin
        .from('blog_pages').update(updates).eq('id', id).select().single();
      if (error) throw error;

      if (data?.published) {
        await generateStaticPage(data);
      }

      return res.status(200).json({ success: true, page: data });
    }

    // ── DELETE — eliminar página ───────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      const { data: page } = await supabaseAdmin
        .from('blog_pages').select('slug').eq('id', id).single();

      const { error } = await supabaseAdmin.from('blog_pages').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ success: true, deleted_slug: page?.slug });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (err) {
    console.error('[admin/pages]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Utilidades ─────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remover acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}


async function generateStaticPage(page) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    console.warn('[generateStaticPage] GitHub env vars não configuradas');
    return;
  }

  const pubDate = new Date().toLocaleDateString('pt-MZ', { year:'numeric', month:'long', day:'numeric' });
  const html = `<!DOCTYPE html>
<html lang="pt-MZ">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(page.title)} — MzDocs Pro</title>
<meta name="description" content="${escapeHtml(page.meta_description || '')}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${SITE_URL}/pages/${page.slug}"/>
<link rel="icon" href="/assets/img/icon-192.png" type="image/png"/>

<!-- Open Graph -->
<meta property="og:type" content="article"/>
<meta property="og:title" content="${escapeHtml(page.title)} — MzDocs Pro"/>
<meta property="og:description" content="${escapeHtml(page.meta_description || '')}"/>
<meta property="og:url" content="${SITE_URL}/pages/${page.slug}"/>
<meta property="og:site_name" content="MzDocs Pro"/>
<meta property="og:locale" content="pt_MZ"/>

<!-- Twitter Card -->
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${escapeHtml(page.title)} — MzDocs Pro"/>
<meta name="twitter:description" content="${escapeHtml(page.meta_description || '')}"/>

<!-- Schema.org Article -->
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"Article",
  "headline":"${escapeHtml(page.title)}",
  "description":"${escapeHtml(page.meta_description || '')}",
  "url":"${SITE_URL}/pages/${page.slug}",
  "datePublished":"${new Date().toISOString()}",
  "publisher":{"@type":"Organization","name":"MzDocs Pro","url":"${SITE_URL}"},
  "inLanguage":"pt-MZ"
}
<\/script>

<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&display=swap"/>
<style>
  :root{
    --ink:#07101F;--ink2:#0F1E3B;--dim:#334155;--muted:#64748B;
    --border:#E2E8F0;--surface:#F8FAFD;--white:#fff;
    --green:#009A44;--blue:#3B82F6;--blue-d:#1D4ED8;
    --gold:#F59E0B;--r:16px;
    --sh:0 2px 12px rgba(7,16,31,.07),0 4px 20px rgba(7,16,31,.09);
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:'Bricolage Grotesque',sans-serif;background:var(--surface);color:var(--ink);line-height:1.7;-webkit-text-size-adjust:100%}

  /* ── HEADER ── */
  .hdr{background:var(--ink);padding:0 20px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
  .hdr-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
  .hdr-badge{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#3B82F6,#009A44);display:flex;align-items:center;justify-content:center;font-size:16px}
  .hdr-name{color:#fff;font-size:17px;font-weight:800}
  .hdr-name span{color:var(--gold);font-style:italic}
  .hdr-back{color:rgba(255,255,255,.7);font-size:13px;text-decoration:none;display:flex;align-items:center;gap:5px;transition:color .2s}
  .hdr-back:hover{color:#fff}

  /* ── HERO ── */
  .hero{background:var(--ink2);padding:48px 20px 36px;text-align:center}
  .hero-eyebrow{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.7);font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:5px 12px;border-radius:20px;margin-bottom:16px}
  .hero h1{color:#fff;font-size:clamp(22px,4.5vw,34px);font-weight:800;line-height:1.25;margin-bottom:12px;max-width:720px;margin-left:auto;margin-right:auto}
  .hero-meta{color:rgba(255,255,255,.45);font-size:12px;margin-top:8px}

  /* ── BREADCRUMB ── */
  .breadcrumb{max-width:780px;margin:0 auto;padding:14px 20px 0;font-size:12px;color:var(--muted)}
  .breadcrumb a{color:var(--muted);text-decoration:none}
  .breadcrumb a:hover{color:var(--blue)}
  .breadcrumb span{margin:0 6px;opacity:.5}

  /* ── ARTICLE ── */
  .wrap{max-width:780px;margin:0 auto;padding:32px 20px 80px}
  .article-card{background:var(--white);border-radius:var(--r);border:1px solid var(--border);box-shadow:var(--sh);padding:40px 40px 48px;margin-top:8px}
  @media(max-width:600px){.article-card{padding:24px 20px 32px}}

  /* ── TYPOGRAPHY ── */
  .article-card h2{font-size:clamp(17px,3vw,22px);font-weight:800;color:var(--ink2);margin:32px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border)}
  .article-card h2:first-child{margin-top:0}
  .article-card h3{font-size:16px;font-weight:700;color:var(--ink);margin:24px 0 8px}
  .article-card p{font-size:15px;color:var(--dim);margin-bottom:14px;line-height:1.8}
  .article-card ul,.article-card ol{padding-left:22px;margin-bottom:14px}
  .article-card li{font-size:15px;color:var(--dim);margin-bottom:6px;line-height:1.7}
  .article-card strong{color:var(--ink);font-weight:700}
  .article-card em{font-style:italic;color:var(--muted)}
  .article-card blockquote{border-left:3px solid var(--blue);padding:10px 16px;margin:16px 0;background:rgba(59,130,246,.05);border-radius:0 8px 8px 0;color:var(--dim);font-style:italic}
  .article-card a{color:var(--blue);text-decoration:none}
  .article-card a:hover{text-decoration:underline}

  /* ── CTA BANNER ── */
  .cta-banner{background:linear-gradient(135deg,var(--ink2),#1a3a6e);border-radius:var(--r);padding:28px 28px;margin-top:36px;text-align:center}
  .cta-banner h3{color:#fff;font-size:18px;font-weight:800;margin-bottom:8px}
  .cta-banner p{color:rgba(255,255,255,.65);font-size:14px;margin-bottom:18px}
  .cta-btn{display:inline-block;background:linear-gradient(135deg,var(--blue),var(--green));color:#fff;font-weight:800;font-size:14px;padding:12px 28px;border-radius:30px;text-decoration:none;transition:opacity .2s}
  .cta-btn:hover{opacity:.88;text-decoration:none}

  /* ── FOOTER ── */
  .page-footer{background:var(--ink);padding:28px 20px;text-align:center;margin-top:40px}
  .page-footer p{color:rgba(255,255,255,.4);font-size:12px;line-height:1.9}
  .page-footer a{color:rgba(255,255,255,.6);text-decoration:none}
  .page-footer a:hover{color:#fff}

  @media(max-width:480px){
    .hero{padding:32px 16px 28px}
    .wrap{padding:24px 16px 60px}
  }
</style>
</head>
<body>

<header class="hdr">
  <a href="/" class="hdr-logo">
    <div class="hdr-badge">📄</div>
    <div class="hdr-name">MzDocs<span>Pro</span></div>
  </a>
  <a href="/" class="hdr-back">← Voltar ao início</a>
</header>

<section class="hero">
  <div class="hero-eyebrow">✍️ Blog &amp; Guias</div>
  <h1>${escapeHtml(page.title)}</h1>
  <div class="hero-meta">Publicado em ${pubDate} · MzDocs Pro</div>
</section>

<nav class="breadcrumb" aria-label="breadcrumb">
  <a href="/">Início</a><span>›</span>
  <a href="/#blog">Blog</a><span>›</span>
  ${escapeHtml(page.title)}
</nav>

<main class="wrap">
  <article class="article-card" itemscope itemtype="https://schema.org/Article">
    ${page.content_html}

    <div class="cta-banner">
      <h3>Precisa de um documento profissional agora?</h3>
      <p>O MzDocs Pro gera CVs, cartas, contratos, orçamentos e muito mais em segundos — com IA.</p>
      <a href="/" class="cta-btn">✨ Criar documento grátis</a>
    </div>
  </article>
</main>

<footer class="page-footer">
  <p>
    © ${new Date().getFullYear()} MzDocs Pro · Todos os direitos reservados<br/>
    <a href="/legal.html">Termos &amp; Privacidade</a> ·
    <a href="mailto:suporte@mzdocs.mz">suporte@mzdocs.mz</a> ·
    <a href="https://wa.me/258858695506">WhatsApp</a>
  </p>
</footer>

</body>
</html>`;

  const githubPath = `pages/${page.slug}/index.html`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}`;

  let sha = undefined;

  try {
    const existing = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (existing.ok) {
      const existingData = await existing.json();
      sha = existingData.sha;
    }
  } catch (_) {}

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Gerar página estática: ${page.slug}`,
      content: Buffer.from(html).toString('base64'),
      sha,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao publicar página estática: ${errorText}`);
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
