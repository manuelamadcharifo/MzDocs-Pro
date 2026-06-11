// assets/js/auth/AuthManager.js — v2.4 (corrigido getValidToken needsRefresh)
// CORRECÇÃO v2.4:
//   getValidToken: (expiresAt && expiresAt-nowSecs < 60) cortocircuitava quando
//   expiresAt era undefined/null — token stale devolvido sem refresh → 401 no servidor.
//   Agora: !expiresAt trata-se como expirado; token definitivamente expirado não é
//   devolvido mesmo em caso de falha de rede no refresh.
export class AuthManager {
 constructor() {
 this.user = undefined;
 this.session = null;
 this.supabase = null;
 this._isAdmin = false;
 this._listeners = [];
 this._initPromise = this._init();
 }

 async _init() {
 try {
 let res = null;
 try {
 const r = await fetch('/api/config');
 if (r.ok && r.headers.get('content-type')?.includes('application/json')) res = r;
 } catch { }

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
 global: { headers: { 'x-client-info': 'mzdocs-pro/7.1' } },
 });

 const { data: { session }, error: sessErr } = await this.supabase.auth.getSession();
 if (session) {
 const expiresAt = session.expires_at;
 const nowSecs = Math.floor(Date.now() / 1000);
 // CORRIGIDO v2.4: se expiresAt ausente ou token expirado, forçar refresh
 const needRefresh = !expiresAt || (expiresAt - nowSecs) < 60;
 if (needRefresh) {
 const { data: refreshed, error: refreshErr } = await this.supabase.auth.refreshSession();
 if (refreshErr || !refreshed?.session) {
   // Refresh token inválido/expirado — limpar sessão e forçar novo login
   console.warn('[AuthManager] Refresh token inválido — sessão limpa:', refreshErr?.message);
   await this.supabase.auth.signOut();
   this.session = null;
   this.user = null;
   this._notify();
   return;
 }
 this.session = refreshed.session;
 } else {
 this.session = session;
 }
 this.user = this.session.user;
 await this._loadProfile(this.session.user.id);
 } else {
 this.user = null;
 }

