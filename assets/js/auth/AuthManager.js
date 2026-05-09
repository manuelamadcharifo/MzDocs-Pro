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

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.session = session;
                this.user = session.user;
                await this._loadProfile(session.user.id); // carregar is_admin da tabela profiles
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
            const { data } = await this.supabase
                .from('profiles')
                .select('is_admin, credits, full_name, email, phone')
                .eq('id', userId)
                .single();
            this._isAdmin = data?.is_admin === true;
            if (this.user) this.user._profile = data;
        } catch {
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

        // Aplicar session devolvida pelo servidor (login automático pós-registo)
        if (data.session && this.supabase) {
            await this.supabase.auth.setSession({
                access_token:  data.session.access_token,
                refresh_token: data.session.refresh_token,
            });
            this.session = data.session;
            this.user    = data.session.user || data.user;
            if (this.user?.id) await this._loadProfile(this.user.id);
            this._notify();
        }
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
            // Normalizar telemóvel moçambicano
            const clean = identifier.replace(/\D/g, '');
            const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
            credentials = { phone: normalized, password };
        }

        const { data, error } = await this.supabase.auth.signInWithPassword(credentials);
        if (error) throw new Error('Credenciais incorrectas. Verifique o número/email e password.');
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
