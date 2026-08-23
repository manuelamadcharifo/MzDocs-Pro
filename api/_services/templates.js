// api/_services/templates.js — MARKETPLACE DE TEMPLATES (extraído de
// api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Namespace /api/misc?_ns=templates&_a=<action> (e /api/templates/<action>).
// Move puro do bloco handleTemplates + todas as funções tpl* — nenhuma
// lógica alterada. api/misc.js continua a ser o único entrypoint HTTP.
// ──────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const {
  restRequest,
  rpc,
  insert,
  update,
  selectOne,
  getUserFromToken,
} = require('../_lib/supabaseAdmin');
const { loadPackagesFromSettings, estimateMznPerCredit } = require('../_lib/packages');
const { ORIGIN, parseBody, getAuthUser } = require('../_lib/httpHelpers');

async function handleTemplates(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  switch (action) {
    case 'list':        return tplList(req, res);
    case 'submit':      return tplSubmit(req, res);
    case 'rate':        return tplRate(req, res);
    case 'download':    return tplDownload(req, res);
    case 'approve':     return tplApprove(req, res);
    case 'reject':      return tplReject(req, res);
    case 'pending':     return tplPending(req, res);
    // ── Acções que faltavam (rotas já existiam no vercel.json e o
    // frontend templates.html já as chamava — só a implementação aqui
    // estava em falta). Usam REST puro (rpc/restRequest), sem o SDK
    // antigo, seguindo a função match_legal_chunks e tplList como
    // referência de estilo. Dependem das funções/views criadas na
    // migration_v12_community_templates.sql.
    case 'gallery':     return tplGallery(req, res);
    case 'mine':        return tplMine(req, res);
    case 'saved':       return tplSaved(req, res);
    case 'save':        return tplSave(req, res);
    case 'use':         return tplUse(req, res);
    case 'report':      return tplReport(req, res);
    case 'share-token': return tplShareToken(req, res);
    case 'by-token':    return tplByToken(req, res);
    case 'delete':      return tplDelete(req, res);
    // NOVO (v38): saldo de royalties e pedido de levantamento para quem
    // cria templates pagos — mesmo padrão já usado pelos afiliados.
    case 'earnings':    return tplEarnings(req, res);
    case 'withdraw':    return tplWithdraw(req, res);
    // NOVO: só afiliados ou parceiros aprovados podem VENDER templates na
    // Galeria (a plataforma não tem como pagar royalties a quem não está
    // associado ao projecto). Esta acção diz ao frontend se o utilizador
    // actual pode definir preço, para mostrar (ou esconder) essa parte do
    // formulário de submissão.
    case 'seller-status': return tplSellerStatus(req, res);
    default:            return res.status(404).json({ error: 'Acção de template não encontrada' });
  }
}

async function tplList(req, res) {
  const service = req.query?.service || null;
  const limit   = Math.min(parseInt(req.query?.limit || 50), 100);

  // CORRIGIDO (bug grave): esta função ignorava por completo req.query.id.
  // O frontend (templates.html → openDetail) chama isto como
  // "/list?id=eq.<uuid>&limit=1" para carregar UM template específico ao
  // clicar num card — mas como o "id" nunca era lido nem aplicado ao filtro,
  // a query executada era sempre "ORDER BY downloads DESC LIMIT 1", ou seja,
  // devolvia sempre o template mais descarregado do catálogo inteiro,
  // fosse qual fosse o id pedido. Resultado: clicar em QUALQUER card da
  // galeria abria sempre o mesmo modal (o template nº1 em downloads).
  //
  // Validamos o formato UUID em vez de concatenar req.query.id directamente
  // no path — sem isto, alguém podia injectar filtros extra do PostgREST
  // (ex: "...&id=neq.0&status=neq.approved") através da query string.
  const idMatch = /^(?:eq\.)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    .exec(String(req.query?.id || ''));
  const id = idMatch ? idMatch[1] : null;

  // CORRIGIDO: faltava template_html aqui — só template_css estava no
  // select. Sem o HTML, o frontend (templates.html → _buildSampleHtml)
  // nunca conseguia preencher os placeholders {{...}} com dados de
  // exemplo e caía sempre no fallback markdown genérico ("Título do
  // Documento de Exemplo... texto de demonstração"), mesmo para
  // templates com HTML real guardado na tabela.
  const fields  = 'id,service_type,template_name,description,thumbnail_url,template_html,template_css,downloads,likes,rating_sum,rating_count,created_at';
  let path = `templates_custom?status=eq.approved&is_public=eq.true&order=downloads.desc&limit=${limit}&select=${fields}`;
  if (service) path += `&service_type=eq.${encodeURIComponent(service)}`;
  if (id) path += `&id=eq.${id}`;
  try {
    const data = await restRequest(path);
    const templates = (Array.isArray(data) ? data : []).map(t => ({
      ...t,
      avg_rating: t.rating_count > 0 ? Math.round((t.rating_sum / t.rating_count) * 10) / 10 : null,
    }));
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error('[tplList] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os modelos. Tente novamente.' });
  }
}

