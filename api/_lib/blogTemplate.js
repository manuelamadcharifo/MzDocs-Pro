// api/_lib/blogTemplate.js
// ─────────────────────────────────────────────────────────────────────────
// Template ÚNICO e partilhado para gerar páginas estáticas de artigos do
// blog. Antes havia DUAS cópias quase idênticas — uma em api/misc.js
// (usada pelo blog-cron) e outra em api/admin/index.js (usada pelo admin
// ao criar/editar páginas manualmente, incl. "Geração Automática"). A
// cópia do admin nunca tinha sido corrigida para usar o template real com
// header/CSS/CTA, por isso páginas geradas por essa via saíam sempre
// "cruas" mesmo depois de corrigir a do blog-cron. Esta lib elimina essa
// divergência: só existe agora UM sítio para o template e para o PUT ao
// GitHub, usado por ambos os ficheiros.
// ─────────────────────────────────────────────────────────────────────────

const BLOG_POST_TEMPLATE = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{{TITLE}} — MzDocs Pro</title>
  <meta name="description" content="{{META_DESCRIPTION}}"/>
  <meta name="robots" content="index, follow"/>
  <link rel="canonical" href="{{CANONICAL_URL}}"/>

  <!-- Open Graph -->
  <meta property="og:type"        content="article"/>
  <meta property="og:title"       content="{{TITLE}} — MzDocs Pro"/>
  <meta property="og:description" content="{{META_DESCRIPTION}}"/>
  <meta property="og:url"         content="{{CANONICAL_URL}}"/>
  <meta property="og:site_name"   content="MzDocs Pro"/>
  <meta property="og:locale"      content="pt_MZ"/>

  <!-- Schema.org Article -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "{{TITLE}}",
    "description": "{{META_DESCRIPTION}}",
    "url": "{{CANONICAL_URL}}",
    "datePublished": "{{DATE_PUBLISHED}}",
    "dateModified": "{{DATE_MODIFIED}}",
    "publisher": {
      "@type": "Organization",
      "name": "MzDocs Pro",
      "url": "https://mzdocs.co.mz"
    },
    "inLanguage": "pt-MZ"
  }
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=Instrument+Serif:ital@0;1&display=swap"/>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --ink: #07101F; --muted: #64748B; --border: #E2E8F0; --surface: #F8FAFD;
      --blue: #3B82F6; --blue-d: #1D4ED8; --green: #009A44;
      --r: 14px; --max: 720px;
    }
    body {
      font-family: 'Bricolage Grotesque', sans-serif;
      background: var(--surface); color: var(--ink);
      line-height: 1.7; font-size: 1rem;
    }

    /* ── Header ── */
    .site-header {
      background: var(--ink); padding: 0 20px; height: 56px;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 50;
    }
    .site-logo {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none; color: #fff;
    }
    .logo-badge {
      width: 30px; height: 30px; border-radius: 8px;
      background: linear-gradient(135deg, var(--blue), var(--green));
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    .logo-text { font-family: 'Instrument Serif', serif; font-size: 18px; }
    .header-cta {
      background: var(--blue); color: #fff; border: none; border-radius: 8px;
      padding: 7px 14px; font-size: 13px; font-weight: 700;
      cursor: pointer; text-decoration: none; white-space: nowrap;
    }
    .header-cta:hover { background: var(--blue-d); }

    /* ── Breadcrumb ── */
    .breadcrumb {
      max-width: var(--max); margin: 0 auto;
      padding: 14px 20px 0; font-size: 13px; color: var(--muted);
    }
    .breadcrumb a { color: var(--blue); text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    .breadcrumb span { margin: 0 6px; }

    /* ── Artigo ── */
    article {
      max-width: var(--max); margin: 0 auto;
      padding: 24px 20px 60px;
    }
    .article-meta {
      display: flex; align-items: center; gap: 10px;
      font-size: 13px; color: var(--muted); margin-bottom: 20px; flex-wrap: wrap;
    }
    .article-meta .tag {
      background: #EFF6FF; color: var(--blue-d); border-radius: 20px;
      padding: 2px 10px; font-size: 12px; font-weight: 600;
    }
    h1 {
      font-family: 'Instrument Serif', serif;
      font-size: clamp(26px, 5vw, 38px); line-height: 1.15;
      margin-bottom: 16px; color: var(--ink);
    }
    .article-body h2 {
      font-size: 1.35rem; font-weight: 800; margin: 2rem 0 .75rem;
      color: var(--ink); border-left: 4px solid var(--blue);
      padding-left: 12px;
    }
    .article-body h3 {
      font-size: 1.1rem; font-weight: 700; margin: 1.5rem 0 .5rem; color: var(--ink);
    }
    .article-body p { margin-bottom: 1rem; color: #1e293b; }
    .article-body ul, .article-body ol {
      margin: .75rem 0 1rem 1.5rem;
    }
    .article-body li { margin-bottom: .4rem; }
    .article-body strong { font-weight: 700; }
    .article-body em { font-style: italic; }
    .article-body blockquote {
      border-left: 4px solid var(--green); margin: 1.5rem 0;
      padding: .75rem 1rem; background: #ECFDF5; border-radius: 0 8px 8px 0;
      color: #065f46; font-style: italic;
    }

    /* ── CTA box ── */
    .cta-box {
      background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
      border: 2px solid #BFDBFE; border-radius: var(--r);
      padding: 24px; margin: 2.5rem 0; text-align: center;
    }
    .cta-box h3 { font-size: 1.2rem; margin-bottom: 8px; color: var(--blue-d); }
    .cta-box p  { color: #1e40af; margin-bottom: 16px; font-size: .95rem; }
    .cta-btn {
      display: inline-block; background: var(--blue-d); color: #fff;
      text-decoration: none; padding: 12px 28px; border-radius: 10px;
      font-weight: 700; font-size: .95rem; transition: background .2s;
    }
    .cta-btn:hover { background: #1e3a8a; }

    /* ── Footer ── */
    .site-footer {
      background: var(--ink); color: rgba(255,255,255,.5);
      padding: 24px 20px; text-align: center; font-size: 13px; line-height: 2;
    }
    .site-footer a { color: rgba(255,255,255,.6); text-decoration: none; }
    .site-footer a:hover { color: #fff; }

    /* ── Responsive ── */
    @media (max-width: 480px) {
      article { padding: 16px 16px 48px; }
      .header-cta { padding: 6px 10px; font-size: 12px; }
    }
  </style>
</head>
<body>

<header class="site-header">
  <a class="site-logo" href="/">
    <div class="logo-badge">📄</div>
    <span class="logo-text">MzDocs</span>
  </a>
  <a class="header-cta" href="/">Criar Documento Grátis →</a>
</header>

<div class="breadcrumb">
  <a href="/">Início</a><span>›</span>
  <a href="/pages/">Blog</a><span>›</span>
  {{TITLE}}
</div>

<article>
  <div class="article-meta">
    <span class="tag">📚 Guia</span>
    <span>{{DATE_DISPLAY}}</span>
    <span>·</span>
    <span>MzDocs Pro</span>
  </div>

  <h1>{{TITLE}}</h1>

  <div class="article-body">
    {{CONTENT_HTML}}
  </div>

  <!-- CTA integrado -->
  <div class="cta-box">
    <h3>📄 Crie o seu documento em segundos</h3>
    <p>O MzDocs Pro usa IA para gerar documentos profissionais adaptados a Moçambique.<br/>CV, cartas, requerimentos e muito mais — sem complicação.</p>
    <a class="cta-btn" href="/">Experimentar Grátis →</a>
  </div>
</article>

<footer class="site-footer">
  <div>
    © 2026 MzDocs Pro · Moçambique 🇲🇿
    &nbsp;|&nbsp;<a href="/legal.html">Termos e Privacidade</a>
    &nbsp;|&nbsp;<a href="/">Início</a>
  </div>
</footer>

<!-- Contador de visitas -->
<script>
  (function(){
    try {
      fetch('/api/page-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: '{{SLUG}}' })
      }).catch(function(){});
    } catch(e) {}
  })();
</script>

</body>
</html>
`;

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Substituição literal (sem regex, sem padrões especiais de $), segura
// mesmo que o conteúdo tenha caracteres como "$&" gerados pela IA.
function fill(tpl, key, value) {
  return tpl.split(key).join(value);
}

function renderBlogPage({ slug, title, metaDescription, contentHtml, SITE_URL }) {
  const nowIso = new Date().toISOString();
  const dateDisplay = new Date().toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const canonicalUrl = `${SITE_URL}/pages/${slug}`;

  let html = BLOG_POST_TEMPLATE;
  html = fill(html, '{{TITLE}}', escHtml(title));
  html = fill(html, '{{META_DESCRIPTION}}', escHtml(metaDescription || ''));
  html = fill(html, '{{CANONICAL_URL}}', canonicalUrl);
  html = fill(html, '{{DATE_PUBLISHED}}', nowIso);
  html = fill(html, '{{DATE_MODIFIED}}', nowIso);
  html = fill(html, '{{DATE_DISPLAY}}', dateDisplay);
  html = fill(html, '{{SLUG}}', slug);
  html = fill(html, '{{CONTENT_HTML}}', contentHtml);
  return html;
}

// Publica (cria ou actualiza) o ficheiro estático no GitHub, com o template
// real aplicado. Lança excepção com o corpo real do erro do GitHub em caso
// de falha (nunca silenciosa) — quem chamar deve fazer .catch() e registar
// o erro nos logs.
async function publishBlogPageToGithub({ slug, title, metaDescription, contentHtml, SITE_URL }) {
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    throw new Error('GitHub env vars em falta (GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN) — publicação estática saltada');
  }

  const html = renderBlogPage({ slug, title, metaDescription, contentHtml, SITE_URL });
  const githubPath = `pages/${slug}/index.html`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}`;

  let sha;
  const ex = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (ex.ok) {
    sha = (await ex.json()).sha;
  } else if (ex.status !== 404) {
    const body = await ex.text().catch(() => '');
    console.warn('[blogTemplate] GitHub GET falhou ao verificar ficheiro existente:', ex.status, body);
  }

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Gerar página: ${slug}`, content: Buffer.from(html).toString('base64'), sha }),
  });

  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => '');
    throw new Error(`GitHub PUT falhou (${putRes.status}): ${errBody.slice(0, 300)}`);
  }
}

module.exports = { BLOG_POST_TEMPLATE, renderBlogPage, publishBlogPageToGithub, escHtml, fill };
