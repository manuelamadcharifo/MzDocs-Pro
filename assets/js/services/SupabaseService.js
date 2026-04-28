// assets/js/services/SupabaseService.js
// Módulo standalone do Supabase client para créditos

export class SupabaseService {
    constructor() {
        this._client = null;
        this._ready = false;
    }

    async init() {
        const url = window.__SUPABASE_URL__;
        const key = window.__SUPABASE_ANON_KEY__;
        if (!url || !key) {
            console.info('[Supabase] Não configurado — modo localStorage');
            return false;
        }

        try {
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
            this._client = createClient(url, key);
            this._ready = true;
            return true;
        } catch (e) {
            console.warn('[Supabase] Falha ao inicializar:', e);
            return false;
        }
    }

    async syncUser(userId, localCredits) {
        if (!this._ready) return null;
        try {
            const { data, error } = await this._client
                .from('profiles')
                .select('credits')
                .eq('id', userId)
                .single();

            if (error?.code === 'PGRST116') {
                await this._client.from('profiles').insert({ id: userId, credits: localCredits });
                return { credits: localCredits };
            }
            if (error) throw error;

            const resolved = Math.max(data.credits, localCredits);
            if (resolved !== data.credits) {
                await this._client.from('profiles').update({ credits: resolved }).eq('id', userId);
            }
            return { credits: resolved };
        } catch (e) {
            console.warn('[Supabase] syncUser falhou:', e);
            return null;
        }
    }

    async deductCredit(userId) {
        if (!this._ready) return null;
        try {
            const { data } = await this._client.rpc('deduct_credit', { user_id: userId });
            return typeof data === 'number' ? data : null;
        } catch {
            return null;
        }
    }

    async updateCredits(userId, credits) {
        if (!this._ready) return;
        try {
            await this._client.from('profiles').upsert({
                id: userId,
                credits,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn('[Supabase] updateCredits falhou:', e);
        }
    }
}

export const supabaseService = new SupabaseService();
export default SupabaseService;