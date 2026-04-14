// config/supabase.js - Production Supabase configuration with singleton pattern
// Never expose API keys - use environment variables injected via meta tags or Netlify functions

class SupabaseConfig {
  constructor() {
    this._instance = null;
    this._isInitialized = false;
    this._authListener = null;
    this._user = null;
    this._session = null;
  }

  /**
   * Get singleton instance of Supabase client
   * @returns {Promise<any>} Supabase client or null if not configured
   */
  async getInstance() {
    if (this._instance && this._isInitialized) {
      return this._instance;
    }
    return this.init();
  }

  /**
   * Initialize Supabase client
   * Credentials must be injected via:
   * - window.__SUPABASE_URL__ and window.__SUPABASE_ANON_KEY__
   * - OR environment variables (Netlify)
   * @returns {Promise<any>} Supabase client or null
   */
  async init() {
    try {
      // Get credentials from safe sources (meta tags or env vars)
      const url = this._getUrl();
      const key = this._getAnonKey();

      if (!url || !key) {
        console.warn('[Supabase] Credentials not configured - using localStorage fallback');
        return null;
      }

      // Validate credentials format
      if (!this._validateCredentials(url, key)) {
        console.error('[Supabase] Invalid credentials format');
        return null;
      }

      // Dynamic import to avoid bundle bloat if not used
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');

      this._instance = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      // Initialize auth listener
      this._setupAuthListener();
      this._isInitialized = true;

      console.log('[Supabase] Initialized ✅');
      return this._instance;
    } catch (error) {
      console.error('[Supabase] Init failed:', error.message);
      this._isInitialized = false;
      return null;
    }
  }

  /**
   * Get Supabase URL from safe sources
   * @returns {string|null}
   */
  _getUrl() {
    // Try meta tag first (injected by backend)
    const metaUrl = document.querySelector('meta[name="supabase-url"]')?.content;
    if (metaUrl) return metaUrl;

    // Try window variable (set by Netlify function or index.html)
    if (typeof window !== 'undefined' && window.__SUPABASE_URL__) {
      return window.__SUPABASE_URL__;
    }

    return null;
  }

  /**
   * Get Supabase anon key from safe sources
   * @returns {string|null}
   */
  _getAnonKey() {
    // Try meta tag first
    const metaKey = document.querySelector('meta[name="supabase-anon-key"]')?.content;
    if (metaKey) return metaKey;

    // Try window variable
    if (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) {
      return window.__SUPABASE_ANON_KEY__;
    }

    return null;
  }

  /**
   * Validate credentials format
   * @param {string} url
   * @param {string} key
   * @returns {boolean}
   */
  _validateCredentials(url, key) {
    const urlRegex = /^https:\/\/[a-z0-9]+\.supabase\.co$/;
    const keyRegex = /^ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.?[A-Za-z0-9_.~+\/-]*$/;

    return urlRegex.test(url) && keyRegex.test(key);
  }

