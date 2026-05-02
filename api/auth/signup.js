// api/auth/signup.js
// Registo via número de telemóvel moçambicano + password — sem email obrigatório

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

    const { phone, fullName, password } = body;

    if (!phone) return res.status(400).json({ error: 'Número de telemóvel é obrigatório' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });

    // Normalizar para formato internacional moçambicano
    const clean = phone.replace(/\D/g, '');
    const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
    if (!/^\+2588[4-7]\d{7}$/.test(normalized)) {
        return res.status(400).json({ error: 'Número inválido. Use formato: 8X XXX XXXX (Vodacom/Tmcel/Movitel)' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        // Criar utilizador — phone como identificador principal
        const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
            phone: normalized,
            password,
            phone_confirm: true,
            user_metadata: { full_name: fullName || '', phone: normalized }
        });

        if (userErr) {
            if (userErr.message?.toLowerCase().includes('already') || userErr.message?.includes('registered')) {
                return res.status(409).json({ error: 'Este número já está registado' });
            }
            throw userErr;
        }

        // Trigger handle_new_user cria perfil com 3 créditos automaticamente

        return res.status(201).json({
            success: true,
            user: { id: userData.user.id, phone: normalized },
            message: 'Conta criada! 3 créditos grátis atribuídos.'
        });

    } catch (err) {
        console.error('[signup] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao criar conta' });
    }
}

export const config = { maxDuration: 30 };