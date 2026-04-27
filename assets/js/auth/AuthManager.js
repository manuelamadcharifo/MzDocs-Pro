// assets/js/auth/AuthManager.js
// Sistema de autenticação completo com Supabase Auth

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = window.__SUPABASE_URL__ || 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || 'sua-anon-key';

export class AuthManager {
    constructor() {
        this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storage: localStorage
            }
        });
        this.user = null;
        this.profile = null;
        this.listeners = [];
        this._init();
    }

    async _init() {
        // Verificar sessão existente
        const { data: { session } } = await this.client.auth.getSession();
        if (session) {
            this.user = session.user;
            await this._loadProfile();
        }

        // Escutar mudanças de auth
        this.client.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                this.user = session.user;
                await this._loadProfile();
            } else if (event === 'SIGNED_OUT') {
                this.user = null;
                this.profile = null;
            }
            this._notifyListeners();
        });
    }

    async _loadProfile() {
        if (!this.user) return;
        const { data, error } = await this.client
            .from('profiles')
            .select('*')
            .eq('id', this.user.id)
            .single();
        
        if (!error) {
            this.profile = data;
        }
    }

    // ============================================
    // REGISTO COM EMAIL + PASSWORD
    // ============================================
    async signUp(email, password, fullName, phone) {
        const { data, error } = await this.client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone: phone
                },
                emailRedirectTo: `${window.location.origin}/auth/callback`
            }
        });

        if (error) throw error;
        
        // O trigger handle_new_user já criou o perfil com 3 créditos
        return { user: data.user, message: 'Verifique seu email para confirmar o registo.' };
    }

    // ============================================
    // LOGIN COM EMAIL + PASSWORD
    // ============================================
    async signIn(email, password) {
        const { data, error } = await this.client.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        
        this.user = data.user;
        await this._loadProfile();
        this._notifyListeners();
        
        return { user: data.user, session: data.session };
    }

    // ============================================
    // LOGIN COM OTP (MAGIC LINK) — SEM PASSWORD
    // ============================================
    async signInWithOtp(email) {
        const { error } = await this.client.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
            }
        });

        if (error) throw error;
        return { message: 'Link de acesso enviado para seu email.' };
    }

    // ============================================
    // LOGIN ANÓNIMO (para testes rápidos)
    // ============================================
    async signInAnonymous() {
        const { data, error } = await this.client.auth.signInAnonymously();
        if (error) throw error;
        
        this.user = data.user;
        await this._loadProfile();
        this._notifyListeners();
        
        return { user: data.user };
    }

    // ============================================
    // RECUPERAÇÃO DE PASSWORD
    // ============================================
    async resetPassword(email) {
        const { error } = await this.client.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`
        });
        if (error) throw error;
        return { message: 'Instruções enviadas para seu email.' };
    }

    // ============================================
    // ATUALIZAR PASSWORD
    // ============================================
    async updatePassword(newPassword) {
        const { error } = await this.client.auth.updateUser({
            password: newPassword
        });
        if (error) throw error;
        return { message: 'Password atualizada com sucesso.' };
    }

    // ============================================
    // ATUALIZAR PERFIL
    // ============================================
    async updateProfile(updates) {
        if (!this.user) throw new Error('Não autenticado');
        
        const { data, error } = await this.client
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        this.profile = data;
        this._notifyListeners();
        return data;
    }

    // ============================================
    // LOGOUT
    // ============================================
    async signOut() {
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
        
        this.user = null;
        this.profile = null;
        this._notifyListeners();
    }

    // ============================================
    // VERIFICAÇÕES
    // ============================================
    isAuthenticated() {
        return !!this.user;
    }

    isAdmin() {
        return this.profile?.is_admin === true;
    }

    getUserId() {
        return this.user?.id || localStorage.getItem('mz_uid') || this._generateAnonymousId();
    }

    getCredits() {
        return this.profile?.credits || parseInt(localStorage.getItem('mz_credits')) || 0;
    }

    _generateAnonymousId() {
        let id = localStorage.getItem('mz_uid');
        if (!id) {
            id = 'anon-' + crypto.randomUUID();
            localStorage.setItem('mz_uid', id);
        }
        return id;
    }

    // ============================================
    // LISTENERS (para UI reativa)
    // ============================================
    onAuthChange(callback) {
        this.listeners.push(callback);
        // Chamar imediatamente com estado atual
        callback({ user: this.user, profile: this.profile });
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    _notifyListeners() {
        this.listeners.forEach(cb => cb({ user: this.user, profile: this.profile }));
    }

    // ============================================
    // GETTERS
    // ============================================
    get supabase() {
        return this.client;
    }
}

// Singleton
export const authManager = new AuthManager();