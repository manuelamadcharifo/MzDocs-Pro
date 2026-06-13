// assets/js/auth/AuthUI.js
// Modal de autenticação — login por TELEMÓVEL (principal) + EMAIL (secundário/recuperação)

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
                        <p>Use o seu número de telemóvel ou e-mail</p>
                    </div>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>Telemóvel ou E-mail</label>
                            <input type="text" id="loginIdentifier" placeholder="84 XXX XXXX ou email@exemplo.com"
                                inputmode="email" autocomplete="username">
                            <small style="color:#6b7280;font-size:.75rem;">Pode usar o número ou o e-mail para entrar</small>
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <div class="pw-wrap">
                                <input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password">
                                <button type="button" class="pw-eye" aria-label="Mostrar password" onclick="(function(btn){var inp=btn.previousElementSibling;inp.type=inp.type==='password'?'text':'password';btn.textContent=inp.type==='password'?'👁️':'🙈';})(this)">👁️</button>
                            </div>
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
                        <p>Registe-se e receba 1 crédito grátis</p>
                    </div>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>Nome Completo</label>
                            <input type="text" id="regName" placeholder="Ana Sofia Machava" autocomplete="name">
                        </div>
                        <div class="form-group">
                            <label>Telemóvel <span style="color:#ef4444">*</span></label>
                            <input type="tel" id="regPhone" placeholder="84 XXX XXXX" maxlength="13" inputmode="tel" autocomplete="tel">
                            <small style="color:#6b7280;font-size:.75rem;">Vodacom, Tmcel ou Movitel — usado para login principal</small>
                        </div>
                        <div class="form-group">
                            <label>E-mail <span style="color:#ef4444">*</span></label>
                            <input type="email" id="regEmail" placeholder="email@exemplo.com" inputmode="email" autocomplete="email">
                            <small style="color:#6b7280;font-size:.75rem;">Para recuperação de password — receberá um link no e-mail</small>
                        </div>
                        <div class="form-group">
                            <label>Password <span style="color:#ef4444">*</span></label>
                            <div class="pw-wrap">
                                <input type="password" id="regPassword" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
                                <button type="button" class="pw-eye" aria-label="Mostrar password" onclick="(function(btn){var inp=btn.previousElementSibling;inp.type=inp.type==='password'?'text':'password';btn.textContent=inp.type==='password'?'👁️':'🙈';})(this)">👁️</button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Confirmar Password <span style="color:#ef4444">*</span></label>
                            <div class="pw-wrap">
                                <input type="password" id="regPasswordConfirm" placeholder="Repita a password" autocomplete="new-password">
                                <button type="button" class="pw-eye" aria-label="Mostrar password" onclick="(function(btn){var inp=btn.previousElementSibling;inp.type=inp.type==='password'?'text':'password';btn.textContent=inp.type==='password'?'👁️':'🙈';})(this)">👁️</button>
                            </div>
                        </div>
                        <button id="btnRegister" class="btn btn-primary btn-block">Criar Conta</button>
                    </div>
                    <p class="auth-footer">Já tem conta? <a href="#" class="auth-link" data-view="login">Entrar</a></p>
                </div>

                <!-- RECUPERAR PASSWORD -->
                <div id="authForgot" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>🔑 Recuperar Password</h2>
                        <p>Insira o seu e-mail para receber o link de recuperação</p>
                    </div>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>E-mail da conta</label>
                            <input type="email" id="forgotEmail" placeholder="email@exemplo.com" inputmode="email" autocomplete="email">
                            <small style="color:#6b7280;font-size:.75rem;">Receberá um link para redefinir a password — verifique também o spam</small>
                        </div>
                        <button id="btnForgot" class="btn btn-primary btn-block">Enviar link de recuperação</button>
                    </div>
                    <p class="auth-footer"><a href="#" class="auth-link" data-view="login">← Voltar ao login</a></p>
                </div>

                <!-- SUCESSO REGISTO -->
                <div id="authSuccess" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>✅ Conta Criada!</h2>
                        <p>Pode fazer login agora com o seu número ou e-mail</p>
                    </div>
                    <div class="auth-info">
                        <p>🎁 1 crédito grátis foi atribuído à sua conta (válido 1 mês). Bem-vindo ao MzDocs Pro!</p>
                        <p style="margin-top:.75rem;font-size:.85rem;color:#6b7280;">
                            💡 Verifique o seu e-mail — pode ter recebido uma mensagem de confirmação do Supabase.
                        </p>
                    </div>
                    <div style="margin-top:1.5rem;">
                        <button class="btn btn-primary btn-block auth-link-btn" data-view="login">Entrar agora →</button>
                    </div>
                </div>

                <!-- SUCESSO RECUPERAÇÃO -->
                <div id="authForgotSent" class="auth-view" style="display:none;">
                    <div class="auth-header">
                        <h2>📧 E-mail Enviado!</h2>
                        <p>Verifique a sua caixa de entrada</p>
                    </div>
                    <div class="auth-info">
                        <p>Enviámos um link de recuperação para o seu e-mail. Clique no link para redefinir a sua password.</p>
                        <p style="margin-top:.75rem;font-size:.85rem;color:#6b7280;">
                            ⚠️ Não encontra o e-mail? Verifique a pasta de spam ou lixo electrónico.
                        </p>
                    </div>
                    <div style="margin-top:1.5rem;">
                        <button class="btn btn-primary btn-block auth-link-btn" data-view="login">← Voltar ao login</button>
                    </div>
                </div>

            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);
        this.overlay = document.getElementById('authOverlay');
    }

    _bindEvents() {
        // Guard: prevent attaching duplicate listeners if constructor is called more than once
        if (document.getElementById('authOverlay')?._mzdocsBound) return;
        if (document.getElementById('authOverlay')) document.getElementById('authOverlay')._mzdocsBound = true;

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

        // Enter nos campos de login
        ['loginIdentifier', 'loginPassword'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleLogin(); });
        });
        // Enter no campo de email de recuperação
        document.getElementById('forgotEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleForgot(); });
    }

    async _handleLogin() {
        if (this._loginSubmitting) return;

        const btn        = document.getElementById('btnLogin');
        const identifier = document.getElementById('loginIdentifier')?.value?.trim();
        const password   = document.getElementById('loginPassword')?.value;

        if (!identifier) return this._showError('Introduza o número de telemóvel ou e-mail');
        if (!password)   return this._showError('Introduza a password');

        this._loginSubmitting = true;
        if (btn) { btn.disabled = true; btn.textContent = '⏳ A entrar...'; }
        try {
            await authManager.signIn(identifier, password);
            this.close();
            this._toast('✅ Bem-vindo de volta!', 'success');
            // Analytics: login bem-sucedido
            try { window.dispatchEvent(new CustomEvent('mz:login')); } catch(_) {}
        } catch (err) {
            this._showError(err.message || err.toString());
        } finally {
            this._loginSubmitting = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        }
    }

    async _handleRegister() {
        // Guard: prevent concurrent submissions (e.g. double-click or duplicate event listeners)
        if (this._registerSubmitting) return;

        const btn     = document.getElementById('btnRegister');
        const name    = document.getElementById('regName')?.value?.trim();
        const phone   = document.getElementById('regPhone')?.value?.trim();
        const email   = document.getElementById('regEmail')?.value?.trim();
        const pass    = document.getElementById('regPassword')?.value;
        const confirm = document.getElementById('regPasswordConfirm')?.value;

        if (!phone)              return this._showError('Número de telemóvel é obrigatório');
        if (!email)              return this._showError('E-mail é obrigatório');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this._showError('E-mail inválido');
        if (!pass || pass.length < 6) return this._showError('Password deve ter pelo menos 6 caracteres');
        if (pass !== confirm)    return this._showError('As passwords não coincidem');

        this._registerSubmitting = true;
        if (btn) { btn.disabled = true; btn.textContent = '⏳ A criar conta...'; }
        try {
            const result = await authManager.signUp(phone, email, pass, name);
            const loggedIn = !!(result?.session || result?._autoLogin);

            if (loggedIn) {
                // Login automático funcionou — fechar modal e mostrar boas-vindas
                this.close();
                this._toast('✅ Conta criada! Bem-vindo ao MzDocs Pro 🎉', 'success');
                // Analytics: registo bem-sucedido
                try { window.dispatchEvent(new CustomEvent('mz:signup')); } catch(_) {}
            } else {
                // Supabase requer confirmação de email — mostrar ecrã informativo
                this._switchView('success');
                this._toast('✅ Conta criada! Verifique o e-mail para confirmar.', 'success');
                // Analytics: registo registado (sem sessão automática)
                try { window.dispatchEvent(new CustomEvent('mz:signup')); } catch(_) {}
            }
        } catch (err) {
            const msg = (err.message || '').toLowerCase();
            const isConflict = msg.includes('já está registado') || msg.includes('já tem conta') ||
                               msg.includes('already') || msg.includes('registered') || msg.includes('duplicate');
            if (isConflict) {
                // Conta já existe — redirecionar para login e pré-preencher o email
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
        const btn   = document.getElementById('btnForgot');
        const email = document.getElementById('forgotEmail')?.value?.trim();

        if (!email) return this._showError('Introduza o e-mail da conta');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this._showError('E-mail inválido');

        btn.disabled    = true;
        btn.textContent = '⏳ A enviar...';
        try {
            await authManager.resetPasswordByEmail(email);
            this._switchView('forgotSent');
        } catch (err) {
            // Mostrar sempre sucesso por segurança (não revelar se o email existe)
            this._switchView('forgotSent');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Enviar link de recuperação';
        }
    }

    async _handleAnonymous() {
        this.close();
        setTimeout(() => window.paymentController?.openAsGuest(), 200);
    }

    _switchView(name) {
        const map = {
            login:       'authLogin',
            register:    'authRegister',
            forgot:      'authForgot',
            forgotSent:  'authForgotSent',
            success:     'authSuccess',
        };
        document.querySelectorAll('.auth-view').forEach(v => v.style.display = 'none');
        const target = document.getElementById(map[name]);
        if (target) target.style.display = 'block';
        this.overlay.querySelectorAll('.auth-error').forEach(e => e.remove());
    }

    _friendlyError(raw) {
        // Mapear erros técnicos do Supabase/rede para mensagens amigáveis
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
        if (msg.includes('timeout') || msg.includes('timed out'))
            return 'O servidor demorou muito a responder. Tente novamente.';
        if (msg.includes('not found') || msg.includes('404'))
            return 'Conta não encontrada. Verifique os dados ou crie uma conta nova.';
        if (msg.includes('signup') || msg.includes('sign up') || msg.includes('register'))
            return 'Não foi possível criar a conta. Tente novamente ou contacte o suporte.';
        if (msg.includes('token') || msg.includes('jwt') || msg.includes('session'))
            return 'Sessão expirada. Por favor faça login novamente.';
        if (msg.includes('module') || msg.includes('package') || msg.includes('cannot find'))
            return 'Erro temporário no servidor. Tente novamente em instantes.';
        // Fallback genérico — não mostrar stack traces ou erros técnicos
        if (raw && raw.length > 120) return 'Ocorreu um erro inesperado. Tente novamente ou contacte o suporte.';
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
