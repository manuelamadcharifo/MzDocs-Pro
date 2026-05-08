// api/auth/index.js
// Router único para todas as funções de autenticação.
// Elimina a necessidade de 4 funções separadas (Vercel Hobby limit = 12).
//
// Rotas (baseadas no path):
//   /api/auth/signin          → login com phone + password
//   /api/auth/signup          → registo com email + phone + password
//   /api/auth/reset-password  → recuperação de password via email
//   /api/auth/verify-otp      → deprecated, devolve 410

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Determinar sub-rota a partir do path
  const urlPath = (req.url || '').split('?')[0];
  const pathParts = urlPath.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const action = (lastSegment && lastSegment !== 'auth')
    ? lastSegment
    : (req.query?.action || '');

  switch (action) {
    case 'signin':         return handleSignin(req, res);
    case 'signup':         return handleSignup(req, res);
    case 'reset-password': return handleResetPassword(req, res);
    case 'verify-otp':     return res.status(410).json({ error: 'OTP por email não suportado. Use telemóvel + password.' });
    default:
      return res.status(404).json({ error: `Acção desconhecida: "${action}". Use: signin, signup, reset-password` });
  }
}

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNIN
// ─────────────────────────────────────────────────────────────────────────────
async function handleSignin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { phone, password } = body;
  if (!phone || !password)
    return res.status(400).json({ error: 'Número de telemóvel e password são obrigatórios' });
  const clean = phone.replace(/\D/g, '');
  const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({ phone: normalized, password });
    if (error) {
      if (error.message?.toLowerCase().includes('invalid'))
        return res.status(401).json({ error: 'Número ou password incorrectos' });
      throw error;
    }
    return res.status(200).json({
      success: true,
      session: {
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at:    data.session.expires_at,
        user: { id: data.user.id, phone: data.user.phone, full_name: data.user.user_metadata?.full_name || '' },
      },
    });
  } catch (err) {
    console.error('[auth/signin]', err);
    return res.status(500).json({ error: err.message || 'Erro ao iniciar sessão' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────────────────────────────────────
async function handleSignup(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { phone, email, fullName, password } = body;
  if (!phone)                        return res.status(400).json({ error: 'Número de telemóvel é obrigatório' });
  if (!email)                        return res.status(400).json({ error: 'E-mail é obrigatório' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
  const clean      = phone.replace(/\D/g, '');
  const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
  if (!/^\+2588[4-7]\d{7}$/.test(normalized))
    return res.status(400).json({ error: 'Número inválido. Use formato: 8X XXX XXXX (Vodacom/Tmcel/Movitel)' });
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName  = (fullName || '').trim();
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey     = process.env.SUPABASE_ANON_KEY;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!anonKey)     throw new Error('SUPABASE_ANON_KEY não configurada');
    if (!supabaseUrl) throw new Error('SUPABASE_URL não configurada');
    const supabaseAdmin = serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : null;
    if (supabaseAdmin) {
      const [{ data: byEmail }, { data: byPhone }] = await Promise.all([
        supabaseAdmin.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle(),
        supabaseAdmin.from('profiles').select('id').eq('phone', normalized).maybeSingle(),
      ]);
      if (byEmail) return res.status(409).json({ error: 'Este e-mail já está registado' });
      if (byPhone) return res.status(409).json({ error: 'Este número de telemóvel já está registado' });
    }
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await supabaseAnon.auth.signUp({
      email: normalizedEmail, password,
      options: { data: { full_name: normalizedName, phone: normalized, email: normalizedEmail } },
    });
    if (userErr) {
      const msg = userErr.message?.toLowerCase() || '';
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists'))
        return res.status(409).json({ error: 'Este e-mail já está registado' });
      throw userErr;
    }
    if (userData.user?.identities?.length === 0)
      return res.status(409).json({ error: 'Este e-mail já está registado' });
    const userId = userData.user?.id;
    if (!userId) throw new Error('Utilizador criado mas sem ID — contacte o suporte');
    const profilePayload = {
      id: userId, phone: normalized, email: normalizedEmail,
      full_name: normalizedName, updated_at: new Date().toISOString(),
    };
    let profileSaved = false;
    if (supabaseAdmin) {
      await new Promise(r => setTimeout(r, 400));
      const { error: upsertErr } = await supabaseAdmin.from('profiles').upsert(profilePayload, { onConflict: 'id' });
      if (upsertErr) console.error('[auth/signup] Erro ao gravar perfil (admin):', upsertErr.message);
      else profileSaved = true;
    }
    if (!profileSaved && userData.session) {
      const supabaseUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${userData.session.access_token}` } },
      });
      const { error: updateErr } = await supabaseUser.from('profiles')
        .update({ phone: normalized, email: normalizedEmail, full_name: normalizedName }).eq('id', userId);
      if (!updateErr) profileSaved = true;
    }
    if (!profileSaved)
      console.warn(`[auth/signup] Phone ${normalized} NÃO gravado para user ${userId}. Configure SUPABASE_SERVICE_ROLE_KEY.`);
    return res.status(201).json({
      success: true,
      user: { id: userId, phone: normalized, email: normalizedEmail },
      session: userData.session || null,
      message: 'Conta criada! 3 créditos grátis atribuídos.',
      _debug: { profileSaved, hasServiceRole: !!serviceKey, hasSession: !!userData.session },
    });
  } catch (err) {
    console.error('[auth/signup]', err);
    return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET-PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
async function handleResetPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Body JSON inválido' });
  const { email } = body;
  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/?reset=true`,
    });
  } catch (err) {
    console.error('[auth/reset-password]', err);
  }
  // Sempre resposta genérica por segurança
  return res.status(200).json({ success: true, message: 'Se o e-mail estiver registado, receberá um link de recuperação em breve.' });
}

export const config = { maxDuration: 30 };
