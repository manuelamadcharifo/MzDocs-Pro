// api/admin/stats.js
// Estatísticas agregadas para o dashboard admin

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

        const period = req.query?.period || 'today';
        const now = new Date();

        // Calcular datas de início
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Receita
        const { data: revToday } = await supabase
            .from('transactions')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', todayStart);
        const revenueToday = revToday?.reduce((s, t) => s + (t.amount || 0), 0) || 0;

        const { data: revWeek } = await supabase
            .from('transactions')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', weekStart.toISOString());
        const revenueWeek = revWeek?.reduce((s, t) => s + (t.amount || 0), 0) || 0;

        const { data: revMonth } = await supabase
            .from('transactions')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', monthStart.toISOString());
        const revenueMonth = revMonth?.reduce((s, t) => s + (t.amount || 0), 0) || 0;

        // Documentos
        const { count: docsToday } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart);

        const { count: docsWeek } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', weekStart.toISOString());

        const { count: docsMonth } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        // Utilizadores
        const { count: usersToday } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart);

        const { count: usersWeek } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', weekStart.toISOString());

        const { count: usersMonth } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        const { count: usersTotal } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        // Pendentes
        const { count: pending } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // Dados dos últimos 7 dias para gráficos
        const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const chartLabels = [];
        const chartRevenue = [];
        const chartDocs = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            chartLabels.push(dayLabels[d.getDay()]);

            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
            const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();

            const { data: dayRev } = await supabase
                .from('transactions')
                .select('amount')
                .eq('status', 'completed')
                .gte('created_at', dayStart)
                .lte('created_at', dayEnd);
            chartRevenue.push(dayRev?.reduce((s, t) => s + (t.amount || 0), 0) || 0);

            const { count: dayDocs } = await supabase
                .from('documents')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', dayStart)
                .lte('created_at', dayEnd);
            chartDocs.push(dayDocs || 0);
        }

        return res.status(200).json({
            success: true,
            revenue: {
                today: revenueToday,
                week: revenueWeek,
                month: revenueMonth
            },
            documents: {
                today: docsToday || 0,
                week: docsWeek || 0,
                month: docsMonth || 0
            },
            users: {
                today: usersToday || 0,
                week: usersWeek || 0,
                month: usersMonth || 0,
                total: usersTotal || 0
            },
            pending: pending || 0,
            chartData: {
                labels: chartLabels,
                revenue: chartRevenue,
                documents: chartDocs
            }
        });

    } catch (err) {
        console.error('[admin/stats] Erro:', err);
        return res.status(500).json({ error: err.message || 'Erro interno' });
    }
}

export const config = { maxDuration: 30 };