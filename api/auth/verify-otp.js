// api/auth/verify-otp.js
// Verificação de token OTP/magic link

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

    const { token_hash, type = 'email' } = body;

    if (!token_hash) {
        return res.status(400).json({ error: 'Token é obrigatório' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type
        });

        if (error) {
            if (error.message?.includes('expired') || error.message?.includes('Invalid')) {
                return res.status(400).json({ error: 'Token inválido ou expirado' });
            }
            throw error;
        }

        return res.status(200).json({
            success: true,
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                user: {
                    id: data.user.id,
                    email: data.user.email
                }
            }
        });

    } catch (err) {
        console.error('[verify-otp] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao verificar token' });
    }
}

export const config = { maxDuration: 30 };