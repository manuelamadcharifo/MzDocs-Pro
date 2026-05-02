// api/admin/transactions.js
// Lista de transações para o painel admin

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // Verificar autenticação
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Token obrigatório' });
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

        // Parâmetros de query
        const status = req.query?.status || 'all';
        const date = req.query?.date;
        const limit = Math.min(parseInt(req.query?.limit) || 50, 100);
        const offset = parseInt(req.query?.offset) || 0;

        // Query base
        let query = supabase
            .from('transactions')
            .select(`
                id,
                user_id,
                package_id,
                amount,
                credits,
                status,
                payment_method,
                reference_id,
                phone_number,
                confirmed_by,
                confirmed_at,
                created_at,
                profiles:user_id (full_name, email, phone)
            `, { count: 'exact' });

        if (status !== 'all') {
            query = query.eq('status', status);
        }
        if (date) {
            const dayStart = `${date}T00:00:00.000Z`;
            const dayEnd = `${date}T23:59:59.999Z`;
            query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return res.status(200).json({
            success: true,
            data: data || [],
            total: count || 0,
            limit,
            offset
        });

    } catch (err) {
        console.error('[admin/transactions] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro interno' });
    }
}

export const config = { maxDuration: 30 };