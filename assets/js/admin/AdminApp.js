// assets/js/admin/AdminApp.js
// Aplicação Admin completa

import { authManager } from '../auth/AuthManager.js';

class AdminApp {
    constructor() {
        this.supabase = authManager.supabase;
        this.currentSection = 'dashboard';
        this.selectedTransaction = null;
        this.charts = {};
        
        this._checkAuth();
        this._bindEvents();
        this._loadDashboard();
    }

    async _checkAuth() {
        await authManager._init();
        
        if (!authManager.isAuthenticated()) {
            window.location.href = '/?admin=1';
            return;
        }
        
        if (!authManager.isAdmin()) {
            alert('⛔ Acesso restrito a administradores.');
            window.location.href = '/';
            return;
        }

        document.getElementById('adminName').textContent = 
            authManager.profile?.full_name || 'Admin';
    }

    _bindEvents() {
        // Navegação
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this._switchSection(item.dataset.section);
            });
        });

        // Logout
        document.getElementById('adminLogout')?.addEventListener('click', () => {
            authManager.signOut().then(() => {
                window.location.href = '/';
            });
        });

        // Filtros de transações
        document.getElementById('filterStatus')?.addEventListener('change', () => {
            this._loadTransactions();
        });
        document.getElementById('filterDate')?.addEventListener('change', () => {
            this._loadTransactions();
        });
        document.getElementById('btnRefresh')?.addEventListener('click', () => {
            this._loadTransactions();
        });

        // Modal de confirmação
        document.getElementById('btnCancelConfirm')?.addEventListener('click', () => {
            this._closeModal();
        });
        document.getElementById('btnConfirmPayment')?.addEventListener('click', () => {
            this._confirmSelectedPayment();
        });

        // Atualizar data
        document.getElementById('adminDate').textContent = 
            new Date().toLocaleDateString('pt-MZ', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            });
    }

    _switchSection(section) {
        // Atualizar nav
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

        // Mostrar secção
        document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
        document.getElementById(`section-${section}`).style.display = 'block';

        // Atualizar título
        const titles = {
            dashboard: 'Dashboard',
            transactions: 'Gestão de Pagamentos',
            users: 'Utilizadores',
            documents: 'Documentos Gerados',
            settings: 'Configurações'
        };
        document.getElementById('pageTitle').textContent = titles[section];

        // Carregar dados
        if (section === 'transactions') this._loadTransactions();
        if (section === 'users') this._loadUsers();
        if (section === 'documents') this._loadDocuments();
        
        this.currentSection = section;
    }

    // ============================================
    // DASHBOARD
    // ============================================
    async _loadDashboard() {
        const today = new Date().toISOString().split('T')[0];
        
        // Receita hoje
        const { data: revenue } = await this.supabase
            .from('transactions')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', today);
        
        const totalRevenue = revenue?.reduce((sum, t) => sum + t.amount, 0) || 0;
        document.getElementById('statRevenue').textContent = `${totalRevenue.toLocaleString()} MZN`;

        // Documentos hoje
        const { count: docCount } = await this.supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);
        document.getElementById('statDocuments').textContent = docCount || 0;

        // Novos utilizadores hoje
        const { count: userCount } = await this.supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);
        document.getElementById('statUsers').textContent = userCount || 0;

        // Pagamentos pendentes
        const { count: pendingCount } = await this.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        document.getElementById('statPending').textContent = pendingCount || 0;
        document.getElementById('pendingCount').textContent = pendingCount || 0;

        // Gráficos
        this._renderCharts();
    }

    async _renderCharts() {
        // Gráfico de receita (últimos 7 dias)
        const days = [];
        const revenues = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            days.push(d.toLocaleDateString('pt-MZ', { weekday: 'short' }));
            
            const { data } = await this.supabase
                .from('transactions')
                .select('amount')
                .eq('status', 'completed')
                .gte('created_at', dateStr)
                .lt('created_at', dateStr + 'T23:59:59');
            
            revenues.push(data?.reduce((s, t) => s + t.amount, 0) || 0);
        }

        const ctx1 = document.getElementById('revenueChart');
        if (ctx1) {
            this.charts.revenue?.destroy();
            this.charts.revenue = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Receita (MZN)',
                        data: revenues,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Gráfico de documentos por tipo
        const { data: docsByType } = await this.supabase
            .from('documents')
            .select('service_type');
        
        const typeCounts = {};
        docsByType?.forEach(d => {
            typeCounts[d.service_type] = (typeCounts[d.service_type] || 0) + 1;
        });

        const ctx2 = document.getElementById('documentsChart');
        if (ctx2) {
            this.charts.docs?.destroy();
            this.charts.docs = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(typeCounts).map(t => this._translateType(t)),
                    datasets: [{
                        data: Object.values(typeCounts),
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    }

    // ============================================
    // TRANSAÇÕES
    // ============================================
    async _loadTransactions() {
        const status = document.getElementById('filterStatus').value;
        const date = document.getElementById('filterDate').value;
        
        let query = this.supabase
            .from('transactions')
            .select('*, profiles(full_name, email)')
            .order('created_at', { ascending: false });

        if (status !== 'all') query = query.eq('status', status);
        if (date) query = query.gte('created_at', date);

        const { data, error } = await query;
        if (error) return;

        const tbody = document.getElementById('transactionsTable');
        tbody.innerHTML = data?.map(t => `
            <tr class="${t.status}">
                <td><code>${t.reference_id}</code></td>
                <td>${t.profiles?.full_name || 'Anónimo'}<br><small>${t.profiles?.email || '-'}</small></td>
                <td>${t.package_id}</td>
                <td><strong>${t.amount} MZN</strong></td>
                <td>${t.payment_method === 'manual' ? '💬 WhatsApp' : '📱 M-Pesa'}</td>
                <td><span class="badge badge-${t.status}">${this._translateStatus(t.status)}</span></td>
                <td>${new Date(t.created_at).toLocaleString('pt-MZ')}</td>
                <td>
                    ${t.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="adminApp.confirmPayment('${t.id}', '${t.user_id}', ${t.credits})">
                            ✅ Confirmar
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="8" class="text-center">Nenhuma transação</td></tr>';
    }

    confirmPayment(transactionId, userId, credits) {
        this.selectedTransaction = { id: transactionId, userId, credits };
        document.getElementById('confirmText').textContent = 
            `Confirmar pagamento e adicionar ${credits} créditos ao utilizador?`;
        document.getElementById('confirmModal').style.display = 'flex';
    }

    async _confirmSelectedPayment() {
        if (!this.selectedTransaction) return;
        
        const btn = document.getElementById('btnConfirmPayment');
        btn.disabled = true;
        btn.textContent = '⏳ A processar...';

        try {
            // 1. Atualizar transação
            await this.supabase
                .from('transactions')
                .update({ 
                    status: 'completed',
                    confirmed_by: authManager.user.id,
                    confirmed_at: new Date().toISOString()
                })
                .eq('id', this.selectedTransaction.id);

            // 2. Adicionar créditos
            await this.supabase.rpc('add_credits', {
                user_id: this.selectedTransaction.userId,
                amount: this.selectedTransaction.credits
            });

            this._closeModal();
            this._loadTransactions();
            this._loadDashboard();
            
            // Notificação
            alert('✅ Pagamento confirmado e créditos adicionados!');

        } catch (err) {
            alert('❌ Erro: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirmar';
        }
    }

    _closeModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.selectedTransaction = null;
    }

    // ============================================
    // UTILIZADORES
    // ============================================
    async _loadUsers() {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*, documents(count)')
            .order('created_at', { ascending: false });

        if (error) return;

        const tbody = document.getElementById('usersTable');
        tbody.innerHTML = data?.map(u => `
            <tr>
                <td>${u.full_name || 'Anónimo'}</td>
                <td>${u.id}</td>
                <td>${u.phone || '-'}</td>
                <td><span class="credit-badge">💎 ${u.credits}</span></td>
                <td>${u.documents?.[0]?.count || 0}</td>
                <td>${new Date(u.created_at).toLocaleDateString('pt-MZ')}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="adminApp.addCredits('${u.id}')">
                        ➕ Créditos
                    </button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="text-center">Nenhum utilizador</td></tr>';
    }

    async addCredits(userId) {
        const amount = prompt('Quantos créditos adicionar?');
        if (!amount || isNaN(amount)) return;

        try {
            await this.supabase.rpc('add_credits', {
                user_id: userId,
                amount: parseInt(amount)
            });
            alert('✅ Créditos adicionados!');
            this._loadUsers();
        } catch (err) {
            alert('❌ Erro: ' + err.message);
        }
    }

    // ============================================
    // DOCUMENTOS
    // ============================================
    async _loadDocuments() {
        const { data, error } = await this.supabase
            .from('documents')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) return;

        const tbody = document.getElementById('documentsTable');
        tbody.innerHTML = data?.map(d => `
            <tr>
                <td>${this._translateType(d.service_type)}</td>
                <td>${d.profiles?.full_name || 'Anónimo'}</td>
                <td><code>${d.model_used}</code></td>
                <td>${new Date(d.created_at).toLocaleString('pt-MZ')}</td>
                <td>
                    <button class="btn btn-sm btn-ghost" onclick="adminApp.viewDocument('${d.id}')">
                        👁 Ver
                    </button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="text-center">Nenhum documento</td></tr>';
    }

    // ============================================
    // HELPERS
    // ============================================
    _translateStatus(status) {
        const map = {
            pending: '⏳ Pendente',
            completed: '✅ Confirmado',
            failed: '❌ Falhado',
            refunded: '↩️ Reembolsado'
        };
        return map[status] || status;
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

// Inicializar
window.adminApp = new AdminApp();