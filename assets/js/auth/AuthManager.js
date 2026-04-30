// assets/js/auth/AuthManager.js
// Gestão de autenticação com Supabase Auth
// Configuração carregada de forma segura via /api/config (nunca exposta no HTML)

export class AuthManager {
    constructor() {
        this.user = undefined; // undefined = a carregar, null = não autenticado
        this.session = null;
        this.supabase = null;
        this._listeners = [];
        this._configLoaded = false;
        this._init();
    }

    async _init() {
        try {
            // ✅ CORREÇÃO: Tentar múltiplos endpoints possíveis para config
            const endpoints = [
                '/api/config',           // Endpoint padrão
                '/api/functions/config', // Fallback para estrutura atual do projeto
            ];
            
            let res = null;
            let lastError = null;
            
            for (const endpoint of endpoints) {
                try {
                    res = await fetch(endpoint);
                    if (res.ok) {
                        const contentType = res.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            console.log(`[AuthManager] Config carregada de: ${endpoint}`);
                            break; // Encontrou endpoint válido com JSON
                        }
                    }
                } catch (e) {
                    lastError = e;
                }
            }

            // Se nenhum endpoint retornou JSON válido
            if (!res || !res.ok) {
                console.info('[AuthManager] Endpoint /api/config não encontrado — modo anónimo');
                console.info('[AuthManager] Dica: Crie o arquivo api/config.js ou api/functions/config.js no seu projeto');
                this.user = null;
                return;
            }

            // ✅ CORREÇÃO: Verificar Content-Type antes de fazer .json()
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const rawText = await res.text();
                console.warn('[AuthManager] Resposta não é JSON. Content-Type:', contentType);
                console.warn('[AuthManager] Corpo da resposta (primeiros 200 chars):', rawText.substring(0, 200));
                console.info('[AuthManager] Supabase não configurado — modo anónimo');
                this.user = null;
                return;
            }

            const config = await res.json();
            if (!config.configured || !config.supabaseUrl || !config.supabaseAnonKey) {
                console.info('[AuthManager] Supabase não configurado — modo anónimo');
                this.user = null;
                return;
            }

            // ✅ CORREÇÃO: Importação do Supabase via CDN com fallback seguro
            let createClient;
            try {
                const supabaseModule = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
                createClient = supabaseModule.createClient;
                
                // Fallback: se createClient não existir no namespace, tentar default export
                if (!createClient && supabaseModule.default) {
                    createClient = supabaseModule.default.createClient || supabaseModule.default;
                }
            } catch (importErr) {
                console.warn('[AuthManager] Falha ao importar Supabase via +esm, tentando fallback...', importErr);
                
                // Fallback: tentar importar sem +esm
                try {
                    const supabaseModule = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
                    createClient = supabaseModule.createClient;
                } catch (fallbackErr) {
                    console.error('[AuthManager] Falha total na importação do Supabase:', fallbackErr);
                    this.user = null;
                    return;
                }
            }

            if (!createClient) {
                console.error('[AuthManager] createClient não encontrado no módulo Supabase');
                this.user = null;
                return;
            }

            this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            // Verificar sessão existente
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.session = session;
                this.user = session.user;
            } else {
                this.user = null;
            }

            // Escutar mudanças de auth
            this.supabase.auth.onAuthStateChange((event, session) => {
                this.session = session;
                this.user = session?.user || null;
                this._notify();
            });

            this._configLoaded = true;

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

    // Método principal: onChange
    onChange(callback) {
        this._listeners.push(callback);
        // Notificar imediatamente com estado atual (se já carregado)
        if (this.user !== undefined) {
            callback(this.user, this.session);
        }
        return () => {
            this._listeners = this._listeners.filter(l => l !== callback);
        };
    }

    // Alias para compatibilidade com código que usa onAuthChange
    onAuthChange(callback) {
        return this.onChange(callback);
    }

    _notify() {
        this._listeners.forEach(cb => cb(this.user, this.session));
    }
}

export const authManager = new AuthManager();
export default AuthManager;