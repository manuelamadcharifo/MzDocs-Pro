// assets/js/app.js — MVC Entry Point

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
    // 1. Aguardar auth inicializar (evita race condition)
    await authManager.ready();

    // 2. Modelos
    const creditModel = new CreditModel();
    await creditModel.init();
    const docModel = new DocumentModel();

    // Instancia editor globalmente antes dos controllers
    window.documentEditor = new DocumentEditor();

    // 3. Controllers
    const docCtrl = new DocumentController(creditModel);
    const payCtrl = new PaymentController(creditModel);
    const ocrCtrl = new OCRController(docModel);
    const histCtrl = new HistoryController();

    docCtrl.docModel = docModel;
    ocrCtrl.docModel = docModel;

    // Expor globalmente para HTML inline
    window.paymentController = payCtrl;
    window.ocrController = ocrCtrl;
    window.docController = docCtrl;
    window.historyController = histCtrl;
    window.authManager = authManager;
    window.authUI = authUI;

    // 4. Auth UI — botão "Entrar" abre o modal correcto (AuthUI.js)
    _setupAuthHeader();

    // 5. Aplicar visibilidade por auth state
    authManager.onChange(() => {
        authGuard.applyVisibility();
    });

    // 6. Créditos — actualizar pill no header (só visível quando autenticado)
    window.addEventListener('creditsChanged', e => {
        const val  = e.detail;
        const el   = document.getElementById('creditVal');
        if (el) el.textContent = val;
        const chip = document.getElementById('creditPill');
        if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';
    });

    window.dispatchEvent(new CustomEvent('creditsChanged', { detail: creditModel.value }));

    // 7. FAB WhatsApp
    const { UserModel } = await import('./models/Models.js');
    const userModel = new UserModel();
    const fab = document.getElementById('fabWa');
    if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

    // 8. Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('[MzDocs] SW registado ✅'))
            .catch(e => console.warn('[MzDocs] SW erro:', e));
    }

    console.log('[MzDocs Pro v3.1] Iniciado ✅ | Créditos:', creditModel.value);
}

// ─── Header Auth UI ──────────────────────────────────────────────────────────
function _setupAuthHeader() {
    const authBtn  = document.getElementById('authBtn');
    const userArea = document.getElementById('userArea');
    const userMenu = document.getElementById('userMenu');
    const guestBar = document.getElementById('guestBar');
    const btnGuestBuy = document.getElementById('btnGuestBuy');

    // Botão de acesso avulso no banner de visitante
    btnGuestBuy?.addEventListener('click', () => {
        window.paymentController?.openAsGuest();
    });

    authManager.onChange(user => {
        if (user && !user.is_anonymous) {
            // ── AUTENTICADO ───────────────────────────────────────────
            if (authBtn)  authBtn.style.display  = 'none';
            if (userArea) userArea.style.display  = 'flex';
            if (guestBar) guestBar.style.display  = 'none';

            const phone    = user.phone || '';
            const name     = user.user_metadata?.full_name || (phone ? phone.slice(-4) : 'Utilizador');
            const initials = name.charAt(0).toUpperCase();

            if (userMenu) {
                userMenu.innerHTML = `
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#1D4ED8);
                        color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;
                        cursor:default;" title="${name}">${initials}</div>
                    <button id="btnLogout" style="padding:6px 12px;background:#f1f5f9;border:none;border-radius:8px;
                        font-size:12px;cursor:pointer;color:#64748b;">🚪 Sair</button>
                `;
                document.getElementById('btnLogout')?.addEventListener('click', () => {
                    authManager.signOut().then(() => location.reload());
                });
            }
        } else {
            // ── VISITANTE ─────────────────────────────────────────────
            if (authBtn)  { authBtn.style.display = 'block'; authBtn.textContent = '🔐 Entrar'; authBtn.onclick = () => authUI.open('login'); }
            if (userArea) userArea.style.display  = 'none';
            if (guestBar) guestBar.style.display  = 'flex';
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}