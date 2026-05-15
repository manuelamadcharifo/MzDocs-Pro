// assets/js/auth/AuthManager.js
// Gestão de autenticação com Supabase — login por telemóvel + password

export class AuthManager {
    constructor() {
        this.user = undefined; // undefined = a carregar, null = não autenticado
        this.session = null;
        this.supabase = null;
        this._isAdmin = false; // carregado da tabela profiles
        this._listeners = [];
        this._initPromise = this._init();
    }

    async _init() {
        try {
            let res = null;
            try {
                const r = await fetch('/api/config');
                if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
                    res = r;
                }
            } catch { /* continuar */ }

            if (!res) {
                console.info('[AuthManager] /api/config não encontrado — modo anónimo');
                this.user = null; this._notify(); return;
            }

            const config = await res.json();
            if (!config.configured || !config.supabaseUrl || !config.supabaseAnonKey) {
                console.info('[AuthManager] Supabase não configurado — modo anónimo');
                this.user = null; this._notify(); return;
            }

            let createClient;
            try {
                ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
                if (!createClient) throw new Error('createClient ausente');
            } catch {
                try {
                    ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'));
                } catch (e) {
                    console.error('[AuthManager] Falha ao importar Supabase:', e);
                    this.user = null; this._notify(); return;
                }
            }

            this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
                realtime: { transport: typeof WebSocket !== 'undefined' ? WebSocket : null },
                global:   { headers: { 'x-client-info': 'mzdocs-pro/6.0' } },
            });

            const { data: { session }, error: sessErr } = await this.supabase.auth.getSession();
            if (session) {
                // Verificar se o token expira em menos de 60 segundos e refrescar preventivamente
                const expiresAt   = session.expires_at; // unix timestamp (segundos)
                const nowSecs     = Math.floor(Date.now() / 1000);
                const needRefresh = expiresAt && (expiresAt - nowSecs) < 60;

                if (needRefresh) {
                    const { data: refreshed } = await this.supabase.auth.refreshSession();
                    this.session = refreshed?.session || session;
                } else {
                    this.session = session;
                }
                this.user = this.session.user;
                await this._loadProfile(this.session.user.id); // carregar is_admin da tabela profiles
            } else {
                this.user = null;
            }

            this.supabase.auth.onAuthStateChange(async (_event, session) => {
                this.session = session;
                this.user = session?.user || null;
                if (this.user) {
                    await this._loadProfile(this.user.id);
                } else {
                    this._isAdmin = false;
                }
                this._notify();
            });

        } catch (err) {
            console.error('[AuthManager] Erro de inicialização:', err);
            this.user = null;
        }
        this._notify();
    }

    // Carrega o perfil da tabela 'profiles' para obter is_admin e email
    async _loadProfile(userId) {
        if (!this.supabase || !userId) return;
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('is_admin, credits, full_name, email, phone')
                .eq('id', userId)
                .single();
            if (error && error.code !== 'PGRST116') {
                console.warn('[AuthManager] _loadProfile erro:', error.message);
            }
            this._isAdmin = data?.is_admin === true;
            if (this.user) this.user._profile = data || null;
        } catch (err) {
            console.warn('[AuthManager] _loadProfile excepção:', err.message);
            this._isAdmin = false;
        }
    }

    async ready() { return this._initPromise; }

    isAuthenticated() { return !!this.user; }

    // Lê is_admin da tabela profiles (carregado em _loadProfile)
    isAdmin() {
        return this._isAdmin === true;
    }

    // Registo com telemóvel + email + password
    async signUp(phone, email, password, fullName = '') {
        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, email, password, fullName })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');

        // Caso 1: servidor devolveu sessão directamente (confirmação de email desactivada)
        if (data.session && this.supabase) {
            try {
                await this.supabase.auth.setSession({
                    access_token:  data.session.access_token,
                    refresh_token: data.session.refresh_token,
                });
                this.session = data.session;
                this.user    = data.session?.user || data.user || null;
                if (this.user?.id) await this._loadProfile(this.user.id);
                this._notify();
                return data;
            } catch (_) { /* falhou setSession — tentar login directo abaixo */ }
        }

        // Caso 2: sem sessão (confirmação de email activa ou setSession falhou)
        // Tentar login directo com as credenciais que acabaram de ser registadas.
        // Timeout de 8 s para evitar que a UI fique suspensa indefinidamente.
        if (this.supabase && data.user) {
            await new Promise(r => setTimeout(r, 800));
            try {
                const loginResult = await Promise.race([
                    this.supabase.auth.signInWithPassword({
                        email: email.toLowerCase().trim(),
                        password,
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 8000)
                    ),
                ]);
                const { data: loginData, error: loginErr } = loginResult;
                if (!loginErr && loginData?.session) {
                    this.session = loginData.session;
                    this.user    = loginData.user;
                    if (this.user?.id) await this._loadProfile(this.user.id);
                    this._notify();
                    return { ...data, session: loginData.session, _autoLogin: true };
                }
            } catch (_) { /* login automático falhou ou timeout — continuar sem sessão */ }
        }

        // Caso 3: nenhuma das anteriores funcionou — conta criada mas sem login
        // (ex: Supabase exige confirmação de email manual)
        this.user = null;
        this._notify();
        return data;
    }

    // Login com telemóvel OU email + password
    async signIn(identifier, password) {
        if (!this.supabase) throw new Error('Supabase não configurado');

        const isEmail = identifier.includes('@');
        let credentials;

        if (isEmail) {
            // Login directo por email
            credentials = { email: identifier.trim(), password };
        } else {
            // Normalizar telemóvel moçambicano e procurar o email associado no perfil.
            // As contas são criadas com email no Supabase Auth; o telemóvel fica no perfil.
            // Por isso, ao usar telemóvel, procuramos o email correspondente primeiro.
            const clean = identifier.replace(/\D/g, '');
            const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;

            // Tentar login por telemóvel directamente (caso a conta tenha phone provider)
            const { data: phoneData, error: phoneError } = await this.supabase.auth.signInWithPassword({ phone: normalized, password });
            if (!phoneError && phoneData?.user) {
                this.session = phoneData.session;
                this.user    = phoneData.user;
                await this._loadProfile(phoneData.user.id);
                this._notify();
                return phoneData;
            }

            // Fallback: procurar o email associado ao telemóvel na tabela profiles
            const { data: profileData, error: profileError } = await this.supabase
                .from('profiles')
                .select('email')
                .eq('phone', normalized)
                .maybeSingle();

            if (profileError || !profileData?.email) {
                throw new Error('Número de telemóvel não encontrado. Use o e-mail registado ou crie uma conta.');
            }
            credentials = { email: profileData.email, password };
        }

        const { data, error } = await this.supabase.auth.signInWithPassword(credentials);
        if (error) {
            const msg = error.message?.toLowerCase() || '';
            if (msg.includes('email not confirmed') || msg.includes('not confirmed'))
                throw new Error('E-mail ainda não confirmado. Verifique a sua caixa de entrada e clique no link de confirmação.');
            if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong password'))
                throw new Error('Credenciais incorrectas. Verifique o número/email e password.');
            if (msg.includes('too many requests') || msg.includes('rate limit'))
                throw new Error('Demasiadas tentativas. Aguarde alguns minutos e tente novamente.');
            throw new Error(error.message || 'Credenciais incorrectas. Verifique o número/email e password.');
        }
        this.session = data.session;
        this.user    = data.user;
        await this._loadProfile(data.user.id);
        this._notify();
        return data;
    }

    // Recuperação de password via email — Supabase envia link gratuito
    async resetPasswordByEmail(email) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        const siteUrl = window.location.origin;
        const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${siteUrl}/?reset=true`,
        });
        if (error) throw new Error(error.message);
        return { success: true };
    }

    // Manter compatibilidade — redirige para resetPasswordByEmail
    async resetPassword(phone, newPassword) {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao redefinir password');
        return data;
    }

    // Modo visitante — não cria sessão Supabase, apenas garante estado null
    async signInAnonymous() {
        this.user     = null;
        this._isAdmin = false;
        this._notify();
        return { anonymous: true };
    }

    async signOut() {
        if (this.supabase) await this.supabase.auth.signOut();
        this.session  = null;
        this.user     = null;
        this._isAdmin = false;
        this._notify();
    }

    getToken() { return this.session?.access_token || null; }

    // Devolve sempre um token válido — refresca automaticamente se expirado ou prestes a expirar
    async getValidToken() {
        if (!this.supabase) return null;
        const expiresAt = this.session?.expires_at;
        const nowSecs   = Math.floor(Date.now() / 1000);
        if (!this.session || (expiresAt && (expiresAt - nowSecs) < 60)) {
            const { data } = await this.supabase.auth.refreshSession();
            if (data?.session) {
                this.session = data.session;
                this.user    = data.session.user;
            }
        }
        return this.session?.access_token || null;
    }

    onChange(callback) {
        this._listeners.push(callback);
        if (this.user !== undefined) callback(this.user, this.session);
        return () => { this._listeners = this._listeners.filter(l => l !== callback); };
    }

    onAuthChange(callback) { return this.onChange(callback); }

    _notify() { this._listeners.forEach(cb => cb(this.user, this.session)); }
}

export const authManager = new AuthManager();
export default AuthManager;
