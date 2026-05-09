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

    // 8. Sandbox bar — mostrar apenas quando M-Pesa automático não está configurado
    try {
        const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
        const sandboxBar = document.getElementById('sandboxBar');
        if (sandboxBar) sandboxBar.style.display = cfg.isSandbox ? 'flex' : 'none';
    } catch { /* não crítico */ }

    // 9. Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('[MzDocs] SW registado ✅'))
            .catch(e => console.warn('[MzDocs] SW erro:', e));
    }

    console.log('[MzDocs Pro v6.0] Iniciado ✅ | Créditos:', creditModel.value);
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

            const phone    = user.phone || user._profile?.phone || '';
            const email    = user.email || user._profile?.email || '';
            const name     = user._profile?.full_name || user.user_metadata?.full_name || (phone ? phone.slice(-4) : 'Utilizador');
            const initials = name.charAt(0).toUpperCase();
            const subtitle = email || phone || '';

            if (userMenu) {
                // Avatar com dropdown — compacto em mobile, sem quebrar o header
                userMenu.innerHTML = `
                    <div class="usr-avatar-wrap" id="usrAvatarWrap" title="${name}">
                        <div class="usr-avatar">${initials}</div>
                        <div class="usr-dropdown" id="usrDropdown">
                            <div class="usr-dd-name">${name}</div>
                            <div class="usr-dd-sub">${subtitle}</div>
                            <hr class="usr-dd-sep">
                            <button class="usr-dd-btn" id="btnLogout">🚪 Terminar sessão</button>
                        </div>
                    </div>
                `;
                // Toggle dropdown ao clicar no avatar
                const wrap = document.getElementById('usrAvatarWrap');
                const drop = document.getElementById('usrDropdown');
                wrap?.addEventListener('click', e => {
                    e.stopPropagation();
                    drop.classList.toggle('open');
                });
                // Fechar ao clicar fora
                document.addEventListener('click', () => drop?.classList.remove('open'), { capture: true });
                document.getElementById('btnLogout')?.addEventListener('click', e => {
                    e.stopPropagation();
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