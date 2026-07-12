// assets/js/marketplace/TemplateLibrary.js
// Biblioteca de templates para todos os serviços — arquitectura extensível
// Cada template define: id, name, description, category, cssVars, previewCss
// Nenhuma function Vercel adicional — tudo client-side
//
// Antes: os ~1450 templates de todas as categorias estavam definidos inline
// neste ficheiro (objecto TEMPLATE_LIBRARY de ~1600 linhas).
// Agora: cada categoria vive no seu próprio módulo em ./templates/<categoria>.js
// e são agregados em ./templates/index.js. Nenhum template foi alterado.

import { TEMPLATE_LIBRARY } from './templates/index.js';
export { TEMPLATE_LIBRARY };

// ── Serviços sem IA — sem templates visuais (usam WhatsApp) ───────────────
// impressao, foto, conversao não têm templates porque não geram documento

// ── Helpers públicos ──────────────────────────────────────────────────────

/** Devolve a lista de templates para um serviço */
export function getTemplates(serviceKey) {
  return TEMPLATE_LIBRARY[serviceKey] || [];
}

/** Sessão de templates dinâmicos (modelo próprio, extraídos de imagem).
 *  Declarado ANTES das funções que o referenciam para evitar TDZ (Temporal Dead Zone). */
const _sessionTemplates = {};  // { serviceKey: [template, ...] }

/** Devolve um template por id — procura primeiro na sessão, depois na biblioteca */
export function getTemplateById(serviceKey, templateId) {
  // CORRIGIDO: procurar também nos templates de sessão (modelo próprio, extraídos de imagem).
  // Bug anterior: só pesquisava TEMPLATE_LIBRARY — templates dinâmicos (MEU, modelo próprio,
  // extraídos de imagem via _handleUpload) nunca eram encontrados, logo _pick() ficava com
  // this._tpl = null e o botão "Usar este Modelo" não aplicava nada.
  const sessionList = (_sessionTemplates[serviceKey] || []);
  return sessionList.find(t => t.id === templateId)
      || (TEMPLATE_LIBRARY[serviceKey] || []).find(t => t.id === templateId)
      || null;
}

/** Devolve o template por defeito de um serviço (primeiro da lista) */
export function getDefaultTemplate(serviceKey) {
  const list = TEMPLATE_LIBRARY[serviceKey] || [];
  return list[0] || null;
}

/** Adiciona um template gerado dinamicamente (ex: extraído de imagem do utilizador) à sessão */

// ── Persistência em localStorage ─────────────────────────────────────────────
// CORRIGIDO: antes os templates de sessão (extraídos de imagem) ficavam apenas
// em memória RAM — desapareciam a cada reload. Agora são persistidos em
// localStorage com limite de 5 templates por serviço (htmlTemplate pode ser
// grande, então guardamos apenas os campos essenciais para reconstruir o card).
const LS_KEY = 'mzdocs_session_templates_v1';

function _lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (_) { return {}; }
}

function _lsSave(all) {
  try {
    // Limitar a 5 templates por serviço para não encher o localStorage
    const trimmed = {};
    for (const [key, list] of Object.entries(all)) {
      trimmed[key] = list.slice(0, 5);
    }
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[TemplateLibrary] localStorage save falhou:', e.message);
  }
}

// Carregar do localStorage na inicialização
(function _lsInit() {
  const saved = _lsLoad();
  for (const [key, list] of Object.entries(saved)) {
    if (Array.isArray(list) && list.length > 0) {
      _sessionTemplates[key] = list;
    }
  }
})();

export function addSessionTemplate(serviceKey, template) {
  if (!_sessionTemplates[serviceKey]) _sessionTemplates[serviceKey] = [];
  // Não persistir cards de processamento temporários
  const skip = template._isProcessing || template.name?.startsWith('⏳');
  // Remover se já existe com mesmo id
  _sessionTemplates[serviceKey] = _sessionTemplates[serviceKey].filter(t => t.id !== template.id);
  _sessionTemplates[serviceKey].unshift(template); // adicionar no topo
  // Persistir no localStorage (excepto cards temporários)
  if (!skip) _lsSave(_sessionTemplates);
}

export function getSessionTemplates(serviceKey) {
  return _sessionTemplates[serviceKey] || [];
}

