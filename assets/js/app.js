// ═══════════════════════════════════════════════════════════
// MzDocs Pro v4 — app.js
// Entry point: inicialização, routing, event delegation
// ═══════════════════════════════════════════════════════════

import { Storage } from './utils/Storage.js';
import { supabaseConfig } from './config/supabase.js';
import { NotificationView, ModalView } from './views/Views.js';
import { CreditModel, DocumentModel, QueueModel, UserModel } from './models/Models.js';
import { DocumentController, PaymentController, OCRController, AdminController } from './controllers/Controllers.js';

// ── ESTADO GLOBAL ──────────────────────────────────────────
class AppState {
  constructor() {
    this.isReady    = false;
    this.user       = null;
    this.session    = null;
    this.isAdmin    = false;
    this.controllers = {};
    this.models      = {};
  }
}
const appState = new AppState();

// ── ROUTER SIMPLES ─────────────────────────────────────────
const Router = {
  navigate(route) {
    if (route === 'home') {
      ModalView.close('formOverlay');
      ModalView.close('payOverlay');
      ModalView.close('resultOverlay');
    } else if (route === 'payment') {
      appState.controllers.payment?.showPricing?.();
    }
  }
};

// ── GESTÃO DE SESSÃO ───────────────────────────────────────
async function checkSession() {
  try {
    await supabaseConfig.getInstance();
    const user = supabaseConfig.getUser();
    appState.user    = user;
    appState.session = supabaseConfig.getSession();
    return !!user;
  } catch (e) {
    console.warn('[Session] Falhou:', e.message);
    return false;
  }
}

// ── EVENT DELEGATION ───────────────────────────────────────
const EventDelegation = {
  init() {
    document.addEventListener('click', e => {
      const t = e.target;
      const closest = sel => t.closest(sel);

      // Cards de serviço (nova classe v4)
      const svcCard = closest('.svc-card[data-svc]');
      if (svcCard) {
        appState.controllers.document?.open(svcCard.dataset.svc);
        return;
      }

      // Header: créditos e comprar
      if (t.id === 'creditPill' || t.closest('#creditPill')) {
        appState.controllers.payment?.showPricing?.();
        return;
      }
      if (t.id === 'btnTopup' || t.closest('#btnTopup')) {
        appState.controllers.payment?.showPricing?.();
        return;
      }

      // Fechar modais
      if (t.id === 'formClose')   { ModalView.close('formOverlay');   return; }
      if (t.id === 'resultClose') { ModalView.close('resultOverlay'); return; }
      if (t.id === 'payClose')    { ModalView.close('payOverlay');    return; }

      // Fechar ao clicar no backdrop
      if (t.id === 'formOverlay')   { ModalView.close('formOverlay');   return; }
      if (t.id === 'resultOverlay') { ModalView.close('resultOverlay'); return; }
      if (t.id === 'payOverlay')    { ModalView.close('payOverlay');    return; }

      // Planos de preço
      const planCard = closest('.plan-card[data-pkg]');
      if (planCard) {
        document.querySelectorAll('.plan-card').forEach(p => p.classList.remove('sel'));
        planCard.classList.add('sel');
        appState.controllers.payment?.selectPkg?.(planCard, planCard.dataset.pkg);
        return;
      }

      // Botões de resultado
      if (t.id === 'btnCopy')     { appState.controllers.document?.copyDoc?.();     return; }
      if (t.id === 'btnDl')       { appState.controllers.document?.downloadDoc?.(); return; }
      if (t.id === 'btnWaResult') { appState.controllers.document?.sendWA?.();      return; }

      // Geração e WhatsApp directo
      if (t.id === 'btnGen')      { appState.controllers.document?.generate?.();    return; }
      if (t.id === 'btnWaDirect') { appState.controllers.document?.sendDirect?.();  return; }

      // Pagamento
      if (t.id === 'btnPay') { appState.controllers.payment?.pay?.(); return; }

      // OCR
      if (t.id === 'btnCam')       { appState.controllers.ocr?.trigger?.('cam');   return; }
      if (t.id === 'btnFile')      { appState.controllers.ocr?.trigger?.('file');  return; }
      if (t.id === 'btnUseOcr')    { appState.controllers.ocr?.use?.();            return; }
      if (t.id === 'btnDiscardOcr'){ appState.controllers.ocr?.discard?.();        return; }
    });

    // Input: telefone
    document.addEventListener('input', e => {
      if (e.target.id === 'phoneInput') {
        appState.controllers.payment?.onPhoneInput?.(e.target);
      }
    });

    // Change: OCR file input
    document.addEventListener('change', e => {
      if (e.target.id === 'ocrInput') {
        appState.controllers.ocr?.processFile?.(e);
      }
    });

    // ESC fecha modais
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (ModalView.isOpen('resultOverlay')) { ModalView.close('resultOverlay'); return; }
        if (ModalView.isOpen('formOverlay'))   { ModalView.close('formOverlay');   return; }
        if (ModalView.isOpen('payOverlay'))    { ModalView.close('payOverlay');    return; }
      }
    });

    console.log('[EventDelegation] Inicializado');
  }
};

