// api/auth/signup.js
// Registo via número de telemóvel (principal) + email (secundário/recuperação) + password

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
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        // Verificar se email já existe na tabela profiles
        const { data: existingEmail } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

        if (existingEmail) {
            return res.status(409).json({ error: 'Este e-mail já está registado' });
        }

        // Verificar se telemóvel já existe na tabela profiles
        const { data: existingPhone } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', normalized)
            .maybeSingle();

        if (existingPhone) {
            return res.status(409).json({ error: 'Este número de telemóvel já está registado' });
        }

        // Criar utilizador no Supabase Auth
        // Usamos email como identificador principal do Auth (mais suportado pelo Supabase gratuito)
        // O phone fica nos metadados e na tabela profiles
        const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
            email:          email.toLowerCase().trim(),
            phone:          normalized,
            password,
            email_confirm:  true,  // confirmar email automaticamente (sem OTP)
            phone_confirm:  true,  // confirmar phone automaticamente (sem SMS pago)
            user_metadata: {
                full_name: fullName || '',
                phone:     normalized,
                email:     email.toLowerCase().trim(),
            },
        });

        if (userErr) {
            const msg = userErr.message?.toLowerCase() || '';
            if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
                return res.status(409).json({ error: 'Este e-mail ou número já está registado' });
            }
            throw userErr;
        }

        // Actualizar o perfil criado pelo trigger com o email
        // (o trigger handle_new_user cria o perfil — aqui apenas adicionamos o email)
        await supabase
            .from('profiles')
            .update({ email: email.toLowerCase().trim() })
            .eq('id', userData.user.id);

        return res.status(201).json({
            success: true,
            user: {
                id:    userData.user.id,
                phone: normalized,
                email: email.toLowerCase().trim(),
            },
            message: 'Conta criada! 3 créditos grátis atribuídos.',
        });

    } catch (err) {
        console.error('[signup] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
    }
}

export const config = { maxDuration: 30 };
