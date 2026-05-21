// assets/js/app.js — MVC Entry Point v7.1

import { Storage } from './utils/Storage.js';
import { CreditModel, DocumentModel } from './models/Models.js';
import { DocumentController } from './controllers/DocumentController.js';
import { PaymentController } from './controllers/PaymentController.js';
import { OCRController } from './controllers/OCRController.js';
import { HistoryController } from './controllers/HistoryController.js';
import { authManager } from './auth/AuthManager.js';
import { authUI } from './auth/AuthUI.js';
import { authGuard } from './auth/AuthGuard.js';
import { DocumentEditor } from './components/DocumentEditor.js';

async function bootstrap() {
  await authManager.ready();

  const creditModel = new CreditModel();
  await creditModel.init();
  const docModel = new DocumentModel();

  window.documentEditor = new DocumentEditor();

  const docCtrl  = new DocumentController(creditModel);
  const payCtrl  = new PaymentController(creditModel);
  const ocrCtrl  = new OCRController(docModel);
  const histCtrl = new HistoryController();

  docCtrl.docModel = docModel;
  ocrCtrl.docModel = docModel;

  window.paymentController  = payCtrl;
  window.ocrController      = ocrCtrl;
  window.docController      = docCtrl;
  window.historyController  = histCtrl;
  window.authManager        = authManager;
  window.authUI             = authUI;

  _setupAuthHeader();

  authManager.onChange(() => {
    authGuard.applyVisibility();
  });

  window.addEventListener('creditsChanged', e => {
    const val = e.detail;
    const el  = document.getElementById('creditVal');
    if (el) el.textContent = val;
    const chip = document.getElementById('creditPill');
    if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';
  });

  window.dispatchEvent(new CustomEvent('creditsChanged', { detail: creditModel.value }));

  const { UserModel } = await import('./models/Models.js');
  const userModel = new UserModel();
  const fab = document.getElementById('fabWa');
  if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

  try {
    const cfg        = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
    const sandboxBar = document.getElementById('sandboxBar');
    if (sandboxBar) sandboxBar.style.display = cfg.isSandbox ? 'flex' : 'none';
  } catch { }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[MzDocs] SW registado ✅');
      authManager.onChange(user => {
        if (user && !user.is_anonymous) {
          _setupPushNotifications(registration).catch(() => {});
        }
      });
    } catch (e) {
      console.warn('[MzDocs] SW erro:', e);
    }
  }

  console.log('[MzDocs Pro v9] Iniciado ✅ | Créditos:', creditModel.value);

  // ── Escape global: fecha qualquer modal aberto ──────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Fechar todos os overlays com classe .open
    document.querySelectorAll('.open[id]').forEach(el => el.classList.remove('open'));
    document.body.style.overflow = '';
    // Libertar qualquer botão de geração bloqueado
    const btnGen = document.getElementById('btnGen');
    if (btnGen) { btnGen.disabled = false; btnGen.style.opacity = ''; }
  });

  // ── Watchdog: se body.overflow ficar 'hidden' sem modal aberto, corrigir ─
  setInterval(() => {
    const hasOpenModal = !!document.querySelector('.open[id]');
    if (!hasOpenModal && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
      console.warn('[MzDocs] Watchdog: overflow corrigido automaticamente');
    }
  }, 3000);
}

async function _setupPushNotifications(registration) {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  console.log('[MzDocs] Notificações push activadas ✅');
}

// Singleton: listener de fechar dropdown registado só uma vez
let _dropdownListenerAttached = false;

function _setupAuthHeader() {
  const authBtn     = document.getElementById('authBtn');
  const userArea    = document.getElementById('userArea');
  const userMenu    = document.getElementById('userMenu');
  const guestBar    = document.getElementById('guestBar');
  const btnGuestBuy = document.getElementById('btnGuestBuy');

  btnGuestBuy?.addEventListener('click', () => {
    window.paymentController?.openAsGuest();
  });

  authManager.onChange(user => {
    if (user && !user.is_anonymous) {
      // ── Autenticado ─────────────────────────────────────────────────────────
      if (authBtn)  authBtn.style.display  = 'none';
      if (userArea) userArea.classList.add('visible');
      if (guestBar) guestBar.style.display = 'none';

      // FAB logout (só visível em mobile via CSS)
      const fabLogout = document.getElementById('fabLogout');
      if (fabLogout) {
        fabLogout.style.display = 'flex';
        fabLogout.onclick = () => {
          if (confirm('Terminar sessão?')) {
            authManager.signOut().then(() => location.reload());
          }
        };
      }

      // Dados do utilizador
      const phone    = user.phone || user._profile?.phone || '';
      const email    = user.email || user._profile?.email || '';
      const name     = user._profile?.full_name
                    || user.user_metadata?.full_name
                    || (phone ? `···${phone.slice(-4)}` : 'Utilizador');
      const initials = name.charAt(0).toUpperCase();
      const subtitle = email || phone || '';

      // Usar classes CSS do styles.css — sem inline styles
      if (userMenu) {
        userMenu.innerHTML = `
          <div class="usr-avatar-wrap" id="usrAvatarWrap">
            <div class="usr-avatar" title="${name}">${initials}</div>
            <div class="usr-dropdown" id="usrDropdown">
              <div class="usr-dd-name">${name}</div>
              <div class="usr-dd-sub">${subtitle}</div>
              <hr class="usr-dd-sep"/>
              <button class="usr-dd-btn" id="btnLogout">🚪 Terminar sessão</button>
            </div>
          </div>
        `;

        const wrap = document.getElementById('usrAvatarWrap');
        const drop = document.getElementById('usrDropdown');

        wrap?.addEventListener('click', e => {
          e.stopPropagation();
          drop?.classList.toggle('open');
        });

        document.getElementById('btnLogout')?.addEventListener('click', e => {
          e.stopPropagation();
          if (confirm('Terminar sessão?')) {
            authManager.signOut().then(() => location.reload());
          }
        });

        if (!_dropdownListenerAttached) {
          _dropdownListenerAttached = true;
          document.addEventListener('click', () => {
            document.getElementById('usrDropdown')?.classList.remove('open');
          }, { capture: true });
        }
      }

    } else {
      // ── Não autenticado ─────────────────────────────────────────────────────
      if (authBtn) {
        authBtn.style.display = 'block';
        authBtn.textContent   = '🔐 Entrar';
        authBtn.onclick       = () => authUI.open('login');
      }
      if (userArea) userArea.classList.remove('visible');
      if (guestBar) guestBar.style.display = 'flex';

      const fabLogout = document.getElementById('fabLogout');
      if (fabLogout) fabLogout.style.display = 'none';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
