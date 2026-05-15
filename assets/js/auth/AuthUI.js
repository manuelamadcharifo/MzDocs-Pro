// assets/js/auth/AuthUI.js
import { authManager } from './AuthManager.js';

export class AuthUI {
 constructor() {
 this.overlay = null;
 this._createOverlay();
 this._bindEvents();
 }

 _createOverlay() {
 if (document.getElementById('authOverlay')) {
 this.overlay = document.getElementById('authOverlay');
 return;
 }
 const div = document.createElement('div');
 div.innerHTML = `
 <div id="authOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;align-items:center;justify-content:center;">
   <div style="background:#fff;border-radius:18px;width:92%;max-width:420px;max-height:90vh;overflow-y:auto;padding:28px;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
     <button id="authClose" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:24px;cursor:pointer;color:#9ca3af;">✕</button>

     <div id="authLogin" class="auth-view">
       <h2 style="margin:0 0 8px;font-size:20px;color:#07101f;">🔐 Iniciar Sessão</h2>
       <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Entre com telemóvel ou e-mail</p>
       <input id="loginIdentifier" type="text" placeholder="Telemóvel ou E-mail" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:12px;font-size:14px;box-sizing:border-box;" />
       <input id="loginPassword" type="password" placeholder="Password" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:16px;font-size:14px;box-sizing:border-box;" />
       <button id="btnLogin" style="width:100%;padding:14px;background:#07101f;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;">Entrar</button>
       <div style="margin-top:16px;text-align:center;font-size:13px;color:#6b7280;">
         <a href="#" class="auth-link" data-view="forgot" style="color:#4b5563;text-decoration:none;">Esqueceu a password?</a>
         <span style="margin:0 8px;">·</span>
         <a href="#" class="auth-link" data-view="register" style="color:#07101f;font-weight:600;text-decoration:none;">Criar conta</a>
       </div>
     </div>

     <div id="authRegister" class="auth-view" style="display:none;">
       <h2 style="margin:0 0 8px;font-size:20px;color:#07101f;">📝 Criar Conta</h2>
       <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">3 créditos grátis ao registar-se</p>
       <input id="regName" type="text" placeholder="Nome completo" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:10px;font-size:14px;box-sizing:border-box;" />
       <input id="regPhone" type="tel" placeholder="Telemóvel (84/85/86/87 XXX XXXX)" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:10px;font-size:14px;box-sizing:border-box;" />
       <input id="regEmail" type="email" placeholder="E-mail" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:10px;font-size:14px;box-sizing:border-box;" />
       <input id="regPassword" type="password" placeholder="Password (mín. 6 caracteres)" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:10px;font-size:14px;box-sizing:border-box;" />
       <input id="regPasswordConfirm" type="password" placeholder="Confirmar password" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:16px;font-size:14px;box-sizing:border-box;" />
       <button id="btnRegister" style="width:100%;padding:14px;background:#07101f;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;">Criar Conta</button>
       <div style="margin-top:16px;text-align:center;font-size:13px;color:#6b7280;">
         Já tem conta? <a href="#" class="auth-link" data-view="login" style="color:#07101f;font-weight:600;text-decoration:none;">Entrar</a>
       </div>
     </div>

     <div id="authForgot" class="auth-view" style="display:none;">
       <h2 style="margin:0 0 8px;font-size:20px;color:#07101f;">🔑 Recuperar Password</h2>
       <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Enviaremos um link para o seu e-mail</p>
       <input id="forgotEmail" type="email" placeholder="E-mail da conta" style="width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:16px;font-size:14px;box-sizing:border-box;" />
       <button id="btnForgot" style="width:100%;padding:14px;background:#07101f;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;">Enviar link de recuperação</button>
       <div style="margin-top:16px;text-align:center;font-size:13px;color:#6b7280;">
         <a href="#" class="auth-link" data-view="login" style="color:#4b5563;text-decoration:none;">← Voltar ao login</a>
       </div>
     </div>

     <div id="authForgotSent" class="auth-view" style="display:none;">
       <div style="text-align:center;padding:20px 0;">
         <div style="font-size:48px;margin-bottom:12px;">📧</div>
         <h3 style="margin:0 0 8px;color:#07101f;">Link enviado!</h3>
         <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Verifique a sua caixa de entrada e clique no link para redefinir a password.</p>
         <button class="auth-link-btn" data-view="login" style="padding:12px 24px;background:#07101f;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Voltar ao Login</button>
       </div>
     </div>

     <div id="authSuccess" class="auth-view" style="display:none;">
       <div style="text-align:center;padding:20px 0;">
         <div style="font-size:48px;margin-bottom:12px;">🎉</div>
         <h3 style="margin:0 0 8px;color:#07101f;">Conta criada!</h3>
         <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Verifique o seu e-mail para confirmar a conta. Após confirmar, pode iniciar sessão.</p>
         <button class="auth-link-btn" data-view="login" style="padding:12px 24px;background:#07101f;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Ir para Login</button>
       </div>
     </div>
   </div>
 </div>`;
 document.body.appendChild(div.firstElementChild);
 this.overlay = document.getElementById('authOverlay');
 }

