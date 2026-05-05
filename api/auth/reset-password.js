// api/auth/reset-password.js
// Recuperação de password via e-mail — Supabase envia o link gratuitamente
// Não requer SMS pago nem OTP — funciona com qualquer plano gratuito

export default async function handler(req, res) {
    const origin  = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';
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

    const { email } = body;

    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'E-mail inválido' });

    try {
        const { createClient } = await import('@supabase/supabase-js');
        // Usar anon key para o resetPasswordForEmail — não precisa de service key
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
            redirectTo: `${origin}/?reset=true`,
        });

        // Sempre devolver sucesso por segurança — não revelar se o email existe
        return res.status(200).json({
            success: true,
            message: 'Se o e-mail estiver registado, receberá um link de recuperação em breve.',
        });

    } catch (err) {
        console.error('[reset-password] Erro:', err);
        // Mesmo em caso de erro — resposta genérica por segurança
        return res.status(200).json({
            success: true,
            message: 'Se o e-mail estiver registado, receberá um link de recuperação em breve.',
        });
    }
}

export const config = { maxDuration: 15 };
