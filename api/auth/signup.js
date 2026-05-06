// api/auth/signup.js
// Registo via email (principal) + telemóvel (secundário) + password
// Usa supabase.auth.signUp() com anon key — não requer service_role key

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

    try {
        const { createClient } = await import('@supabase/supabase-js');

        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey     = process.env.SUPABASE_ANON_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;

        if (!anonKey) throw new Error('SUPABASE_ANON_KEY não configurada');

        // Verificar duplicados com service_role (se disponível)
        if (serviceKey) {
            const supabaseAdmin = createClient(supabaseUrl, serviceKey);

            const { data: existingEmail } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('email', email.toLowerCase().trim())
                .maybeSingle();

            if (existingEmail) {
                return res.status(409).json({ error: 'Este e-mail já está registado' });
            }

            const { data: existingPhone } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('phone', normalized)
                .maybeSingle();

            if (existingPhone) {
                return res.status(409).json({ error: 'Este número de telemóvel já está registado' });
            }
        }

        // Criar utilizador com signUp público (anon key) — não precisa de service_role
        // Desligar "Confirm email" no Supabase Dashboard → conta activa imediatamente
        const supabaseAnon = createClient(supabaseUrl, anonKey);
        const { data: userData, error: userErr } = await supabaseAnon.auth.signUp({
            email:    email.toLowerCase().trim(),
            password,
            options: {
                data: {
                    full_name: fullName || '',
                    phone:     normalized,
                    email:     email.toLowerCase().trim(),
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

        // Email já registado mas não confirmado: Supabase devolve user com identities vazio
        if (userData.user && userData.user.identities && userData.user.identities.length === 0) {
            return res.status(409).json({ error: 'Este e-mail já está registado' });
        }

        // Actualizar perfil com telemóvel + email (o trigger cria o registo base)
        if (userData.session) {
            // Usar token do utilizador recém-criado (melhor prática — respeita RLS)
            const supabaseUser = createClient(supabaseUrl, anonKey, {
                global: { headers: { Authorization: `Bearer ${userData.session.access_token}` } },
            });
            await supabaseUser
                .from('profiles')
                .update({ phone: normalized, email: email.toLowerCase().trim(), full_name: fullName || '' })
                .eq('id', userData.user.id);
        } else if (serviceKey) {
            const supabaseAdmin = createClient(supabaseUrl, serviceKey);
            await supabaseAdmin
                .from('profiles')
                .update({ phone: normalized, email: email.toLowerCase().trim(), full_name: fullName || '' })
                .eq('id', userData.user.id);
        }

        return res.status(201).json({
            success: true,
            user: {
                id:    userData.user.id,
                phone: normalized,
                email: email.toLowerCase().trim(),
            },
            session: userData.session || null,
            message: 'Conta criada! 3 créditos grátis atribuídos.',
        });

    } catch (err) {
        console.error('[signup] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
    }
}

export const config = { maxDuration: 30 };