 const { data: { subscription } } = this.supabase.auth.onAuthStateChange(async (_event, session) => {
 if (this._suppressAuthStateChange) {
   console.log('[AuthManager] onAuthStateChange suprimido durante signUp');
   return;
 }
 this.session = session;
 this.user = session?.user || null;
 if (this.user) {
 await this._loadProfile(this.user.id);
 } else {
 this._isAdmin = false;
 }
 this._notify();
 });
 this._authSubscription = subscription;

 } catch (err) {
 console.error('[AuthManager] Erro de inicialização:', err);
 this.user = null;
 }
 this._notify();
 }

 // Perfil público — acessível via window.authManager.profile
 get profile() { return this.user?._profile || null; }

 async _loadProfile(userId) {
 if (!this.supabase || !userId) return;
 for (let attempt = 1; attempt <= 4; attempt++) {
 try {
 const { data, error } = await this.supabase
 .from('profiles')
 .select('is_admin, is_blocked, credits, full_name, email, phone, account_type, credits_expires_at, free_credit_used')
 .eq('id', userId)
 .single();
 if (error && error.code !== 'PGRST116') {
 console.warn('[AuthManager] _loadProfile erro:', error.message);
 }
 if (data) {
 this._isAdmin   = data?.is_admin   === true;
 this._isBlocked = data?.is_blocked === true;
 if (this.user) this.user._profile = data || null;
 return;
 }
 if (attempt < 4) {
 await new Promise(r => setTimeout(r, 400 * attempt));
 }
 } catch (err) {
 console.warn('[AuthManager] _loadProfile excepção:', err.message);
 if (attempt >= 4) this._isAdmin = false;
 }
 }
 }

 async ready() { return this._initPromise; }
 isAuthenticated() { return !!this.user; }
 isAdmin()   { return this._isAdmin   === true; }
 isBlocked() { return this._isBlocked === true; }

 async _withTimeout(promise, ms, errMsg) {
 return Promise.race([
 promise,
 new Promise((_, reject) => setTimeout(() => reject(new Error(errMsg || 'timeout')), ms)),
 ]);
 }

  async signUp(phone, email, password, fullName = '') {
    console.log('[AuthManager] signUp: A iniciar criação de conta…', { email, phone });

    // Capturar ref_code do link de afiliado se existir
    const refCode = sessionStorage.getItem('mz_ref') || null;

    let res;
    try {
      res = await this._withTimeout(
        fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, email, password, fullName, ref_code: refCode })
        }),
        15000,
        'O servidor demorou demasiado a criar a conta. Tente novamente.'
      );
    } catch (fetchErr) {
      console.error('[AuthManager] signUp: Erro de rede:', fetchErr);
      throw fetchErr;
    }

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      console.error('[AuthManager] signUp: Resposta inválida do servidor:', jsonErr);
      throw new Error('Resposta inválida do servidor. Tente novamente.');
    }

    console.log('[AuthManager] signUp: Resposta:', { status: res.status, ok: res.ok, hasSession: !!data.session, hasUser: !!data.user });

    if (!res.ok) {
      console.error('[AuthManager] signUp: Erro:', data.error);
      throw new Error(data.error || 'Erro ao criar conta');
    }

    // Caso 1: servidor devolveu sessão (login automático)
    if (data.session && this.supabase) {
      console.log('[AuthManager] signUp: Sessão recebida, aplicando setSession…');
      // Suprimir onAuthStateChange durante setSession para evitar bloqueio
      // (o listener tentaria _loadProfile antes do perfil existir no Supabase)
      this._suppressAuthStateChange = true;
      try {
        const { data: sessData, error: sessErr } = await this.supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessErr) {
          console.warn('[AuthManager] signUp: setSession warning:', sessErr.message);
        } else {
          console.log('[AuthManager] signUp: setSession OK ✅');
        }
        // Usar a sessão confirmada pelo Supabase (ou a do servidor como fallback)
        this.session = sessData?.session || data.session;
        this.user = this.session?.user || data.session?.user || data.user || null;
        console.log('[AuthManager] signUp: user definido =', this.user?.id);
        // Carregar perfil em background sem bloquear
        setTimeout(() => {
          this._suppressAuthStateChange = false; // reativar listener
          this._loadProfile(this.user?.id).catch(e =>
            console.warn('[AuthManager] signUp: _loadProfile bg falhou:', e)
          );
        }, 2000);
        this._notify();
        return data;
      } catch (sessException) {
        console.error('[AuthManager] signUp: Excepção em setSession:', sessException);
        this._suppressAuthStateChange = false;
      }
    }

    // Caso 2: conta criada sem sessão — tentar auto-login
    if (this.supabase && data.user) {
      console.log('[AuthManager] signUp: Tentando auto-login…');
      await new Promise(r => setTimeout(r, 800));
      try {
        const loginResult = await this._withTimeout(
          this.supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password }),
          8000,
          'timeout'
        );
        const { data: loginData, error: loginErr } = loginResult;
        if (loginErr) {
          console.warn('[AuthManager] signUp: auto-login erro:', loginErr.message);
          const msg = (loginErr.message || '').toLowerCase();
          if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
            this.user = null;
            this._notify();
            return { ...data, _emailConfirmRequired: true };
          }
        } else if (loginData?.session) {
          console.log('[AuthManager] signUp: auto-login OK ✅', loginData.user?.id);
          this.session = loginData.session;
          this.user = loginData.user;
          setTimeout(() => this._loadProfile(this.user?.id).catch(e =>
            console.warn('[AuthManager] signUp: _loadProfile bg falhou:', e)
          ), 1500);
          this._notify();
          return { ...data, session: loginData.session, _autoLogin: true };
        }
      } catch (e) {
        console.error('[AuthManager] signUp: Excepção no auto-login:', e.message);
        const msg = (e.message || '').toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          this.user = null;
          this._notify();
          return { ...data, _emailConfirmRequired: true };
        }
      }
    }

    // Caso 3: sem sessão automática
    console.info('[AuthManager] signUp: Conta criada sem sessão automática');
    this.user = null;
    this._notify();
    return data;
  }

 async signIn(identifier, password) {
 if (!this.supabase) throw new Error('Supabase não configurado');
 const isEmail = identifier.includes('@');
 let credentials;

 if (isEmail) {
 credentials = { email: identifier.trim(), password };
 } else {
 const clean = identifier.replace(/\D/g, '');
 const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
 const { data: phoneData, error: phoneError } = await this.supabase.auth.signInWithPassword({ phone: normalized, password });
 if (!phoneError && phoneData?.user) {
 this.session = phoneData.session;
 this.user = phoneData.user;
 await this._loadProfile(phoneData.user.id);
 this._notify();
 return phoneData;
 }
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
 this.user = data.user;
 await this._loadProfile(data.user.id);
 this._notify();
 return data;
 }

 async resetPasswordByEmail(email) {
 if (!this.supabase) throw new Error('Supabase não configurado');
 const siteUrl = window.location.origin;
 const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), {
 redirectTo: `${siteUrl}/?reset=true`,
 });
 if (error) throw new Error(error.message);
 return { success: true };
 }

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

 async signInAnonymous() {
 this.user = null;
 this._isAdmin = false;
 this._notify();
 return { anonymous: true };
 }

 async signOut() {
 if (this.supabase) await this.supabase.auth.signOut();
 this.session = null;
 this.user = null;
 this._isAdmin = false;
 this._notify();
 }

 getToken() { return this.session?.access_token || null; }

 async getValidToken() {
    if (!this.supabase) return null;
    const expiresAt = this.session?.expires_at;
    const nowSecs   = Math.floor(Date.now() / 1000);

    // CORRIGIDO v2.4: (expiresAt && ...) cortocircuitava para false quando expiresAt
    // era undefined/null — o token stale era devolvido sem refresh.
    // Agora: se expiresAt ausente tratamos como expirado (mais seguro).
    const tokenExpired  = !expiresAt || (expiresAt - nowSecs) < 0;
    const tokenNearExp  = expiresAt  && (expiresAt - nowSecs) < 60;
    const needsRefresh  = !this.session || tokenExpired || tokenNearExp;

    if (!needsRefresh) return this.session?.access_token || null;

    // Mutex: se já há um refresh em curso, esperar o mesmo promise
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = (async () => {
      try {
        const { data, error } = await Promise.race([
          this.supabase.auth.refreshSession(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('refresh timeout')), 8000)),
        ]);
        if (error || !data?.session) {
          // Token inválido — limpar sessão para forçar novo login
          console.warn('[AuthManager] refresh token inválido:', error?.message);
          this.session = null;
          this.user = null;
          await this.supabase.auth.signOut();
          this._notify();
        } else {
          this.session = data.session;
          this.user    = data.session.user;
        }
      } catch (err) {
        console.warn('[AuthManager] refresh falhou:', err.message);
        // Em caso de timeout/erro de rede: só devolver token se NÃO estiver definitivamente expirado
        if (tokenExpired) {
          // Token já expirou — não adianta enviá-lo ao servidor (vai dar 401 na mesma)
          this.session = null;
          this.user = null;
          this._notify();
        }
        // Se apenas tokenNearExp (< 60s mas ainda válido), o token actual ainda serve
      } finally {
        this._refreshPromise = null;
      }
      return this.session?.access_token || null;
    })();

    return this._refreshPromise;
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
