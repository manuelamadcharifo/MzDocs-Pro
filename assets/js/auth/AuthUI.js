// assets/js/auth/AuthUI.js
// Modal de autenticação — login/registo por TELEMÓVEL + password

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
        <div id="authOverlay" class="auth-overlay" style="display:none;">
            <div class="auth-modal">
                <button id="authClose" class="auth-close" aria-label="Fechar">×</button>

                <!-- LOGIN -->
                <div id="authLogin" class="auth-view">
                    <div class="auth-header">
                        <h2>🔐 Entrar no MzDocs Pro</h2>
                        <p>Use o seu número de telemóvel</p>
                    </div>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>Telemóvel</label>
                            <input type="tel" id="loginPhone" placeholder="84 XXX XXXX" maxlength="13" inputmode="tel">
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="loginPassword" placeholder="••••••••">
                            <a href="#" class="auth-link" data-view="forgot">Esqueceu a password?</a>
                        </div>
                        <button id="btnLogin" class="btn btn-primary btn-block">Entrar</button>
                    </div>
                    <div class="auth-divider"><span>ou</span></div>
                    <button id="btnAnonymous" class="btn btn-ghost btn-block">🚀 Continuar sem conta (acesso avulso · 50 MZN)</button>
                    <p class="auth-footer">Não tem conta? <a href="#" class="auth-link" data-view="register">Criar conta</a></p>
                </div>

                <!-- REGISTO -->
                <div id="authRegister" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>📝 Criar Conta</h2>
                        <p>Registe-se e receba 3 créditos grátis</p>
                    </div>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>Nome Completo</label>
                            <input type="text" id="regName" placeholder="Ana Sofia Machava">
                        </div>
                        <div class="form-group">
                            <label>Telemóvel <span style="color:#ef4444">*</span></label>
                            <input type="tel" id="regPhone" placeholder="84 XXX XXXX" maxlength="13" inputmode="tel">
                            <small style="color:#6b7280;font-size:0.78rem;">Vodacom, Tmcel ou Movitel</small>
                        </div>
                        <div class="form-group">
                            <label>Password <span style="color:#ef4444">*</span></label>
                            <input type="password" id="regPassword" placeholder="Mínimo 6 caracteres">
                        </div>
                        <div class="form-group">
                            <label>Confirmar Password <span style="color:#ef4444">*</span></label>
                            <input type="password" id="regPasswordConfirm" placeholder="Repita a password">
                        </div>
                        <button id="btnRegister" class="btn btn-primary btn-block">Criar Conta</button>
                    </div>
                    <p class="auth-footer">Já tem conta? <a href="#" class="auth-link" data-view="login">Entrar</a></p>
                </div>

                <!-- RECUPERAR PASSWORD -->
                <div id="authForgot" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>🔑 Recuperar Password</h2>
                        <p>Introduza o seu número e defina uma nova password</p>
                    </div>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>Telemóvel</label>
                            <input type="tel" id="forgotPhone" placeholder="84 XXX XXXX" maxlength="13" inputmode="tel">
                        </div>
                        <div class="form-group">
                            <label>Nova Password</label>
                            <input type="password" id="forgotNewPassword" placeholder="Mínimo 6 caracteres">
                        </div>
                        <div class="form-group">
                            <label>Confirmar Nova Password</label>
                            <input type="password" id="forgotConfirmPassword" placeholder="Repita a nova password">
                        </div>
                        <button id="btnForgot" class="btn btn-primary btn-block">Redefinir Password</button>
                    </div>
                    <p class="auth-footer"><a href="#" class="auth-link" data-view="login">← Voltar ao login</a></p>
                </div>

                <!-- SUCESSO -->
                <div id="authSuccess" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>✅ Conta Criada!</h2>
                        <p>Pode fazer login agora com o seu número</p>
                    </div>
                    <div class="auth-info">
                        <p>🎁 3 créditos grátis já foram atribuídos à sua conta. Bem-vindo ao MzDocs Pro!</p>
                    </div>
                    <div style="margin-top:1.5rem;">
                        <button class="btn btn-primary btn-block auth-link-btn" data-view="login">Entrar agora →</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);
        this.overlay = document.getElementById('authOverlay');
    }

    _bindEvents() {
        document.getElementById('authClose')?.addEventListener('click', () => this.close());

        // Troca de vistas via links
        document.querySelectorAll('.auth-link[data-view]').forEach(link => {
            link.addEventListener('click', e => { e.preventDefault(); this._switchView(e.target.dataset.view); });
        });
        document.querySelectorAll('.auth-link-btn[data-view]').forEach(btn => {
            btn.addEventListener('click', () => this._switchView(btn.dataset.view));
        });

        // Fechar ao clicar fora
        this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

        // Botões de acção
        document.getElementById('btnLogin')?.addEventListener('click', () => this._handleLogin());
        document.getElementById('btnRegister')?.addEventListener('click', () => this._handleRegister());
        document.getElementById('btnForgot')?.addEventListener('click', () => this._handleForgot());
        document.getElementById('btnAnonymous')?.addEventListener('click', () => this._handleAnonymous());

        // Enter nos campos
        ['loginPhone','loginPassword'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleLogin(); });
        });
    }

    async _handleLogin() {
        const btn = document.getElementById('btnLogin');
        const phone = document.getElementById('loginPhone')?.value?.trim();
        const password = document.getElementById('loginPassword')?.value;

        if (!phone) return this._showError('Introduza o número de telemóvel');
        if (!password) return this._showError('Introduza a password');

        btn.disabled = true;
        btn.textContent = '⏳ A entrar...';
        try {
            await authManager.signIn(phone, password);
            this.close();
            this._toast('✅ Bem-vindo de volta!', 'success');
        } catch (err) {
            this._showError(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    }

    async _handleRegister() {
        const btn = document.getElementById('btnRegister');
        const name = document.getElementById('regName')?.value?.trim();
        const phone = document.getElementById('regPhone')?.value?.trim();
        const password = document.getElementById('regPassword')?.value;
        const confirm = document.getElementById('regPasswordConfirm')?.value;

        if (!phone) return this._showError('Número de telemóvel é obrigatório');
        if (!password || password.length < 6) return this._showError('Password deve ter pelo menos 6 caracteres');
        if (password !== confirm) return this._showError('As passwords não coincidem');

        btn.disabled = true;
        btn.textContent = '⏳ A criar conta...';
        try {
            await authManager.signUp(phone, password, name);
            this._switchView('success');
            this._toast('✅ Conta criada com sucesso!', 'success');
        } catch (err) {
            this._showError(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar Conta';
        }
    }

    async _handleForgot() {
        const btn = document.getElementById('btnForgot');
        const phone = document.getElementById('forgotPhone')?.value?.trim();
        const newPassword = document.getElementById('forgotNewPassword')?.value;
        const confirm = document.getElementById('forgotConfirmPassword')?.value;

        if (!phone) return this._showError('Introduza o número de telemóvel');
        if (!newPassword || newPassword.length < 6) return this._showError('Nova password deve ter pelo menos 6 caracteres');
        if (newPassword !== confirm) return this._showError('As passwords não coincidem');

        btn.disabled = true;
        btn.textContent = '⏳ A redefinir...';
        try {
            await authManager.resetPassword(phone, newPassword);
            this._toast('✅ Password redefinida! Faça login agora.', 'success');
            this._switchView('login');
        } catch (err) {
            this._showError(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Redefinir Password';
        }
    }

    async _handleAnonymous() {
        this.close();
        // Sem conta → abrir modal de acesso avulso
        setTimeout(() => window.paymentController?.openAsGuest(), 200);
    }

    _switchView(name) {
        const map = { login: 'authLogin', register: 'authRegister', forgot: 'authForgot', success: 'authSuccess' };
        document.querySelectorAll('.auth-view').forEach(v => v.style.display = 'none');
        const target = document.getElementById(map[name]);
        if (target) target.style.display = 'block';
        // Limpar mensagens de erro
        this.overlay.querySelectorAll('.auth-error').forEach(e => e.remove());
    }

    _showError(msg) {
        this.overlay.querySelectorAll('.auth-error').forEach(e => e.remove());
        const el = document.createElement('div');
        el.className = 'auth-error';
        el.style.cssText = 'background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:.75rem 1rem;border-radius:10px;font-size:.875rem;margin-top:.5rem;';
        el.textContent = '⚠️ ' + msg;
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
