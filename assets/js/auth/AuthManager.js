// assets/js/auth/AuthManager.js
// Gestão de autenticação com Supabase Auth

export class AuthManager {
    constructor() {
        this.user = undefined;
        this.session = null;
        this.supabase = null;
        this._listeners = [];
        this._init();
    }

    async _init() {
        const url = window.__SUPABASE_URL__;
        const key = window.__SUPABASE_ANON_KEY__;

        if (!url || !key) {
            console.info('[AuthManager] Supabase não configurado — modo anónimo');
            this.user = null;
            return;
        }

        try {
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
            this.supabase = createClient(url, key);

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.session = session;
                this.user = session.user;
            } else {
                this.user = null;
            }

            this.supabase.auth.onAuthStateChange((event, session) => {
                this.session = session;
                this.user = session?.user || null;
                this._notify();
            });

        } catch (err) {
            console.error('[AuthManager] Erro ao inicializar:', err);
            this.user = null;
        }
    }

    isAuthenticated() {
        return !!this.user;
    }

    isAdmin() {
        return this.user?.user_metadata?.is_admin === true ||
               this.user?.app_metadata?.is_admin === true;
    }

    async signUp(email, password, metadata = {}) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        const { data, error } = await this.supabase.auth.signUp({
            email,
            password,
            options: { data: metadata }
        });
        if (error) throw error;
        return data;
    }

    async signIn(email, password) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        this.session = data.session;
        this.user = data.user;
        this._notify();
        return data;
    }

    async signOut() {
        if (!this.supabase) return;
        await this.supabase.auth.signOut();
        this.session = null;
        this.user = null;
        this._notify();
    }

    async resetPassword(email) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`
        });
        if (error) throw error;
    }

    getToken() {
        return this.session?.access_token || null;
    }

    onChange(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(l => l !== callback);
        };
    }

    _notify() {
        this._listeners.forEach(cb => cb(this.user, this.session));
    }
}

export const authManager = new AuthManager();
export default AuthManager;