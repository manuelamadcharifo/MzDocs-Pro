// api/auth/reset-password.js
// Envio de email de recuperação de password

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

    const { email } = body;

    if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        const redirectTo = process.env.SITE_URL
            ? `${process.env.SITE_URL}/auth/reset-password`
            : 'https://mz-docs-pro.vercel.app/auth/reset-password';

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo
        });

        if (error) throw error;

        // Não revela se o email existe (segurança)
        return res.status(200).json({
            success: true,
            message: 'Se o email estiver registado, receberá instruções de recuperação.'
        });

    } catch (err) {
        // Mesmo em erro, retorna mensagem genérica
        console.error('[reset-password] Erro:', err);
        return res.status(200).json({
            success: true,
            message: 'Se o email estiver registado, receberá instruções de recuperação.'
        });
    }
}

export const config = { maxDuration: 30 };