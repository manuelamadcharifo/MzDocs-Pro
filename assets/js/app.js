// assets/js/app.js — MVC Entry Point

import { Storage } from './utils/Storage.js';
import { CreditModel, DocumentModel } from './models/Models.js';
import { DocumentController } from './controllers/DocumentController.js';
import { PaymentController } from './controllers/PaymentController.js';
import { OCRController } from './controllers/OCRController.js';
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

    docCtrl.docModel = docModel;
    ocrCtrl.docModel = docModel;

    // Expor globalmente para HTML inline
    window.paymentController = payCtrl;
    window.ocrController = ocrCtrl;
    window.docController = docCtrl;
    window.authManager = authManager;
    window.authUI = authUI;

    // 4. Auth UI — botão "Entrar" abre o modal correcto (AuthUI.js)
    _setupAuthHeader();

    // 5. Aplicar visibilidade por auth state
    authManager.onChange(() => {
        authGuard.applyVisibility();
        _updateCreditBanner(creditModel);
    });

    // 6. Créditos
    window.addEventListener('creditsChanged', e => {
        const val = e.detail;
        const el = document.getElementById('creditVal');
        if (el) el.textContent = val;
        const chip = document.getElementById('creditPill');
        if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';
        _updateCreditBanner(creditModel);
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
    const authBtn = document.getElementById('authBtn');
    const userMenu = document.getElementById('userMenu');
    const creditPill = document.getElementById('creditPill');
    const btnTopup = document.getElementById('btnTopup');

    authManager.onChange(user => {
        if (user) {
            // Utilizador autenticado
            if (authBtn) authBtn.style.display = 'none';
            if (userMenu) {
                userMenu.style.display = 'flex';
                const phone = user.phone || '';
                const name = user.user_metadata?.full_name || (phone ? phone.slice(-4) : 'Utilizador');
                const initials = name.charAt(0).toUpperCase();
                userMenu.innerHTML = `
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${initials}</div>
                    <span style="font-size:13px;font-weight:600;color:#334155;">${name}</span>
                    <button id="btnLogout" style="padding:6px 12px;background:#f1f5f9;border:none;border-radius:8px;font-size:12px;cursor:pointer;color:#64748b;">🚪 Sair</button>
                `;
                document.getElementById('btnLogout')?.addEventListener('click', () => {
                    authManager.signOut().then(() => location.reload());
                });
            }
            if (creditPill) creditPill.style.display = 'flex';
            if (btnTopup) btnTopup.style.display = 'block';
        } else {
            // Visitante
            if (authBtn) {
                authBtn.style.display = 'block';
                authBtn.textContent = '🔐 Entrar';
                authBtn.onclick = () => authUI.open('login'); // abre modal correcto
            }
            if (userMenu) userMenu.style.display = 'none';
            if (creditPill) creditPill.style.display = 'flex';
            if (btnTopup) btnTopup.style.display = 'block';
        }
    });
}

function _updateCreditBanner(creditModel) {
    const freeKey = Storage.getFreeKey();
    const freeUsed = Storage.get(freeKey, 0);
    const freeLeft = Math.max(0, 3 - freeUsed);
    const el2 = document.getElementById('freeLeft');
    if (el2) el2.textContent = freeLeft;
    const bar = document.getElementById('freeBar');
    if (bar && freeLeft === 0) bar.style.display = 'none';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}