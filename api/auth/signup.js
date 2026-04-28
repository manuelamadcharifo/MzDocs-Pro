// api/auth/signup.js
// Registo de utilizadores via Supabase Admin SDK

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Body JSON inválido' });
    }

    const { email, password, fullName, phone } = body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e password são obrigatórios' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Verificar se email já existe
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Email já registado' });
        }

        // Criar utilizador via Admin SDK
        const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, phone }
        });

        if (userErr) throw userErr;

        // O trigger handle_new_user cria o perfil automaticamente com 3 créditos

        return res.status(201).json({
            success: true,
            user: {
                id: userData.user.id,
                email: userData.user.email
            },
            message: 'Conta criada com sucesso. 3 créditos grátis atribuídos!'
        });

    } catch (err) {
        console.error('[signup] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
    }
}

export const config = { maxDuration: 30 };