// ── Elegibilidade para VENDER templates (créditos > 0) ─────────────────────
// REGRA DE NEGÓCIO: a plataforma só pode pagar royalties a quem já está
// associado ao projecto — afiliados aprovados (profiles.is_affiliate) ou
// parceiros aprovados e activos (tabela partners, ligados à conta via
// partners.linked_user_id — ver migration_v55). Um utilizador comum pode
// sempre criar e submeter os seus próprios templates (privados, ou
// públicos gratuitos), mas NUNCA lhes definir um preço em créditos.
// Esta função é a verificação "amigável" ao nível da aplicação — a
// garantia definitiva (que não depende de nenhum código de API estar
// correcto) é o trigger enforce_template_credit_eligibility na base de
// dados, que força credit_cost=0 em qualquer INSERT/UPDATE que viole esta
// regra, seja qual for o caminho usado para lá chegar.
async function isEligibleTemplateSeller(userId) {
  if (!userId) return false;
  try {
    const profile = await selectOne('profiles', 'id', userId, 'is_affiliate');
    if (profile?.is_affiliate) return true;
  } catch (_) { /* ignora — trata como não elegível */ }
  try {
    const rows = await restRequest(
      `partners?linked_user_id=eq.${userId}&status=eq.approved&active=eq.true&select=id&limit=1`
    );
    if (Array.isArray(rows) && rows.length) return true;
  } catch (_) { /* coluna pode não existir ainda — ver migration_v55 */ }
  return false;
}

// GET /api/templates/seller-status — usado pelo formulário "Submeter
// Template" para decidir se mostra a secção de preço/créditos ou uma
// mensagem a explicar como se tornar elegível para vender.
async function tplSellerStatus(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const eligible = await isEligibleTemplateSeller(user.id);
  // NOVO: devolve também a taxa MZN/crédito em vigor, para o formulário
  // "Submeter Template" mostrar "≈ X MZN" ao vivo enquanto o criador define
  // o preço — o mesmo cálculo que o admin já vê em /api/admin/templates
  // (mzn_per_credit), calculado a partir dos pacotes de créditos activos.
  let mznPerCredit = 0;
  try {
    const packages = await loadPackagesFromSettings();
    mznPerCredit = estimateMznPerCredit(packages);
  } catch (_) { /* falha a obter a taxa não deve bloquear o resto do formulário */ }
  return res.status(200).json({
    success: true, eligible,
    mzn_per_credit: Math.round(mznPerCredit * 100) / 100,
  });
}

