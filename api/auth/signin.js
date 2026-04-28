// api/auth/signin.js
// Login de utilizadores via Supabase

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

    const { email, password } = body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e password são obrigatórios' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            if (error.message?.includes('Invalid login')) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            throw error;
        }

        return res.status(200).json({
            success: true,
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
                user: {
                    id: data.user.id,
                    email: data.user.email
                }
            }
        });

    } catch (err) {
        console.error('[signin] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao iniciar sessão' });
    }
}

export const config = { maxDuration: 30 };