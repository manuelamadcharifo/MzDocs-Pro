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

 const docCtrl = new DocumentController(creditModel);
 const payCtrl = new PaymentController(creditModel);
 const ocrCtrl = new OCRController(docModel);
 const histCtrl = new HistoryController();

 docCtrl.docModel = docModel;
 ocrCtrl.docModel = docModel;

 window.paymentController = payCtrl;
 window.ocrController = ocrCtrl;
 window.docController = docCtrl;
 window.historyController = histCtrl;
 window.authManager = authManager;
 window.authUI = authUI;

 _setupAuthHeader();

 authManager.onChange(() => {
 authGuard.applyVisibility();
 });

 window.addEventListener('creditsChanged', e => {
 const val = e.detail;
 const el = document.getElementById('creditVal');
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
 const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
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

 console.log('[MzDocs Pro v7.1] Iniciado ✅ | Créditos:', creditModel.value);
}

async function _setupPushNotifications(registration) {
 if (!('Notification' in window) || !('PushManager' in window)) return;
 if (Notification.permission === 'granted') return;
 if (Notification.permission === 'denied') return;
 const permission = await Notification.requestPermission();
 if (permission !== 'granted') return;
 console.log('[MzDocs] Notificações push activadas ✅');
}

function _setupAuthHeader() {
 const authBtn = document.getElementById('authBtn');
 const userArea = document.getElementById('userArea');
 const userMenu = document.getElementById('userMenu');
 const guestBar = document.getElementById('guestBar');
 const btnGuestBuy = document.getElementById('btnGuestBuy');

 btnGuestBuy?.addEventListener('click', () => {
 window.paymentController?.openAsGuest();
 });

 authManager.onChange(user => {
 if (user && !user.is_anonymous) {
 if (authBtn) authBtn.style.display = 'none';
 if (userArea) userArea.style.display = 'flex';
 if (guestBar) guestBar.style.display = 'none';

 const fabLogout = document.getElementById('fabLogout');
 if (fabLogout) {
 fabLogout.style.display = 'flex';
 fabLogout.onclick = () => {
 if (confirm('Terminar sessão?')) {
 authManager.signOut().then(() => location.reload());
 }
 };
 }

 const phone = user.phone || user._profile?.phone || '';
 const email = user.email || user._profile?.email || '';
 const name = user._profile?.full_name || user.user_metadata?.full_name || (phone ? phone.slice(-4) : 'Utilizador');
 const initials = name.charAt(0).toUpperCase();
 const subtitle = email || phone || '';

 if (userMenu) {
 userMenu.innerHTML = `
 <div id="usrAvatarWrap" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 12px;border-radius:10px;transition:background .2s;">
   <div style="width:32px;height:32px;border-radius:50%;background:#07101f;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${initials}</div>
   <div style="display:flex;flex-direction:column;line-height:1.2;">
     <span style="font-size:13px;font-weight:600;color:#07101f;">${name}</span>
     <span style="font-size:11px;color:#6b7280;">${subtitle}</span>
   </div>
   <span style="font-size:12px;color:#9ca3af;">▼</span>
 </div>
 <div id="usrDropdown" style="display:none;position:absolute;top:100%;right:0;margin-top:6px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);min-width:200px;z-index:1000;overflow:hidden;">
   <div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;">
     <div style="font-size:13px;font-weight:600;color:#07101f;">${name}</div>
     <div style="font-size:11px;color:#6b7280;">${subtitle}</div>
   </div>
   <button id="btnLogout" style="width:100%;padding:10px 14px;border:none;background:none;text-align:left;font-size:13px;color:#dc2626;cursor:pointer;display:flex;align-items:center;gap:8px;">
     <span>🚪</span> Sair
   </button>
 </div>
 `;
 const wrap = document.getElementById('usrAvatarWrap');
 const drop = document.getElementById('usrDropdown');
 wrap?.addEventListener('click', e => {
 e.stopPropagation();
 if (drop.style.display === 'none' || drop.style.display === '') {
 drop.style.display = 'block';
 } else {
 drop.style.display = 'none';
 }
 });
 document.addEventListener('click', () => {
 if (drop) drop.style.display = 'none';
 }, { capture: true });
 document.getElementById('btnLogout')?.addEventListener('click', e => {
 e.stopPropagation();
 if (confirm('Terminar sessão?')) {
 authManager.signOut().then(() => location.reload());
 }
 });
 }

 _ensureLogoutButton();

 } else {
 if (authBtn) { authBtn.style.display = 'block'; authBtn.textContent = '🔐 Entrar'; authBtn.onclick = () => authUI.open('login'); }
 if (userArea) userArea.style.display = 'none';
 if (guestBar) guestBar.style.display = 'flex';
 const fabLogout = document.getElementById('fabLogout');
 if (fabLogout) fabLogout.style.display = 'none';

 const explicitLogout = document.getElementById('btnExplicitLogout');
 if (explicitLogout) explicitLogout.remove();
 }
 });
}

function _ensureLogoutButton() {
 let btn = document.getElementById('btnExplicitLogout');
 if (btn) return;

 const header = document.querySelector('header') || document.getElementById('mainHeader');
 if (!header) return;

 btn = document.createElement('button');
 btn.id = 'btnExplicitLogout';
 btn.textContent = '🚪 Sair';
 Object.assign(btn.style, {
 padding: '6px 12px',
 border: '1.5px solid #fca5a5',
 borderRadius: '8px',
 background: '#fef2f2',
 color: '#dc2626',
 fontSize: '12px',
 fontWeight: '600',
 cursor: 'pointer',
 marginLeft: '8px',
 });
 btn.onclick = () => {
 if (confirm('Terminar sessão?')) {
 authManager.signOut().then(() => location.reload());
 }
 };

 const userArea = document.getElementById('userArea');
 if (userArea && userArea.parentNode) {
 userArea.parentNode.insertBefore(btn, userArea.nextSibling);
 } else {
 header.appendChild(btn);
 }
}

if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', bootstrap);
} else {
 bootstrap();
}