async function tplSubmit(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body = parseBody(req);
  const { service_type, template_name, description, template_css, thumbnail_url, template_file, template_html } = body;
  if (!service_type || !template_name || !template_css)
    return res.status(400).json({ error: 'service_type, template_name e template_css são obrigatórios' });

  // CORRIGIDO: esta função nunca lia body.template_type nem body.tags —
  // o formulário em templates.html envia ambos (rádio "Comunidade"/
  // "Privado" + campo de tags), mas eram descartados em silêncio. Ficava
  // sempre gravado o valor por omissão da coluna (template_type =
  // 'community'), pelo que um template submetido como "Privado" nunca
  // recebia is_public/aprovação imediata nem share_token — ficava preso
  // como 'pending', igual a um template público comum, contrariando o que
  // o próprio formulário promete ("Templates privados são aprovados
  // imediatamente"). As tags eram sempre perdidas.
  const rawType = String(body.template_type || 'community').trim();
  const template_type = rawType === 'private' ? 'private' : 'community';
  const tags = Array.isArray(body.tags) ? body.tags.map(t => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 10) : [];

  // NOVO (v39): o cliente pode propor as suas próprias regras de venda —
  // o preço em CRÉDITOS (a mesma moeda usada em toda a plataforma; nunca
  // um valor monetário à parte) a cobrar de quem usar o seu template, e a
  // percentagem que fica para si. Esta percentagem é SEMPRE limitada
  // entre 60% e 70% (o resto, 30%-40%, fica para a plataforma), mesmo que
  // o valor enviado esteja fora da banda — nunca confiamos apenas na
  // validação do lado do cliente. A base de dados tem o mesmo limite via
  // CHECK constraint, como segunda camada de protecção. O admin continua
  // a poder rever/ajustar o preço em créditos antes de aprovar (ver
  // handleTemplates), tal como já acontecia com templates "premium".
  // Templates privados nunca são vendidos (credit_cost forçado a 0).
  // NOVO: só afiliados/parceiros aprovados podem vender templates — um
  // utilizador comum pode sempre submeter (privado, ou público gratuito),
  // mas nunca com preço em créditos. Isto é reforçado outra vez ao nível
  // da base de dados (trigger), mas verifica-se aqui também para devolver
  // uma mensagem clara em vez de o preço ser simplesmente ignorado.
  const canSell = template_type === 'private' ? false : await isEligibleTemplateSeller(user.id);

  const rawCost = parseInt(body.credit_cost, 10);
  // Limite do projecto: nenhuma operação cobra mais de 10 créditos (ver
  // VALID_COSTS em api/deduct-credit.js) — antes permitia até 50, um
  // template aprovado com esse preço nunca poderia sequer ser debitado.
  const requestedCost = Number.isFinite(rawCost) ? Math.min(10, Math.max(0, rawCost)) : 0;
  const credit_cost = canSell ? requestedCost : 0;
  const blockedSale  = !canSell && requestedCost > 0; // pediu preço mas não é elegível
  const rawShare = parseFloat(body.author_share_percent);
  const author_share_percent = Number.isFinite(rawShare)
    ? Math.min(70, Math.max(60, rawShare))
    : 65; // omisso → 65%, o valor intermédio da banda permitida

  // Templates privados: aprovação imediata (só o autor os vê, ou quem tiver
  // o link secreto) — mesma regra já implementada na função Postgres
  // submit_template (migration_v12), replicada aqui porque esta rota usa
  // insert() directo em vez dessa RPC.
  const isPrivate   = template_type === 'private';
  const share_token = isPrivate ? crypto.randomBytes(16).toString('hex') : null;

  let data;
  try {
    data = await insert('templates_custom', {
      user_id: user.id,
      service_type:  service_type.trim().slice(0, 50),
      template_name: template_name.trim().slice(0, 100),
      description:   (description || '').trim().slice(0, 300),
      template_html: (template_html || '').slice(0, 20000),
      template_css:  template_css.slice(0, 20000),
      thumbnail_url: thumbnail_url || null,
      template_file: template_file || null,
      tags,
      template_type,
      share_token,
      status:        isPrivate ? 'approved' : 'pending',
      is_public:     false, // mesmo aprovado, um template privado nunca entra na galeria pública
      credit_cost,
      author_share_percent,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({
    success: true, id: data.id, share_token,
    message: isPrivate
      ? 'Template privado guardado! Já pode partilhar o link.'
      : blockedSale
        ? 'Template submetido gratuitamente. Só afiliados ou parceiros aprovados podem vender templates na plataforma — torne-se afiliado para poder definir um preço da próxima vez.'
        : credit_cost > 0
          ? `Template submetido com preço de ${credit_cost} créditos (${author_share_percent}% para si). Aguarda aprovação.`
          : 'Template submetido! Aguarda aprovação.',
  });
}

async function tplRate(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, rating, comment } = parseBody(req);
  if (!template_id || !rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'template_id e rating (1-5) são obrigatórios' });
  try {
    const data = await rpc('rate_template', {
      p_template_id: template_id, p_user_id: user.id,
      p_rating: parseInt(rating), p_comment: (comment || '').slice(0, 500),
    });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function tplDownload(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { template_id, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    await rpc('increment_template_downloads', { p_template_id: template_id });
  } catch (_) { /* contador é best-effort */ }
  try {
    await insert('template_downloads', { template_id, session_id: session_id || null });
  } catch (_) { /* registo de download é best-effort */ }
  return res.status(200).json({ ok: true });
}

async function tplApprove(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id } = parseBody(req);
  await rpc('approve_template', { p_template_id: template_id });
  return res.status(200).json({ success: true });
}

async function tplReject(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { template_id, note } = parseBody(req);
  await rpc('reject_template', { p_template_id: template_id, p_note: note || '' });
  return res.status(200).json({ success: true });
}

async function tplPending(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const data = await restRequest(
    'templates_custom?status=eq.pending&order=created_at.asc&select=id,service_type,template_name,description,thumbnail_url,status,created_at,user_id'
  );
  return res.status(200).json({ success: true, templates: data || [] });
}

// ── Auxiliar: extrair utilizador autenticado a partir do header
// Authorization, via REST puro (sem o SDK antigo) — usado pelas 9 funções
// abaixo, todas adicionadas para completar o que templates.html (página
// de marketplace comunitário) já chamava mas api/misc.js ainda não tinha
// implementado. Devolve null em vez de lançar erro — cada função decide
// se autenticação é obrigatória ou opcional (ex: 'use' regista a sessão
// mesmo sem login, via session_id).

// GET /api/templates/gallery?sort=&limit=&offset=&type=
// Usa a view v_templates_gallery (migration_v12) — já calcula avg_rating
// e popularity_score, e já filtra status='approved' AND is_public=true.
async function tplGallery(req, res) {
  const limit   = Math.min(parseInt(req.query?.limit || 24), 50);
  const offset  = Math.max(parseInt(req.query?.offset || 0), 0);
  const sort    = req.query?.sort || 'popular';
  const type    = req.query?.type || null;
  // v39: mini filtro Grátis/Pagos na Galeria Comunitária — os templates são
  // sempre pagos em créditos (credit_cost), nunca um valor MZN à parte.
  const pricing = req.query?.pricing || null; // 'free' | 'paid'

  const sortColumn = {
    popular: 'popularity_score',
    recent:  'created_at',
    rating:  'avg_rating',
    downloads: 'downloads',
  }[sort] || 'popularity_score';

  let path = `v_templates_gallery?order=${sortColumn}.desc.nullslast&limit=${limit}&offset=${offset}`;
  if (type)    path += `&template_type=eq.${encodeURIComponent(type)}`;
  if (pricing === 'free') path += `&credit_cost=eq.0`;
  if (pricing === 'paid') path += `&credit_cost=gt.0`;

  try {
    const templates = await restRequest(path);
    return res.status(200).json({ success: true, templates: Array.isArray(templates) ? templates : [] });
  } catch (err) {
    console.error('[tplGallery] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar a galeria. Tente novamente.' });
  }
}

// GET /api/templates/mine — templates submetidos pelo utilizador autenticado.
// Usa a view v_my_templates (já filtra por auth.uid() no lado do Postgres,
// mas como chamamos com a service_role key — que ignora RLS — filtramos
// explicitamente por user_id aqui em vez de confiar em auth.uid()).
async function tplMine(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    // CORRIGIDO: faltavam template_html e template_css no select — sem
    // eles, o preview real do documento não conseguia ser mostrado na
    // aba "Os Meus" (mesmo bug da galeria pública, ver
    // migration_v23_fix_gallery_view_html_css.sql).
    // CORRIGIDO: faltavam também is_public, credit_cost, author_share_percent
    // e template_type — o criador não conseguia ver se o seu template já
    // (ou ainda não) estava mesmo visível na galeria pública, nem quanto
    // preço/percentagem ficou definido para ele (ver migration_v54).
    const templates = await restRequest(
      `templates_custom?user_id=eq.${user.id}&order=created_at.desc&select=id,service_type,template_name,description,thumbnail_url,status,is_public,template_type,rejection_note,use_count,downloads,is_featured,credit_cost,author_share_percent,template_html,template_css,created_at,share_token`
    );
    return res.status(200).json({ success: true, templates: Array.isArray(templates) ? templates : [] });
  } catch (err) {
    console.error('[tplMine] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os seus templates.' });
  }
}

