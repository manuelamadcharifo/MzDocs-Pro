// assets/js/auth/AuthManager.js
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
 const needRefresh = expiresAt && (expiresAt - nowSecs) < 60;
 if (needRefresh) {
 const { data: refreshed } = await this.supabase.auth.refreshSession();
 this.session = refreshed?.session || session;
 } else {
 this.session = session;
 }
 this.user = this.session.user;
 await this._loadProfile(this.session.user.id);
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

 async _loadProfile(userId) {
 if (!this.supabase || !userId) return;
 for (let attempt = 1; attempt <= 4; attempt++) {
 try {
 const { data, error } = await this.supabase
 .from('profiles')
 .select('is_admin, credits, full_name, email, phone')
 .eq('id', userId)
 .single();
 if (error && error.code !== 'PGRST116') {
 console.warn('[AuthManager] _loadProfile erro:', error.message);
 }
 if (data) {
 this._isAdmin = data?.is_admin === true;
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
 isAdmin() { return this._isAdmin === true; }

 async _withTimeout(promise, ms, errMsg) {
 return Promise.race([
 promise,
 new Promise((_, reject) => setTimeout(() => reject(new Error(errMsg || 'timeout')), ms)),
 ]);
 }

 async signUp(phone, email, password, fullName = '') {
 const res = await this._withTimeout(
 fetch('/api/auth/signup', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ phone, email, password, fullName })
 }),
 15000,
 'O servidor demorou demasiado a criar a conta. Tente novamente.'
 );

 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');

 if (data.session && this.supabase) {
 try {
 await this.supabase.auth.setSession({
 access_token: data.session.access_token,
 refresh_token: data.session.refresh_token,
 });
 this.session = data.session;
 this.user = data.session?.user || data.user || null;
 if (this.user?.id) await this._loadProfile(this.user.id);
 this._notify();
 return data;
 } catch (_) { }
 }

 if (this.supabase && data.user) {
 await new Promise(r => setTimeout(r, 800));
 try {
 const loginResult = await this._withTimeout(
 this.supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password }),
 8000,
 'timeout'
 );
 const { data: loginData, error: loginErr } = loginResult;
 if (!loginErr && loginData?.session) {
 this.session = loginData.session;
 this.user = loginData.user;
 if (this.user?.id) await this._loadProfile(this.user.id);
 this._notify();
 return { ...data, session: loginData.session, _autoLogin: true };
 }
 } catch (e) {
 const msg = (e.message || '').toLowerCase();
 if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
 this.user = null;
 this._notify();
 return { ...data, _emailConfirmRequired: true };
 }
 }
 }

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
 const nowSecs = Math.floor(Date.now() / 1000);
 if (!this.session || (expiresAt && (expiresAt - nowSecs) < 60)) {
 const { data } = await this.supabase.auth.refreshSession();
 if (data?.session) {
 this.session = data.session;
 this.user = data.session.user;
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
