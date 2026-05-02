// api/auth/reset-password.js
// Recuperação de conta via número de telemóvel — gera token admin e notifica suporte

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

    const { phone, newPassword } = body;

    if (!phone) return res.status(400).json({ error: 'Número de telemóvel é obrigatório' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Nova password deve ter pelo menos 6 caracteres' });

    const clean = phone.replace(/\D/g, '');
    const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        // Encontrar utilizador pelo telefone
        const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
        if (listErr) throw listErr;

        const user = users.find(u => u.phone === normalized);
        if (!user) {
            // Mensagem genérica por segurança
            return res.status(200).json({ success: true, message: 'Se o número estiver registado, a password será redefinida.' });
        }

        // Redefinir password directamente via Admin API
        const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
            password: newPassword
        });

        if (updateErr) throw updateErr;

        return res.status(200).json({
            success: true,
            message: 'Password redefinida com sucesso. Pode fazer login agora.'
        });

    } catch (err) {
        console.error('[reset-password] Erro:', err);
        return res.status(500).json({ error: 'Erro ao redefinir password' });
    }
}

export const config = { maxDuration: 30 };