// GET /api/templates/saved — templates guardados pelo utilizador na sua
// colecção pessoal (tabela template_saves, join com templates_custom).
async function tplSaved(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    const saves = await restRequest(
      `template_saves?user_id=eq.${user.id}&select=template_id,templates_custom(id,service_type,template_name,description,thumbnail_url,downloads,use_count,likes,rating_count,template_type,template_html,template_css,created_at)`
    );
    const templates = (Array.isArray(saves) ? saves : [])
      .map(s => s.templates_custom)
      .filter(Boolean);
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error('[tplSaved] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os templates guardados.' });
  }
}

// POST /api/templates/save  { template_id }
// Alterna guardar/remover da colecção pessoal — usa toggle_save_template
// (migration_v12), que já trata o INSERT/DELETE atomicamente.
async function tplSave(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('toggle_save_template', { p_template_id: template_id, p_user_id: user.id });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplSave] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível guardar o template.' });
  }
}

// POST /api/templates/use  { template_id, service_key }
// Regista que o template foi efectivamente aplicado a um documento
// (diferente de 'download' — ver comentário em template_uses na
// migration_v12). Login não é exigido aqui pelo frontend (templates.html
// já valida currentUser antes de chamar, mas mantemos tolerante a
// session_id para não bloquear o fluxo de geração caso a sessão expire).
async function tplUse(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  const { template_id, service_key, session_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('use_template', {
      p_template_id: template_id,
      p_user_id: user?.id || null,
      p_session_id: session_id || null,
      p_service_key: service_key || '',
    });
    // NOVO (v39): repartição de receita entre o criador do template
    // (vendedor) e a plataforma, sempre entre 60%-70% para o criador e
    // 30%-40% para a plataforma (author_share_percent, definido pelo
    // próprio cliente ao submeter o template — ver tplSubmit — e
    // validado/limitado a essa banda tanto no servidor como por CHECK
    // constraint na base de dados).
    //
    // IMPORTANTE: quem usa o template paga sempre em CRÉDITOS
    // (credit_cost, a mesma moeda já usada em toda a plataforma) — nunca
    // um valor monetário à parte. O valor em MZN só existe internamente,
    // para o criador poder levantar via M-Pesa: convertemos os créditos
    // gastos para MZN usando a taxa média (dinâmica) dos pacotes activos
    // — a mesma fonte de verdade do checkout — nunca um valor fixo.
    if (result?.success && user?.id && (result.credit_cost || 0) > 0) {
      const packages    = await loadPackagesFromSettings();
      const mznPerCredit = estimateMznPerCredit(packages);
      const amountMzn    = Math.round(result.credit_cost * mznPerCredit * 100) / 100;
      rpc('process_template_sale', {
        p_template_id:   template_id,
        p_buyer_id:      user.id,
        p_credits_spent: result.credit_cost,
        p_amount_mzn:    amountMzn,
      }).catch(e => console.warn('[tplUse] process_template_sale falhou:', e.message));
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplUse] erro:', err.message);
    // Não bloquear o fluxo de aplicação do template por falha no registo
    // de uso — o utilizador já está a navegar para a página de geração
    // quando isto é chamado (ver templates.html → useTemplate()).
    return res.status(200).json({ success: false });
  }
}