export function removeSessionTemplate(serviceKey, templateId) {
  if (!_sessionTemplates[serviceKey]) return;
  _sessionTemplates[serviceKey] = _sessionTemplates[serviceKey].filter(t => t.id !== templateId);
  _lsSave(_sessionTemplates);
}

/** Lista de todos os serviços que têm templates */
export const SERVICES_WITH_TEMPLATES = Object.keys(TEMPLATE_LIBRARY);

/**
 * Carrega templates do Supabase para a sessão:
 * — Templates públicos aprovados (visíveis a todos)
 * — Templates do próprio utilizador em qualquer estado (pending, approved, rejected)
 *   para que ele veja os seus uploads sem ter que re-extrair da imagem.
 * @param {string} serviceKey
 * @returns {Promise<Array>} lista de templates carregados
 */
export async function loadPublicTemplatesFromSupabase(serviceKey) {
  try {
    const supabase = window.authManager?.supabase;
    if (!supabase) return [];

    const userId = window.authManager?.user?.id;

    // ── Construir query: aprovados públicos + os do próprio user ─────────────
    // CORRIGIDO: antes só carregava status='approved' AND is_public=true.
    // O utilizador que fez upload ficava a ver sempre "Modelo Próprio" genérico
    // porque o seu template estava 'pending' e nunca era devolvido pela query.
    // Agora fazemos duas queries e juntamos os resultados.
    let publicData = [];
    let userOwnData = [];

    // 1. Templates públicos aprovados
    const { data: pub, error: pubErr } = await supabase
      .from('templates_custom')
      .select('id, template_name, description, template_html, template_css, service_type, downloads, rating_sum, rating_count, status, user_id, credit_cost, price_mzn')
      .eq('service_type', serviceKey)
      .eq('status', 'approved')
      .eq('is_public', true)
      .order('downloads', { ascending: false })
      .limit(20);

    if (!pubErr && pub?.length) publicData = pub;

    // 2. Templates do próprio utilizador (todos os estados)
    if (userId) {
      const { data: own, error: ownErr } = await supabase
        .from('templates_custom')
        .select('id, template_name, description, template_html, template_css, service_type, downloads, rating_sum, rating_count, status, user_id, credit_cost, price_mzn')
        .eq('service_type', serviceKey)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!ownErr && own?.length) userOwnData = own;
    }

    // Juntar e desduplicar (os próprios do user primeiro)
    const seen = new Set();
    const allData = [...userOwnData, ...publicData].filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    if (!allData.length) return [];

    const loaded = [];
    for (const row of allData) {
      // Evitar duplicados com templates já na sessão (ex: extraído desta sessão)
      if (_sessionTemplates[serviceKey]?.find(t => t.id === row.id)) continue;

      const avgRating = row.rating_count > 0
        ? (row.rating_sum / row.rating_count).toFixed(1)
        : null;

      // Badge de estado para templates do próprio user ainda pendentes
      const isOwnPending  = row.user_id === window.authManager?.user?.id && row.status === 'pending';
      const isOwnRejected = row.user_id === window.authManager?.user?.id && row.status === 'rejected';
      const statusSuffix  = isOwnPending  ? ' ⏳' : isOwnRejected ? ' ❌' : '';

      const tpl = {
        id:           row.id,
        name:         row.template_name + statusSuffix,
        description:  row.description || `⭐ ${avgRating || '?'} · ${row.downloads || 0} downloads`,
        preview:      { accent: '#3B82F6', bg: '#fff', font: 'sans-serif' },
        htmlTemplate: row.template_html || '',
        css:          row.template_css || '',
        _fromMarketplace: true,
        _isOwnPending:    isOwnPending,
        _downloads:   row.downloads || 0,
        // NOVO (v38 — filtro grátis/pago no selector de modelos): um
        // template do marketplace é pago se o criador definiu preço em
        // créditos (credit_cost) ou em MZN (price_mzn) ao submetê-lo.
        credit_cost:  row.credit_cost || 0,
        price_mzn:    row.price_mzn || 0,
        _isFree:      !((row.credit_cost || 0) > 0 || (row.price_mzn || 0) > 0),
      };

      addSessionTemplate(serviceKey, tpl);
      loaded.push(tpl);
    }

    return loaded;
  } catch (e) {
    console.warn('[TemplateLibrary] loadPublicTemplatesFromSupabase:', e.message);
    return [];
  }
}
