// api/auth/signin.js
// Login via número de telemóvel + password

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

    const { phone, password } = body;

    if (!phone || !password) {
        return res.status(400).json({ error: 'Número de telemóvel e password são obrigatórios' });
    }

    // Normalizar número
    const clean = phone.replace(/\D/g, '');
    const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        const { data, error } = await supabase.auth.signInWithPassword({
            phone: normalized,
            password
        });

        if (error) {
            if (error.message?.includes('Invalid') || error.message?.includes('invalid')) {
                return res.status(401).json({ error: 'Número ou password incorrectos' });
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
                    phone: data.user.phone,
                    full_name: data.user.user_metadata?.full_name || ''
                }
            }
        });

    } catch (err) {
        console.error('[signin] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao iniciar sessão' });
    }
}

export const config = { maxDuration: 30 };