// POST /api/templates/report  { template_id, reason, detail? }
// reason deve ser um dos valores aceites pelo CHECK de template_reports:
// 'spam' | 'inappropriate' | 'copyright' | 'poor_quality' | 'other'
async function tplReport(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id, reason, detail } = parseBody(req);
  const motivosValidos = ['spam', 'inappropriate', 'copyright', 'poor_quality', 'other'];
  if (!template_id || !motivosValidos.includes(reason)) {
    return res.status(400).json({ error: 'template_id e reason (spam|inappropriate|copyright|poor_quality|other) são obrigatórios' });
  }
  try {
    await insert('template_reports', {
      template_id,
      reporter_id: user.id,
      reason,
      detail: (detail || '').slice(0, 500),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tplReport] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível enviar o relatório.' });
  }
}

// POST /api/templates/share-token  { template_id }
// Gera (ou regenera) o token de partilha de um template privado — só o
// dono pode fazê-lo (verificado dentro de regenerate_share_token, SQL).
async function tplShareToken(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const result = await rpc('regenerate_share_token', { p_template_id: template_id, p_user_id: user.id });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tplShareToken] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível gerar o link de partilha.' });
  }
}

// GET /api/templates/by-token?token=...
// Acesso público a um template privado partilhado por link directo —
// não exige autenticação (o token É a autorização).
async function tplByToken(req, res) {
  const token = req.query?.token || '';
  if (!token) return res.status(400).json({ error: 'token obrigatório' });
  try {
    const rows = await restRequest(
      `templates_custom?share_token=eq.${encodeURIComponent(token)}&select=id,service_type,template_name,description,template_html,template_css,thumbnail_url,downloads,use_count&limit=1`
    );
    const template = Array.isArray(rows) ? rows[0] : null;
    if (!template) return res.status(404).json({ error: 'Link inválido ou expirado' });
    return res.status(200).json({ success: true, template });
  } catch (err) {
    console.error('[tplByToken] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar o template.' });
  }
}

