// assets/js/app.js — MVC Entry Point
// Importa e instancia todos os módulos em ordem correcta

import { Storage } from './utils/Storage.js';
import { CreditModel, DocumentModel } from './models/Models.js';
import { DocumentController } from './controllers/DocumentController.js';
import { PaymentController } from './controllers/PaymentController.js';
import { OCRController } from './controllers/OCRController.js';
import { authManager } from './auth/AuthManager.js';

// ═════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═════════════════════════════════════════════════════════════════════════════
async function bootstrap() {
    // 1. Criar modelos singleton
    const creditModel = new CreditModel();
    await creditModel.init();

    const docModel = new DocumentModel();

    // 2. Criar controllers (injectando dependências)
    const docCtrl = new DocumentController(creditModel);
    const payCtrl = new PaymentController(creditModel);
    const ocrCtrl = new OCRController(docModel);

    // Passar docModel ao docCtrl (para OCR)
    docCtrl.docModel = docModel;
    ocrCtrl.docModel = docModel;

    // Expor globalmente para acesso em HTML inline (compatibilidade)
    window.paymentController = payCtrl;
    window.ocrController = ocrCtrl;
    window.docController = docCtrl;
    window.authManager = authManager;

    // 3. Configurar UI de autenticação
    setupAuthUI();

    // 4. Actualizar UI de créditos ao mudar
    window.addEventListener('creditsChanged', e => {
        const val = e.detail;
        const el = document.getElementById('creditVal');
        if (el) el.textContent = val;
        const chip = document.getElementById('creditPill');
        if (chip) chip.style.borderColor = val === 0 ? '#EF4444' : '';

        // Atualizar banner de créditos gratuitos
        const freeKey = Storage.getFreeKey();
        const freeUsed = Storage.get(freeKey, 0);
        const freeLeft = Math.max(0, 3 - freeUsed);
        const el2 = document.getElementById('freeLeft');
        if (el2) el2.textContent = freeLeft;
        if (freeLeft === 0) {
            const bar = document.getElementById('freeBar');
            if (bar) bar.style.display = 'none';
        }
    });

    // Trigger inicial
    window.dispatchEvent(new CustomEvent('creditsChanged', { detail: creditModel.value }));

    // 5. FAB WhatsApp
    const { UserModel } = await import('./models/Models.js');
    const userModel = new UserModel();
    const fab = document.getElementById('fabWa');
    if (fab) fab.href = `https://wa.me/${userModel.WA_SUPPORT}`;

    // 6. Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('[MzDocs] SW registado ✅'))
            .catch(e => console.warn('[MzDocs] SW erro:', e));
    }

    console.log('[MzDocs Pro v3.1] Iniciado — MVC ✅ | Créditos:', creditModel.value);
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH UI — Integração inline (não depende de AuthUI.js)
// ═════════════════════════════════════════════════════════════════════════════
function setupAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userMenu = document.getElementById('userMenu');
    const creditPill = document.getElementById('creditPill');
    const btnTopup = document.getElementById('btnTopup');

    // Escutar mudanças de auth
    authManager.onChange((user, session) => {
        updateAuthUI(user);
    });

    function updateAuthUI(user) {
        if (user) {
            // Utilizador logado
            if (authBtn) authBtn.style.display = 'none';
            if (userMenu) {
                userMenu.style.display = 'flex';
                const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilizador';
                userMenu.innerHTML = `
                    <div class="user-avatar" style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${name.charAt(0).toUpperCase()}</div>
                    <span class="user-name" style="font-size:13px;font-weight:600;color:#334155;">${name}</span>
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
                authBtn.onclick = () => {
                    // Abrir modal de login simples ou redirecionar
                    const email = prompt('Email:');
                    if (!email) return;
                    const password = prompt('Password:');
                    if (!password) return;
                    authManager.signIn(email, password)
                        .then(() => location.reload())
                        .catch(err => alert('Erro: ' + err.message));
                };
            }
            if (userMenu) userMenu.style.display = 'none';
            if (creditPill) creditPill.style.display = 'flex'; // Mostrar mesmo offline
            if (btnTopup) btnTopup.style.display = 'block';
        }
    }
}

// Aguardar DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}