// ── UI WATCHERS ────────────────────────────────────────────
function setupWatchers() {
  // Créditos mudaram
  window.addEventListener('creditsChanged', e => {
    const val = e.detail;

    const creditVal = document.getElementById('creditVal');
    if (creditVal) creditVal.textContent = val ?? '0';

    const creditBtn = document.getElementById('creditPill');
    if (creditBtn) {
      creditBtn.style.borderColor = val === 0 ? '#EF4444' : '';
    }

    // Actualizar banner de créditos gratuitos
    const freeKey  = Storage.getFreeKey();
    const freeUsed = Storage.get(freeKey, 0);
    const freeLeft = Math.max(0, 3 - freeUsed);
    const freeLeftEl = document.getElementById('freeLeft');
    if (freeLeftEl) freeLeftEl.textContent = freeLeft;

    // Esconder banner se esgotados
    if (freeLeft === 0) {
      const freeBar = document.getElementById('freeBar');
      if (freeBar) freeBar.style.display = 'none';
    }
  });

  // Admin verificado
  window.addEventListener('admin-verified', e => {
    appState.isAdmin = true;
    console.log('[App] Admin:', e.detail?.role);
  });

  // Auth Supabase
  window.addEventListener('supabase-auth-change', e => {
    appState.user = e.detail?.user || null;
  });

  console.log('[Watchers] Prontos');
}

// ── SHORTCUTS DE URL (?s=cv, etc.) ────────────────────────
function handleURLShortcuts() {
  const params = new URLSearchParams(window.location.search);
  const svc    = params.get('s');
  if (svc) {
    // Aguardar controladores
    setTimeout(() => {
      appState.controllers.document?.open?.(svc);
    }, 400);
  }
}

// ── INICIALIZAÇÃO ──────────────────────────────────────────
async function initialize() {
  if (appState.isReady) return;
  console.log('[App] A inicializar MzDocs Pro v4…');

  try {
    // 1. Supabase (não bloqueia)
    await supabaseConfig.getInstance().catch(e => {
      console.warn('[App] Supabase adiado:', e.message);
    });
    window.supabaseConfig = supabaseConfig;

    // 2. Sessão
    await checkSession();

    // 3. Modelos
    const creditModel = new CreditModel();
    await creditModel.init();

    const docModel  = new DocumentModel();
    const userModel = new UserModel();

    appState.models = { creditModel, docModel, userModel };

    // 4. Controladores
    const docCtrl   = new DocumentController(creditModel);
    docCtrl.docModel = docModel;

    const payCtrl   = new PaymentController();
    const ocrCtrl   = new OCRController(docModel);
    ocrCtrl.docModel = docModel;

    const adminCtrl = new AdminController();

    appState.controllers = {
      document: docCtrl,
      payment:  payCtrl,
      ocr:      ocrCtrl,
      admin:    adminCtrl,
    };

    // Expor globalmente (retrocompatibilidade)
    window.paymentController = payCtrl;
    window.ocrController     = ocrCtrl;
    window.docController     = docCtrl;
    window.adminController   = adminCtrl;
    window.appState          = appState;
    window.Router            = Router;

    // 5. Watchers UI
    setupWatchers();

    // 6. Event delegation
    EventDelegation.init();

    // 7. FAB WhatsApp
    const fab = document.getElementById('fabWa');
    if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

    // 8. Emitir créditos iniciais
    window.dispatchEvent(new CustomEvent('creditsChanged', {
      detail: creditModel.value
    }));

    // 9. URL shortcuts (ex: mzdocs.app/?s=cv)
    handleURLShortcuts();

    appState.isReady = true;
    console.log('[App] ✅ Pronto | Créditos:', creditModel.value);

  } catch (error) {
    console.error('[App] Falha na inicialização:', error);
    NotificationView.error('Erro ao carregar a aplicação. Refresca a página.');
  }
}

// ── ENTRY POINT ────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