// POST /api/templates/delete  { template_id }
// Só o dono pode apagar o seu próprio template — verificado explicitamente
// aqui (não delegado a uma função RPC) porque é uma operação destrutiva e
// simples o suficiente para validar directamente.
async function tplDelete(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { template_id } = parseBody(req);
  if (!template_id) return res.status(400).json({ error: 'template_id obrigatório' });
  try {
    const rows = await restRequest(`templates_custom?id=eq.${template_id}&select=user_id`);
    const tpl = Array.isArray(rows) ? rows[0] : null;
    if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado' });
    if (tpl.user_id !== user.id) return res.status(403).json({ success: false, error: 'Não autorizado' });
    await restRequest(`templates_custom?id=eq.${template_id}`, { method: 'DELETE' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tplDelete] erro:', err.message);
    return res.status(500).json({ success: false, error: 'Não foi possível apagar o template.' });
  }
}

// GET /api/templates/earnings — saldo e histórico de vendas de templates
// pagos criados pelo próprio utilizador (v38: repartição de receita).
async function tplEarnings(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  try {
    const profile = await selectOne('profiles', 'id', user.id, 'template_author_balance,template_author_total_earned');
    const sales = await restRequest(
      `template_sales?author_id=eq.${user.id}&order=created_at.desc&limit=50` +
      `&select=id,template_id,amount_mzn,author_share_mzn,created_at,templates_custom(template_name)`
    );
    const withdrawals = await restRequest(
      `template_withdrawals?author_id=eq.${user.id}&order=created_at.desc&limit=20` +
      `&select=id,amount,status,created_at,processed_at`
    );
    return res.status(200).json({
      success: true,
      balance:      profile?.template_author_balance || 0,
      total_earned: profile?.template_author_total_earned || 0,
      sales:        sales || [],
      withdrawals:  withdrawals || [],
    });
  } catch (err) {
    console.error('[tplEarnings] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível carregar os ganhos.' });
  }
}

// POST /api/templates/withdraw  { amount, phone } — pedido de levantamento
// de royalties de templates. Mesmo padrão de validação de affWithdraw
// (número M-Pesa, saldo suficiente, sem pedido duplicado pendente).
async function tplWithdraw(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseFloat(body.amount || 0);
  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });
  if (!Number.isFinite(amount) || amount <= 0)
    return res.status(400).json({ error: 'Valor inválido' });
  // NOVO (pedido do fundador — controlo administrativo): antes disto não
  // existia NENHUM valor mínimo de levantamento para royalties de
  // templates (só para afiliados, ver affWithdraw acima). Lê o mesmo
  // padrão de system_settings, editável em Configurações → "Templates —
  // Royalties de Criadores".
  const minSetting = await selectOne('system_settings', 'key', 'tpl_min_withdraw', 'value');
  const minWithdraw = parseInt(minSetting?.value || '100');
  if (amount < minWithdraw) return res.status(400).json({ error: `Valor mínimo: ${minWithdraw} MZN` });
  const profile = await selectOne('profiles', 'id', user.id, 'template_author_balance');
  if (amount > (profile?.template_author_balance || 0))
    return res.status(400).json({ error: 'Saldo insuficiente' });
  const pendingW = await restRequest(`template_withdrawals?author_id=eq.${user.id}&status=eq.pending&select=id&limit=1`);
  if (pendingW && pendingW.length > 0)
    return res.status(400).json({ error: 'Já tem um levantamento pendente. Aguarde a conclusão.' });
  try {
    await insert('template_withdrawals', { author_id: user.id, amount, mpesa_phone: phone, status: 'pending' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  await update('profiles', 'id', user.id, { template_author_balance: (profile.template_author_balance || 0) - amount });
  insert('admin_notifications', {
    type:    'withdrawal_request',
    title:   '💸 Pedido de levantamento — royalties de template',
    message: `${amount} MZN para ${phone}. Processar em até 48h.`,
    link:    '#templates',
  }).catch(e => console.warn('[tplWithdraw] admin_notifications insert falhou:', e.message));
  return res.status(200).json({ success: true, message: `Pedido de ${amount} MZN submetido. Processado em até 48 horas via M-Pesa.` });
}

// ════════════════════════════════════════════════════════════════════════════
// AFILIADOS  (/api/affiliate/:action) — v2 Pro (segmentos, ranking, antifraude)
// ════════════════════════════════════════════════════════════════════════════

module.exports = { handleTemplates };
