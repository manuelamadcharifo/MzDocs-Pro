// api/auth/signup.js
// Registo via email + telemóvel + password
// FIX: phone agora gravado via upsert com service_role (não depende de session)

export default async function handler(req, res) {
    const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Body JSON inválido' });
    }

    const { phone, email, fullName, password } = body;

    // Validações
    if (!phone)    return res.status(400).json({ error: 'Número de telemóvel é obrigatório' });
    if (!email)    return res.status(400).json({ error: 'E-mail é obrigatório' });
    if (!password || password.length < 6)
                   return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'E-mail inválido' });

    // Normalizar telemóvel moçambicano
    const clean      = phone.replace(/\D/g, '');
    const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
    if (!/^\+2588[4-7]\d{7}$/.test(normalized)) {
        return res.status(400).json({ error: 'Número inválido. Use formato: 8X XXX XXXX (Vodacom/Tmcel/Movitel)' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName  = (fullName || '').trim();

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl      = process.env.SUPABASE_URL;
        const anonKey          = process.env.SUPABASE_ANON_KEY;
        const serviceKey       = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!anonKey)     throw new Error('SUPABASE_ANON_KEY não configurada');
        if (!supabaseUrl) throw new Error('SUPABASE_URL não configurada');

        // Cliente admin (service_role) — permite bypass de RLS para gravar phone
        // sem service_role a funcionalidade fica degradada mas não quebra
        const supabaseAdmin = serviceKey
            ? createClient(supabaseUrl, serviceKey, {
                auth: { autoRefreshToken: false, persistSession: false }
              })
            : null;

        // ── Verificar duplicados ───────────────────────────────────────
        if (supabaseAdmin) {
            const [{ data: byEmail }, { data: byPhone }] = await Promise.all([
                supabaseAdmin.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle(),
                supabaseAdmin.from('profiles').select('id').eq('phone', normalized).maybeSingle(),
            ]);
            if (byEmail) return res.status(409).json({ error: 'Este e-mail já está registado' });
            if (byPhone) return res.status(409).json({ error: 'Este número de telemóvel já está registado' });
        }

        // ── Criar utilizador no Supabase Auth ─────────────────────────
        // Usamos anon key para signUp mas passamos os dados no metadata
        // para o trigger SQL os poder usar ao criar o perfil
        const supabaseAnon = createClient(supabaseUrl, anonKey);
        const { data: userData, error: userErr } = await supabaseAnon.auth.signUp({
            email:    normalizedEmail,
            password,
            options: {
                data: {
                    full_name: normalizedName,
                    phone:     normalized,
                    email:     normalizedEmail,
                },
            },
        });

        if (userErr) {
            const msg = userErr.message?.toLowerCase() || '';
            if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
                return res.status(409).json({ error: 'Este e-mail já está registado' });
            }
            throw userErr;
        }

        // Email já registado mas não confirmado: Supabase devolve identities vazio
        if (userData.user?.identities?.length === 0) {
            return res.status(409).json({ error: 'Este e-mail já está registado' });
        }

        const userId = userData.user?.id;
        if (!userId) throw new Error('Utilizador criado mas sem ID — contacte o suporte');

        // ── Gravar phone + dados no perfil (FIX PRINCIPAL) ────────────
        // O trigger SQL cria o registo base em profiles quando o auth.user é inserido.
        // Fazemos upsert para garantir que phone, email e full_name ficam gravados
        // independentemente de:
        //   a) O email estar ou não confirmado (session pode ser null)
        //   b) O trigger ter ou não extraído o phone do user_metadata
        //   c) A ordem de execução trigger vs. este update

        const profilePayload = {
            id:         userId,
            phone:      normalized,
            email:      normalizedEmail,
            full_name:  normalizedName,
            updated_at: new Date().toISOString(),
        };

        let profileSaved = false;

        if (supabaseAdmin) {
            // Caminho ideal: service_role bypassa RLS, funciona sempre
            // Pequeno delay para garantir que o trigger SQL já criou o registo
            await new Promise(r => setTimeout(r, 400));

            const { error: upsertErr } = await supabaseAdmin
                .from('profiles')
                .upsert(profilePayload, { onConflict: 'id' });

            if (upsertErr) {
                console.error('[signup] Erro ao gravar perfil (admin):', upsertErr.message);
            } else {
                profileSaved = true;
            }
        }

        if (!profileSaved && userData.session) {
            // Fallback: usar token do utilizador (funciona se email confirmation estiver desligado)
            const supabaseUser = createClient(supabaseUrl, anonKey, {
                global: { headers: { Authorization: `Bearer ${userData.session.access_token}` } },
            });
            const { error: updateErr } = await supabaseUser
                .from('profiles')
                .update({ phone: normalized, email: normalizedEmail, full_name: normalizedName })
                .eq('id', userId);

            if (updateErr) {
                console.warn('[signup] Erro no fallback update (sem service_role):', updateErr.message);
            } else {
                profileSaved = true;
            }
        }

        if (!profileSaved) {
            // Último recurso: log para debug — não bloqueia o signup
            console.warn(`[signup] Phone ${normalized} NÃO gravado para user ${userId}. Configure SUPABASE_SERVICE_ROLE_KEY.`);
        }

        return res.status(201).json({
            success: true,
            user: {
                id:    userId,
                phone: normalized,
                email: normalizedEmail,
            },
            session: userData.session || null,
            message: 'Conta criada! 3 créditos grátis atribuídos.',
            _debug: { profileSaved, hasServiceRole: !!serviceKey, hasSession: !!userData.session }
        });

    } catch (err) {
        console.error('[signup] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
    }
}

export const config = { maxDuration: 30 };
