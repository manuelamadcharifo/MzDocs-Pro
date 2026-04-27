// assets/js/auth/AuthUI.js
// Interface completa de autenticação

import { authManager } from './AuthManager.js';

export class AuthUI {
    constructor() {
        this.overlay = null;
        this.currentView = 'login'; // login, register, forgot, otp
        this._createOverlay();
        this._bindEvents();
    }

    _createOverlay() {
        const html = `
        <div id="authOverlay" class="auth-overlay" style="display:none;">
            <div class="auth-modal">
                <button id="authClose" class="auth-close">×</button>
                
                <!-- LOGIN VIEW -->
                <div id="authLogin" class="auth-view">
                    <div class="auth-header">
                        <h2>🔐 Aceder ao MzDocs Pro</h2>
                        <p>Entre para guardar seus documentos e créditos</p>
                    </div>
                    
                    <form id="loginForm" class="auth-form">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="loginEmail" placeholder="seu@email.com" required>
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="loginPassword" placeholder="••••••••" required>
                            <a href="#" class="auth-link" data-view="forgot">Esqueceu a password?</a>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">Entrar</button>
                    </form>
                    
                    <div class="auth-divider">
                        <span>ou</span>
                    </div>
                    
                    <button id="btnAnonymous" class="btn btn-ghost btn-block">
                        🚀 Usar sem registo (3 créditos grátis)
                    </button>
                    
                    <p class="auth-footer">
                        Não tem conta? <a href="#" class="auth-link" data-view="register">Criar conta</a>
                    </p>
                </div>

                <!-- REGISTER VIEW -->
                <div id="authRegister" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>📝 Criar Conta</h2>
                        <p>Registe-se e receba 3 créditos grátis</p>
                    </div>
                    
                    <form id="registerForm" class="auth-form">
                        <div class="form-group">
                            <label>Nome Completo</label>
                            <input type="text" id="regName" placeholder="Ana Sofia Machava" required>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="regEmail" placeholder="seu@email.com" required>
                        </div>
                        <div class="form-group">
                            <label>Telefone</label>
                            <input type="tel" id="regPhone" placeholder="84 XXX XXXX" required>
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="regPassword" placeholder="Mínimo 6 caracteres" minlength="6" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">Criar Conta</button>
                    </form>
                    
                    <p class="auth-footer">
                        Já tem conta? <a href="#" class="auth-link" data-view="login">Entrar</a>
                    </p>
                </div>

                <!-- FORGOT PASSWORD VIEW -->
                <div id="authForgot" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>🔑 Recuperar Password</h2>
                        <p>Enviaremos um link para seu email</p>
                    </div>
                    
                    <form id="forgotForm" class="auth-form">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="forgotEmail" placeholder="seu@email.com" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">Enviar Link</button>
                    </form>
                    
                    <p class="auth-footer">
                        <a href="#" class="auth-link" data-view="login">← Voltar ao login</a>
                    </p>
                </div>

                <!-- OTP VIEW -->
                <div id="authOtp" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>📧 Verifique seu Email</h2>
                        <p>Clique no link que enviamos para seu email</p>
                    </div>
                    <div class="auth-info">
                        <p>Se não recebeu, verifique a pasta de spam.</p>
                    </div>
                </div>
            </div>
        </div>`;

        // Inserir no body se não existir
        if (!document.getElementById('authOverlay')) {
            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);
            this.overlay = document.getElementById('authOverlay');
        }
    }

    _bindEvents() {
        // Fechar
        document.getElementById('authClose')?.addEventListener('click', () => this.close());

        // Troca de views
        document.querySelectorAll('.auth-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this._switchView(e.target.dataset.view);
            });
        });

        // Login
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this._handleLogin();
        });

        // Registo
        document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this._handleRegister();
        });

        // Recuperação
        document.getElementById('forgotForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this._handleForgot();
        });

        // Anónimo
        document.getElementById('btnAnonymous')?.addEventListener('click', async () => {
            await this._handleAnonymous();
        });
    }

    async _handleLogin() {
        const btn = document.querySelector('#loginForm button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '⏳ A entrar...';

        try {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            await authManager.signIn(email, password);
            this.close();
            this._showNotification('✅ Bem-vindo de volta!', 'success');
            
        } catch (err) {
            this._showNotification('❌ ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    }

    async _handleRegister() {
        const btn = document.querySelector('#registerForm button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '⏳ A criar conta...';

        try {
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const phone = document.getElementById('regPhone').value;
            const password = document.getElementById('regPassword').value;

            const result = await authManager.signUp(email, password, name, phone);
            this._switchView('otp');
            this._showNotification('✅ ' + result.message, 'success');
            
        } catch (err) {
            this._showNotification('❌ ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar Conta';
        }
    }

    async _handleForgot() {
        const btn = document.querySelector('#forgotForm button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '⏳ A enviar...';

        try {
            const email = document.getElementById('forgotEmail').value;
            await authManager.resetPassword(email);
            this._showNotification('✅ Verifique seu email!', 'success');
            this._switchView('login');
            
        } catch (err) {
            this._showNotification('❌ ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Enviar Link';
        }
    }

    async _handleAnonymous() {
        try {
            await authManager.signInAnonymous();
            this.close();
            this._showNotification('✅ Modo anónimo ativado (3 créditos)', 'success');
        } catch (err) {
            this._showNotification('❌ ' + err.message, 'error');
        }
    }

    _switchView(viewName) {
        document.querySelectorAll('.auth-view').forEach(v => v.style.display = 'none');
        document.getElementById('auth' + viewName.charAt(0).toUpperCase() + viewName.slice(1)).style.display = 'block';
        this.currentView = viewName;
    }

    _showNotification(msg, type) {
        // Usar o NotificationView existente ou criar toast simples
        if (window.NotificationView) {
            type === 'success' ? NotificationView.success(msg) : NotificationView.error(msg);
        } else {
            alert(msg);
        }
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