  /**
   * Setup authentication state listener
   */
  _setupAuthListener() {
    if (!this._instance) return;

    try {
      this._instance.auth.onAuthStateChange((event, session) => {
        this._session = session;
        this._user = session?.user || null;

        console.log('[Supabase Auth]', event, this._user?.email || 'anonymous');

        // Dispatch custom event for components to react
        window.dispatchEvent(new CustomEvent('supabase-auth-change', {
          detail: { event, session, user: this._user }
        }));

        // Handle session sync
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          this._syncSessionToStorage(session);
        } else if (event === 'SIGNED_OUT') {
          this._clearSessionStorage();
        }
      });
    } catch (error) {
      console.error('[Supabase Auth] Listener setup failed:', error.message);
    }
  }

  /**
   * Save session to localStorage for persistence
   * @param {object} session
   */
  _syncSessionToStorage(session) {
    if (!session) return;
    try {
      localStorage.setItem('mz_session', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: { id: session.user.id, email: session.user.email }
      }));
    } catch (error) {
      console.warn('[Supabase] Session storage failed:', error.message);
    }
  }

  /**
   * Clear session from localStorage
   */
  _clearSessionStorage() {
    try {
      localStorage.removeItem('mz_session');
    } catch (error) {
      console.warn('[Supabase] Session clear failed:', error.message);
    }
  }

  /**
   * Get current authenticated user
   * @returns {object|null}
   */
  getUser() {
    return this._user;
  }

  /**
   * Get current session
   * @returns {object|null}
   */
  getSession() {
    return this._session;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this._user && !!this._session;
  }

  /**
   * Sign in with email and password
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{user, session, error}>}
   */
  async signIn(email, password) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;

      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      console.error('[Supabase] Sign in failed:', error.message);
      return { user: null, session: null, error: error.message };
    }
  }

  /**
   * Sign up with email and password
   * @param {string} email
   * @param {string} password
   * @param {object} metadata - Additional user metadata
   * @returns {Promise<{user, session, error}>}
   */
  async signUp(email, password, metadata = {}) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: metadata }
      });
      if (error) throw error;

      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      console.error('[Supabase] Sign up failed:', error.message);
      return { user: null, session: null, error: error.message };
    }
  }

  /**
   * Sign out current user
   * @returns {Promise<{error|null}>}
   */
  async signOut() {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { error } = await client.auth.signOut();
      if (error) throw error;

      return { error: null };
    } catch (error) {
      console.error('[Supabase] Sign out failed:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Get user by ID (requires RLS bypass or proper permissions)
   * @param {string} userId
   * @returns {Promise<{data, error}>}
   */
  async getUser(userId) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .from('perfis_usuarios')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[Supabase] Get user failed:', error.message);
      return { data: null, error: error.message };
    }
  }

  /**
   * Update user profile
   * @param {string} userId
   * @param {object} updates
   * @returns {Promise<{data, error}>}
   */
  async updateProfile(userId, updates) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .from('perfis_usuarios')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[Supabase] Update profile failed:', error.message);
      return { data: null, error: error.message };
    }
  }

  /**
   * Get user credits
   * @param {string} userId
   * @returns {Promise<{credits, error}>}
   */
  async getCredits(userId) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .from('perfis_usuarios')
        .select('creditos')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return { credits: data?.creditos || 0, error: null };
    } catch (error) {
      console.error('[Supabase] Get credits failed:', error.message);
      return { credits: 0, error: error.message };
    }
  }

  /**
   * Consume credits via RPC (atomic operation)
   * @param {string} userId
   * @param {number} amount
   * @returns {Promise<{credits, error}>}
   */
  async consumeCredits(userId, amount) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .rpc('consumir_creditos', {
          user_id: userId,
          amount: amount
        });

      if (error) throw error;
      return { credits: data || 0, error: null };
    } catch (error) {
      console.error('[Supabase] Consume credits failed:', error.message);
      return { credits: 0, error: error.message };
    }
  }

  /**
   * Get pending payments (admin only)
   * @returns {Promise<{payments, error}>}
   */
  async getPendingPayments() {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .from('pagamentos_pendentes')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { payments: data || [], error: null };
    } catch (error) {
      console.error('[Supabase] Get pending payments failed:', error.message);
      return { payments: [], error: error.message };
    }
  }

  /**
   * Submit payment (creates pending record)
   * @param {string} userId
   * @param {string} name
   * @param {string} phone
   * @param {string} transactionRef
   * @param {number} amount
   * @returns {Promise<{payment, error}>}
   */
  async submitPayment(userId, name, phone, transactionRef, amount) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .from('pagamentos_pendentes')
        .insert({
          user_id: userId,
          nome: name,
          telefone: phone,
          referencia_transacao: transactionRef,
          montante: amount,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      return { payment: data, error: null };
    } catch (error) {
      console.error('[Supabase] Submit payment failed:', error.message);
      return { payment: null, error: error.message };
    }
  }

  /**
   * Approve payment (admin only) via RPC
   * @param {string} paymentId
   * @returns {Promise<{success, error}>}
   */
  async approvePayment(paymentId) {
    try {
      const client = await this.getInstance();
      if (!client) throw new Error('Supabase not initialized');

      const { data, error } = await client
        .rpc('aprovar_pagamento_admin', {
          payment_id: paymentId
        });

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('[Supabase] Approve payment failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export const supabaseConfig = new SupabaseConfig();

// Auto-initialize on module load (non-blocking)
supabaseConfig.init().catch(err => {
  console.warn('[Supabase] Auto-init failed (will retry on first use)', err.message);
});
