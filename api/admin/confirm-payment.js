// api/admin/confirm-payment.js
// Confirma pagamento pendente e adiciona créditos

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // Verificar autenticação
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Token obrigatório' });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Body JSON inválido' });
    }

    const { transactionId, userId, credits } = body;

    if (!transactionId || !userId || !credits) {
        return res.status(400).json({ error: 'transactionId, userId e credits são obrigatórios' });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Verificar token e obter utilizador
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        // Verificar se é admin
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (profileErr || !profile?.is_admin) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        // Verificar se transação existe e está pendente
        const { data: tx, error: txErr } = await supabase
            .from('transactions')
            .select('id, status')
            .eq('id', transactionId)
            .single();

        if (txErr || !tx) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }

        if (tx.status !== 'pending') {
            return res.status(400).json({ error: 'Transação já não está pendente' });
        }

        // 1. Actualizar transação
        const { error: updateErr } = await supabase
            .from('transactions')
            .update({
                status: 'completed',
                confirmed_by: user.id,
                confirmed_at: new Date().toISOString()
            })
            .eq('id', transactionId);

        if (updateErr) throw updateErr;

        // 2. Adicionar créditos via RPC
        const { data: newCredits, error: rpcErr } = await supabase
            .rpc('add_credits', { user_id: userId, amount: credits });

        if (rpcErr) throw rpcErr;

        return res.status(200).json({
            success: true,
            newCredits: newCredits || credits,
            message: `${credits} créditos adicionados com sucesso`
        });

    } catch (err) {
        console.error('[admin/confirm-payment] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro ao confirmar pagamento' });
    }
}

export const config = { maxDuration: 30 };