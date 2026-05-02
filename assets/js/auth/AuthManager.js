// assets/js/auth/AuthManager.js
// Gestão de autenticação com Supabase — login por telemóvel + password

export class AuthManager {
    constructor() {
        this.user = undefined; // undefined = a carregar, null = não autenticado
        this.session = null;
        this.supabase = null;
        this._listeners = [];
        this._initPromise = this._init();
    }

    async _init() {
        try {
            const endpoints = ['/api/config', '/api/functions/config'];
            let res = null;

            for (const ep of endpoints) {
                try {
                    const r = await fetch(ep);
                    if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
                        res = r; break;
                    }
                } catch { /* continuar */ }
            }

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

            this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) { this.session = session; this.user = session.user; }
            else { this.user = null; }

            this.supabase.auth.onAuthStateChange((_event, session) => {
                this.session = session;
                this.user = session?.user || null;
                this._notify();
            });

        } catch (err) {
            console.error('[AuthManager] Erro de inicialização:', err);
            this.user = null;
        }
        this._notify();
    }

    async ready() { return this._initPromise; }

    isAuthenticated() { return !!this.user; }

    isAdmin() {
        return this.user?.user_metadata?.is_admin === true ||
               this.user?.app_metadata?.is_admin === true;
    }

    // Registo com telemóvel + password
    async signUp(phone, password, fullName = '') {
        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password, fullName })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
        return data;
    }

    // Login com telemóvel + password
    async signIn(phone, password) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        const clean = phone.replace(/\D/g, '');
        const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;

        const { data, error } = await this.supabase.auth.signInWithPassword({
            phone: normalized,
            password
        });
        if (error) throw new Error('Número ou password incorrectos');
        this.session = data.session;
        this.user = data.user;
        this._notify();
        return data;
    }

    // Modo anónimo (3 créditos locais, sem conta)
    async signInAnonymous() {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase.auth.signInAnonymously();
                if (!error) {
                    this.session = data.session;
                    this.user = data.user;
                    this._notify();
                    return data;
                }
            } catch { /* fallback abaixo */ }
        }
        // Fallback: continuar sem conta
        this.user = null;
        this._notify();
        return { anonymous: true };
    }

    async signOut() {
        if (this.supabase) await this.supabase.auth.signOut();
        this.session = null;
        this.user = null;
        this._notify();
    }

    // Redefinir password via telemóvel
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
