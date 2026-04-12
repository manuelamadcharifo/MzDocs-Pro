// ═══════════════════════════════════════════════════════════════════════════
// MzDocs Pro v3 — Main Application Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// Proper MVC initialization with routing, session management, and event delegation

import { Storage } from './utils/Storage.js';
import { supabaseConfig } from './config/supabase.js';
import { NotificationView, ModalView } from './views/Views.js';
import { CreditModel, DocumentModel, QueueModel, UserModel } from './models/Models.js';
import { DocumentController, PaymentController, OCRController, AdminController } from './controllers/Controllers.js';

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION STATE MANAGER
// ═══════════════════════════════════════════════════════════════════════════
class AppState {
  constructor() {
    this.isReady = false;
    this.user = null;
    this.session = null;
    this.isAdmin = false;
    this.currentPage = 'home';
    this.controllers = {};
    this.models = {};
  }

  reset() {
    this.user = null;
    this.session = null;
    this.isAdmin = false;
  }
}

const appState = new AppState();

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE ROUTER
// ═══════════════════════════════════════════════════════════════════════════
const Router = {
  currentRoute: 'home',

  routes: {
    home: () => {
      document.getElementById('formOverlay')?.classList.remove('open');
      document.getElementById('payOverlay')?.classList.remove('open');
      document.getElementById('resultOverlay')?.classList.remove('open');
      document.body.style.overflow = '';
    },
    payment: () => {
      if (appState.controllers.payment) {
        ModalView.open('payOverlay');
      }
    },
    admin: () => {
      if (!appState.isAdmin) {
        NotificationView.warn('⚠️ Acesso negado: apenas admins');
        return;
      }
      // Route to admin panel if it exists
      console.log('[Router] Admin panel requested');
    }
  },

  navigate(route) {
    if (!this.routes[route]) {
      console.warn('[Router] Unknown route:', route);
      return;
    }
    this.currentRoute = route;
    appState.currentPage = route;
    this.routes[route]();
    console.log('[Router] Navigated to:', route);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
async function checkSession() {
  try {
    const supabase = await supabaseConfig.getInstance();
    const session = supabaseConfig.getSession();
    const user = supabaseConfig.getUser();

    appState.session = session;
    appState.user = user;

    if (user && session) {
      console.log('[Session] User authenticated:', user.email);
      return true;
    } else {
      console.log('[Session] No active session');
      return false;
    }
  } catch (error) {
    console.error('[Session] Check failed:', error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT DELEGATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
const EventDelegation = {
  handlers: {
    // Document grid service cards (open form)
    '.sc[data-svc]': (el) => {
      appState.controllers.document?.open(el.dataset.svc);
    },

    // Credit pill & topup button (open pricing)
    '#creditPill': () => appState.controllers.payment?.showPricing?.(),
    '#btnTopup': () => appState.controllers.payment?.showPricing?.(),

    // Form close buttons
    '#formClose': () => ModalView.close('formOverlay'),
    '#resultClose': () => ModalView.close('resultOverlay'),
    '#payClose': () => ModalView.close('payOverlay'),

    // Package selection
    '.pkg': (el) => {
      const pkgId = el.dataset.pkg;
      if (pkgId && appState.controllers.payment) {
        document.querySelectorAll('.pkg').forEach(p => p.classList.remove('sel'));
        el.classList.add('sel');
        appState.controllers.payment.selectPkg(el, pkgId);
      }
    },

    // Result action buttons
    '#btnCopy': () => appState.controllers.document?.copyDoc?.(),
    '#btnDl': () => appState.controllers.document?.downloadDoc?.(),
    '#btnWaResult': () => appState.controllers.document?.sendWA?.(),

    // Form generation button
    '#btnGen': () => appState.controllers.document?.generate?.(),

    // Direct WhatsApp button
    '#btnWaDirect': () => appState.controllers.document?.sendDirect?.(),

    // Payment button
    '#btnPay': () => appState.controllers.payment?.pay?.(),

    // OCR buttons
    '#btnCam': (el) => appState.controllers.ocr?.trigger?.('cam'),
    '#btnFile': (el) => appState.controllers.ocr?.trigger?.('file'),
    '#btnUseOcr': () => appState.controllers.ocr?.use?.(),
    '#btnDiscardOcr': () => appState.controllers.ocr?.discard?.(),

    // Modal overlay clicks (close if clicking outside)
    '#formOverlay': (el, e) => {
      if (e.target.id === 'formOverlay') ModalView.close('formOverlay');
    },
    '#payOverlay': (el, e) => {
      if (e.target.id === 'payOverlay') ModalView.close('payOverlay');
    },
    '#resultOverlay': (el, e) => {
      if (e.target.id === 'resultOverlay') ModalView.close('resultOverlay');
    }
  },

  init() {
    document.addEventListener('click', (e) => {
      const target = e.target;

      // Check direct ID match
      if (this.handlers[`#${target.id}`]) {
        this.handlers[`#${target.id}`](target, e);
        return;
      }

      // Check class and attribute matches
      for (const selector in this.handlers) {
        if (selector.startsWith('.') || selector.includes('[')) {
          if (target.matches(selector)) {
            this.handlers[selector](target, e);
            return;
          }
        }
      }
    });

    // Input event delegations
    document.addEventListener('input', (e) => {
      const target = e.target;

      // Phone input validation
      if (target.id === 'phoneInput') {
        appState.controllers.payment?.onPhoneInput?.(target);
      }

      // Form field inputs
      if (target.classList.contains('fi') || target.classList.contains('fta') || 
          target.classList.contains('fs')) {
        // Form input tracking can go here
      }
    });

    // Change event delegations
    document.addEventListener('change', (e) => {
      const target = e.target;

      // OCR file input
      if (target.id === 'ocrInput') {
        appState.controllers.ocr?.processFile?.(e);
      }
    });

    console.log('[EventDelegation] System initialized');
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UI STATE WATCHERS
// ═══════════════════════════════════════════════════════════════════════════
function setupWatchers() {
  // Credits changed
  window.addEventListener('creditsChanged', (e) => {
    const val = e.detail;
    const creditVal = document.getElementById('creditVal');
    if (creditVal) creditVal.textContent = val;

    const creditPill = document.getElementById('creditPill');
    if (creditPill) {
      creditPill.style.borderColor = val === 0 ? '#EF4444' : '';
    }

    // Update free credits banner
    const freeKey = Storage.getFreeKey();
    const freeUsed = Storage.get(freeKey, 0);
    const freeLeft = Math.max(0, 3 - freeUsed);
    const freeLeftEl = document.getElementById('freeLeft');
    if (freeLeftEl) freeLeftEl.textContent = freeLeft;

    if (freeLeft === 0) {
      const freeBar = document.getElementById('freeBar');
      if (freeBar) freeBar.style.display = 'none';
    }
  });

  // Admin verified
  window.addEventListener('admin-verified', (e) => {
    appState.isAdmin = true;
    console.log('[App] Admin verified:', e.detail.role);
    // Show admin-only UI elements here if needed
  });

  // Supabase auth change
  window.addEventListener('supabase-auth-change', (e) => {
    const { event: authEvent, user } = e.detail;
    appState.user = user;
    console.log('[App] Auth changed:', authEvent, user?.email || 'signed out');
  });

  // Payment state changes
  window.addEventListener('creditsBalanceUpdated', (e) => {
    console.log('[App] Credits balance updated:', e.detail.credits);
  });

  window.addEventListener('creditsConsumed', (e) => {
    console.log('[App] Credits consumed:', e.detail);
  });

  console.log('[Watchers] Setup complete');
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════
async function initialize() {
  if (appState.isReady) return; // Prevent double initialization

  console.log('[App] Initialization starting…');

  try {
    // Step 1: Initialize Supabase (non-blocking)
    await supabaseConfig.getInstance().catch(e => {
      console.warn('[App] Supabase init delayed:', e.message);
    });
    window.supabaseConfig = supabaseConfig;

    // Step 2: Check active session
    const hasSession = await checkSession();
    if (!hasSession) {
      console.log('[App] No session found');
    }

    // Step 3: Initialize Models
    const creditModel = new CreditModel();
    await creditModel.init();

    const docModel = new DocumentModel();
    const userModel = new UserModel();

    appState.models = { creditModel, docModel, userModel };

    // Step 4: Initialize Controllers
    const docCtrl = new DocumentController(creditModel);
    docCtrl.docModel = docModel;

    const payCtrl = new PaymentController();
    const ocrCtrl = new OCRController(docModel);
    ocrCtrl.docModel = docModel;

    const adminCtrl = new AdminController();

    // Store in state for event delegation
    appState.controllers = {
      document: docCtrl,
      payment: payCtrl,
      ocr: ocrCtrl,
      admin: adminCtrl
    };

    // Expose globally for backward compatibility
    window.paymentController = payCtrl;
    window.ocrController = ocrCtrl;
    window.docController = docCtrl;
    window.adminController = adminCtrl;

    // Step 5: Setup UI watchers
    setupWatchers();

    // Step 6: Initialize event delegation
    EventDelegation.init();

    // Step 7: FAB WhatsApp
    const fab = document.getElementById('fabWa');
    if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

    // Step 8: Service Worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('[App] Service Worker registered ✅'))
        .catch(e => console.warn('[App] Service Worker error:', e.message));
    }

    // Step 9: Trigger initial UI update
    window.dispatchEvent(new CustomEvent('creditsChanged', { 
      detail: creditModel.value 
    }));

    // Mark as ready
    appState.isReady = true;
    window.appState = appState; // Expose for debugging

    console.log('[App] Initialization complete ✅');
    console.log('[App] MzDocs Pro v3 running | Credits:', creditModel.value);
  } catch (error) {
    console.error('[App] Initialization failed:', error);
    NotificationView.error('❌ Erro ao inicializar aplicação');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT — Proper DOMContentLoaded handling
// ═══════════════════════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
  // DOM still loading
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] DOM ready');
    initialize();
  });
} else {
  // DOM already loaded (e.g., script loaded late)
  console.log('[App] DOM already ready');
  initialize();
}

// Expose router for debugging
window.Router = Router;