 _bindEvents() {
 if (document.getElementById('authOverlay')?._mzdocsBound) return;
 if (document.getElementById('authOverlay')) document.getElementById('authOverlay')._mzdocsBound = true;

 document.getElementById('authClose')?.addEventListener('click', () => this.close());

 document.querySelectorAll('.auth-link[data-view]').forEach(link => {
 link.addEventListener('click', e => { e.preventDefault(); this._switchView(e.target.dataset.view); });
 });
 document.querySelectorAll('.auth-link-btn[data-view]').forEach(btn => {
 btn.addEventListener('click', () => this._switchView(btn.dataset.view));
 });

 this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

 document.getElementById('btnLogin')?.addEventListener('click', () => this._handleLogin());
 document.getElementById('btnRegister')?.addEventListener('click', () => this._handleRegister());
 document.getElementById('btnForgot')?.addEventListener('click', () => this._handleForgot());

 ['loginIdentifier', 'loginPassword'].forEach(id => {
 document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleLogin(); });
 });
 document.getElementById('forgotEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleForgot(); });
 }

 async _handleLogin() {
 if (this._loginSubmitting) return;

 const btn = document.getElementById('btnLogin');
 const identifier = document.getElementById('loginIdentifier')?.value?.trim();
 const password = document.getElementById('loginPassword')?.value;

 if (!identifier) return this._showError('Introduza o número de telemóvel ou e-mail');
 if (!password) return this._showError('Introduza a password');

 this._loginSubmitting = true;
 if (btn) { btn.disabled = true; btn.textContent = '⏳ A entrar...'; }
 try {
 await authManager.signIn(identifier, password);
 this.close();
 this._toast('✅ Bem-vindo de volta!', 'success');
 } catch (err) {
 this._showError(err.message || err.toString());
 } finally {
 this._loginSubmitting = false;
 if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
 }
 }

 async _handleRegister() {
 if (this._registerSubmitting) return;

 const btn = document.getElementById('btnRegister');
 const name = document.getElementById('regName')?.value?.trim();
 const phone = document.getElementById('regPhone')?.value?.trim();
 const email = document.getElementById('regEmail')?.value?.trim();
 const pass = document.getElementById('regPassword')?.value;
 const confirm = document.getElementById('regPasswordConfirm')?.value;

 if (!phone) return this._showError('Número de telemóvel é obrigatório');
 if (!email) return this._showError('E-mail é obrigatório');
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this._showError('E-mail inválido');
 if (!pass || pass.length < 6) return this._showError('Password deve ter pelo menos 6 caracteres');
 if (pass !== confirm) return this._showError('As passwords não coincidem');

 this._registerSubmitting = true;
 if (btn) { btn.disabled = true; btn.textContent = '⏳ A criar conta...'; }

 try {
 const result = await authManager.signUp(phone, email, pass, name);

 const loggedIn = !!(result?.session || result?._autoLogin);
 const emailConfirmRequired = !!result?._emailConfirmRequired;

 if (loggedIn) {
 this.close();
 this._toast('✅ Conta criada! Bem-vindo ao MzDocs Pro 🎉', 'success');
 } else if (emailConfirmRequired) {
 this._switchView('success');
 this._toast('✅ Conta criada! Verifique o e-mail para confirmar.', 'success');
 } else {
 this._switchView('success');
 this._toast('✅ Conta criada! Verifique o e-mail para confirmar.', 'success');
 }
 } catch (err) {
 const msg = (err.message || '').toLowerCase();
 const isConflict = msg.includes('já está registado') || msg.includes('já tem conta') ||
 msg.includes('already') || msg.includes('registered') || msg.includes('duplicate') ||
 msg.includes('este e-mail já está registado') || msg.includes('este número');
 if (isConflict) {
 this._switchView('login');
 const loginField = document.getElementById('loginIdentifier');
 if (loginField && email) loginField.value = email;
 this._showError('Já tens conta com este e-mail. Faz login abaixo ou recupera a password.');
 } else {
 this._showError(err.message || err.toString());
 }
 } finally {
 this._registerSubmitting = false;
 if (btn) { btn.disabled = false; btn.textContent = 'Criar Conta'; }
 }
 }

 async _handleForgot() {
 const btn = document.getElementById('btnForgot');
 const email = document.getElementById('forgotEmail')?.value?.trim();

 if (!email) return this._showError('Introduza o e-mail da conta');
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this._showError('E-mail inválido');

 btn.disabled = true;
 btn.textContent = '⏳ A enviar...';
 try {
 await authManager.resetPasswordByEmail(email);
 this._switchView('forgotSent');
 } catch (err) {
 this._switchView('forgotSent');
 } finally {
 btn.disabled = false;
 btn.textContent = 'Enviar link de recuperação';
 }
 }

 _switchView(name) {
 const map = {
 login: 'authLogin',
 register: 'authRegister',
 forgot: 'authForgot',
 forgotSent: 'authForgotSent',
 success: 'authSuccess',
 };
 document.querySelectorAll('.auth-view').forEach(v => v.style.display = 'none');
 const target = document.getElementById(map[name]);
 if (target) target.style.display = 'block';
 this.overlay.querySelectorAll('.auth-error').forEach(e => e.remove());
 }

 _friendlyError(raw) {
 const msg = (raw || '').toLowerCase();
 if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('email not confirmed'))
 return 'E-mail ou password incorrectos. Verifique e tente novamente.';
 if (msg.includes('já está registado') || msg.includes('já tem conta') ||
 msg.includes('user already registered') || msg.includes('already been registered') || msg.includes('duplicate'))
 return 'Este e-mail ou telemóvel já tem conta. Use "Entrar" ou recupere a password.';
 if (msg.includes('password should be') || msg.includes('password must'))
 return 'A password deve ter pelo menos 6 caracteres.';
 if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429'))
 return 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.';
 if (msg.includes('network') || msg.includes('fetch') || msg.includes('websocket') || msg.includes('ws') || msg.includes('500') || msg.includes('failed to fetch'))
 return 'Sem ligação ao servidor. Verifique a sua internet e tente novamente.';
 if (msg.includes('email') && msg.includes('invalid'))
 return 'Endereço de e-mail inválido.';
 if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('demorou demasiado'))
 return 'O servidor demorou muito a responder. Tente novamente.';
 if (msg.includes('not found') || msg.includes('404'))
 return 'Conta não encontrada. Verifique os dados ou crie uma conta nova.';
 if (msg.includes('signup') || msg.includes('sign up') || msg.includes('register'))
 return 'Não foi possível criar a conta. Tente novamente ou contacte o suporte.';
 if (msg.includes('token') || msg.includes('jwt') || msg.includes('session'))
 return 'Sessão expirada. Por favor faça login novamente.';
 if (msg.includes('module') || msg.includes('package') || msg.includes('cannot find'))
 return 'Erro temporário no servidor. Tente novamente em instantes.';
 if (raw && raw.length > 120) return 'Ocorreu um erro inesperado. Tente novamente.';
 return raw || 'Ocorreu um erro inesperado. Tente novamente.';
 }

 _showError(msg) {
 this.overlay.querySelectorAll('.auth-error').forEach(e => e.remove());
 const el = document.createElement('div');
 el.className = 'auth-error';
 el.style.cssText = 'background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:.75rem 1rem;border-radius:10px;font-size:.875rem;margin-top:.5rem;';
 el.textContent = '⚠️ ' + this._friendlyError(msg);
 const activeView = this.overlay.querySelector('.auth-view:not([style*="none"])') ||
 this.overlay.querySelector('.auth-view');
 activeView?.appendChild(el);
 }

 _toast(msg, type = 'success') {
 const stack = document.getElementById('notifStack');
 if (!stack) return;
 const el = document.createElement('div');
 el.className = `notif ${type}`;
 el.textContent = msg;
 stack.appendChild(el);
 setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
 }

 open(view = 'login') {
 this._switchView(view);
 this.overlay.style.display = 'flex';
 document.body.style.overflow = 'hidden';
 }

 close() {
 this.overlay.style.display = 'none';
 document.body.style.overflow = '';
 }
}

export const authUI = new AuthUI();
