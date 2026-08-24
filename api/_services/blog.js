// api/_services/blog.js — SITEMAP, BLOG-LIST, BLOG-CRON, GITHUB-DIAGNOSTIC
// (extraído de api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Agrupa tudo o que publica/lista conteúdo (sitemap dinâmico, blog gerado
// por IA, cron de agendamento, diagnóstico do publish para o GitHub Pages).
// Move puro — nenhuma lógica alterada. api/misc.js continua a ser o único
// entrypoint HTTP.
// ──────────────────────────────────────────────────────────────────────────

const { restRequest, insert } = require('../_lib/supabaseAdmin');
const { publishBlogPageToGithub } = require('../_lib/blogTemplate');
const { ORIGIN, SITE_URL, parseBody } = require('../_lib/httpHelpers');
// NOVO (Ago/2026): motor de corrida por tiers partilhado com
// api/generate-document.js — ver nota em _callAiText abaixo.
const { raceAllProviders, buildApiKeysFromEnv } = require('../_lib/aiRace');

// Páginas SEO estáticas — ao adicionar novas páginas em /pages/, acrescentar
// aqui também. Páginas geradas pelo admin (blog_pages) são lidas
// automaticamente da BD e não precisam de estar nesta lista.
const STATIC_PAGES = [
  { loc: '/',                                                                    priority: '1.0', changefreq: 'weekly'  },
  { loc: '/pages/',                                                              priority: '0.7', changefreq: 'weekly'  },
  // Páginas SEO estáticas — ficheiros físicos em /pages/
  { loc: '/pages/como-fazer-cv-mocambique.html',                                 priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/cv-licenciado-mocambique.html',                                 priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/cv-sem-experiencia-mocambique.html',                            priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/como-fazer-um-cv-de-um-licenciado-em-mocambique/',              priority: '0.9', changefreq: 'monthly' },
  { loc: '/pages/carta-candidatura-emprego-mocambique.html',                     priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-formal-mocambique.html',                                  priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/carta-recomendacao-mocambique.html',                            priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/contrato-arrendamento-mocambique.html',                         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-residencia-mocambique.html',                         priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/declaracao-rendimentos-mocambique.html',                        priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/plano-negocios-mocambique.html',                                priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/procuracao-mocambique.html',                                    priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/recibo-pagamento-mocambique.html',                              priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/requerimento-emprego-mocambique.html',                          priority: '0.8', changefreq: 'monthly' },
  { loc: '/pages/trabalho-escolar-mocambique.html',                              priority: '0.8', changefreq: 'monthly' },
  // Outras páginas públicas
  { loc: '/parceiros.html',                                                      priority: '0.6', changefreq: 'monthly' },
  { loc: '/templates.html',                                                      priority: '0.6', changefreq: 'weekly'  },
  { loc: '/legal.html',                                                          priority: '0.3', changefreq: 'monthly' },
];

async function handleSitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  // Páginas dinâmicas criadas pelo admin (blog_pages publicadas na BD).
  //
  // FORMATO DA URL:
  //   - O admin publica via GitHub commit em pages/<slug>/index.html
  //     (ver handleGeneratePage em api/admin/index.js).
  //   - Logo a URL pública é /pages/<slug>/ (cleanUrls no vercel.json),
  //     NÃO /pages/<slug>.html como estava antes (bug anterior).
  //
  // DEDUPLICAÇÃO:
  //   - Se uma página dinâmica tiver o mesmo slug de uma estática já listada
  //     em STATIC_PAGES (ex: como-fazer-cv-mocambique), a entrada estática
  //     tem prioridade. Isto evita duplicados no sitemap quando uma página
  //     estática foi posteriormente republicada pelo admin.
  let dynamicPages = [];
  try {
    const data = await restRequest(
      'blog_pages?published=eq.true&select=slug,updated_at,title&order=updated_at.desc&limit=500'
    );

    // Conjunto de slugs já cobertos pelas páginas estáticas
    const staticSlugs = new Set(
      STATIC_PAGES
        .map(p => {
          // Extrai o slug do loc: /pages/foo.html → foo | /pages/foo/ → foo
          const m = p.loc.match(/\/pages\/([^/]+?)(?:\.html|\/?$)/);
          return m ? m[1] : null;
        })
        .filter(Boolean)
    );

    dynamicPages = (Array.isArray(data) ? data : [])
      .filter(p => p.slug && !staticSlugs.has(p.slug))
      .map(p => ({
        // CORRIGIDO (auditoria de indexação): antes usava '/pages/slug/'
        // (com barra final), mas a tag <link rel="canonical"> gerada pelo
        // mesmo template (blogTemplate.js) usa '/pages/slug' (SEM barra) —
        // e como o vercel.json não define trailingSlash:true, o Vercel
        // redirecciona (308) de /slug/ para /slug por omissão. Ou seja, o
        // sitemap estava a listar URLs que fazem um salto de redirect
        // antes de chegar à versão canónica — más práticas para SEO
        // (Google prefere URLs do sitemap que respondem 200 directamente).
        // Agora ambos usam exactamente a mesma forma.
        loc:        `/pages/${p.slug}`,
        priority:   '0.8',
        changefreq: 'monthly',
        lastmod:    p.updated_at ? p.updated_at.slice(0, 10) : undefined,
      }));
  } catch (_) {
    // Falha silenciosa: o sitemap serve as páginas estáticas mesmo sem BD
  }

  const allPages = [...STATIC_PAGES, ...dynamicPages];

  const urlEntries = allPages.map(p => {
    const lines = [
      `  <url>`,
      `    <loc>${SITE_URL}${p.loc}</loc>`,
      p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>` : null,
      `    <changefreq>${p.changefreq}</changefreq>`,
      `    <priority>${p.priority}</priority>`,
      `  </url>`,
    ].filter(Boolean);
    return lines.join('\n');
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;

  return res.status(200).send(xml);
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════════════
// NOTA (auditoria Jul/2026 — corrigido comentário anterior que contradizia o
// código): este endpoint EXPÕE supabaseUrl + supabaseAnonKey de propósito, e
// isso está correcto. AuthManager.js usa-os no browser para criar um cliente
// Supabase real (createClient), necessário para autenticação e para as
// poucas escritas directas feitas pelo painel admin (ver AdminApp.js).
//
// A anon key do Supabase é, por desenho, uma chave PÚBLICA — todo o modelo
// de segurança do Supabase assume que ela vai parar ao browser de qualquer
// app que a use, e a protecção real vem do Row Level Security (RLS) em
// cada tabela, não do sigilo desta chave. Confirmado nesta auditoria:
//   - profiles/documents/transactions têm RLS activo com políticas "own
//     row" para utilizadores normais e políticas de admin (baseadas em
//     is_admin=true verificado no próprio Postgres, não confiado ao
//     cliente) em polices.sql.
//   - migration_v50_protect_sensitive_profile_columns.sql acrescenta uma
//     camada extra: mesmo dentro da própria linha, um utilizador normal
//     não consegue alterar directamente is_admin/credits/aff_balance/etc.
// O que NUNCA pode ir para aqui (nem para nenhum endpoint público) é a
// SERVICE_ROLE_KEY — essa sim ignora todo o RLS e só é usada server-side
// em api/_lib/supabaseAdmin.js.
function _blogSlugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function _blogExtractHTML(text) {
  return String(text || '')
    .replace(/```html/gi, '').replace(/```/g, '')
    .trim();
}

// Similaridade simples por sobreposição de palavras (Jaccard) — suficiente
// para apanhar títulos praticamente repetidos sem precisar de embeddings.
function _titleSimilarity(a, b) {
  const norm = s => new Set(
    String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length > 3)
  );
  const setA = norm(a), setB = norm(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  return inter / new Set([...setA, ...setB]).size;
}

function _isTooSimilar(candidateTitle, existingTitles, threshold = 0.55) {
  return existingTitles.some(t => _titleSimilarity(candidateTitle, t) >= threshold);
}

// CORRIGIDO (Ago/2026 — incidente de 19-23/08): esta função só tinha Groq e
// Gemini fixos, sem tiers, sem timeout, sem disjuntor por modelo — quando
// os dois esgotaram quota no mesmo dia, TODAS as publicações agendadas
// passaram a falhar com "Nenhum provider de IA disponível", apesar de
// existirem outros ~7-11 providers já configurados e a funcionar
// normalmente na geração de documentos (api/generate-document.js). Passa a
// usar o mesmo motor partilhado (api/_lib/aiRace.js) — corre por tiers
// (generoso+médio primeiro, reserva_ativa só como fallback), com timeout
// de 9s por provider e disjuntor por modelo, tal como a geração de
// documentos. Zero providers a mais para configurar — usa exactamente as
// mesmas env vars já ligadas no admin ("IA Providers").
async function _callAiText(prompt, { maxTokens = 3000 } = {}) {
  const apiKeys = buildApiKeysFromEnv();
  if (Object.keys(apiKeys).length === 0) return null;

  try {
    const result = await raceAllProviders(
      prompt, apiKeys, /* preferProvider */ null, maxTokens,
      'És um especialista em SEO e redacção de conteúdo para o mercado moçambicano. Respondes apenas com o conteúdo pedido, sem comentários adicionais.'
    );
    return { text: result.content, provider: result.provider };
  } catch (e) {
    // AggregateError do Promise.any quando TODOS os providers do grupo
    // falharam — junta as mensagens individuais em vez de um "[object
    // AggregateError]" inútil no error_note da fila.
    const detail = e?.errors?.length ? e.errors.map(x => x.message).join(' | ') : e.message;
    console.warn('[blog-cron] Todos os providers de IA falharam:', detail);
    return null;
  }
}

// Publica o HTML estático no GitHub — mesma lógica de
// api/admin/index.js::_generateStaticPage, duplicada aqui porque as duas
// funções vivem em ficheiros/serverless functions diferentes (limite de
// 12 funções do plano Hobby da Vercel não permite extrair para um módulo
// importado sem cuidado de bundling — mantemos a duplicação pequena e
// explícita, tal como já acontecia com outros helpers deste projecto).

async function _publishBlogStaticFile(slug, title, metaDescription, contentHtml, SITE_URL) {
  await publishBlogPageToGithub({ slug, title, metaDescription, contentHtml, SITE_URL });
}

async function _generateAndPublishArticle({ title, keywords, existingTitles, transactionNote }) {
  const avoidBlock = existingTitles.length
    ? `\n\nJÁ EXISTEM estes artigos no blog — o teu deve cobrir um ângulo/subtema DIFERENTE, sem repetir conteúdo:\n${existingTitles.slice(0, 80).map(t => `- ${t}`).join('\n')}`
    : '';

  const prompt = `És um especialista em SEO e redacção de conteúdo para o mercado moçambicano.\n\nEscreve um artigo de blog completo sobre: "${title}"\nPalavras-chave a incluir naturalmente: ${keywords || 'documentos, Moçambique'}\nTom: informativo\nExtensão aproximada: 700 palavras${avoidBlock}\n\nREGRAS OBRIGATÓRIAS:\n- Escreve em português europeu (não brasileiro)\n- Conteúdo específico para Moçambique (exemplos locais, instituições moçambicanas, M-Pesa, etc.)\n- Inclui H2 e H3, e uma secção FAQ com 3-4 perguntas no final\n- Menciona que o MzDocs Pro pode ajudar a criar estes documentos rapidamente com IA\n- NÃO incluis <html>, <head>, <body> ou <!DOCTYPE> — apenas conteúdo do artigo\n- Devolve APENAS HTML válido: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>\n- Não uses Markdown, apenas HTML puro\n\nComeça directamente com o conteúdo HTML, sem preâmbulo.`;

  const result = await _callAiText(prompt, { maxTokens: 3000, temperature: 0.5 });
  if (!result) throw new Error('Nenhum provider de IA disponível para gerar o artigo.');

  const html = _blogExtractHTML(result.text);
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const metaDescription = plainText.slice(0, 155).trim() + (plainText.length > 155 ? '…' : '');
  let slug = _blogSlugify(title);

  // Garantir slug único (sufixo -2, -3... se já existir)
  let suffix = 1;
  let finalSlug = slug;
  while (true) {
    const existing = await restRequest(`blog_pages?slug=eq.${finalSlug}&select=id&limit=1`);
    if (!Array.isArray(existing) || existing.length === 0) break;
    suffix++; finalSlug = `${slug}-${suffix}`;
    if (suffix > 20) { finalSlug = `${slug}-${Date.now()}`; break; }
  }

  const nowIso = new Date().toISOString();
  const inserted = await insert('blog_pages', {
    slug: finalSlug, title, meta_description: metaDescription, content_html: html,
    published: true, ai_generated: true, published_at: nowIso, updated_at: nowIso,
    topic_keywords: keywords || null,
  });
  const newPage = Array.isArray(inserted) ? inserted[0] : inserted;

  const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';
  await _publishBlogStaticFile(finalSlug, title, metaDescription, html, SITE_URL)
    .catch(e => {
      console.warn('[blog-cron] publicação estática falhou:', e.message, transactionNote || '');
      // NOVO (Fase 5): o artigo já ficou gravado em blog_pages (published:true
      // acima), mas se o ficheiro estático no GitHub falhar, o sitemap/URL
      // real pode não existir — o admin precisa de saber para investigar
      // (normalmente token do GitHub expirado ou rate-limit).
      insert('admin_notifications', {
        type:    'blog_publish_failed',
        title:   '⚠️ Falha ao publicar artigo no GitHub',
        message: `"${title}" (slug: ${finalSlug}) foi gravado na base de dados mas a publicação estática falhou: ${e.message}`,
        link:    '#blog',
      }).catch(() => {});
    });

  return { slug: finalSlug, title, id: newPage?.id, provider: result.provider };
}

// ════════════════════════════════════════════════════════════════════════════
// GITHUB-DIAGNOSTIC — testa as credenciais do GitHub server-side, sem nunca
// expor o valor do token. Usa-se uma vez para diagnosticar o problema do
// "publicação estática falhou" e depois pode remover-se.
// GET/POST /api/misc?action=github-diagnostic  (mesmo header que blog-cron)
// ════════════════════════════════════════════════════════════════════════════
async function handleGithubDiagnostic(req, res) {
  const bearerSecret = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const customSecret  = req.headers['x-vercel-cron-secret'] || req.headers['x-cron-secret'] || '';
  const providedSecret = bearerSecret || customSecret;
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  const report = {
    envVarsPresentes: { GITHUB_OWNER: !!owner, GITHUB_REPO: !!repo, GITHUB_TOKEN: !!token },
    ownerUsado: owner || null,
    repoUsado: repo || null,
  };

  if (!owner || !repo || !token) {
    report.conclusao = 'Falta pelo menos uma env var — vê envVarsPresentes acima.';
    return res.status(200).json(report);
  }

  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    const body = await r.json().catch(() => ({}));
    report.status = r.status;

    if (r.status === 401) {
      report.conclusao = 'Token inválido ou expirado (Bad credentials). Gera um novo Personal Access Token no GitHub.';
    } else if (r.status === 404) {
      report.conclusao = `Repositório "${owner}/${repo}" não encontrado com este token — confirma se GITHUB_OWNER/GITHUB_REPO estão certos, ou se é um fine-grained token sem acesso a este repo.`;
    } else if (r.status === 200) {
      const podeEscrever = body?.permissions?.push === true;
      report.repoEncontrado = true;
      report.permissoes = body?.permissions || null;
      report.conclusao = podeEscrever
        ? 'Tudo certo: o token acede ao repositório e TEM permissão de escrita (push). O problema deve estar noutro sítio — verifica os logs do próximo blog-cron.'
        : 'O token acede ao repositório mas NÃO tem permissão de escrita. Se for um PAT clássico, falta o scope "repo". Se for fine-grained, falta "Contents: Read and write".';
    } else {
      report.corpo = JSON.stringify(body).slice(0, 500);
      report.conclusao = `Resposta inesperada do GitHub (${r.status}) — vê o corpo acima.`;
    }
    return res.status(200).json(report);
  } catch (e) {
    report.erro = e.message;
    report.conclusao = 'Excepção de rede ao contactar a API do GitHub.';
    return res.status(200).json(report);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOG-LIST — endpoint público (sem autenticação) que lista artigos do blog
// já publicados, mais recentes primeiro, com pesquisa opcional por título
// ou descrição. Usado pela página /blog para listar e pesquisar artigos.
// GET /api/misc?action=blog-list&q=termo&limit=60&offset=0
// ════════════════════════════════════════════════════════════════════════════
async function handleBlogList(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const q      = (req.query.q || '').toString().trim();
    const limit  = Math.min(parseInt(req.query.limit, 10)  || 60, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Mais recente primeiro: published_at (com nulls por último, para
    // artigos antigos que possam não ter esse campo preenchido), e
    // updated_at como critério de desempate/fallback.
    let path = `blog_pages?published=eq.true&select=slug,title,meta_description,published_at,updated_at,views`
             // NOTA: não usar "updated_at" como critério de desempate — a
             // tabela tem um trigger que actualiza updated_at em QUALQUER
             // alteração da linha, incluindo o simples incremento de
             // visitas (views = views + 1). Um artigo antigo muito visto
             // ficaria sempre a parecer "recente". published_at é o único
             // campo que reflecte o momento real da publicação.
             + `&order=published_at.desc.nullslast&limit=${limit}&offset=${offset}`;

    if (q) {
      // Remove caracteres que têm significado especial na sintaxe do
      // PostgREST (vírgulas, parêntesis, %) para evitar quebrar a query.
      const safe = q.replace(/[%,()]/g, ' ').trim();
      if (safe) {
        const pattern = encodeURIComponent(`*${safe}*`);
        path += `&or=(title.ilike.${pattern},meta_description.ilike.${pattern})`;
      }
    }

    const rows = await restRequest(path);
    const posts = (Array.isArray(rows) ? rows : []).map(p => ({
      slug: p.slug,
      title: p.title,
      description: p.meta_description || '',
      date: p.published_at || p.updated_at,
      views: p.views || 0,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ posts, count: posts.length });
  } catch (e) {
    console.error('[blog-list] erro:', e.message);
    return res.status(500).json({ error: 'Erro ao carregar artigos do blog.' });
  }
}

async function handleBlogCron(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Autenticação do cron: aceita tanto o header nativo que a Vercel injecta
  // (Authorization: Bearer $CRON_SECRET) como um header custom, para
  // permitir também accionar via serviço externo — mesmo padrão de
  // api/cleanup-temp-accounts.js.
  const bearerSecret = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const customSecret  = req.headers['x-vercel-cron-secret'] || req.headers['x-cron-secret'] || '';
  const providedSecret = bearerSecret || customSecret;
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const results = { published: [], failed: [], autogen: null };

  try {
    // 1. Processar a fila (títulos manuais/IA já agendados e vencidos).
    //    Limitado a 2 por execução para não estourar o timeout da função.
    const nowIso = new Date().toISOString();
    const due = await restRequest(
      `blog_schedule_queue?status=eq.pending&scheduled_at=lte.${encodeURIComponent(nowIso)}&order=scheduled_at.asc&limit=2`
    );

    if (Array.isArray(due) && due.length) {
      const existingPages = await restRequest('blog_pages?select=title');
      const existingTitles = (existingPages || []).map(p => p.title);

      for (const item of due) {
        try {
          const article = await _generateAndPublishArticle({
            title: item.title, keywords: item.keywords, existingTitles,
            transactionNote: `fila:${item.id}`,
          });
          existingTitles.push(item.title);
          await restRequest(`blog_schedule_queue?id=eq.${item.id}`, {
            method: 'PATCH', body: { status: 'published', blog_page_id: article.id }, prefer: 'return=minimal',
          });
          results.published.push({ id: item.id, title: item.title, slug: article.slug });
        } catch (itemErr) {
          console.error('[blog-cron] falha ao publicar item da fila:', item.id, itemErr.message);
          await restRequest(`blog_schedule_queue?id=eq.${item.id}`, {
            method: 'PATCH', body: { status: 'failed', error_note: itemErr.message }, prefer: 'return=minimal',
          }).catch(() => {});
          results.failed.push({ id: item.id, title: item.title, error: itemErr.message });
        }
      }
    }

    // 2. Geração automática por IA (se activada) — só corre se NENHUM item
    //    manual foi processado agora, para manter o ritmo previsível e não
    //    duplicar o "orçamento" de chamadas de IA da mesma execução.
    if (results.published.length === 0) {
      const settingsRows = await restRequest(
        `system_settings?key=in.(blog_autogen_enabled,blog_autogen_interval_days,blog_autogen_last_run,blog_monthly_limit)&select=key,value`
      );
      const settings = {};
      (settingsRows || []).forEach(r => { settings[r.key] = r.value; });

      const enabled      = settings.blog_autogen_enabled === 'true';
      const intervalDays = parseInt(settings.blog_autogen_interval_days, 10) || 7;
      const monthlyLimit = Math.max(1, parseInt(settings.blog_monthly_limit, 10) || 12);
      const lastRun       = settings.blog_autogen_last_run ? new Date(settings.blog_autogen_last_run) : null;
      const dueForAutogen = !lastRun || (Date.now() - lastRun.getTime()) >= intervalDays * 86400000;

      // Conta o que já está publicado ou agendado para o mês corrente, para
      // nunca deixar a geração automática ultrapassar o tecto mensal
      // (blog_monthly_limit) — o mesmo tecto que se aplica ao agendamento
      // manual em massa, para manter um ritmo de publicação que o Google
      // não veja como conteúdo em massa gerado por IA.
      const now        = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const [publishedThisMonth, pendingThisMonth] = await Promise.all([
        restRequest(`blog_pages?published_at=gte.${encodeURIComponent(monthStart)}&published_at=lt.${encodeURIComponent(monthEnd)}&select=id`),
        restRequest(`blog_schedule_queue?status=eq.pending&scheduled_at=gte.${encodeURIComponent(monthStart)}&scheduled_at=lt.${encodeURIComponent(monthEnd)}&select=id`),
      ]);
      const monthTotal = (publishedThisMonth?.length || 0) + (pendingThisMonth?.length || 0);
      const monthlyLimitReached = monthTotal >= monthlyLimit;

      if (monthlyLimitReached) {
        results.autogen = { skipped: 'monthly_limit_reached', monthTotal, monthlyLimit };
      } else if (enabled && dueForAutogen) {
        const existingPages = await restRequest('blog_pages?select=title');
        const pendingQueue  = await restRequest('blog_schedule_queue?status=eq.pending&select=title');
        const existingTitles = [
          ...(existingPages || []).map(p => p.title),
          ...(pendingQueue  || []).map(p => p.title),
        ];

        try {
          // Pedir à IA um título+subtema novo, derivado dos serviços do
          // MzDocs Pro mas ainda não coberto pelos artigos existentes.
          const ideaPrompt = `Sugere UM título de artigo de blog sobre documentos/burocracia em Moçambique (CVs, contratos, cartas, declarações, procurações, etc.), pensado para SEO.\n\nNÃO podes repetir nem parafrasear de perto nenhum destes títulos já publicados ou já agendados:\n${existingTitles.slice(0, 100).map(t => `- ${t}`).join('\n') || '(nenhum ainda)'}\n\nPode ser um subtema/ângulo derivado de um dos temas já existentes (ex: uma variante para outra profissão, outra província, outro tipo de documento relacionado), desde que seja claramente distinto.\n\nResponde APENAS em JSON válido, sem markdown: {"title":"...","keywords":"palavra1, palavra2, palavra3"}`;

          const ideaResult = await _callAiText(ideaPrompt, { maxTokens: 200, temperature: 0.8 });
          if (!ideaResult) throw new Error('IA indisponível para sugerir título.');

          let idea;
          try {
            const jsonMatch = ideaResult.text.match(/\{[\s\S]*\}/);
            idea = JSON.parse(jsonMatch ? jsonMatch[0] : ideaResult.text);
          } catch (_) {
            throw new Error('Resposta da IA não é JSON válido para o título sugerido.');
          }

          if (!idea?.title || _isTooSimilar(idea.title, existingTitles)) {
            throw new Error('Título sugerido pela IA repete conteúdo já existente — a saltar esta execução.');
          }

          const article = await _generateAndPublishArticle({
            title: idea.title, keywords: idea.keywords, existingTitles,
            transactionNote: 'autogen',
          });

          await restRequest('system_settings?key=eq.blog_autogen_last_run', {
            method: 'PATCH', body: { value: new Date().toISOString() }, prefer: 'return=minimal',
          });

          results.autogen = { title: idea.title, slug: article.slug };
        } catch (autoErr) {
          console.error('[blog-cron] geração automática falhou:', autoErr.message);
          results.autogen = { error: autoErr.message };
        }
      }
    }

    console.log('[blog-cron] concluído:', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('[blog-cron] erro geral:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT-USAGE (v40) — limites de downloads/edições por documento
// Antes vivia em api/document-usage.js; dobrado aqui para o projecto se
// manter dentro das 12 Serverless Functions do plano Vercel Hobby (ver
// vercel.json → rewrite "/api/document-usage" → "/api/misc", que faz o
// endpoint continuar acessível no mesmo URL de sempre, sem o front-end
// precisar de nenhuma alteração).
//
// GET  /api/document-usage?document_id=X
//   → estado actual (downloads/edições usados e limite, plano do documento)
// POST /api/document-usage  { action, document_id, kind? }
//   action = 'consume-download' | 'consume-edit' | 'unlock-extra'
//   kind   = 'download' | 'edit'   (só para 'unlock-extra')
//
// A lógica real (limites, contadores, protecção contra alteração directa
// pelo cliente) vive nas funções SECURITY DEFINER da base de dados — ver
// supabase/migration_v40_document_usage_limits.sql. Isto é só a camada
// HTTP fina por cima delas.
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  handleSitemap,
  handleBlogList,
  handleBlogCron,
  handleGithubDiagnostic,
};
