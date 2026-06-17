// api/auth/index.js — v2.0 (AUDITORIA Junho/2026)
// ALTERAÇÕES v2.0:
//  1. Removido @supabase/supabase-js + require('ws') — usa api/_lib/supabaseAdmin.js
//     para operações com service_role. SignIn/SignUp/Reset usam fetch directo ao
//     endpoint GoTrue (/auth/v1/*) via anonAuthRequest().
//  2. Validação de telefone corrigida de 8[4-7] para 8[2-7] — aceita M-Pesa,
//     e-Mola e mKesh (auditoria 3.6).
//  3. Lógica de negócio 100% preservada da v1.0.

const {
  getUserFromToken,
  selectOne,
  insert,
  update,
  restRequest,
  anonAuthRequest,
  adminSendRecovery,
  SUPABASE_URL,
  SERVICE_KEY,
} = require('../_lib/supabaseAdmin');

const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlPath    = (req.url || '').split('?')[0];
  const pathParts  = urlPath.split('/').filter(Boolean);
  const lastSegment = pathParts[pathParts.length - 1];
  const action = (lastSegment && lastSegment !== 'auth')
    ? lastSegment
    : (req.query?.action || '');

  switch (action) {
    case 'signin':         return handleSignin(req, res);
    case 'signup':         return handleSignup(req, res);
    case 'reset-password': return handleResetPassword(req, res);
    case 'verify-otp':
      return res.status(410).json({ error: 'OTP por email não suportado. Use telemóvel + password.' });
    default:
      return res.status(404).json({ error: `Acção desconhecida: "${action}". Use: signin, signup, reset-password` });
  }
};

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

  const clean      = phone.replace(/\D/g, '');
  const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;

  try {
    const { data, ok, status } = await anonAuthRequest('token?grant_type=password', {
      phone: normalized,
      password,
    });

    if (!ok) {
      const msg = (data?.error_description || data?.msg || '').toLowerCase();
      if (msg.includes('invalid') || status === 400 || status === 401)
        return res.status(401).json({ error: 'Número ou password incorrectos' });
      throw new Error(data?.error_description || `HTTP ${status}`);
    }

    return res.status(200).json({
      success: true,
      session: {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at,
        user: {
          id:        data.user?.id,
          phone:     data.user?.phone,
          full_name: data.user?.user_metadata?.full_name || '',
        },
      },
    });
  } catch (err) {
    console.error('[auth/signin]', err.message);
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

  const { phone, email, fullName, password, ref_code } = body;
  if (!phone)                          return res.status(400).json({ error: 'Número de telemóvel é obrigatório' });
  if (!email)                          return res.status(400).json({ error: 'E-mail é obrigatório' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });

  const clean      = phone.replace(/\D/g, '');
  const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;

  // CORRIGIDO (auditoria 3.6): aceitar 8[2-7] — M-Pesa, e-Mola e mKesh
  if (!/^\+2588[2-7]\d{7}$/.test(normalized))
    return res.status(400).json({ error: 'Número inválido. Use formato: 8X XXX XXXX (M-Pesa, e-Mola ou mKesh)' });

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName  = (fullName || '').trim();

  if (!SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  try {
    // Verificar duplicados (com service_role, contorna RLS)
    if (SERVICE_KEY) {
      const [byEmail, byPhone] = await Promise.all([
        selectOne('profiles', 'email', normalizedEmail, 'id').catch(() => null),
        selectOne('profiles', 'phone', normalized, 'id').catch(() => null),
      ]);
      if (byEmail) return res.status(409).json({ error: 'Este e-mail já está registado' });
      if (byPhone) return res.status(409).json({ error: 'Este número de telemóvel já está registado' });
    }

    // Criar utilizador via GoTrue anon key
    const { data: userData, ok: signupOk, status: signupStatus } = await anonAuthRequest('signup', {
      email: normalizedEmail,
      password,
      options: { data: { full_name: normalizedName, phone: normalized, email: normalizedEmail } },
    });

    if (!signupOk) {
      const msg = (userData?.error_description || userData?.msg || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || signupStatus === 409)
        return res.status(409).json({ error: 'Este e-mail já está registado' });
      throw new Error(userData?.error_description || `HTTP ${signupStatus}`);
    }

    if (userData?.user?.identities?.length === 0)
      return res.status(409).json({ error: 'Este e-mail já está registado' });

    const userId = userData?.user?.id;
    if (!userId) throw new Error('Utilizador criado mas sem ID — contacte o suporte');

    const profilePayload = {
      id:               userId,
      phone:            normalized,
      email:            normalizedEmail,
      full_name:        normalizedName,
      updated_at:       new Date().toISOString(),
      account_type:     'normal',
      credits:          1,
      credits_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // Verificar link de afiliado
    if (ref_code && typeof ref_code === 'string' && /^MZ-[A-Z0-9]{6}$/.test(ref_code)) {
      const affProfile = await selectOne('profiles', 'ref_code', ref_code, 'id,is_affiliate').catch(() => null);
      if (affProfile) profilePayload.referred_by = affProfile.id;
    }

    // Responder imediatamente — não bloquear na gravação do perfil
    res.status(201).json({
      success: true,
      user:    { id: userId, phone: normalized, email: normalizedEmail },
      session: userData.session || null,
      message: 'Conta criada! 1 crédito grátis atribuído (válido 1 mês).',
    });

    // ── Gravar perfil em background ───────────────────────────────────────
    if (!SERVICE_KEY) {
      console.warn(`[auth/signup] Sem service role — perfil não gravado para ${userId.slice(0,8)}***`);
      return;
    }

    await new Promise(r => setTimeout(r, 600));

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await restRequest('profiles', {
          method: 'POST',
          body:   profilePayload,
          prefer: 'resolution=merge-duplicates,return=minimal',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        });
        console.log(`[auth/signup] Perfil gravado (tentativa ${attempt + 1})`);
        return;
      } catch (err) {
        console.warn(`[auth/signup] upsert tentativa ${attempt + 1}/3:`, err.message);
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    console.error(`[auth/signup] Perfil NÃO gravado após 3 tentativas para ${userId.slice(0,8)}***`);

  } catch (err) {
    console.error('[auth/signup]', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
    }
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
    await adminSendRecovery(email.trim().toLowerCase(), `${origin}/?reset=true`);
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
  }
  // Resposta sempre genérica por segurança (não revelar se email existe)
  return res.status(200).json({
    success: true,
    message: 'Se o e-mail estiver registado, receberá um link de recuperação em breve.',
  });
}
