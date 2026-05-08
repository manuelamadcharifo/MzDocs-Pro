// assets/js/admin/AdminApp.js
// Painel Admin — corrigido: race condition, viewDocument, settings, addCredits UI

import { authManager } from '../auth/AuthManager.js';

class AdminApp {
    constructor() {
        // CORRIGIDO: NÃO usar supabase aqui — ainda é null no construtor
        this.supabase = null;
        this.currentSection = 'dashboard';
        this.selectedTransaction = null;
        this.charts = {};

        // Aguardar auth antes de tudo
        this._boot();
    }

    async _boot() {
        await authManager.ready(); // aguarda init async completo

        // Agora o supabase está disponível
        this.supabase = authManager.supabase;

        if (!authManager.isAuthenticated()) {
            window.location.href = '/?auth=required';
            return;
        }
        if (!authManager.isAdmin()) {
            alert('⛔ Acesso restrito a administradores.');
            window.location.href = '/';
            return;
        }

        const name = authManager.user?.user_metadata?.full_name ||
                     authManager.user?.phone || 'Admin';
        const nameEl = document.getElementById('adminName');
        if (nameEl) nameEl.textContent = name;

        this._bindEvents();
        await this._loadDashboard();
    }

    _bindEvents() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                this._switchSection(item.dataset.section);
            });
        });

        document.getElementById('adminLogout')?.addEventListener('click', () => {
            authManager.signOut().then(() => { window.location.href = '/'; });
        });

        document.getElementById('filterStatus')?.addEventListener('change', () => this._loadTransactions());
        document.getElementById('filterDate')?.addEventListener('change', () => this._loadTransactions());
        document.getElementById('btnRefresh')?.addEventListener('click', () => this._loadTransactions());

        document.getElementById('btnCancelConfirm')?.addEventListener('click', () => this._closeModal());
        document.getElementById('btnConfirmPayment')?.addEventListener('click', () => this._confirmSelectedPayment());

        // CORRIGIDO: settings forms agora têm listeners
        document.getElementById('mpesaConfigForm')?.addEventListener('submit', e => {
            e.preventDefault();
            this._saveSettings();
        });
        document.getElementById('pricingForm')?.addEventListener('submit', e => {
            e.preventDefault();
            this._savePricing();
        });

        // Pesquisa de utilizadores
        document.getElementById('searchUsers')?.addEventListener('input', e => {
            this._filterUsers(e.target.value);
        });

        const dateEl = document.getElementById('adminDate');
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-MZ', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    _switchSection(section) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
        document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
        const sec = document.getElementById(`section-${section}`);
        if (sec) sec.style.display = 'block';
        const titles = {
            dashboard: 'Dashboard', transactions: 'Gestão de Pagamentos',
            users: 'Utilizadores', documents: 'Documentos Gerados', settings: 'Configurações'
        };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = titles[section] || section;

        if (section === 'transactions') this._loadTransactions();
        if (section === 'users') this._loadUsers();
        if (section === 'documents') this._loadDocuments();
        if (section === 'settings') this._loadSettings();
        this.currentSection = section;
    }

    // ── DASHBOARD ──────────────────────────────────────────────────────────
    async _loadDashboard() {
        if (!this.supabase) return;
        try {
            const today = new Date().toISOString().slice(0, 10);

            const { data: revenue } = await this.supabase
                .from('transactions').select('amount').eq('status', 'completed')
                .gte('created_at', today);
            const totalRevenue = (revenue || []).reduce((s, t) => s + t.amount, 0);

            const { count: docCount } = await this.supabase
                .from('documents').select('*', { count: 'exact', head: true }).gte('created_at', today);

            const { count: userCount } = await this.supabase
                .from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today);

            const { count: pendingCount } = await this.supabase
                .from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending');

            const el = id => document.getElementById(id);
            if (el('statRevenue')) el('statRevenue').textContent = `${totalRevenue.toLocaleString('pt-MZ')} MZN`;
            if (el('statDocuments')) el('statDocuments').textContent = docCount || 0;
            if (el('statUsers')) el('statUsers').textContent = userCount || 0;
            if (el('statPending')) el('statPending').textContent = pendingCount || 0;
            if (el('pendingCount')) el('pendingCount').textContent = pendingCount || 0;

            this._loadCharts();
        } catch (e) {
            console.error('[Admin] Dashboard erro:', e);
        }
    }

    async _loadCharts() {
        if (!this.supabase || typeof Chart === 'undefined') return;
        try {
            const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString();
            const { data: revenueData } = await this.supabase
                .from('transactions').select('amount, created_at')
                .eq('status', 'completed').gte('created_at', sevenDays);

            const days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(Date.now() - (6 - i) * 86400000);
                return d.toISOString().slice(0, 10);
            });
            const revenueByDay = days.map(day =>
                (revenueData || []).filter(t => t.created_at.slice(0, 10) === day)
                    .reduce((s, t) => s + t.amount, 0)
            );

            const rc = document.getElementById('revenueChart');
            if (rc) {
                if (this.charts.revenue) this.charts.revenue.destroy();
                this.charts.revenue = new Chart(rc, {
                    type: 'line',
                    data: {
                        labels: days.map(d => d.slice(5)),
                        datasets: [{ label: 'Receita (MZN)', data: revenueByDay,
                            borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)',
                            tension: 0.4, fill: true }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } } }
                });
            }

            const { data: docsByType } = await this.supabase
                .from('documents').select('service_type').gte('created_at', sevenDays);
            const typeMap = {};
            (docsByType || []).forEach(d => { typeMap[d.service_type] = (typeMap[d.service_type] || 0) + 1; });

            const dc = document.getElementById('documentsChart');
            if (dc) {
                if (this.charts.documents) this.charts.documents.destroy();
                this.charts.documents = new Chart(dc, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(typeMap).map(k => this._translateType(k)),
                        datasets: [{ data: Object.values(typeMap),
                            backgroundColor: ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'] }]
                    },
                    options: { responsive: true }
                });
            }
        } catch (e) { console.warn('[Admin] Charts erro:', e); }
    }

    // ── TRANSAÇÕES ─────────────────────────────────────────────────────────
    async _loadTransactions() {
        if (!this.supabase) return;
        try {
            const status = document.getElementById('filterStatus')?.value;
            const date = document.getElementById('filterDate')?.value;

            let query = this.supabase
                .from('transactions')
                .select('*, profiles(full_name, phone)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (status && status !== 'all') query = query.eq('status', status);
            if (date) query = query.gte('created_at', date).lte('created_at', date + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            const tbody = document.getElementById('transactionsTable');
            if (!tbody) return;
            tbody.innerHTML = (data || []).map(t => `
                <tr>
                    <td><code style="font-size:12px">${t.reference_id || t.id.slice(0,8)}</code></td>
                    <td>${t.profiles?.full_name || t.profiles?.phone || 'Anónimo'}</td>
                    <td>${t.package_id?.toUpperCase() || '-'}</td>
                    <td>${(t.amount || 0).toLocaleString('pt-MZ')} MZN</td>
                    <td>${t.credits} cr</td>
                    <td>${t.phone_number || '-'}</td>
                    <td><span class="status-badge status-${t.status}">${this._translateStatus(t.status)}</span></td>
                    <td>${new Date(t.created_at).toLocaleDateString('pt-MZ')}</td>
                    <td>
                        ${t.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="adminApp.confirmPayment('${t.id}','${t.user_id}',${t.credits})">✅ Confirmar</button>` : ''}
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#9ca3af">Nenhuma transação</td></tr>';
        } catch (e) { console.error('[Admin] Transações erro:', e); }
    }

    confirmPayment(txId, userId, credits) {
        this.selectedTransaction = { id: txId, userId, credits };
        const txt = document.getElementById('confirmText');
        if (txt) txt.textContent = `Confirmar ${credits} créditos para o utilizador?`;
        const modal = document.getElementById('confirmModal');
        if (modal) modal.style.display = 'flex';
    }

    _closeModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) modal.style.display = 'none';
        this.selectedTransaction = null;
    }

    async _confirmSelectedPayment() {
        if (!this.selectedTransaction) return;
        const { id, userId, credits } = this.selectedTransaction;
        const btn = document.getElementById('btnConfirmPayment');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ A confirmar…'; }

        try {
            const token = authManager.getToken();
            const res = await fetch('/api/admin/confirm-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ transactionId: id, userId, credits })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            this._closeModal();
            this._notify('✅ ' + credits + ' créditos adicionados com sucesso!');
            this._loadTransactions();
            this._loadDashboard();
        } catch (err) {
            this._notify('❌ Erro: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
        }
    }

    // ── UTILIZADORES ───────────────────────────────────────────────────────
    _allUsers = [];

    async _loadUsers() {
        if (!this.supabase) return;
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('id, full_name, phone, email, credits, total_documents, is_admin, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this._allUsers = data || [];
            this._renderUsers(this._allUsers);
        } catch (e) { console.error('[Admin] Utilizadores erro:', e); }
    }

    _filterUsers(query) {
        const q = query.toLowerCase();
        const filtered = this._allUsers.filter(u =>
            (u.full_name || '').toLowerCase().includes(q) ||
            (u.phone || '').includes(q) ||
            (u.email || '').toLowerCase().includes(q)
        );
        this._renderUsers(filtered);
    }

    _renderUsers(users) {
        const tbody = document.getElementById('usersTable');
        if (!tbody) return;
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.full_name || '—'}</td>
                <td>${u.phone || '<span style="color:#f59e0b;font-size:.8rem">⚠ sem phone</span>'}</td>
                <td style="font-size:.8rem;color:#64748b">${u.email || '—'}</td>
                <td><span class="credit-badge">💎 ${u.credits}</span></td>
                <td>${u.total_documents || 0}</td>
                <td>${u.is_admin ? '⭐ Admin' : 'Utilizador'}</td>
                <td>${new Date(u.created_at).toLocaleDateString('pt-MZ')}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="adminApp.addCreditsModal('${u.id}', '${u.full_name || u.phone || u.id.slice(0,8)}')">
                        ➕ Créditos
                    </button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af">Nenhum utilizador</td></tr>';
    }

    // CORRIGIDO: addCredits usa modal inline, não prompt()
    addCreditsModal(userId, userName) {
        const existing = document.getElementById('addCreditsModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'addCreditsModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:2rem;width:360px;max-width:90vw;">
                <h3 style="margin:0 0 .5rem">➕ Adicionar Créditos</h3>
                <p style="color:#6b7280;font-size:.875rem;margin-bottom:1.5rem">Utilizador: <strong>${userName}</strong></p>
                <div style="display:flex;flex-direction:column;gap:.75rem;">
                    <input type="number" id="creditsAmount" min="1" max="999" value="10"
                        style="padding:.75rem;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;"
                        placeholder="Quantidade de créditos">
                    <div style="display:flex;gap:.5rem;">
                        <button onclick="document.getElementById('addCreditsModal').remove()"
                            style="flex:1;padding:.75rem;background:#f3f4f6;border:none;border-radius:10px;cursor:pointer;font-weight:600;">Cancelar</button>
                        <button onclick="adminApp._doAddCredits('${userId}')"
                            style="flex:1;padding:.75rem;background:#3b82f6;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">Confirmar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('creditsAmount')?.focus();
    }

    async _doAddCredits(userId) {
        const amount = parseInt(document.getElementById('creditsAmount')?.value);
        if (!amount || amount < 1) return;
        document.getElementById('addCreditsModal')?.remove();

        try {
            const { error } = await this.supabase.rpc('add_credits', { user_id: userId, amount });
            if (error) throw error;
            this._notify(`✅ ${amount} créditos adicionados!`);
            this._loadUsers();
        } catch (err) {
            this._notify('❌ Erro: ' + err.message, 'error');
        }
    }

    // ── DOCUMENTOS ─────────────────────────────────────────────────────────
    async _loadDocuments() {
        if (!this.supabase) return;
        try {
            const { data, error } = await this.supabase
                .from('documents')
                .select('id, service_type, title, model_used, created_at, content, profiles(full_name, phone)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            this._docsData = data || [];

            const tbody = document.getElementById('documentsTable');
            if (!tbody) return;
            tbody.innerHTML = this._docsData.map(d => `
                <tr>
                    <td>${this._translateType(d.service_type)}</td>
                    <td>${d.profiles?.full_name || d.profiles?.phone || 'Anónimo'}</td>
                    <td><code style="font-size:12px">${d.model_used || '—'}</code></td>
                    <td>${new Date(d.created_at).toLocaleString('pt-MZ')}</td>
                    <td>
                        <button class="btn btn-sm btn-ghost" onclick="adminApp.viewDocument('${d.id}')">👁 Ver</button>
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#9ca3af">Nenhum documento</td></tr>';
        } catch (e) { console.error('[Admin] Documentos erro:', e); }
    }

    // CORRIGIDO: viewDocument agora existe e funciona
    viewDocument(docId) {
        const doc = (this._docsData || []).find(d => d.id === docId);
        if (!doc) return;

        const existing = document.getElementById('docViewModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'docViewModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:2rem;width:700px;max-width:95vw;max-height:85vh;overflow-y:auto;position:relative;">
                <button onclick="document.getElementById('docViewModal').remove()"
                    style="position:absolute;top:1rem;right:1rem;background:#f3f4f6;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:1.2rem;">×</button>
                <h3 style="margin:0 0 .5rem">${this._translateType(doc.service_type)}</h3>
                <p style="color:#6b7280;font-size:.8rem;margin-bottom:1rem">
                    ${doc.profiles?.full_name || doc.profiles?.phone || 'Anónimo'} · ${new Date(doc.created_at).toLocaleString('pt-MZ')}
                </p>
                <div style="background:#f8fafc;border-radius:10px;padding:1rem;white-space:pre-wrap;font-family:monospace;font-size:.85rem;max-height:60vh;overflow-y:auto;">
                    ${(doc.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    // ── CONFIGURAÇÕES ──────────────────────────────────────────────────────
    _loadSettings() {
        // Preencher com valores actuais guardados (localStorage admin)
        const saved = JSON.parse(localStorage.getItem('mz_admin_settings') || '{}');
        const el = id => document.getElementById(id);
        if (saved.mpesaEnv && el('mpesaEnv')) el('mpesaEnv').value = saved.mpesaEnv;
        if (el('pkgStarterCredits')) el('pkgStarterCredits').value = saved.starterCredits || 10;
        if (el('pkgStarterPrice')) el('pkgStarterPrice').value = saved.starterPrice || 150;
        if (el('pkgBasicoCredits')) el('pkgBasicoCredits').value = saved.basicoCredits || 25;
        if (el('pkgBasicoPrice')) el('pkgBasicoPrice').value = saved.basicoPrice || 350;
        if (el('pkgProCredits')) el('pkgProCredits').value = saved.proCredits || 60;
        if (el('pkgProPrice')) el('pkgProPrice').value = saved.proPrice || 750;
    }

    _saveSettings() {
        const el = id => document.getElementById(id)?.value;
        const saved = JSON.parse(localStorage.getItem('mz_admin_settings') || '{}');
        saved.mpesaEnv = el('mpesaEnv') || 'sandbox';
        localStorage.setItem('mz_admin_settings', JSON.stringify(saved));
        this._notify('✅ Configuração M-Pesa guardada (reinicie o servidor para aplicar).');
    }

    _savePricing() {
        const el = id => parseInt(document.getElementById(id)?.value) || 0;
        const settings = JSON.parse(localStorage.getItem('mz_admin_settings') || '{}');
        settings.starterCredits = el('pkgStarterCredits');
        settings.starterPrice = el('pkgStarterPrice');
        settings.basicoCredits = el('pkgBasicoCredits');
        settings.basicoPrice = el('pkgBasicoPrice');
        settings.proCredits = el('pkgProCredits');
        settings.proPrice = el('pkgProPrice');
        localStorage.setItem('mz_admin_settings', JSON.stringify(settings));
        this._notify('✅ Preços actualizados localmente.');
    }

    // ── HELPERS ────────────────────────────────────────────────────────────
    _notify(msg, type = 'success') {
        const n = document.createElement('div');
        n.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;padding:.875rem 1.25rem;border-radius:12px;font-weight:600;font-size:.9rem;z-index:99999;animation:slideUp .3s ease;background:${type === 'error' ? '#fef2f2' : '#f0fdf4'};color:${type === 'error' ? '#dc2626' : '#166534'};border:1px solid ${type === 'error' ? '#fca5a5' : '#86efac'};box-shadow:0 4px 12px rgba(0,0,0,.1)`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 4000);
    }

    _translateStatus(status) {
        return { pending: '⏳ Pendente', completed: '✅ Confirmado', failed: '❌ Falhado', refunded: '↩️ Reembolsado' }[status] || status;
    }

    _translateType(type) {
        return { trabalho: '📚 Trabalho', cv: '📋 CV', carta: '✉️ Carta', orcamento: '🏗️ Orçamento',
            impressao: '🖨️ Impressão', foto: '📷 Foto', conversao: '🔄 Conversão' }[type] || type;
    }
}

window.adminApp = new AdminApp();
