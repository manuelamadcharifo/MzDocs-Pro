// assets/js/services/MarketingTracker.js — Fase 1 do sistema de Marketing Analytics
//
// Responsabilidades:
//   1. Capturar ?src=... da URL (facebook, tiktok, qr001, uem, papelaria_001, etc.)
//   2. Persistir a origem + um visitor_id anónimo (localStorage, sobrevive
//      entre sessões — é assim que se atribui uma compra feita hoje a uma
//      visita de há 3 dias vinda do TikTok, por exemplo).
//   3. Registar 1 visita por sessão de browser (não por pageview — evita
//      inflacionar a tabela sempre que o utilizador navega dentro do site).
//   4. Expor window.marketingTracker.trackEvent(nome, extra) para qualquer
//      controller disparar eventos do funil (signup, compra, etc.).
//
// Filosofia: nunca deve poder quebrar nada. Todos os erros são engolidos
// silenciosamente — analytics é sempre "melhor esforço", nunca bloqueante.

const VISITOR_KEY  = 'mzd_visitor_id';
const SOURCE_KEY   = 'mzd_src';
const SESSION_FLAG = 'mzd_visit_logged';

function _uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = _uuid(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch (_) { return _uuid(); } // localStorage indisponível (modo privado, etc.) — degrada sem rebentar
}

function _getSource() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('src') || params.get('ref') && 'afiliado'; // ?ref=... (afiliados) conta como origem "afiliado" para o dashboard de marketing
    if (fromUrl) {
      localStorage.setItem(SOURCE_KEY, fromUrl.toLowerCase().slice(0, 50));
      return fromUrl.toLowerCase().slice(0, 50);
    }
    return localStorage.getItem(SOURCE_KEY) || 'direct';
  } catch (_) { return 'direct'; }
}

async function _post(action, payload) {
  try {
    await fetch(`/api/misc?_ns=marketing&_a=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // garante o envio mesmo se o utilizador navegar/fechar logo a seguir
    });
  } catch (_) { /* melhor-esforço — nunca propagar erro de analytics */ }
}

export const MarketingTracker = {
  visitorId: null,

  init() {
    this.visitorId = _getVisitorId();

    // 1 visita registada por separador/sessão (sessionStorage, não localStorage)
    // — abrir 5 páginas do site na mesma visita não conta como 5 visitas.
    let alreadyLogged = false;
    try { alreadyLogged = sessionStorage.getItem(SESSION_FLAG) === '1'; } catch (_) {}

    if (!alreadyLogged) {
      _post('visit', {
        visitor_id:   this.visitorId,
        source:       _getSource(),
        referrer:     document.referrer || '',
        landing_page: location.pathname + location.search,
        language:     navigator.language || '',
      });
      try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch (_) {}
    }

    return this;
  },

  // Chamar a partir de qualquer controller no momento exacto em que a acção
  // acontece. Exemplos:
  //   window.marketingTracker.trackEvent('signup');
  //   window.marketingTracker.trackEvent('credit_purchase', { value: 280, metadata: { pkg: 'basico' } });
  //   window.marketingTracker.trackEvent('document_generated', { document_type: 'cv' });
  trackEvent(event, { userId = null, documentType = null, value = null, metadata = {} } = {}) {
    if (!this.visitorId) this.visitorId = _getVisitorId();
    _post('event', {
      visitor_id:    this.visitorId,
      user_id:       userId,
      event,
      document_type: documentType,
      value,
      metadata,
    });
  },
};
