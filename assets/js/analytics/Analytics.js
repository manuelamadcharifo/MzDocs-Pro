// assets/js/analytics/Analytics.js — MzDocs Pro Analytics v1.0
// Módulo centralizado para GA4, Facebook Pixel e Microsoft Clarity
// Usa window.gtag / window.fbq / window.clarity como wrappers seguros
// IDs configurados no index.html via variáveis globais

export const Analytics = {

  // ── Eventos de Autenticação ───────────────────────────────────────────────

  trackSignUp(method = 'email') {
    this._gtag('event', 'sign_up', { method });
    this._fbq('track', 'CompleteRegistration');
  },

  trackLogin(method = 'email') {
    this._gtag('event', 'login', { method });
  },

  // ── Eventos de Documento ──────────────────────────────────────────────────

  trackDocumentStart(serviceKey, creditCost) {
    this._gtag('event', 'begin_checkout', {
      service_type: serviceKey,
      credit_cost:  creditCost,
    });
    this._fbq('track', 'InitiateCheckout', {
      value:    creditCost * 50,
      currency: 'MZN',
    });
  },

  trackDocumentGenerated(serviceKey, creditCost, docId = '') {
    const txId = docId || `doc_${Date.now()}`;
    this._gtag('event', 'purchase', {
      transaction_id: txId,
      value:          creditCost * 50,
      currency:       'MZN',
      items: [{
        item_name:     serviceKey,
        item_category: 'document',
        quantity:      1,
        price:         creditCost * 50,
      }],
    });
    // Incrementar contador de docs gerados no localStorage
    try {
      const count = parseInt(localStorage.getItem('mz_docs_count') || '0', 10);
      localStorage.setItem('mz_docs_count', String(count + 1));
    } catch (_) {}
  },

  // NOVO v2.1: amostra grátis (_previewMode) — evento separado de
  // trackDocumentGenerated porque NÃO é uma conversão/compra (sem custo de
  // crédito), apenas um sinal de interesse/funil. Útil para medir taxa de
  // conversão preview → geração paga.
  trackPreviewGenerated(serviceKey) {
    this._gtag('event', 'view_item', {
      service_type: serviceKey,
      preview:      true,
    });
  },

  // ── Eventos de Pagamento ──────────────────────────────────────────────────

  trackCreditPurchase(amount, paymentId = '') {
    this._gtag('event', 'purchase', {
      transaction_id: paymentId || `pay_${Date.now()}`,
      value:          amount,
      currency:       'MZN',
    });
    this._fbq('track', 'Purchase', { value: amount, currency: 'MZN' });
  },

  // ── Eventos de Upsell / Referral ─────────────────────────────────────────

  trackUpsellShown(plan = 'starter') {
    this._gtag('event', 'upsell_shown', { plan });
    this._fbq('track', 'InitiateCheckout', { value: 500, currency: 'MZN' });
  },

  trackReferralCopied() {
    this._gtag('event', 'referral_link_copied');
  },

  trackReferralWhatsApp() {
    this._gtag('event', 'referral_whatsapp_shared');
  },

  // ── Eventos de Landing Page ───────────────────────────────────────────────

  trackModalOpen(modalType = 'register') {
    this._gtag('event', 'modal_open', { modal_type: modalType });
  },

  trackServiceSelected(serviceKey) {
    this._gtag('event', 'select_content', {
      content_type: 'service',
      item_id:      serviceKey,
    });
  },

  trackCTAClick(buttonText, location = 'header') {
    this._gtag('event', 'cta_click', {
      button_text:     buttonText,
      button_location: location,
    });
  },

  // ── Setup de Scroll Depth (chamar 1x na landing page) ────────────────────

  initScrollDepth() {
    if (typeof window === 'undefined') return;
    const scrollMarks = [25, 50, 75, 90];
    const fired = new Set();
    window.addEventListener('scroll', () => {
      const scrollable = document.body.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = (window.scrollY / scrollable) * 100;
      scrollMarks.forEach(mark => {
        if (pct >= mark && !fired.has(mark)) {
          fired.add(mark);
          this._gtag('event', 'scroll_depth', { percent: mark });
        }
      });
    }, { passive: true });
  },

  // ── Utilidades internas ───────────────────────────────────────────────────

  _gtag(...args) {
    try {
      if (typeof window.gtag === 'function') window.gtag(...args);
    } catch (_) {}
  },

  _fbq(...args) {
    try {
      if (typeof window.fbq === 'function') window.fbq(...args);
    } catch (_) {}
  },
};
