// assets/js/admin/AdminDashboard.js
// Dashboard do painel admin

export class AdminDashboard {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.charts = {};
    }

    async load() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const todayStart = `${today}T00:00:00.000Z`;

            const { data: revenueData, error: revErr } = await this.supabase
                .from('transactions')
                .select('amount')
                .eq('status', 'completed')
                .gte('created_at', todayStart);

            const revenue = revenueData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

            const { count: docsToday } = await this.supabase
                .from('documents')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', todayStart);

            const { count: usersToday } = await this.supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', todayStart);

            const { count: pendingCount } = await this.supabase
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            const setText = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setText('statRevenue', `MZN ${revenue.toLocaleString('pt-MZ')}`);
            setText('statDocuments', docsToday || 0);
            setText('statUsers', usersToday || 0);
            setText('statPending', pendingCount || 0);

            const badge = document.getElementById('pendingCount');
            if (badge) {
                badge.textContent = pendingCount || 0;
                badge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
            }

            await this.renderCharts();

        } catch (err) {
            console.error('[AdminDashboard] Erro ao carregar:', err);
        }
    }

    async renderCharts() {
        try {
            const ChartModule = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm');
            const Chart = ChartModule.default || ChartModule.Chart || window.Chart;
            
            if (!Chart) {
                console.warn('[AdminDashboard] Chart.js não disponível');
                return;
            }

            Object.values(this.charts).forEach(c => c?.destroy?.());
            this.charts = {};

            const labels = [];
            const revenueData = [];
            const docsData = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                labels.push(dayLabels[d.getDay()]);

                const dayStart = `${dateStr}T00:00:00.000Z`;
                const dayEnd = `${dateStr}T23:59:59.999Z`;

                const { data: rev } = await this.supabase
                    .from('transactions')
                    .select('amount')
                    .eq('status', 'completed')
                    .gte('created_at', dayStart)
                    .lte('created_at', dayEnd);
                revenueData.push(rev?.reduce((s, t) => s + (t.amount || 0), 0) || 0);

                const { count: dc } = await this.supabase
                    .from('documents')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', dayStart)
                    .lte('created_at', dayEnd);
                docsData.push(dc || 0);
            }

            const revCanvas = document.getElementById('revenueChart');
            if (revCanvas) {
                this.charts.revenue = new Chart(revCanvas, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Receita (MZN)',
                            data: revenueData,
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#3b82f6'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const { data: typeData } = await this.supabase
                .from('documents')
                .select('service_type')
                .gte('created_at', thirtyDaysAgo.toISOString());

            const typeCounts = {};
            typeData?.forEach(d => {
                typeCounts[d.service_type] = (typeCounts[d.service_type] || 0) + 1;
            });

            const typeLabels = Object.keys(typeCounts).map(t => this._translateType(t));
            const typeValues = Object.values(typeCounts);

            const docCanvas = document.getElementById('documentsChart');
            if (docCanvas && typeValues.length > 0) {
                this.charts.documents = new Chart(docCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: typeLabels,
                        datasets: [{
                            data: typeValues,
                            backgroundColor: colors.slice(0, typeValues.length),
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right', labels: { usePointStyle: true, padding: 16 } }
                        },
                        cutout: '65%'
                    }
                });
            }

        } catch (err) {
            console.error('[AdminDashboard] Erro nos gráficos:', err);
        }
    }

    _translateType(type) {
        const map = {
            trabalho: '📚 Trabalho Escolar',
            cv: '📋 CV',
            carta: '✉️ Carta Formal',
            orcamento: '🏗️ Orçamento',
            impressao: '🖨️ Impressão',
            foto: '📷 Foto',
            conversao: '🔄 Conversão'
        };
        return map[type] || type;
    }
}

export default AdminDashboard;