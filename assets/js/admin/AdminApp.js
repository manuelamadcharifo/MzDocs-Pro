// assets/js/admin/AdminApp.js — v4.1
// Mobile-first · Sync real · Bloquear/Deletar utilizadores · Total correcto

import { authManager } from '../auth/AuthManager.js';

class AdminApp {
    constructor() {
        this.supabase  = null;
        this._users    = [];
        this._docs     = [];
        this._section  = 'dashboard';
        this.charts    = {};
        this._boot();
    }

    async _boot() {
        await authManager.ready();
        this.supabase = authManager.supabase;

        // Aguardar sessão com tolerância extra para conexões lentas (10s)
        if (!authManager.isAuthenticated()) {
            // Tentar uma vez mais após pequena espera (race condition Supabase)
            await new Promise(r => setTimeout(r, 800));
            await authManager.ready();
        }

        if (!authManager.isAuthenticated()) { window.location.href = '/?auth=required'; return; }
        if (!authManager.isAdmin())         { this._toast('⛔ Acesso restrito a administradores.', 'error'); window.location.href = '/'; return; }

        // Nome do admin
        const name = authManager.user?._profile?.full_name
                  || authManager.user?.user_metadata?.full_name
                  || authManager.user?._profile?.phone
                  || 'Admin';
        const el = id => document.getElementById(id);
        if (el('adminName')) el('adminName').textContent = name;
        if (el('adminDate')) el('adminDate').textContent = new Date().toLocaleDateString('pt-MZ', {
            weekday: 'short', day: 'numeric', month: 'short'
        });

        this._bindNav();
        this._bindEvents();
        await this._loadDashboard();
        this._loadAnalytics().catch(() => {});

        // CORRIGIDO: os badges do menu lateral (Blog, Afiliados, Templates)
        // só eram preenchidos quando o admin entrava manualmente nessa
        // secção (_loadBlog/_loadAffiliates/_loadTemplates só corriam no
        // _navigate). Até lá, ficavam presos no "0" estático do HTML,
        // dando a impressão de que não havia conteúdo nenhum mesmo
        // havendo dados reais. Agora carregam em paralelo já no arranque,
        // tal como o badge de Utilizadores.
        Promise.allSettled([
          this._loadBlog(),
          this._loadAffiliates(),
          this._loadTemplates('pending'),
        ]).catch(() => {});

        // Realtime: subscrever mudanças na tabela online_sessions via Supabase Realtime
        this._startOnlineRealtime();
        // Polling de fallback a cada 20s (caso realtime falhe)
        this._onlinePoller = setInterval(() => this._pollOnline(), 20000);

        // Notificações administrativas (Fase 5) — carrega já no arranque
        // (badge do sino) e volta a verificar a cada 60s, sem precisar de
        // abrir o painel.
        this._loadNotifCount().catch(() => {});
        this._notifPoller = setInterval(() => this._loadNotifCount().catch(() => {}), 60000);

        // Estado do botão "Activar notificações" no painel do sino.
        this._refreshPushButton();
    }

    _updateOnlineUI(n) {
        const el = id => document.getElementById(id);
        if (el('statOnlineNow'))          el('statOnlineNow').textContent          = n;
        if (el('statOnlineNowAnalytics')) el('statOnlineNowAnalytics').textContent = n;
        const dot = el('onlineDot');
        if (dot) dot.style.background = n > 0 ? '#22c55e' : '#94a3b8';
    }

    async _startOnlineRealtime() {
        if (!this.supabase) return;
        const fiveMinAgo = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();

        // Função para recontagem directa no Supabase (anon key tem SELECT em online_sessions via policy admin)
        // Usar RPC ou COUNT via API admin para evitar RLS
        const recount = async () => { await this._pollOnline(); };

        // Canal Realtime — escuta INSERT, UPDATE, DELETE em online_sessions
        this._realtimeChannel = this.supabase
            .channel('online-sessions-watch')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'online_sessions' },
                () => { recount(); }
            )
            .subscribe((status) => {
                const dot = document.getElementById('onlineDot');
                if (dot) {
                    // Indicador de ligação realtime: pulsa quando conectado
                    if (status === 'SUBSCRIBED') {
                        dot.title = 'Realtime activo';
                    }
                }
            });
    }

    async _pollOnline() {
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/analytics?days=1', {
                headers: { Authorization: 'Bearer ' + token },
                signal: (AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined),
            });
            if (!res.ok) return;
            const d = await res.json();
            this._updateOnlineUI(d.onlineNow || 0);
        } catch (_) {}
    }

    // ── NAVEGAÇÃO ───────────────────────────────────────────────────────
    _bindNav() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                const sec = item.dataset.section;
                if (sec) { this.nav(sec); this.closeSidebar(); }
            });
        });
    }

    nav(section) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${section}`)?.classList.add('active');

        const titles = {
            dashboard: 'Dashboard', users: 'Utilizadores',
            transactions: 'Transações', documents: 'Documentos',
            blog: 'Blog / Páginas', settings: 'Configurações',
            analytics: 'Analytics', staticpages: 'Páginas Estáticas',
            affiliates: 'Afiliados', 'ai-providers': 'IA Providers',
            qrcodes: 'QR Codes', funnel: 'Funil',
            campaigns: 'Campanhas', goals: 'Metas',
            finance: 'Finanças', 'marketing-kit': 'Kit de Marketing',
        };
        document.getElementById('pageTitle').textContent = titles[section] || section;
        this._section = section;

        if (section === 'dashboard')    { this._loadDashboard(); this._loadAnalytics(); }
        if (section === 'users')        this._loadUsers();
        if (section === 'transactions') this._loadTransactions();
        if (section === 'documents')    this._loadDocuments();
        if (section === 'blog')         { this._loadBlog(); this._loadStaticPages(); }
        if (section === 'settings')     this._loadSettings();
        if (section === 'analytics')    this._loadAnalytics();
        if (section === 'affiliates')   this._loadAffiliates();
        if (section === 'templates')    { this._loadTemplates('pending'); this._loadTemplateWithdrawals(); }
        if (section === 'ai-providers') this._loadAiProviders();
        if (section === 'qrcodes')      this._loadQrCodes();
        if (section === 'funnel')       this._loadFunnel();
        if (section === 'campaigns')    this._loadCampaigns();
        if (section === 'goals')        this._loadGoals();
        if (section === 'finance')      this._loadFinance();
        if (section === 'marketing-kit') this._loadMaterials();
    }

    refresh() { this.nav(this._section); }

    // ── SIDEBAR mobile ──────────────────────────────────────────────────
    openSidebar() {
        document.getElementById('adminSidebar')?.classList.add('open');
        document.getElementById('sidebarOverlay')?.classList.add('show');
    }
    closeSidebar() {
        document.getElementById('adminSidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('show');
    }

    // ── EVENTS ──────────────────────────────────────────────────────────
    _bindEvents() {
        document.getElementById('adminLogout')?.addEventListener('click', () => {
            authManager.signOut().then(() => { window.location.href = '/'; });
        });
        document.getElementById('filterStatus')?.addEventListener('change', () => this._loadTransactions());
        document.getElementById('filterDate')?.addEventListener('change', () => this._loadTransactions());
        document.getElementById('pricingForm')?.addEventListener('submit', e => { e.preventDefault(); this._savePricing(); });
        document.getElementById('mpesaConfigForm')?.addEventListener('submit', e => { e.preventDefault(); this._saveSettings(); });
    }

    // ── DASHBOARD ───────────────────────────────────────────────────────
    async _loadDashboard() {
        if (!this.supabase) return;
        const e   = id => document.getElementById(id);
        const fmt = n  => (n ?? 0).toLocaleString('pt-MZ');

        // Mostrar spinners enquanto carrega
        ['statTotalUsers','statTotalDocs','statRevenue','statPending','statNewUsers24h','statOnlineNow'].forEach(id => {
            if (e(id) && e(id).textContent === '—') e(id).textContent = '…';
        });

        try {
            const token = await this._getAdminToken();
            const res = await Promise.race([
                fetch('/api/admin/stats', { headers: { Authorization: 'Bearer ' + token } }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
            ]);
            if (!res.ok) throw new Error('Stats ' + res.status);
            const d = await res.json();

            if (e('statTotalUsers'))    e('statTotalUsers').textContent    = fmt(d.users?.total);
            if (e('statUserSplit'))     e('statUserSplit').textContent      = (d.users?.normal ?? 0) + ' normais · ' + (d.users?.avulso ?? 0) + ' avulso';
            if (e('statTotalDocs'))     e('statTotalDocs').textContent      = fmt(d.documents?.total);
            if (e('statDocsToday'))     e('statDocsToday').textContent      = 'Hoje: ' + fmt(d.documents?.today);
            if (e('statRevenue'))       e('statRevenue').textContent        = fmt(d.revenue?.month) + ' MZN';
            if (e('statPending'))       e('statPending').textContent        = fmt(d.pending);
            if (e('statNewUsers24h'))   e('statNewUsers24h').textContent    = fmt(d.users?.new_24h);
            if (e('statAvulso'))        e('statAvulso').textContent         = fmt(d.users?.avulso);
            if (e('statBlogPublished')) e('statBlogPublished').textContent  = fmt(d.blog?.published);
            if (e('statDocsWeek'))      e('statDocsWeek').textContent       = fmt(d.documents?.week);

            if (e('navBadgeUsers'))   e('navBadgeUsers').textContent   = fmt(d.users?.total);
            if (e('navBadgePending')) e('navBadgePending').textContent  = fmt(d.pending);

            // Charts só se Chart.js estiver disponível
            if (typeof Chart !== 'undefined') {
                this._loadChartsFromData(d.chartData, d.topDocTypes).catch(() => {});
            }
        } catch (err) {
            console.error('[Admin] Dashboard:', err.message);
            // Mostrar '—' em vez de spinner se falhar
            ['statTotalUsers','statTotalDocs','statRevenue','statPending'].forEach(id => {
                if (e(id) && e(id).textContent === '…') e(id).textContent = '—';
            });
        }

        // Card "Valor Levantável" — pedido à parte (acção 'finance') para
        // não atrasar o resto do dashboard caso o câmbio ao vivo demore.
        this._loadWithdrawableCard().catch(() => {});
    }

    async _loadWithdrawableCard() {
        const e = id => document.getElementById(id);
        if (!e('statWithdrawable')) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', { headers: { Authorization: 'Bearer ' + token } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const d = await res.json();
            const fmt = n => (n ?? 0).toLocaleString('pt-MZ', { maximumFractionDigits: 0 });
            e('statWithdrawable').textContent = fmt(d.withdrawable_mzn) + ' MZN';
            if (e('statWithdrawableSub')) {
                e('statWithdrawableSub').textContent = 'Custos/mês: ' + fmt(d.recurring_costs?.total_monthly_mzn) + ' MZN';
            }
        } catch (err) {
            console.error('[Admin] Valor Levantável:', err.message);
            e('statWithdrawable').textContent = '—';
        }
    }


    async _loadChartsFromData(chartData, topDocTypes) {
        if (typeof Chart === 'undefined') return;
        try {
            const labels = chartData?.labels || [];
            const revenueData = chartData?.revenue || [];
            const docsData    = chartData?.documents || [];

            // Revenue line chart
            const rc = document.getElementById('revenueChart');
            if (rc) {
                if (this.charts.revenue) this.charts.revenue.destroy();
                this.charts.revenue = new Chart(rc, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'MZN',
                            data: revenueData,
                            borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,.1)',
                            tension: .4, fill: true, pointRadius: 4,
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }

            // Documents per day bar chart
            const dc = document.getElementById('documentsChart');
            if (dc) {
                if (this.charts.docs) this.charts.docs.destroy();
                this.charts.docs = new Chart(dc, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Docs',
                            data: docsData,
                            backgroundColor: 'rgba(16,185,129,.75)',
                            borderRadius: 6,
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
        } catch (err) { console.warn('[Admin] Charts:', err); }
    }

    // Legacy alias (kept for safety)
    async _loadCharts() { await this._loadDashboard(); }

    // ── UTILIZADORES ────────────────────────────────────────────────────
    async _loadUsers() {
        if (!this.supabase) return;
        try {
            // Tentar com is_blocked; se coluna não existir (erro 42703), tentar sem ela
            let data, error;
            // Tentativa 1: select completo
            ({ data, error } = await this.supabase
                .from('profiles')
                .select('id, full_name, phone, email, credits, total_documents, is_admin, is_blocked, is_temp, account_type, credits_expires_at, temp_ref, temp_password, created_at')
                .order('created_at', { ascending: false }));

            // Tentativa 2: sem is_blocked (BD não migrada)
            if (error?.code === '42703') {
                this._isBlockedMissing = true;
                ({ data, error } = await this.supabase
                    .from('profiles')
                    .select('id, full_name, phone, email, credits, total_documents, is_admin, account_type, credits_expires_at, created_at')
                    .order('created_at', { ascending: false }));
            }

            // Tentativa 3: schema mínimo
            if (error?.code === '42703') {
                ({ data, error } = await this.supabase
                    .from('profiles')
                    .select('id, full_name, phone, email, credits, is_admin, created_at')
                    .order('created_at', { ascending: false }));
            }

            if (error) throw error;
            // Normalizar campos opcionais
            this._users = (data || []).map(u => ({
                ...u,
                is_blocked:   u.is_blocked   ?? false,
                is_temp:      u.is_temp       ?? (u.account_type === 'avulso'),
                account_type: u.account_type  ?? 'normal',
            }));
            this._renderUsers(this._users);

            if (this._isBlockedMissing && !this._blockWarnShown) {
                this._blockWarnShown = true;
                this._notify('⚠ Execute a migração SQL para activar o bloqueio de utilizadores.', 'warn');
            }
        } catch (err) { console.error('[Admin] Utilizadores:', err); this._notify('❌ Erro ao carregar utilizadores', 'error'); }
    }

    filterUsers(query) {
        const q    = (query || document.getElementById('searchUsers')?.value || '').toLowerCase();
        const type = document.getElementById('userTypeFilter')?.value || 'all';
        let filtered = (this._users || []).filter(u =>
            (u.full_name || '').toLowerCase().includes(q) ||
            (u.phone     || '').includes(q) ||
            (u.email     || '').toLowerCase().includes(q) ||
            (u.id        || '').toLowerCase().includes(q)
        );
        if (type === 'admin')   filtered = filtered.filter(u => u.is_admin);
        if (type === 'blocked') filtered = filtered.filter(u => u.is_blocked);
        if (type === 'avulso')  filtered = filtered.filter(u => u.account_type === 'avulso' || u.is_temp);
        if (type === 'normal')  filtered = filtered.filter(u => (u.account_type === 'normal' || !u.account_type) && !u.is_temp);
        this._renderUsers(filtered);
    }

    _renderUsers(users) {
        // ── MOBILE CARDS ──
        const cards = document.getElementById('usersCards');
        if (cards) {
            if (!users.length) {
                cards.innerHTML = '<div class="empty-state"><p>👥 Nenhum utilizador encontrado</p></div>';
            } else {
                cards.innerHTML = users.map(u => this._userCard(u)).join('');
            }
        }

        // ── DESKTOP TABLE ──
        const tbody = document.getElementById('usersTable');
        if (tbody) {
            if (!users.length) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8">Nenhum utilizador</td></tr>';
            } else {
                tbody.innerHTML = users.map(u => `
                    <tr>
                        <td>
                            <div style="font-weight:700;font-size:.9rem">${u.full_name || '—'}</div>
                            <div style="font-size:.75rem;color:#64748b">${u.id.slice(0,8)}…</div>
                        </td>
                        <td>${u.phone ? u.phone : '<span style="color:#f59e0b;font-size:.8rem">⚠ sem phone</span>'}</td>
                        <td style="font-size:.8rem;color:#64748b;max-width:160px;overflow:hidden;text-overflow:ellipsis">${u.email || '—'}</td>
                        <td><span class="credit-badge">💎 ${u.credits ?? 0}</span></td>
                        <td>${u.total_documents ?? 0}</td>
                        <td>
                            ${(u.account_type === 'avulso' || u.is_temp) ? '<span class="badge badge-orange">⏳ Avulso</span>' : '<span class="badge badge-blue" style="font-size:10px;">👤 Normal</span>'}
                            ${u.is_admin ? '<span class="badge badge-purple">⭐ Admin</span>' : ''}
                            ${u.is_blocked ? '<span class="badge badge-red">🚫 Bloqueado</span>' : '<span class="badge badge-green">✅ Activo</span>'}
                            ${u.credits_expires_at && new Date(u.credits_expires_at) < new Date() ? '<span class="badge badge-red" style="font-size:10px;">⌛ Expirado</span>' : ''}
                        </td>
                        <td style="font-size:.8rem">${new Date(u.created_at).toLocaleDateString('pt-MZ')}</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-ghost" title="Timeline / CRM" onclick="adminApp._openUserTimeline('${u.id}','${(u.full_name||u.phone||u.id.slice(0,8)).replace(/'/g,'')}')">🕒</button>
                                <button class="btn-ghost" onclick="adminApp.addCreditsModal('${u.id}','${(u.full_name||u.phone||u.id.slice(0,8)).replace(/'/g,'')}',${u.credits??0})">➕</button>
                                <button class="btn-warning" onclick="adminApp.editCreditsModal('${u.id}','${(u.full_name||u.phone||u.id.slice(0,8)).replace(/'/g,'')}',${u.credits??0})">✏️</button>
                                ${u.is_temp ? `<button class="btn-info" onclick="adminApp.showTempCredentials('${u.id}')">🔑</button>` : ''}
                                ${u.is_blocked
                                    ? `<button class="btn-success" onclick="adminApp.toggleBlock('${u.id}',false)">🔓</button>`
                                    : `<button class="btn-warning" onclick="adminApp.toggleBlock('${u.id}',true)">🔒</button>`}
                                <button class="btn-danger" onclick="adminApp.deleteUser('${u.id}','${(u.full_name||u.phone||'').replace(/'/g,'')}')">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }
        }
    }

    _userCard(u) {
        const initials = (u.full_name || u.email || '?')[0].toUpperCase();
        return `<div class="user-card">
            <div class="user-card-header">
                <div class="user-card-avatar">${initials}</div>
                <div class="user-card-info">
                    <div class="user-card-name">${u.full_name || '(sem nome)'}</div>
                    <div class="user-card-phone">${u.phone || '⚠ sem telemóvel'}</div>
                    <div class="user-card-email">${u.email || '—'}</div>
                </div>
            </div>
            <div class="user-card-meta">
                <span class="credit-badge">💎 ${u.credits ?? 0} cr</span>
                <span class="badge badge-gray">📄 ${u.total_documents ?? 0} docs</span>
                ${(u.account_type === 'avulso' || u.is_temp) ? '<span class="badge badge-orange">⏳ Avulso</span>' : '<span class="badge badge-blue" style="font-size:10px;">👤 Normal</span>'}
                ${u.is_admin    ? '<span class="badge badge-purple">⭐ Admin</span>' : ''}
                ${u.is_blocked  ? '<span class="badge badge-red">🚫 Bloqueado</span>' : '<span class="badge badge-green">✅ Activo</span>'}
            </div>
            <div class="user-card-actions">
                <button class="btn-ghost" onclick="adminApp._openUserTimeline('${u.id}','${(u.full_name||u.phone||u.id.slice(0,8)).replace(/'/g,'')}')">🕒 Timeline</button>
                <button class="btn-ghost" onclick="adminApp.addCreditsModal('${u.id}','${(u.full_name||u.phone||u.id.slice(0,8)).replace(/'/g,'')}',${u.credits??0})">➕ Créditos</button>
                <button class="btn-warning" onclick="adminApp.editCreditsModal('${u.id}','${(u.full_name||u.phone||u.id.slice(0,8)).replace(/'/g,'')}',${u.credits??0})">✏️ Definir</button>
                ${u.is_temp
                    ? `<button class="btn-info" onclick="adminApp.showTempCredentials('${u.id}')">🔑 Credenciais</button>`
                    : ''}
                ${u.is_blocked
                    ? `<button class="btn-success" onclick="adminApp.toggleBlock('${u.id}',false)">🔓 Desbloquear</button>`
                    : `<button class="btn-warning" onclick="adminApp.toggleBlock('${u.id}',true)">🔒 Bloquear</button>`}
                <button class="btn-danger" onclick="adminApp.deleteUser('${u.id}','${(u.full_name||u.phone||'').replace(/'/g,'')}')">🗑️ Eliminar</button>
            </div>
        </div>`;
    }

    // ── Adicionar créditos (incremento) ─────────────────────────────────
    addCreditsModal(userId, userName, current) {
        this.showModal(`
            <p class="modal-title">➕ Adicionar Créditos</p>
            <p class="modal-sub">Utilizador: <strong>${userName}</strong> · Actual: <strong>${current} cr</strong></p>
            <div class="modal-field">
                <label>Créditos a adicionar</label>
                <input type="number" id="mCredits" min="1" max="9999" value="10" autofocus>
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#3b82f6;color:#fff" onclick="adminApp._doAddCredits('${userId}')">✅ Confirmar</button>
            </div>
        `);
        setTimeout(() => document.getElementById('mCredits')?.focus(), 100);
    }

    async _doAddCredits(userId) {
        const amount = parseInt(document.getElementById('mCredits')?.value);
        if (!amount || amount < 1) return;
        this.closeModal();
        try {
            const { error } = await this.supabase.rpc('add_credits', { user_id: userId, amount });
            if (error) throw error;
            this._notify(`✅ ${amount} créditos adicionados!`);
            this._loadUsers();
        } catch (err) {
            // Fallback se a RPC não existir: update directo
            try {
                const user = this._users.find(u => u.id === userId);
                const newCredits = (user?.credits || 0) + amount;
                const { error: e2 } = await this.supabase
                    .from('profiles').update({ credits: newCredits }).eq('id', userId);
                if (e2) throw e2;
                this._notify(`✅ ${amount} créditos adicionados!`);
                this._loadUsers();
            } catch (err2) {
                this._notify('❌ ' + err2.message, 'error');
            }
        }
    }

    // ── Definir créditos (valor absoluto) ───────────────────────────────
    editCreditsModal(userId, userName, current) {
        this.showModal(`
            <p class="modal-title">✏️ Definir Créditos</p>
            <p class="modal-sub">Utilizador: <strong>${userName}</strong></p>
            <div class="modal-field">
                <label>Novo total de créditos</label>
                <input type="number" id="mCreditsSet" min="0" max="9999" value="${current}" autofocus>
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#f59e0b;color:#000" onclick="adminApp._doSetCredits('${userId}')">✅ Guardar</button>
            </div>
        `);
        setTimeout(() => document.getElementById('mCreditsSet')?.focus(), 100);
    }

    async _doSetCredits(userId) {
        const credits = parseInt(document.getElementById('mCreditsSet')?.value);
        if (isNaN(credits) || credits < 0) return;
        this.closeModal();
        try {
            const { error } = await this.supabase.from('profiles').update({ credits }).eq('id', userId);
            if (error) throw error;
            this._notify(`✅ Créditos definidos para ${credits}!`);
            this._loadUsers();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── Bloquear / Desbloquear ──────────────────────────────────────────
    async toggleBlock(userId, block) {
        const action = block ? 'bloquear' : 'desbloquear';
        const confirmed = await this._dialog(
            action === 'suspend' ? '⛔ Suspender utilizador?' : '✅ Reactivar utilizador?',
            `Tem a certeza que deseja <strong>${action}</strong> este utilizador?`,
            { confirmLabel: action === 'suspend' ? 'Suspender' : 'Reactivar',
              confirmColor: action === 'suspend' ? '#ef4444' : '#22c55e' }
        );
        if (!confirmed) return;
        try {
            // is_blocked: se a coluna não existir no schema, usar um workaround via credits = -1
            const { error } = await this.supabase
                .from('profiles')
                .update({ is_blocked: block })
                .eq('id', userId);

            if (error) {
                // Coluna is_blocked não existe — avisar o admin
                this._notify('⚠ A coluna is_blocked não existe no schema. Execute o SQL de migração.', 'error');
                this._showMigrationHint();
                return;
            }
            this._notify(`✅ Utilizador ${block ? 'bloqueado' : 'desbloqueado'} com sucesso!`);
            this._loadUsers();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    _showMigrationHint() {
        this.showModal(`
            <p class="modal-title">📋 Migração SQL Necessária</p>
            <p class="modal-sub">Execute este SQL no Supabase Dashboard → SQL Editor:</p>
            <pre style="background:#f1f5f9;padding:1rem;border-radius:8px;font-size:.75rem;overflow-x:auto;margin:.75rem 0;white-space:pre-wrap">ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- Política RLS para admin actualizar qualquer perfil
CREATE POLICY IF NOT EXISTS "Admin can update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND is_admin = TRUE
));</pre>
            <div class="modal-actions">
                <button style="background:#3b82f6;color:#fff" onclick="adminApp.closeModal()">OK</button>
            </div>
        `);
    }

    // ── Ver credenciais de conta temporária ────────────────────────────
    showTempCredentials(userId) {
        const u = this._users.find(u => u.id === userId);
        if (!u) return;
        const email = u.email || '—';
        const pass  = u.temp_password || '(não disponível — enviada por WhatsApp)';
        const ref   = u.temp_ref || '—';
        this.showModal(`
            <p class="modal-title">🔑 Credenciais Avulso</p>
            <p class="modal-sub">Conta temporária — referência: <code>${ref}</code></p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1rem;margin:.75rem 0;font-size:.85rem;line-height:2">
                <div><strong>📧 Email:</strong> <code>${email}</code></div>
                <div><strong>🔐 Password:</strong> <code style="color:#7c3aed">${pass}</code></div>
                <div><strong>💎 Créditos actuais:</strong> ${u.credits ?? 0}</div>
                <div><strong>📱 Telemóvel:</strong> ${u.phone || '—'}</div>
            </div>
            <p style="font-size:.75rem;color:#94a3b8">Partilhe as credenciais com o cliente pelo WhatsApp de forma segura.</p>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Fechar</button>
                ${u.phone ? `<button style="background:#25d366;color:#fff" onclick="adminApp._sendCredentialsWA('${userId}')">📱 Reenviar WhatsApp</button>` : ''}
            </div>
        `);
    }

    _sendCredentialsWA(userId) {
        const u = this._users.find(u => u.id === userId);
        if (!u || !u.temp_password) { this._notify('⚠ Password não disponível', 'warn'); return; }
        const origin = window.location.origin;
        const msg = encodeURIComponent(
            `Olá! As suas credenciais MzDocs Pro:\n` +
            `🌐 Acesso: ${origin}\n` +
            `📧 Utilizador: ${u.email}\n` +
            `🔐 Password: ${u.temp_password}\n` +
            `💎 Créditos: ${u.credits}\n\n` +
            `Use estas credenciais para gerar os seus documentos.`
        );
        const phone = (u.phone || '').replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    }

    // ── Criar conta avulsa manualmente ──────────────────────────────────
    createAvulsoModal() {
        this.showModal(`
            <p class="modal-title">➕ Criar Conta Avulsa</p>
            <p class="modal-sub">Cria uma conta temporária com créditos avulsos para um cliente que já pagou.</p>
            <div class="modal-field">
                <label>Telemóvel do cliente *</label>
                <input type="tel" id="avPhone" placeholder="84XXXXXXX ou +25884XXXXXXX" autofocus>
            </div>
            <div class="modal-field">
                <label>Créditos a atribuir *</label>
                <input type="number" id="avCredits" min="1" max="100" value="3">
            </div>
            <div class="modal-field">
                <label>Referência do pagamento</label>
                <input type="text" id="avRef" placeholder="MAN001 (ou deixe vazio para gerar automaticamente)">
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#009A44;color:#fff" onclick="adminApp._doCreateAvulso()">✅ Criar conta</button>
            </div>
        `);
        setTimeout(() => document.getElementById('avPhone')?.focus(), 100);
    }

    async _doCreateAvulso() {
        const phone   = document.getElementById('avPhone')?.value?.trim();
        const credits = parseInt(document.getElementById('avCredits')?.value);
        const ref     = document.getElementById('avRef')?.value?.trim() || ('MAN' + Date.now().toString().slice(-6));

        if (!phone || phone.replace(/\D/g,'').length < 8) { this._notify('⚠ Insira um telemóvel válido', 'warn'); return; }
        if (!credits || credits < 1)                       { this._notify('⚠ Créditos inválidos', 'warn'); return; }

        this.closeModal();
        this._notify('⏳ A criar conta temporária…', 'info');

        try {
            const token = await authManager.getValidToken();
            const res = await fetch('/api/admin/confirm-avulso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ phone, credits, referenceId: ref, manual: true }),
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `Erro ${res.status}`);

            this.showModal(`
                <p class="modal-title" style="color:#009A44">✅ Conta criada com sucesso!</p>
                <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:1rem;margin:.75rem 0;font-size:.875rem;line-height:2">
                    <div><strong>📧 Email:</strong> <code>${result.tempEmail}</code></div>
                    <div><strong>🔐 Password:</strong> <code style="color:#7c3aed;font-size:1.05rem">${result.tempPass}</code></div>
                    <div><strong>💎 Créditos:</strong> ${credits}</div>
                    <div><strong>📱 Telemóvel:</strong> ${phone}</div>
                </div>
                <p style="font-size:.75rem;color:#94a3b8">Partilhe estas credenciais com o cliente.</p>
                <div class="modal-actions">
                    <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal();adminApp._loadUsers()">Fechar</button>
                    ${result.waLink ? `<a href="${result.waLink}" target="_blank" style="display:inline-flex;align-items:center;gap:.4rem;background:#25d366;color:#fff;padding:.6rem 1.2rem;border-radius:8px;font-weight:700;text-decoration:none">📱 Enviar WhatsApp</a>` : ''}
                </div>
            `);
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── Eliminar utilizador ─────────────────────────────────────────────
    deleteUser(userId, userName) {
        this.showModal(`
            <p class="modal-title" style="color:#ef4444">🗑️ Eliminar Utilizador</p>
            <p class="modal-sub">Esta acção é <strong>irreversível</strong>. Todos os documentos e dados serão apagados.</p>
            <p style="font-size:.9rem;margin:.75rem 0"><strong>Utilizador:</strong> ${userName}</p>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#ef4444;color:#fff" onclick="adminApp._doDeleteUser('${userId}')">🗑️ Eliminar definitivamente</button>
            </div>
        `);
    }

    async _doDeleteUser(userId) {
        this.closeModal();
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/delete-user', {
                method:  'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body:    JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao eliminar');
            this._notify('✅ Utilizador eliminado permanentemente!');
            this._loadUsers();
            this._loadDashboard();
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── TRANSAÇÕES ──────────────────────────────────────────────────────
    async _loadTransactions() {
        const tbody = document.getElementById('transactionsTable');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8">A carregar…</td></tr>';
        try {
            const token  = await this._getAdminToken();
            const status = document.getElementById('filterStatus')?.value || 'all';
            const date   = document.getElementById('filterDate')?.value   || '';
            const params = new URLSearchParams({ status, date, limit: '100' });
            const res    = await fetch(`/api/admin/transactions?${params}`, {
                headers: { Authorization: 'Bearer ' + token },
                signal: (AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao carregar');
            const data = json.data || [];
            this._transactions = data; // NOVO (Fase 5): usado pela exportação CSV/Excel/PDF

            tbody.innerHTML = data.map(t => {
                const user    = t.profiles || t.user_profile || {};
                const name    = user.full_name || user.phone || 'Anónimo';
                const email   = user.email || '';
                const hasReceipt = t.receipt_hash && t.receipt_hash.length > 0;

                let actions = '—';
                if (t.status === 'pending') {
                    actions = `
                        <div class="action-group">
                            <button class="btn-success" title="Confirmar" onclick="adminApp._confirmPayment('${t.id}','${t.user_id}',${t.credits})">✅</button>
                            <button class="btn-danger"  title="Rejeitar"  onclick="adminApp._rejectPayment('${t.id}')">❌</button>
                        </div>`;
                } else if (t.status === 'review_needed') {
                    actions = `
                        <div class="action-group">
                            <button class="btn-success" title="Ver comprovativo e aprovar" onclick="adminApp._reviewReceipt('${t.id}','${t.user_id}',${t.credits},'${t.reference_id || ''}',${t.receipt_confidence || 0},'${(t.review_reason || '').replace(/'/g, '')}')">🔍 Rever</button>
                            <button class="btn-danger"  title="Rejeitar directamente"      onclick="adminApp._rejectReceipt('${t.id}')">❌</button>
                        </div>`;
                }

                const confidenceBadge = (t.status === 'review_needed' && t.receipt_confidence != null)
                    ? `<div style="font-size:.7rem;color:#92400e;margin-top:2px;">IA: ${Math.round((t.receipt_confidence||0)*100)}%</div>`
                    : '';

                return `
                <tr>
                    <td><code style="font-size:.75rem">${t.reference_id || t.id.slice(0,8)}</code></td>
                    <td>
                        <div style="font-size:.85rem">${name}</div>
                        <div style="font-size:.72rem;color:#64748b">${email}</div>
                    </td>
                    <td>${(t.package_id||'-').toUpperCase()}</td>
                    <td style="font-weight:700">${(t.amount||0).toLocaleString('pt-MZ')} MZN</td>
                    <td><span class="credit-badge">${t.credits} cr</span></td>
                    <td>
                        <span class="status-badge status-${t.status}">${this._statusLabel(t.status)}</span>
                        ${confidenceBadge}
                    </td>
                    <td style="font-size:.78rem">${new Date(t.created_at).toLocaleString('pt-MZ')}</td>
                    <td>${actions}</td>
                </tr>`;
            }).join('') || '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8">Nenhuma transação</td></tr>';
        } catch (err) {
            console.error('[Admin] Transa\u00e7\u00f5es:', err);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444">\u274c ${err.message}</td></tr>`;
        }
    }

    _confirmPayment(txId, userId, credits) {
        this.showModal(`
            <p class="modal-title">✅ Confirmar Pagamento</p>
            <p class="modal-sub">Adicionar <strong>${credits} créditos</strong> ao utilizador?</p>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#22c55e;color:#fff" onclick="adminApp._doConfirm('${txId}','${userId}',${credits})">✅ Confirmar</button>
            </div>
        `);
    }

    async _doConfirm(txId, userId, credits) {
        this.closeModal();
        try {
            const token = await authManager.getValidToken();
            const res = await fetch('/api/admin/confirm-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ transactionId: txId, userId, credits })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this._notify(`✅ ${credits} créditos confirmados!`);
            this._loadTransactions();
            this._loadDashboard();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    async _rejectPayment(txId) {
        const confirmed = await this._dialog(
            'Rejeitar pagamento?',
            'Esta acção marcará o pagamento como falhado. Não pode ser desfeita.',
            { confirmLabel: 'Rejeitar', icon: '❌' }
        );
        if (!confirmed) return;
        try {
            const { error } = await this.supabase.from('transactions').update({ status: 'failed' }).eq('id', txId);
            if (error) throw error;
            this._notify('✅ Pagamento rejeitado');
            this._loadTransactions();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── REVISÃO DE COMPROVATIVO (review_needed) ──────────────────────────
    async _reviewReceipt(txId, userId, credits, refId, confidence, reviewReason) {
        // Buscar a imagem do comprovativo via pending-receipts
        let receiptImgHtml = '<p style="color:#94a3b8;font-size:.82rem;text-align:center;padding:12px;">A carregar imagem…</p>';

        this.showModal(`
            <p class="modal-title">🔍 Rever Comprovativo</p>
            <div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:6px;">
                    <span>Referência: <code>${refId}</code></span>
                    <span>Créditos: <strong>${credits}</strong></span>
                </div>
                <div style="font-size:.78rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px;">
                    Confiança IA: <strong>${Math.round(confidence * 100)}%</strong>
                    ${reviewReason ? ` &mdash; ${reviewReason}` : ''}
                </div>
            </div>
            <div id="receiptImgContainer" style="text-align:center;margin-bottom:12px;min-height:80px;">
                ${receiptImgHtml}
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Fechar</button>
                <button style="background:#ef4444;color:#fff" onclick="adminApp._rejectReceipt('${txId}')">❌ Rejeitar</button>
                <button style="background:#22c55e;color:#fff" onclick="adminApp._approveReceipt('${txId}','${userId}',${credits})">✅ Aprovar</button>
            </div>
        `);

        // Tentar carregar imagem do Supabase (se receipt_image estiver na tabela)
        try {
            const token = await this._getAdminToken();
            const res   = await fetch(`/api/admin/pending-receipts`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const json = await res.json();
            const tx   = (json.data || []).find(t => t.id === txId);
            const container = document.getElementById('receiptImgContainer');
            if (!container) return;

            if (tx?.receipt_image_url) {
                container.innerHTML = `<img src="${tx.receipt_image_url}" style="max-width:100%;max-height:240px;border-radius:8px;border:1.5px solid #d1d5db;" alt="Comprovativo">`;
            } else if (tx?.receipt_hash) {
                container.innerHTML = `
                    <div style="background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:8px;padding:16px;text-align:center;">
                        <div style="font-size:1.5rem;margin-bottom:4px;">🔐</div>
                        <p style="font-size:.8rem;color:#64748b;margin:0;">Imagem processada (hash: <code style="font-size:.72rem">${tx.receipt_hash.slice(0,16)}…</code>)</p>
                        <p style="font-size:.75rem;color:#94a3b8;margin:4px 0 0;">A imagem não é armazenada por privacidade.<br>Verifique o comprovativo pelo WhatsApp se necessário.</p>
                    </div>`;
            } else {
                container.innerHTML = `<p style="color:#94a3b8;font-size:.82rem;text-align:center;">Sem imagem disponível — verifique via WhatsApp</p>`;
            }
        } catch (e) {
            const container = document.getElementById('receiptImgContainer');
            if (container) container.innerHTML = `<p style="color:#ef4444;font-size:.8rem;text-align:center;">Erro ao carregar imagem</p>`;
        }
    }

    async _approveReceipt(txId, userId, credits) {
        this.closeModal();
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/approve-receipt', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ transactionId: txId, approved: true }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this._notify(`✅ ${credits} créditos aprovados e adicionados!`);
            this._loadTransactions();
            this._loadDashboard();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    async _rejectReceipt(txId) {
        this.closeModal();
        const note = await this._prompt(
            'Motivo da rejeição',
            'Ex: Valor incorrecto, comprovativo ilegível…',
            { icon: '❌', subtitle: 'Opcional — será registado no histórico.', confirmLabel: 'Rejeitar' }
        );
        if (note === null) return; // cancelou
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/approve-receipt', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ transactionId: txId, approved: false, note }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this._notify('✅ Comprovativo rejeitado.');
            this._loadTransactions();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── DOCUMENTOS ──────────────────────────────────────────────────────
    async _loadDocuments() {
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/documents?limit=100', {
                headers: { Authorization: 'Bearer ' + token },
                signal: (AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao carregar documentos');
            this._docs = json.data || [];
            this._renderDocs(this._docs);
        } catch (err) {
            console.error('[Admin] Documentos:', err);
            const tbody = document.getElementById('documentsTable');
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#ef4444">❌ ${err.message}</td></tr>`;
        }
    }

    filterDocs(query) {
        const q = query.toLowerCase();
        const filtered = this._docs.filter(d =>
            this._typeLabel(d.service_type).toLowerCase().includes(q) ||
            (d.profiles?.full_name || '').toLowerCase().includes(q) ||
            (d.profiles?.phone || '').includes(q)
        );
        this._renderDocs(filtered);
    }

    _renderDocs(docs) {
        const tbody = document.getElementById('documentsTable');
        if (!tbody) return;
        tbody.innerHTML = docs.map(d => `
            <tr>
                <td>${this._typeLabel(d.service_type)}</td>
                <td>${d.profiles?.full_name || d.profiles?.phone || 'Anónimo'}</td>
                <td><code style="font-size:.75rem">${d.model_used || '—'}</code></td>
                <td style="font-size:.78rem">${new Date(d.created_at).toLocaleString('pt-MZ')}</td>
                <td>
                    <div class="action-group">
                        <button class="btn-ghost" onclick="adminApp._viewDoc('${d.id}')">👁 Ver</button>
                        <button class="btn-danger" onclick="adminApp._deleteDoc('${d.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:#94a3b8">Nenhum documento</td></tr>';
    }

    _viewDoc(docId) {
        const doc = this._docs.find(d => d.id === docId);
        if (!doc) return;
        this.showModal(`
            <p class="modal-title">${this._typeLabel(doc.service_type)}</p>
            <p class="modal-sub">${doc.profiles?.full_name || doc.profiles?.phone || 'Anónimo'} · ${new Date(doc.created_at).toLocaleString('pt-MZ')}</p>
            <div style="background:#f8fafc;border-radius:8px;padding:.875rem;white-space:pre-wrap;font-family:monospace;font-size:.75rem;max-height:50vh;overflow-y:auto;border:1px solid #e2e8f0">
                ${(doc.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0, 3000)}${doc.content?.length > 3000 ? '\n\n[…truncado]' : ''}
            </div>
            <div class="modal-actions" style="margin-top:.75rem">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Fechar</button>
                <button style="background:#ef4444;color:#fff" onclick="adminApp._deleteDoc('${doc.id}')">🗑️ Eliminar</button>
            </div>
        `);
    }

    async _deleteDoc(docId) {
        const confirmed = await this._dialog(
            'Eliminar documento?',
            'Esta acção é permanente e não pode ser desfeita.',
            { confirmLabel: 'Eliminar', icon: '🗑️' }
        );
        if (!confirmed) return;
        this.closeModal();
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/delete-document', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ docId }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao eliminar documento');
            this._notify('✅ Documento eliminado');
            this._loadDocuments();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── CONFIGURAÇÕES ────────────────────────────────────────────────────
    // _loadSettings, _savePricing, _saveSettings → replaced by async DB versions (v8.2)

    // ── DIAGNÓSTICO ─────────────────────────────────────────────────────
    async diagnoseMissingPhones() {
        const { data } = await this.supabase.from('profiles').select('id,email,phone,full_name').or('phone.is.null,phone.eq.');
        if (!data?.length) { this._notify('✅ Todos os utilizadores têm telemóvel!', 'info'); return; }
        this.showModal(`
            <p class="modal-title">🔍 Perfis sem telemóvel: ${data.length}</p>
            <div style="max-height:40vh;overflow-y:auto;margin:.75rem 0">
                ${data.map(u => `<div style="padding:.5rem;border-bottom:1px solid #e2e8f0;font-size:.83rem">
                    <strong>${u.email || u.id.slice(0,8)}</strong>
                    <span style="color:#94a3b8"> · ${u.id.slice(0,8)}</span>
                </div>`).join('')}
            </div>
            <div class="modal-actions">
                <button style="background:#3b82f6;color:#fff" onclick="adminApp.fixMissingPhones()">🔧 Reparar</button>
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Fechar</button>
            </div>
        `);
    }

    async fixMissingPhones() {
        this.closeModal();
        try {
            const token = await authManager.getValidToken();
            const res = await fetch('/api/admin/fix-profiles', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            this._notify(data.message || '✅ Reparação concluída', res.ok ? 'success' : 'error');
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── MODAL ────────────────────────────────────────────────────────────
    showModal(html) {
        const overlay = document.getElementById('globalModal');
        const content = document.getElementById('modalContent');
        if (content) content.innerHTML = html;
        if (overlay) overlay.style.display = 'flex';
    }

    closeModal(e) {
        if (e && e.target !== document.getElementById('globalModal')) return;
        document.getElementById('globalModal').style.display = 'none';
    }

    /**
     * _dialog — substitui confirm() nativo.
     * Devolve Promise<boolean>.
     * @param {string} title   — título do modal
     * @param {string} message — mensagem (aceita HTML)
     * @param {object} [opts]
     * @param {string} [opts.confirmLabel]  — texto do botão confirmar (default: 'Confirmar')
     * @param {string} [opts.confirmColor]  — cor CSS do botão (default: '#ef4444')
     * @param {string} [opts.cancelLabel]   — texto do botão cancelar (default: 'Cancelar')
     */
    _dialog(title, message, opts = {}) {
        return new Promise(resolve => {
            const confirmLabel = opts.confirmLabel || 'Confirmar';
            const confirmColor = opts.confirmColor || '#ef4444';
            const cancelLabel  = opts.cancelLabel  || 'Cancelar';
            const icon         = opts.icon         || '⚠️';

            this.showModal(`
                <div style="text-align:center;padding:4px 0 8px;">
                    <div style="font-size:2rem;margin-bottom:8px;">${icon}</div>
                    <p class="modal-title" style="margin-bottom:6px;">${title}</p>
                    <p class="modal-sub" style="font-size:.85rem;color:#4b5563;margin-bottom:0;">${message}</p>
                </div>
                <div class="modal-actions" style="margin-top:16px;">
                    <button id="_dlgCancel" style="background:#f1f5f9;color:#0f172a;flex:1;">
                        ${cancelLabel}
                    </button>
                    <button id="_dlgConfirm" style="background:${confirmColor};color:#fff;flex:1;font-weight:700;">
                        ${confirmLabel}
                    </button>
                </div>
            `);

            const cleanup = (result) => {
                document.getElementById('globalModal').style.display = 'none';
                resolve(result);
            };
            document.getElementById('_dlgCancel') ?.addEventListener('click', () => cleanup(false));
            document.getElementById('_dlgConfirm')?.addEventListener('click', () => cleanup(true));
        });
    }

    /**
     * _prompt — substitui prompt() nativo.
     * Devolve Promise<string|null>  (null se cancelou).
     * @param {string} title
     * @param {string} [placeholder]
     * @param {object} [opts]
     * @param {string} [opts.defaultValue]
     * @param {string} [opts.inputType]   — 'text' | 'month' | etc.
     * @param {string} [opts.confirmLabel]
     * @param {boolean}[opts.required]
     */
    _prompt(title, placeholder = '', opts = {}) {
        return new Promise(resolve => {
            const confirmLabel = opts.confirmLabel || 'OK';
            const inputType    = opts.inputType    || 'text';
            const defaultVal   = opts.defaultValue || '';
            const required     = opts.required     || false;
            const icon         = opts.icon         || '✏️';
            const subtitle     = opts.subtitle     || '';

            this.showModal(`
                <div style="text-align:center;padding:4px 0 6px;">
                    <div style="font-size:1.6rem;margin-bottom:6px;">${icon}</div>
                    <p class="modal-title" style="margin-bottom:${subtitle ? 4 : 12}px;">${title}</p>
                    ${subtitle ? `<p class="modal-sub" style="font-size:.82rem;color:#6b7280;margin-bottom:12px;">${subtitle}</p>` : ''}
                </div>
                <input id="_promptInput" type="${inputType}"
                    placeholder="${placeholder}"
                    value="${defaultVal}"
                    style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;
                           font-size:.9rem;outline:none;box-sizing:border-box;margin-bottom:14px;
                           transition:border .2s;"
                    onfocus="this.style.borderColor='#3b82f6'"
                    onblur="this.style.borderColor='#d1d5db'"
                >
                <div class="modal-actions">
                    <button id="_promptCancel" style="background:#f1f5f9;color:#0f172a;flex:1;">
                        Cancelar
                    </button>
                    <button id="_promptOk" style="background:#2563eb;color:#fff;flex:1;font-weight:700;">
                        ${confirmLabel}
                    </button>
                </div>
            `);

            const input = document.getElementById('_promptInput');
            const cleanup = (val) => {
                document.getElementById('globalModal').style.display = 'none';
                resolve(val);
            };

            // Auto-focus no input
            setTimeout(() => input?.focus(), 80);

            // Enter confirma
            input?.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const val = input.value.trim();
                    if (required && !val) { input.style.borderColor = '#ef4444'; return; }
                    cleanup(val || null);
                }
                if (e.key === 'Escape') cleanup(null);
            });

            document.getElementById('_promptCancel')?.addEventListener('click', () => cleanup(null));
            document.getElementById('_promptOk')    ?.addEventListener('click', () => {
                const val = input?.value?.trim() || '';
                if (required && !val) { if (input) input.style.borderColor = '#ef4444'; return; }
                cleanup(val || '');
            });
        });
    }

    /**
     * _toast — substitui alert() nativo (não bloqueante).
     * Para mensagens de sucesso/erro que não precisam de resposta.
     */
    _toast(msg, type = 'info') {
        this._notify(msg, type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
    }

    // ── NOTIFY ───────────────────────────────────────────────────────────
    _notify(msg, type = 'success') {
        document.querySelectorAll('.notify-toast').forEach(n => n.remove());
        const n = document.createElement('div');
        n.className = `notify-toast notify-${type}`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => { n.style.opacity = '0'; n.style.transition = 'opacity .3s'; setTimeout(() => n.remove(), 300); }, 3500);
    }

    // ── HELPERS ──────────────────────────────────────────────────────────
    _statusLabel(s) {
        return {
            pending:       '⏳ Pendente',
            review_needed: '🔍 Em revisão',
            completed:     '✅ Confirmado',
            confirmed:     '✅ Confirmado',
            failed:        '❌ Falhado',
            cancelled:     '🚫 Cancelado',
            refunded:      '↩️ Reembolsado',
        }[s] || s;
    }
    _typeLabel(t) {
        return { trabalho:'📚 Trabalho', cv:'📋 CV', carta:'✉️ Carta', orcamento:'🏗️ Orçamento',
                 impressao:'🖨️ Impressão', foto:'📷 Foto', conversao:'🔄 Conversão' }[t] || (t || '—');
    }

    // ════════════════════════════════════════════════════════════════════
    // BLOG / PÁGINAS
    // ════════════════════════════════════════════════════════════════════

    async _getAdminToken() {
        const { data } = await this.supabase.auth.getSession();
        return data?.session?.access_token || null;
    }

    async _loadBlog() {
        const tbody = document.getElementById('blogTable');
        const empty = document.getElementById('blogEmpty');
        const badge = document.getElementById('navBadgeBlog');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">A carregar…</td></tr>';
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/pages', { headers: { Authorization: 'Bearer ' + token } });
            const pages = await res.json();
            this._allBlogPages = Array.isArray(pages) ? pages : [];
            if (badge) badge.textContent = this._allBlogPages.length;
            const totalEl = document.getElementById('blogTotalCount');
            if (totalEl) {
                const pubCount = this._allBlogPages.filter(p => p.published).length;
                totalEl.textContent = `${this._allBlogPages.length} artigo(s) — ${pubCount} publicado(s)`;
            }
            this.filterBlog();
            this._loadBlogQueue();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">Erro: ' + err.message + '</td></tr>';
        }
    }

    // ── NOVO: Fila de publicação agendada (manual + IA) ──────────────────
    async _loadBlogQueue() {
        const pendTbody = document.getElementById('blogQueuePendingTable');
        const doneTbody = document.getElementById('blogQueueDoneTable');
        const summaryEl = document.getElementById('blogQueueSummary');
        if (!pendTbody || !doneTbody) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin?action=blog-queue', { headers: { Authorization: 'Bearer ' + token } });
            const json  = await res.json();
            const items = json.data || [];
            const s     = json.summary || {};
            this._blogQueueLimits = { monthlyLimit: s.monthlyLimit || 12, minIntervalDays: s.minIntervalDays || 2 };

            document.getElementById('blogPendingCount').textContent = s.pendingCount ?? items.filter(i => i.status === 'pending').length;
            document.getElementById('blogDoneCount').textContent    = s.publishedCount ?? items.filter(i => i.status === 'published').length;

            if (summaryEl) {
                const pct = s.monthlyLimit ? Math.min(100, Math.round((s.thisMonthCount / s.monthlyLimit) * 100)) : 0;
                const overBudget = s.thisMonthCount >= s.monthlyLimit;
                summaryEl.innerHTML = `
                    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px 14px;font-size:12px;color:#334155;">
                        📊 <strong>${s.thisMonthCount ?? 0}/${s.monthlyLimit ?? '—'}</strong> artigos este mês
                        ${overBudget ? '<span style="color:#DC2626;font-weight:700;"> · limite atingido</span>' : ''}
                    </div>
                    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px 14px;font-size:12px;color:#334155;">
                        ⏱️ Intervalo mínimo: <strong>${s.minIntervalDays ?? '—'} dia(s)</strong>
                    </div>
                    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px 14px;font-size:12px;color:#334155;">
                        🗓️ Total na fila: <strong>${items.length}</strong>
                    </div>
                `;
            }

            const pending   = items.filter(i => i.status === 'pending');
            const settled   = items.filter(i => i.status !== 'pending');

            if (!pending.length) {
                pendTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;">Sem artigos pendentes. Use "📅 Agendar em Massa" ou active a "🤖 Geração Automática".</td></tr>';
            } else {
                pendTbody.innerHTML = pending.map(it => {
                    const dt = new Date(it.scheduled_at);
                    const localInput = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    const origem = it.source === 'ai' ? '🤖 IA' : '✍️ Manual';
                    return `<tr>
                        <td><strong>${it.title}</strong></td>
                        <td style="font-size:12px;">${origem}</td>
                        <td style="font-size:12px;">
                            <input type="datetime-local" value="${localInput}" id="sched-${it.id}"
                                style="font-size:12px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px;">
                        </td>
                        <td><span style="background:#FEF9C3;color:#713F12;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">⏳ Agendado</span></td>
                        <td style="white-space:nowrap;">
                            <button class="btn-ghost" style="font-size:12px;" onclick="adminApp._saveBlogQueueDate('${it.id}')">💾 Guardar</button>
                            <button class="btn-ghost" style="font-size:12px;color:#ef4444;" onclick="adminApp._deleteBlogQueueItem('${it.id}')">🗑️</button>
                        </td>
                    </tr>`;
                }).join('');
            }

            if (!settled.length) {
                doneTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;">Ainda sem publicações concluídas pela fila.</td></tr>';
            } else {
                doneTbody.innerHTML = settled.map(it => {
                    const when = new Date(it.scheduled_at).toLocaleString('pt-MZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
                    const statusBadge = {
                        published: '<span style="background:#ECFDF5;color:#065F46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">✅ Publicado</span>',
                        failed:    '<span style="background:#FEE2E2;color:#991B1B;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">❌ Falhou</span>',
                    }[it.status] || it.status;
                    const origem = it.source === 'ai' ? '🤖 IA' : '✍️ Manual';
                    const actions = it.error_note ? `<span style="font-size:11px;color:#991B1B;" title="${(it.error_note||'').replace(/"/g,'&quot;')}">ⓘ erro</span>` : '—';
                    return `<tr>
                        <td><strong>${it.title}</strong></td>
                        <td style="font-size:12px;">${origem}</td>
                        <td style="font-size:12px;color:#64748b;">${when}</td>
                        <td>${statusBadge}</td>
                        <td>${actions}</td>
                    </tr>`;
                }).join('');
            }
        } catch (err) {
            pendTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#ef4444;">Erro: ' + err.message + '</td></tr>';
            doneTbody.innerHTML = '';
        }
    }

    // Guarda a nova data (manual, item a item) escolhida no input inline.
    async _saveBlogQueueDate(id) {
        const input = document.getElementById(`sched-${id}`);
        if (!input || !input.value) return;
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin?action=blog-queue', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ id, scheduled_at: new Date(input.value).toISOString() }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `Erro ${res.status}`);
            this._notify('✅ Data actualizada', 'success');
            this._loadBlogQueue();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    async _deleteBlogQueueItem(id) {
        try {
            const token = await this._getAdminToken();
            await fetch('/api/admin?action=blog-queue', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ id }),
            });
            this._loadBlogQueue();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── NOVO: Remover TODOS os pendentes de uma vez ───────────────────────
    async _deleteAllPendingBlogQueue() {
        if (!confirm('Remover TODOS os artigos pendentes da fila? Esta acção não pode ser desfeita. Os já publicados não são afectados.')) return;
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin?action=blog-queue', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ all: 'pending' }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `Erro ${res.status}`);
            this._notify(`✅ ${result.deleted} artigo(s) pendente(s) removido(s)`, 'success');
            this._loadBlogQueue();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── NOVO: Reagendar automaticamente TODOS os pendentes de uma vez ────
    openBlogRescheduleAll() {
        const today = new Date().toISOString().slice(0, 10);
        const lim = this._blogQueueLimits || { minIntervalDays: 2 };
        this.showModal(`
            <p class="modal-title">🔀 Reagendar Pendentes</p>
            <p class="modal-sub">Redistribui automaticamente TODOS os artigos ainda pendentes a partir da data escolhida, respeitando o intervalo mínimo e o limite mensal de artigos (avança para o mês seguinte sozinho se um mês já estiver cheio).</p>
            <div class="modal-field">
                <label>Recomeçar a partir de</label>
                <input type="date" id="rescheduleStartDate" value="${today}">
            </div>
            <div class="modal-field">
                <label>Intervalo entre artigos (dias) — mínimo ${lim.minIntervalDays}</label>
                <input type="number" id="rescheduleInterval" min="${lim.minIntervalDays}" value="${lim.minIntervalDays}">
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#009A44;color:#fff" onclick="adminApp._doRescheduleAll()">🔀 Reagendar Tudo</button>
            </div>
        `);
    }

    async _doRescheduleAll() {
        const startDate = document.getElementById('rescheduleStartDate')?.value;
        const intervalDays = parseInt(document.getElementById('rescheduleInterval')?.value) || (this._blogQueueLimits?.minIntervalDays || 2);
        this.closeModal();
        this._notify('⏳ A reagendar pendentes…', 'info');
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin?action=blog-queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ reschedule: true, startDate, intervalDays }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `Erro ${res.status}`);
            this._notify(`✅ ${result.updated} artigo(s) reagendado(s), 1 a cada ${result.intervalUsed} dia(s)`, 'success');
            this._loadBlogQueue();
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── NOVO: Agendar em massa (colar títulos + datas) ───────────────────
    openBlogBulkSchedule() {
        const today = new Date().toISOString().slice(0, 10);
        this.showModal(`
            <p class="modal-title">📅 Agendar Artigos em Massa</p>
            <p class="modal-sub">Cole um título por linha (até 200). Cada um será gerado por IA e publicado automaticamente na data agendada — lendo sempre os artigos já existentes para não repetir conteúdo. O intervalo mínimo entre artigos e o limite mensal (definidos em "🤖 Geração Automática") são sempre respeitados; se um mês ficar cheio, o agendamento avança sozinho para o mês seguinte.</p>
            <div class="modal-field">
                <label>Títulos (um por linha) *</label>
                <textarea id="bulkTitles" rows="8" placeholder="Como fazer um contrato de arrendamento em Maputo&#10;Como escrever uma carta de recomendação profissional&#10;..." style="width:100%;font-family:inherit;font-size:.85rem;padding:.5rem;border:1px solid #e2e8f0;border-radius:8px;"></textarea>
            </div>
            <div class="modal-field">
                <label>Primeira publicação em</label>
                <input type="date" id="bulkStartDate" value="${today}">
            </div>
            <div class="modal-field">
                <label>Intervalo entre artigos (dias)</label>
                <input type="number" id="bulkInterval" min="1" value="7">
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#009A44;color:#fff" onclick="adminApp._doBulkSchedule()">📅 Agendar</button>
            </div>
        `);
    }

    async _doBulkSchedule() {
        const raw      = document.getElementById('bulkTitles')?.value || '';
        const items    = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const startDate = document.getElementById('bulkStartDate')?.value;
        const intervalDays = parseInt(document.getElementById('bulkInterval')?.value) || 7;

        if (!items.length) { this._notify('⚠ Cole pelo menos um título', 'warn'); return; }
        if (items.length > 200) { this._notify('⚠ Máximo de 200 títulos', 'warn'); return; }

        this.closeModal();
        this._notify(`⏳ A agendar ${items.length} artigo(s)…`, 'info');
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin?action=blog-queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ items, startDate, intervalDays }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `Erro ${res.status}`);
            this._notify(`✅ ${result.inserted} artigo(s) agendado(s), 1 a cada ${intervalDays} dia(s)`, 'success');
            this._loadBlogQueue();
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── NOVO: Geração automática por IA (activar/desactivar + intervalo) ─
    async openBlogAutogenSettings() {
        this.showModal(`<p class="modal-title">🤖 Geração Automática</p><p class="modal-sub">A carregar…</p>`);
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin?action=blog-settings', { headers: { Authorization: 'Bearer ' + token } });
            const s = await res.json();
            const lastRunTxt = s.lastRun
                ? new Date(s.lastRun).toLocaleString('pt-MZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                : 'Nunca';
            this.showModal(`
                <p class="modal-title">🤖 Geração Automática de Artigos</p>
                <p class="modal-sub">Quando activo, o sistema gera e publica sozinho um novo artigo (título + conteúdo, sempre distinto dos já existentes) a cada X dias — sem precisar de colar títulos manualmente.</p>
                <div class="modal-field">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="autogenEnabled" ${s.enabled ? 'checked' : ''} style="width:18px;height:18px;">
                        Activar geração automática
                    </label>
                </div>
                <div class="modal-field">
                    <label>Intervalo entre artigos (dias)</label>
                    <input type="number" id="autogenInterval" min="1" value="${s.intervalDays || 7}">
                </div>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;">
                <p style="font-size:.8rem;font-weight:700;color:#0F172A;margin-bottom:4px;">Limites de publicação (manual + automática)</p>
                <div class="modal-field">
                    <label>Máximo de artigos por mês</label>
                    <input type="number" id="blogMonthlyLimit" min="1" max="31" value="${s.monthlyLimit || 12}">
                    <p style="font-size:.72rem;color:#94a3b8;margin-top:2px;">Aplica-se à fila inteira (agendamento manual + automático), para manter um ritmo de publicação seguro aos olhos do Google.</p>
                </div>
                <div class="modal-field">
                    <label>Intervalo mínimo entre artigos (dias)</label>
                    <input type="number" id="blogMinInterval" min="1" value="${s.minIntervalDays || 2}">
                </div>
                <p style="font-size:.75rem;color:#94a3b8;">Última geração automática: ${lastRunTxt}. O sistema verifica isto uma vez por dia.</p>
                <div class="modal-actions">
                    <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                    <button style="background:#009A44;color:#fff" onclick="adminApp._saveBlogAutogenSettings()">💾 Guardar</button>
                </div>
            `);
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    async _saveBlogAutogenSettings() {
        const enabled = document.getElementById('autogenEnabled')?.checked || false;
        const intervalDays = parseInt(document.getElementById('autogenInterval')?.value) || 7;
        const monthlyLimit = parseInt(document.getElementById('blogMonthlyLimit')?.value) || 12;
        const minIntervalDays = parseInt(document.getElementById('blogMinInterval')?.value) || 2;
        this.closeModal();
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin?action=blog-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ enabled, intervalDays, monthlyLimit, minIntervalDays }),
            });
            if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
            this._notify(enabled ? `✅ Geração automática activada (a cada ${intervalDays} dias)` : '✅ Definições guardadas', 'success');
            this._loadBlogQueue();
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    filterBlog() {
        const q      = (document.getElementById('searchBlog')?.value || '').toLowerCase();
        const status = document.getElementById('blogStatusFilter')?.value || 'all';
        const pages  = (this._allBlogPages || []).filter(p => {
            const matchQ = !q || (p.title || '').toLowerCase().includes(q) || (p.slug || '').includes(q);
            const matchS = status === 'all'
                || (status === 'published' && p.published)
                || (status === 'draft' && !p.published);
            return matchQ && matchS;
        });

        const tbody = document.getElementById('blogTable');
        const empty = document.getElementById('blogEmpty');
        if (!tbody) return;

        if (pages.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = pages.map(p => {
            const date = p.updated_at
                ? new Date(p.updated_at).toLocaleDateString('pt-MZ', { day:'2-digit', month:'short', year:'numeric' })
                : '—';
            const pubBadge = p.published
                ? '<span style="background:#ECFDF5;color:#065F46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">✅ Publicada</span>'
                : '<span style="background:#FEF9C3;color:#713F12;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">📝 Rascunho</span>';
            const aiBadge = p.ai_generated
                ? '<span style="font-size:11px;">🤖</span>'
                : '<span style="font-size:11px;color:#cbd5e1;">—</span>';
            const safeTitle = (p.title || '').replace(/'/g, "\\'");
            return '<tr>'
                + '<td><strong>' + (p.title || '—') + '</strong></td>'
                + '<td><code style="font-size:11px;background:#F1F5F9;padding:2px 6px;border-radius:4px;">' + p.slug + '</code></td>'
                + '<td>' + pubBadge + '</td>'
                + '<td>' + (p.views || 0) + '</td>'
                + '<td>' + aiBadge + '</td>'
                + '<td style="font-size:12px;color:#64748b;">' + date + '</td>'
                + '<td>'
                + '<button class="btn-ghost" style="font-size:12px;" onclick="adminApp.openPageEditor(\'' + p.id + '\')">✏️ Editar</button> '
                + '<a href="/pages/' + p.slug + '" target="_blank" class="btn-ghost" style="font-size:12px;text-decoration:none;">🔗 Ver</a> '
                + '<button class="btn-danger" style="font-size:12px;" onclick="adminApp.deletePage(\'' + p.id + '\',\'' + safeTitle + '\')">🗑️</button>'
                + '</td>'
                + '</tr>';
        }).join('');
    }

    async openPageEditor(pageId) {
        pageId = pageId || null;

        // Limpar todos os campos
        ['pageTitle2','pageSlug','pageMetaDesc','pageContent','pageEditId','aiTitle','aiKeywords'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const preview  = document.getElementById('pagePreview');
        const aiStatus = document.getElementById('aiStatus');
        const metaCount= document.getElementById('metaCharCount');
        if (preview)   preview.innerHTML = '';
        if (aiStatus)  { aiStatus.style.display = 'none'; aiStatus.textContent = ''; aiStatus.style.color = '#1D4ED8'; }
        if (metaCount) metaCount.textContent = '0 / 155';

        const editorTitle = document.getElementById('editorModalTitle');
        if (editorTitle) editorTitle.textContent = pageId ? '✏️ Editar Página' : '✏️ Nova Página';

        // Live preview
        const contentArea = document.getElementById('pageContent');
        if (contentArea) {
            if (contentArea._previewHandler) {
                contentArea.removeEventListener('input', contentArea._previewHandler);
            }
            contentArea._previewHandler = () => { if (preview) preview.innerHTML = contentArea.value; };
            contentArea.addEventListener('input', contentArea._previewHandler);
        }

        // Meta char count
        const metaArea = document.getElementById('pageMetaDesc');
        if (metaArea && metaCount) {
            metaArea.oninput = () => { metaCount.textContent = metaArea.value.length + ' / 155'; };
        }

        // Slug: marcar como não-manual para autoSlug funcionar
        const slugEl = document.getElementById('pageSlug');
        if (slugEl) {
            slugEl.dataset.manual = 'false';
            slugEl.addEventListener('input', () => { slugEl.dataset.manual = 'true'; }, { once: true });
        }

        // Se editar, carregar dados existentes
        if (pageId) {
            const page = (this._allBlogPages || []).find(p => p.id === pageId);
            if (page) {
                try {
                    const token = await this._getAdminToken();
                    const res   = await fetch('/api/admin/pages?slug=' + encodeURIComponent(page.slug), {
                        headers: { Authorization: 'Bearer ' + token }
                    });
                    if (res.ok) {
                        const full = await res.json();
                        document.getElementById('pageTitle2').value   = full.title            || '';
                        document.getElementById('pageSlug').value     = full.slug             || '';
                        document.getElementById('pageMetaDesc').value = full.meta_description || '';
                        document.getElementById('pageContent').value  = full.content_html     || '';
                        document.getElementById('pageEditId').value   = full.id               || '';
                        if (metaCount) metaCount.textContent = (full.meta_description || '').length + ' / 155';
                        if (preview)   preview.innerHTML = full.content_html || '';
                        if (slugEl)    slugEl.dataset.manual = 'true';
                    }
                } catch (e) {
                    console.error('[Blog editor load]', e);
                }
            }
        }

        document.getElementById('pageEditorOverlay').style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    closePageEditor() {
        document.getElementById('pageEditorOverlay').style.display = 'none';
        document.body.style.overflow = '';
        const contentArea = document.getElementById('pageContent');
        if (contentArea && contentArea._previewHandler) {
            contentArea.removeEventListener('input', contentArea._previewHandler);
            delete contentArea._previewHandler;
        }
    }

    autoSlug() {
        const titleEl = document.getElementById('pageTitle2');
        const slugEl  = document.getElementById('pageSlug');
        if (!titleEl || !slugEl || slugEl.dataset.manual === 'true') return;
        slugEl.value = titleEl.value
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 80);
    }

    async generateWithAI() {
        const aiTitle    = (document.getElementById('aiTitle')?.value || '').trim();
        const aiKeywords = (document.getElementById('aiKeywords')?.value || '').trim();
        const aiTone     = document.getElementById('aiTone')?.value || 'informativo';
        const aiWords    = parseInt(document.getElementById('aiWordCount')?.value || '600', 10);
        const aiStatus   = document.getElementById('aiStatus');
        const btn        = document.getElementById('btnGenerateAI');

        if (!aiTitle) { this._toast('Introduza um título para gerar com IA.', 'error'); return; }

        btn.disabled    = true;
        btn.textContent = '⏳ A gerar…';
        if (aiStatus) { aiStatus.style.display = 'block'; aiStatus.style.color = '#1D4ED8'; aiStatus.textContent = '🤖 A contactar a IA… pode demorar 10-30 segundos.'; }

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/generate-page', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body:    JSON.stringify({ title: aiTitle, keywords: aiKeywords, tone: aiTone, word_count: aiWords }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro na geração IA');

            document.getElementById('pageTitle2').value   = data.title            || aiTitle;
            document.getElementById('pageSlug').value     = data.slug             || '';
            document.getElementById('pageMetaDesc').value = data.meta_description || '';
            document.getElementById('pageContent').value  = data.content_html     || '';

            const preview   = document.getElementById('pagePreview');
            const metaCount = document.getElementById('metaCharCount');
            if (preview)   preview.innerHTML = data.content_html || '';
            if (metaCount) metaCount.textContent = (data.meta_description || '').length + ' / 155';

            const slugEl = document.getElementById('pageSlug');
            if (slugEl) slugEl.dataset.manual = 'true';

            if (aiStatus) aiStatus.textContent = '✅ Artigo gerado! (provider: ' + (data.provider || 'IA') + ') — Reveja e publique.';

        } catch (err) {
            if (aiStatus) { aiStatus.style.color = '#ef4444'; aiStatus.textContent = '❌ ' + err.message; }
        } finally {
            btn.disabled    = false;
            btn.textContent = '✨ Gerar Artigo';
        }
    }

    async savePage(publish) {
        publish = publish === true;
        const id      = (document.getElementById('pageEditId')?.value || '').trim();
        const title   = (document.getElementById('pageTitle2')?.value || '').trim();
        const slug    = (document.getElementById('pageSlug')?.value || '').trim();
        const meta    = (document.getElementById('pageMetaDesc')?.value || '').trim();
        const content = (document.getElementById('pageContent')?.value || '').trim();

        if (!title)   { this._toast('O título é obrigatório.', 'error'); return; }
        if (!content) { this._toast('O conteúdo é obrigatório.', 'error'); return; }

        try {
            const token   = await this._getAdminToken();
            const payload = { title, slug, meta_description: meta, content_html: content, published: publish };
            const method  = id ? 'PUT' : 'POST';
            if (id) payload.id = id;

            const res  = await fetch('/api/admin/pages', {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body:    JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao guardar');

            this.closePageEditor();
            await this._loadBlog();
            this._notify(publish ? '🚀 Página publicada com sucesso!' : '💾 Rascunho guardado com sucesso!');

        } catch (err) {
            this._notify('❌ Erro: ' + err.message, 'error');
        }
    }

    async deletePage(pageId, pageTitle) {
        const confirmed = await this._dialog(
            'Eliminar página?',
            `<strong>"${pageTitle}"</strong> será eliminada permanentemente.`,
            { confirmLabel: 'Eliminar', icon: '🗑️' }
        );
        if (!confirmed) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/pages', {
                method:  'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body:    JSON.stringify({ id: pageId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao eliminar');
            await this._loadBlog();
        } catch (err) {
            this._notify('❌ Erro: ' + err.message, 'error');
        }
    }


    // ════════════════════════════════════════════════════════════════════
    // ANALYTICS — visitas, online, serviços mais usados
    // ════════════════════════════════════════════════════════════════════

    // NOVO (Fase 4.1): rótulos amigáveis para as origens de marketing,
    // incluindo as novas detectadas por referrer (pesquisa orgânica,
    // redes sociais) e o tráfego vindo dos artigos do blog.
    _sourceLabel(source) {
        const map = {
            direct: '🔗 Directo', blog: '📝 Blog', afiliado: '🤝 Afiliado',
            organic_google: '🔍 Google (orgânico)', organic_bing: '🔍 Bing (orgânico)',
            organic_yahoo: '🔍 Yahoo (orgânico)', organic_duckduckgo: '🔍 DuckDuckGo (orgânico)',
            organic_baidu: '🔍 Baidu (orgânico)',
            social_facebook: '📘 Facebook/Instagram', social_tiktok: '🎵 TikTok', social_whatsapp: '💬 WhatsApp',
        };
        return map[source] || source;
    }

    async _loadAnalytics() {
        const el = id => document.getElementById(id);
        const setEl = (id, html) => { const e = el(id); if (e) e.innerHTML = html; };

        // Estado de carregamento
        const analyticsSection = el('section-analytics');
        if (analyticsSection) {
            setEl('topServicesList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('feedbackList',    '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('topPagesList',    '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('blogPerformanceList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('newClientsSummary',   '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('affiliateSegmentList','<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('marketingSourcesList','<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
        }

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/analytics?days=7', {
                headers: { Authorization: 'Bearer ' + token },
                signal: (AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined),
            }).catch(() => null);

            if (!res || !res.ok) {
                setEl('topServicesList', '<div style="color:#ef4444;font-size:.8rem">Erro ao carregar dados</div>');
                setEl('feedbackList', '<div style="color:#ef4444;font-size:.8rem">Erro ao carregar dados</div>');
                return;
            }
            const d = await res.json();

            // ── Online agora ─────────────────────────────────────────
            const online = d.onlineNow || 0;
            if (el('statOnlineNow'))          el('statOnlineNow').textContent          = online;
            if (el('statOnlineNowAnalytics')) el('statOnlineNowAnalytics').textContent = online;

            // ── Total de visitas hoje ────────────────────────────────
            const today    = new Date().toISOString().split('T')[0];
            const todayViews = (d.visitsByDay || {})[today] || 0;
            const totalViews = Object.values(d.visitsByDay || {}).reduce((a, b) => a + b, 0);
            if (el('statTodayViews'))  el('statTodayViews').textContent  = todayViews;
            if (el('statTotalViews'))  el('statTotalViews').textContent  = totalViews;

            // ── Gráfico visitas por dia ──────────────────────────────
            const visitLabels = Object.keys(d.visitsByDay || {}).map(dt => {
                const [, m, day] = dt.split('-');
                return `${day}/${m}`;
            });
            const visitData = Object.values(d.visitsByDay || {});
            const vc = el('visitsChart');
            if (vc && typeof Chart !== 'undefined') {
                if (this.charts && this.charts.visits) {
                    try { this.charts.visits.destroy(); } catch (_) {}
                }
                if (!this.charts) this.charts = {};
                this.charts.visits = new Chart(vc, {
                    type: 'bar',
                    data: {
                        labels: visitLabels,
                        datasets: [{
                            label: 'Visitas',
                            data: visitData,
                            backgroundColor: 'rgba(139,92,246,.7)',
                            borderRadius: 6,
                            borderSkipped: false,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
                            x: { ticks: { font: { size: 11 } } },
                        }
                    }
                });
            } else if (vc) {
                // Fallback sem Chart.js: tabela simples
                const parent = vc.parentElement;
                vc.style.display = 'none';
                const table = document.createElement('div');
                table.innerHTML = visitLabels.map((l, i) =>
                    `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:.8rem">
                        <span>${l}</span><strong>${visitData[i]}</strong>
                    </div>`
                ).join('') || '<span style="color:#94a3b8;font-size:.8rem">Sem dados</span>';
                parent.appendChild(table);
            }

            // ── Top serviços ─────────────────────────────────────────
            const serviceLabels = {
                trabalho:'📚 Trabalho Escolar', cv:'📋 Curriculum Vitae',
                carta:'✉️ Carta', orcamento:'🏗️ Orçamento de Obra',
                impressao:'🖨️ Impressão', foto:'📷 Foto Documentos',
                conversao:'🔄 Conversão', declaracao:'📄 Declaração',
                contrato:'📑 Contrato', procuracao:'⚖️ Procuração',
                requerimento:'📋 Requerimento', recibo:'🧾 Recibo',
                atestado:'📄 Atestado', geral:'⭐ Geral',
            };

            // Resolve qualquer formato de service para um label legível:
            // aceita chave simples "trabalho", JSON string '{"title":"..."}', ou texto livre
            function resolveServiceLabel(raw) {
                if (!raw) return 'Geral';
                const s = String(raw).trim();
                // JSON object string
                if (s.startsWith('{')) {
                    try {
                        const obj = JSON.parse(s);
                        return (obj.title || obj.name || 'Serviço');
                    } catch (_) {}
                }
                // JSON array string (improvável mas defensivo)
                if (s.startsWith('[')) return 'Serviço';
                // Chave mapeada
                return serviceLabels[s] || s;
            }
            const topSvcs = d.topServices || [];
            if (!topSvcs.length) {
                setEl('topServicesList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">Sem dados ainda</div>');
            } else {
                const max = topSvcs[0]?.count || 1;
                setEl('topServicesList', topSvcs.map(s => {
                    const pct   = Math.round((s.count / max) * 100);
                    const label = resolveServiceLabel(s.name);
                    return `<div style="margin:.5rem 0;overflow:hidden">
                        <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px;gap:4px">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><strong style="white-space:nowrap;flex-shrink:0">${s.count}</strong>
                        </div>
                        <div style="background:#e2e8f0;border-radius:4px;height:7px">
                            <div style="background:#3B82F6;height:7px;border-radius:4px;width:${pct}%;transition:width .4s"></div>
                        </div>
                    </div>`;
                }).join(''));
            }

            // ── NOVO (auditoria de analytics, v27): páginas mais vistas,
            // desempenho por artigo do blog, origem de novos clientes e
            // cliques de afiliados por segmento.
            const topPages = d.topPages || [];
            if (!topPages.length) {
                setEl('topPagesList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">Sem dados ainda</div>');
            } else {
                const maxP = topPages[0]?.views || 1;
                setEl('topPagesList', topPages.slice(0, 15).map(p => {
                    const pct   = Math.round((p.views / maxP) * 100);
                    const icon  = p.type === 'blog' ? '📝' : (p.type === 'home' ? '🏠' : '📄');
                    const label = p.title || p.page;
                    return `<div style="margin:.5rem 0">
                        <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px;gap:4px">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon} ${label}</span><strong style="white-space:nowrap;flex-shrink:0">${p.views}</strong>
                        </div>
                        <div style="background:#e2e8f0;border-radius:4px;height:7px">
                            <div style="background:#8B5CF6;height:7px;border-radius:4px;width:${pct}%;"></div>
                        </div>
                    </div>`;
                }).join(''));
            }

            const blogPerf = d.blogPerformance || [];
            if (!blogPerf.length) {
                setEl('blogPerformanceList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">Ainda sem artigos publicados</div>');
            } else {
                setEl('blogPerformanceList', blogPerf.slice(0, 15).map(b => `
                    <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:6px 0;border-bottom:1px solid #f1f5f9;gap:8px">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📝 ${b.title}</span>
                        <span style="white-space:nowrap;flex-shrink:0;color:#64748b">${b.views_total} vistas totais · ${b.views_period} no período</span>
                    </div>`).join(''));
            }

            const nc = d.newClients || { total: 0, organic: 0, avulso: 0, bySegment: {} };
            const segLabels = { papelaria:'🏪 Papelaria', cyber:'💻 Cyber Café', universidade:'🎓 Universidade', explicacao:'📖 Explicação', digitador:'⌨️ Digitador', individual:'👤 Individual' };
            const segEntries = Object.entries(nc.bySegment || {}).sort((a,b) => b[1]-a[1]);
            setEl('newClientsSummary', `
                <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.5rem">
                    <div><strong style="font-size:1.1rem">${nc.total}</strong><div style="font-size:.7rem;color:#64748b">Novos clientes</div></div>
                    <div><strong style="font-size:1.1rem">${nc.organic}</strong><div style="font-size:.7rem;color:#64748b">Orgânicos</div></div>
                    <div><strong style="font-size:1.1rem">${nc.avulso}</strong><div style="font-size:.7rem;color:#64748b">Avulso</div></div>
                </div>
                ${segEntries.length ? segEntries.map(([seg, count]) => `
                    <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:3px 0">
                        <span>${segLabels[seg] || seg}</span><strong>${count}</strong>
                    </div>`).join('') : '<div style="color:#94a3b8;font-size:.75rem">Nenhum vindo de afiliados no período</div>'}
            `);

            const affSeg = d.affiliateClicksBySegment || [];
            if (!affSeg.length) {
                setEl('affiliateSegmentList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">Sem cliques de afiliados no período</div>');
            } else {
                setEl('affiliateSegmentList', affSeg.map(s => `
                    <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:5px 0;border-bottom:1px solid #f1f5f9">
                        <span>${segLabels[s.segment] || s.segment}</span>
                        <span><strong>${s.clicks}</strong> cliques · ${s.conversions} conversões (${s.conversion_rate}%)</span>
                    </div>`).join(''));
            }

            // NOVO (Fase 2 — Marketing Analytics): tabela de origens
            // (Fase 1 ainda não aplicada nalgum ambiente → d.marketingSources
            // vem undefined/[] e mostramos a mensagem de "sem dados", nunca
            // um erro — a Fase 1 é opcional para o resto do admin funcionar).
            const mktSources = d.marketingSources || [];
            if (!mktSources.length) {
                setEl('marketingSourcesList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">Sem visitas com origem registada neste período (a Fase 1 do tracking precisa de estar aplicada e ter tráfego novo)</div>');
            } else {
                const fmtMzn = v => 'MZN ' + Number(v || 0).toLocaleString('pt-MZ', { maximumFractionDigits: 0 });
                setEl('marketingSourcesList', `
                    <div style="display:grid;grid-template-columns:1.3fr .7fr .7fr .7fr 1fr .8fr;gap:4px;font-size:.72rem;font-weight:800;color:#94a3b8;text-transform:uppercase;padding:2px 0 6px;border-bottom:1.5px solid #e2e8f0">
                        <span>Origem</span><span>Visitas</span><span>Registos</span><span>Compras</span><span>Receita</span><span>Conv.</span>
                    </div>
                    ${mktSources.map(s => `
                    <div style="display:grid;grid-template-columns:1.3fr .7fr .7fr .7fr 1fr .8fr;gap:4px;font-size:.8rem;padding:6px 0;border-bottom:1px solid #f1f5f9;align-items:center">
                        <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._sourceLabel(s.source)}</span>
                        <span>${s.visits}</span>
                        <span>${s.signups}</span>
                        <span>${s.buyers}</span>
                        <span style="font-weight:700;color:#047857">${fmtMzn(s.revenue)}</span>
                        <span>${s.conversion_rate}%</span>
                    </div>`).join('')}
                `);
            }

            // ── Feedback por serviço ──────────────────────────────────
            // ── Avaliações: tabela completa com filtro ────────────────
            const fbList    = d.feedbackList    || [];
            const fbSummary = d.feedbackSummary || [];

            // Guardar dados para filtro interactivo
            this._feedbackAll     = fbList;
            this._feedbackSummary = fbSummary;
            this._renderFeedback(fbList, fbSummary, null);

        } catch (err) {
            console.error('[Admin] Analytics:', err);
            setEl('topServicesList', '<div style="color:#ef4444;font-size:.8rem">Erro: ' + err.message + '</div>');
        }
    }

    // ── Avaliações: renderizar tabela com filtro por serviço ────────────────
    _renderFeedback(fbList, fbSummary, activeFilter) {
        const setEl = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };

        const serviceLabels = {
            trabalho:'📚 Trabalho Escolar', cv:'📋 Curriculum Vitae',
            carta:'✉️ Carta', orcamento:'🏗️ Orçamento de Obra',
            impressao:'🖨️ Impressão', foto:'📷 Foto Documentos',
            conversao:'🔄 Conversão', declaracao:'📄 Declaração',
            contrato:'📑 Contrato', procuracao:'⚖️ Procuração',
            requerimento:'📋 Requerimento', recibo:'🧾 Recibo',
            atestado:'📄 Atestado', geral:'⭐ Geral',
        };
        const resolveLabel = raw => {
            if (!raw) return 'Geral';
            const s = String(raw).trim();
            if (s.startsWith('{')) { try { return JSON.parse(s).title || 'Serviço'; } catch(_) {} }
            return serviceLabels[s] || s;
        };
        const starHtml = n => {
            const full  = Math.round(Math.min(5, n || 0));
            return '⭐'.repeat(full) + '<span style="color:#ddd">☆</span>'.repeat(5 - full);
        };
        const fmtDate = dt => {
            if (!dt) return '—';
            const d = new Date(dt);
            return d.toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: '2-digit' })
                 + ' ' + d.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
        };

        // Filtros de serviço
        const filterOptions = fbSummary.map(f =>
            `<button onclick="adminApp._filterFeedback('${f.service}')"
                style="border:none;padding:3px 10px;border-radius:20px;cursor:pointer;font-size:.75rem;margin:2px;
                    background:${activeFilter === f.service ? '#3B82F6' : '#e2e8f0'};
                    color:${activeFilter === f.service ? '#fff' : '#374151'}">
                ${resolveLabel(f.service)} (${f.count})
            </button>`
        ).join('');

        const clearBtn = activeFilter
            ? `<button onclick="adminApp._filterFeedback(null)"
                style="border:none;padding:3px 10px;border-radius:20px;cursor:pointer;font-size:.75rem;margin:2px;background:#fee2e2;color:#dc2626">
                ✕ Limpar filtro
               </button>`
            : '';

        const filtered = activeFilter ? fbList.filter(f => f.service === activeFilter) : fbList;

        if (!filtered.length) {
            setEl('feedbackList',
                `<div style="padding:4px 0 8px">
                    <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px">${filterOptions}${clearBtn}</div>
                    <div style="color:#94a3b8;font-size:.8rem;padding:.5rem">
                        ${fbList.length ? 'Nenhuma avaliação para este serviço.' : 'Ainda sem avaliações.'}
                    </div>
                </div>`
            );
            return;
        }

        const rows = filtered.map(f => `
            <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:6px 8px;font-size:.8rem;white-space:nowrap;color:${f.is_logged ? '#1e293b' : '#94a3b8'}">
                    ${f.is_logged ? '👤' : '👻'} ${f.user_name}
                </td>
                <td style="padding:6px 8px;font-size:.8rem;white-space:nowrap">${resolveLabel(f.service)}</td>
                <td style="padding:6px 4px;white-space:nowrap;font-size:.85rem">${starHtml(f.rating)} <strong>${f.rating}</strong>/5</td>
                <td style="padding:6px 8px;font-size:.78rem;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${f.comment || '<span style="color:#cbd5e1">—</span>'}
                </td>
                <td style="padding:6px 8px;font-size:.75rem;color:#94a3b8;white-space:nowrap">${fmtDate(f.created_at)}</td>
            </tr>`).join('');

        setEl('feedbackList', `
            <div style="padding:4px 0 8px">
                <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px">${filterOptions}${clearBtn}</div>
                <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;min-width:400px">
                        <thead>
                            <tr style="background:#f8fafc;font-size:.75rem;color:#64748b;text-transform:uppercase">
                                <th style="padding:6px 8px;text-align:left;font-weight:600">Utilizador</th>
                                <th style="padding:6px 8px;text-align:left;font-weight:600">Serviço</th>
                                <th style="padding:6px 4px;text-align:left;font-weight:600">Rating</th>
                                <th style="padding:6px 8px;text-align:left;font-weight:600">Comentário</th>
                                <th style="padding:6px 8px;text-align:left;font-weight:600">Data</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div style="font-size:.75rem;color:#94a3b8;margin-top:6px;text-align:right">
                    ${filtered.length} avaliação${filtered.length !== 1 ? 'ões' : ''}
                    ${activeFilter ? ' · filtrado por ' + resolveLabel(activeFilter) : ''}
                </div>
            </div>`
        );
    }

    _filterFeedback(service) {
        const fbList    = this._feedbackAll     || [];
        const fbSummary = this._feedbackSummary || [];
        this._renderFeedback(fbList, fbSummary, service || null);
    }

    // Lista de páginas estáticas da pasta /pages do repo
    async _loadStaticPages() {
        const tbody = document.getElementById('staticPagesTable');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8">A carregar…</td></tr>';
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/static-pages', { headers: { Authorization: 'Bearer ' + token } });
            const data  = await res.json();
            const pages = data.pages || [];

            if (!pages.length) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8">Nenhuma página estática encontrada</td></tr>';
                return;
            }
            tbody.innerHTML = pages.map(p => `
                <tr>
                    <td><code style="font-size:11px">${p.slug}</code></td>
                    <td style="font-size:11px;color:#64748b">${p.filename}</td>
                    <td style="font-size:11px">${new Date(p.modified).toLocaleDateString('pt-MZ')}</td>
                    <td>
                        <a href="${p.url}" target="_blank" class="btn-ghost" style="font-size:12px;text-decoration:none">🔗 Ver</a>
                    </td>
                </tr>
            `).join('');
            const badge = document.getElementById('navBadgeStaticPages');
            if (badge) badge.textContent = pages.length;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:16px;color:#ef4444">❌ ${err.message}</td></tr>`;
        }
    }

    // ════════════════════════════════════════════════════════════════════

    async _loadSettings() {
        await Promise.all([
            this._loadSystemSettings(),
            this.loadAuditLog(),
        ]);
        // Existing pricing form submit (safe re-bind)
        const pf = document.getElementById('pricingForm');
        if (pf && !pf._bound) {
            pf._bound = true;
            pf.addEventListener('submit', async e => {
                e.preventDefault();
                await this._savePricingSettings();
            });
        }
    }

    async _loadSystemSettings() {
        const loader = document.getElementById('systemSettingsLoader');
        const form   = document.getElementById('systemSettingsForm');
        if (!loader || !form) return;

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/settings', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const { map } = await res.json();

            // Populate fields
            const set = (id, key) => {
                const el = document.getElementById(id);
                if (el && map[key] !== undefined) el.value = map[key];
            };
            set('cfg_site_name',               'site_name');
            set('cfg_free_credits_normal',     'free_credits_normal');
            set('cfg_free_credits_expiry_days','free_credits_expiry_days');
            set('cfg_temp_credits',            'temp_credits');
            set('cfg_temp_account_expiry_days','temp_account_expiry_days');
            set('cfg_auto_delete_temp_hours',  'auto_delete_temp_hours');
            set('cfg_whatsapp_support',        'whatsapp_support');

            // Populate pricing fields too
            set('pkgStarterCredits', 'pkg_starter_credits');
            set('pkgStarterPrice',   'pkg_starter_price');
            set('pkgBasicoCredits',  'pkg_basico_credits');
            set('pkgBasicoPrice',    'pkg_basico_price');
            set('pkgProCredits',     'pkg_pro_credits');
            set('pkgProPrice',       'pkg_pro_price');
            set('pkgEmpresaCredits', 'pkg_empresa_credits');
            set('pkgEmpresaPrice',   'pkg_empresa_price');

            loader.style.display = 'none';
            form.style.display   = 'block';
        } catch (err) {
            loader.textContent = '⚠️ Erro ao carregar configurações: ' + err.message;
            console.error('[Admin] _loadSystemSettings:', err);
        }
    }

    async saveSystemSettings() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const updates = {
            site_name:               get('cfg_site_name'),
            free_credits_normal:     get('cfg_free_credits_normal'),
            free_credits_expiry_days:get('cfg_free_credits_expiry_days'),
            temp_credits:            get('cfg_temp_credits'),
            temp_account_expiry_days:get('cfg_temp_account_expiry_days'),
            auto_delete_temp_hours:  get('cfg_auto_delete_temp_hours'),
            whatsapp_support:        get('cfg_whatsapp_support'),
        };
        // Remove empty values
        Object.keys(updates).forEach(k => { if (!updates[k]) delete updates[k]; });

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/settings', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body:    JSON.stringify({ updates }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao guardar');
            this._notify('✅ Configurações guardadas com sucesso!', 'success');
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    async _savePricingSettings() {
        const get = id => document.getElementById(id)?.value?.trim() || '';
        const updates = {
            pkg_starter_credits: get('pkgStarterCredits'),
            pkg_starter_price:   get('pkgStarterPrice'),
            pkg_basico_credits:  get('pkgBasicoCredits'),
            pkg_basico_price:    get('pkgBasicoPrice'),
            pkg_pro_credits:     get('pkgProCredits'),
            pkg_pro_price:       get('pkgProPrice'),
            pkg_empresa_credits: get('pkgEmpresaCredits'),
            pkg_empresa_price:   get('pkgEmpresaPrice'),
        };
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/settings', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body:    JSON.stringify({ updates }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro');
            this._notify('✅ Preços guardados!', 'success');
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // AUDIT LOG
    // ════════════════════════════════════════════════════════════════════

    async loadAuditLog() {
        const container = document.getElementById('auditLogList');
        if (!container) return;
        container.innerHTML = '<div style="color:#94a3b8;font-size:.8rem;">A carregar…</div>';

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/audit-log?limit=30', {
                headers: { Authorization: 'Bearer ' + token }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro');

            const logs = data.logs || [];
            if (!logs.length) {
                container.innerHTML = '<div style="color:#94a3b8;font-size:.8rem;">Nenhuma acção registada ainda.</div>';
                return;
            }

            container.innerHTML = logs.map(l => {
                const date = new Date(l.created_at).toLocaleString('pt-MZ', {
                    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
                });
                const actionIcons = {
                    update_settings: '⚙️', approve_payment: '✅', reject_payment: '❌',
                    delete_user: '🗑️', block_user: '🔒', unblock_user: '🔓',
                    add_credits: '➕', edit_credits: '✏️', update_pricing: '💰',
                };
                const icon = actionIcons[l.action] || '📋';
                return '<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;display:flex;gap:8px;align-items:flex-start;">'
                    + '<span style="font-size:14px;">' + icon + '</span>'
                    + '<div>'
                    + '<div style="font-weight:600;font-size:.78rem;">' + (l.action || '—').replace(/_/g, ' ') + '</div>'
                    + '<div style="color:#94a3b8;font-size:.72rem;">' + date + (l.target_type ? ' · ' + l.target_type : '') + '</div>'
                    + '</div>'
                    + '</div>';
            }).join('');
        } catch (err) {
            container.innerHTML = '<div style="color:#ef4444;font-size:.8rem;">⚠️ ' + err.message + '</div>';
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // AFILIADOS
    // ══════════════════════════════════════════════════════════════════════════
    // ══ AFILIADOS PRO ══════════════════════════════════════════════════════

    async _loadAffiliates() {
        const token   = await this._getAdminToken();
        const loading = document.getElementById('affLoading');
        const table   = document.getElementById('affTable');
        if (loading) loading.style.display = 'block';
        if (table)   table.style.display   = 'none';

        try {
            const res  = await fetch('/api/admin/affiliates', { headers: { Authorization: 'Bearer ' + token } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao carregar afiliados');

            this._affData = data.affiliates || [];
            this._renderAffiliates(this._affData);

            const total    = this._affData.length;
            const pending  = this._affData.filter(a => !a.is_affiliate && !a.aff_is_blocked && a.ref_code).length;
            const approved = this._affData.filter(a => a.is_affiliate).length;
            const clicks   = this._affData.reduce((s, a) => s + (a.aff_clicks || 0), 0);
            const earned   = this._affData.reduce((s, a) => s + (a.aff_total_earned || 0), 0);
            const fraudTotal = this._affData.reduce((s, a) => s + (a.fraud_flags || 0), 0);
            const wdTotal    = this._affData.reduce((s, a) => s + (a.pending_withdrawals || 0), 0);

            const e = id => document.getElementById(id);
            if (e('affStatTotal'))    e('affStatTotal').textContent    = total;
            if (e('affStatPending'))  e('affStatPending').textContent  = pending;
            if (e('affStatApproved')) e('affStatApproved').textContent = approved;
            if (e('affStatClicks'))   e('affStatClicks').textContent   = clicks.toLocaleString('pt-MZ');
            if (e('affStatEarned'))   e('affStatEarned').textContent   = earned.toLocaleString('pt-MZ') + ' MZN';

            const navBadge = e('navBadgeAffiliates');
            if (navBadge) { navBadge.textContent = pending + wdTotal; navBadge.style.display = (pending + wdTotal) > 0 ? 'inline-flex' : 'none'; }

            const wdBadge = e('wdBadge');
            if (wdBadge) { wdBadge.textContent = wdTotal; wdBadge.style.display = wdTotal > 0 ? 'inline' : 'none'; }

            const fraudBadge = e('fraudBadge');
            if (fraudBadge) { fraudBadge.textContent = fraudTotal; fraudBadge.style.display = fraudTotal > 0 ? 'inline' : 'none'; }

        } catch (err) {
            if (loading) { loading.style.display = 'block'; loading.textContent = '❌ ' + err.message; }
        }
    }

    _switchAffTab(btn, tabId) {
        document.querySelectorAll('.aff-admin-tab').forEach(b => {
            b.style.color = '#64748b'; b.style.borderBottomColor = 'transparent';
        });
        document.querySelectorAll('.aff-admin-panel').forEach(p => p.style.display = 'none');
        btn.style.color = '#3b82f6'; btn.style.borderBottomColor = '#3b82f6';
        const panel = document.getElementById(tabId);
        if (panel) panel.style.display = 'block';

        if (tabId === 'aff-withdrawals') this._loadWithdrawals('pending');
        if (tabId === 'aff-fraud')       this._loadFraudFlags();
        if (tabId === 'aff-ranking') {
            const monthEl = document.getElementById('rankingMonth');
            if (monthEl && !monthEl.value) monthEl.value = new Date().toISOString().slice(0, 7);
        }
    }

    _affFilter(filter) {
        if (!this._affData) return;
        let filtered = this._affData;
        if (filter === 'pending')  filtered = this._affData.filter(a => !a.is_affiliate && !a.aff_is_blocked && a.ref_code);
        if (filter === 'approved') filtered = this._affData.filter(a => a.is_affiliate);
        if (filter === 'blocked')  filtered = this._affData.filter(a => a.aff_is_blocked);
        this._renderAffiliates(filtered);
    }

    _renderAffiliates(list) {
        const loading = document.getElementById('affLoading');
        const table   = document.getElementById('affTable');
        const tbody   = document.getElementById('affTableBody');
        if (!tbody) return;

        if (!list.length) {
            if (loading) { loading.style.display = 'block'; loading.textContent = 'Nenhum afiliado encontrado.'; }
            if (table) table.style.display = 'none';
            return;
        }
        if (loading) loading.style.display = 'none';
        if (table) table.style.display = 'table';

        const segIco = { papelaria:'🖨️', cyber:'💻', universidade:'🎓', explicacao:'📚', digitador:'⌨️', individual:'👤' };
        const tierColors = { bronze:'#a15d00', prata:'#475569', ouro:'#92400e', diamante:'#4c1d95' };
        const tierBg     = { bronze:'#fef9c3', prata:'#f1f5f9', ouro:'#fffbeb', diamante:'#f5f3ff' };

        tbody.innerHTML = list.map(a => {
            const stateBadge = a.aff_is_blocked
                ? '<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700">⛔ Suspenso</span>'
                : a.is_affiliate
                    ? '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700">✅ Aprovado</span>'
                    : '<span style="background:#fef9c3;color:#854d0e;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700">⏳ Pendente</span>';
            const tier = a.aff_tier || 'bronze';
            const tierBadge = `<span style="background:${tierBg[tier]};color:${tierColors[tier]};padding:2px 7px;border-radius:20px;font-size:10px;font-weight:800">${{'bronze':'🥉 Bronze','prata':'🥈 Prata','ouro':'🥇 Ouro','diamante':'💎 Diamante'}[tier]}</span>`;
            const fraudWarn = a.fraud_flags > 0 ? ` <span style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700">🚨 ${a.fraud_flags}</span>` : '';
            const seg = a.aff_segment || 'individual';

            return `<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:10px 12px">
                  <div style="font-weight:700;font-size:13px">${a.full_name || '—'}${fraudWarn}</div>
                  <div style="font-size:11px;color:#64748b">${a.email || a.phone || '—'}</div>
                  <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:10px">${a.ref_code || '—'}</code>
                </td>
                <td style="padding:10px 12px;text-align:center">${segIco[seg] || '👤'} <span style="font-size:10.5px;color:#64748b">${seg}</span></td>
                <td style="padding:10px 12px;text-align:center">${tierBadge}</td>
                <td style="padding:10px 12px;text-align:center">${stateBadge}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:800">${(a.aff_conversions || 0).toLocaleString()}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:800;color:${(a.aff_balance || 0) > 0 ? '#16a34a' : '#64748b'}">${(a.aff_balance || 0).toLocaleString('pt-MZ')}</td>
                <td style="padding:10px 12px;text-align:center;white-space:nowrap">
                  <button onclick="adminApp._viewAffiliate('${a.id}')" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;margin-right:3px">👁 Ver</button>
                  ${!a.is_affiliate && !a.aff_is_blocked
                    ? `<button onclick="adminApp._approveAffiliate('${a.id}')" style="background:#16a34a;color:#fff;border:none;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">✅</button>`
                    : a.aff_is_blocked
                      ? `<button onclick="adminApp._unblockAffiliate('${a.id}')" style="background:#16a34a;color:#fff;border:none;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">🔓</button>`
                      : `<button onclick="adminApp._revokeAffiliate('${a.id}')" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">🚫</button>`}
                </td>
            </tr>`;
        }).join('');
    }

    async _approveAffiliate(userId) {
        const confirmed = await this._dialog('Aprovar afiliado?', 'O utilizador receberá acesso ao painel de afiliados.', { confirmLabel: 'Aprovar', confirmColor: '#22c55e', icon: '✅' });
        if (!confirmed) return;
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve', user_id: userId }),
        });
        const d = await res.json();
        if (!res.ok) { this._notify('Erro: ' + d.error, 'error'); return; }
        this._notify('✅ Afiliado aprovado! Notificação enviada.');
        this._loadAffiliates();
    }

    async _revokeAffiliate(userId) {
        const confirmed = await this._dialog('Revogar aprovação?', 'O afiliado perderá o acesso ao painel.', { confirmLabel: 'Revogar', icon: '🚫' });
        if (!confirmed) return;
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'revoke', user_id: userId }),
        });
        const d = await res.json();
        if (!res.ok) { this._notify('Erro: ' + d.error, 'error'); return; }
        this._loadAffiliates();
    }

    async _blockAffiliateModal(userId) {
        document.getElementById('affDetailModal').style.display = 'none';
        const reason = await this._prompt(
            'Suspender conta de afiliado',
            'Ex: Fraude detectada, incumprimento dos termos…',
            { icon: '⛔', subtitle: 'Indique o motivo da suspensão.', confirmLabel: 'Suspender', required: true }
        );
        if (!reason) return;
        await this._blockAffiliate(userId, reason);
    }

    async _blockAffiliate(userId, note) {
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'block', user_id: userId, note }),
        });
        const d = await res.json();
        if (!res.ok) { this._notify('Erro: ' + d.error, 'error'); return; }
        this._notify('⛔ Conta suspensa.');
        document.getElementById('affDetailModal').style.display = 'none';
        this._loadAffiliates();
    }

    async _unblockAffiliate(userId) {
        const confirmed = await this._dialog('Reactivar conta?', 'O afiliado voltará a ter acesso ao painel.', { confirmLabel: 'Reactivar', confirmColor: '#22c55e', icon: '🔓' });
        if (!confirmed) return;
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unblock', user_id: userId }),
        });
        const d = await res.json();
        if (!res.ok) { this._notify('Erro: ' + d.error, 'error'); return; }
        this._loadAffiliates();
    }

    _viewAffiliate(userId) {
        const aff = (this._affData || []).find(a => a.id === userId);
        if (!aff) return;
        const modal   = document.getElementById('affDetailModal');
        const content = document.getElementById('affDetailContent');
        if (!modal || !content) return;

        const refLink = 'https://mzdocs.co.mz/?ref=' + aff.ref_code;
        const segLabel = { individual:'Individual', papelaria:'Papelaria', cyber:'Cyber Café', universidade:'Universidade', explicacao:'Explicação', digitador:'Digitador' };
        const tierLabel = { bronze:'🥉 Bronze', prata:'🥈 Prata', ouro:'🥇 Ouro', diamante:'💎 Diamante' };

        content.innerHTML = `
          <h3 style="font-size:16px;font-weight:800;margin:0 0 4px">${aff.full_name || 'Afiliado'}</h3>
          <p style="font-size:11.5px;color:#64748b;margin-bottom:16px">${aff.email || aff.phone || '—'} · ${segLabel[aff.aff_segment || 'individual']} · ${tierLabel[aff.aff_tier || 'bronze']}</p>

          <div style="display:grid;gap:8px;margin-bottom:16px">
            <div style="background:#f8fafc;border-radius:10px;padding:10px 12px">
              <div style="font-size:10px;color:#64748b;margin-bottom:3px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Código / Link</div>
              <div style="font-size:16px;font-weight:800;color:#1e40af;margin-bottom:4px">${aff.ref_code || '—'}</div>
              <div style="font-size:11px;word-break:break-all;color:#3b82f6">${refLink}</div>
              <button onclick="navigator.clipboard.writeText('${refLink}')" style="margin-top:5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;padding:3px 9px;font-size:10.5px;font-weight:700;cursor:pointer">📋 Copiar Link</button>
            </div>

            ${aff.aff_business_name ? `<div style="background:#f8fafc;border-radius:10px;padding:10px 12px"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Negócio</div><div style="font-size:13px;font-weight:700">${aff.aff_business_name}${aff.aff_city ? ' · ' + aff.aff_city : ''}</div></div>` : ''}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:#f8fafc;border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:#7c3aed">${(aff.aff_clicks || 0).toLocaleString()}</div><div style="font-size:10.5px;color:#64748b">Cliques</div></div>
              <div style="background:#f8fafc;border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:#0891b2">${aff.aff_conversions || 0}</div><div style="font-size:10.5px;color:#64748b">Conversões</div></div>
              <div style="background:#f8fafc;border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:#16a34a">${(aff.aff_total_earned || 0).toLocaleString('pt-MZ')} MZN</div><div style="font-size:10.5px;color:#64748b">Total Ganho</div></div>
              <div style="background:#f8fafc;border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:800;color:#d97706">${(aff.aff_balance || 0).toLocaleString('pt-MZ')} MZN</div><div style="font-size:10.5px;color:#64748b">Saldo</div></div>
            </div>

            ${aff.fraud_flags > 0 ? `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:10px 12px;font-size:12px;color:#991b1b"><strong>🚨 ${aff.fraud_flags} alerta(s) de fraude pendente(s).</strong> Verifique o separador "Fraude".</div>` : ''}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px">
            ${!aff.is_affiliate && !aff.aff_is_blocked
              ? `<button onclick="adminApp._approveAffiliate('${aff.id}');document.getElementById('affDetailModal').style.display='none'" style="background:#16a34a;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;width:100%">✅ Aprovar Afiliado</button>`
              : aff.is_affiliate
                ? `<button onclick="adminApp._revokeAffiliate('${aff.id}');document.getElementById('affDetailModal').style.display='none'" style="background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;width:100%">🔄 Revogar Aprovação</button>` : ''}
            ${!aff.aff_is_blocked
              ? `<button onclick="adminApp._blockAffiliateModal('${aff.id}')" style="background:#fef2f2;color:#991b1b;border:1.5px solid #fca5a5;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;width:100%">⛔ Suspender Conta</button>`
              : `<button onclick="adminApp._unblockAffiliate('${aff.id}');document.getElementById('affDetailModal').style.display='none'" style="background:#16a34a;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;width:100%">🔓 Reactivar Conta</button>`}
            ${aff.aff_phone_mpesa ? `<a href="https://wa.me/${aff.aff_phone_mpesa.replace(/\D/g,'')}" target="_blank" style="background:#25d366;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;width:100%;text-align:center;text-decoration:none;display:block">📲 WhatsApp</a>` : ''}
          </div>`;

        modal.style.display = 'flex';
    }

    // ── LEVANTAMENTOS ADMIN ───────────────────────────────────────────────
    async _loadWithdrawals(status = 'pending') {
        const token   = await this._getAdminToken();
        const loading = document.getElementById('withdrawalsAdminLoading');
        const table   = document.getElementById('withdrawalsAdminTable');
        if (loading) { loading.style.display = 'block'; loading.textContent = 'A carregar…'; }
        if (table)   table.style.display = 'none';

        try {
            const res  = await fetch('/api/admin/affiliates?sub=withdrawals&status=' + status, { headers: { Authorization: 'Bearer ' + token } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const list = data.withdrawals || [];
            if (!list.length) {
                if (loading) { loading.style.display = 'block'; loading.textContent = 'Nenhum levantamento ' + status + '.'; }
                return;
            }
            if (loading) loading.style.display = 'none';
            if (table)   table.style.display = 'table';

            const statusBg  = { pending:'#fef9c3', completed:'#dcfce7', rejected:'#fee2e2', processing:'#f5f3ff' };
            const statusClr = { pending:'#854d0e', completed:'#166534', rejected:'#991b1b', processing:'#5b21b6' };
            const statusLbl = { pending:'⏳ Pendente', completed:'✅ Pago', rejected:'❌ Rejeitado', processing:'🔄 A processar' };

            document.getElementById('withdrawalsAdminBody').innerHTML = list.map(w => `
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:9px 12px">
                  <div style="font-weight:700;font-size:13px">${w.affiliate?.full_name || '—'}</div>
                  <div style="font-size:10.5px;color:#64748b">${w.affiliate?.email || w.affiliate?.phone || '—'}</div>
                  ${w.affiliate?.aff_tier ? `<span style="font-size:9.5px;color:#7c3aed;font-weight:700">${{'bronze':'🥉','prata':'🥈','ouro':'🥇','diamante':'💎'}[w.affiliate.aff_tier]} ${w.affiliate.aff_tier}</span>` : ''}
                </td>
                <td style="padding:9px 12px;text-align:center;font-size:15px;font-weight:800;color:#16a34a">${(w.amount || 0).toLocaleString('pt-MZ')} MZN</td>
                <td style="padding:9px 12px;font-family:monospace;font-size:12px">${w.mpesa_phone}</td>
                <td style="padding:9px 12px;text-align:center;font-size:11px;color:#64748b;white-space:nowrap">${new Date(w.created_at).toLocaleDateString('pt-MZ')}</td>
                <td style="padding:9px 12px;text-align:center"><span style="background:${statusBg[w.status]};color:${statusClr[w.status]};padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700">${statusLbl[w.status] || w.status}</span></td>
                <td style="padding:9px 12px;text-align:center;white-space:nowrap">
                  ${w.status === 'pending' ? `
                    <button onclick="adminApp._processWithdrawal('${w.id}','completed')" style="background:#16a34a;color:#fff;border:none;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;margin-right:3px">✅ Pagar</button>
                    <button onclick="adminApp._processWithdrawal('${w.id}','rejected')" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">❌ Rejeitar</button>
                  ` : `<span style="font-size:11px;color:#94a3b8">${w.processed_at ? new Date(w.processed_at).toLocaleDateString('pt-MZ') : '—'}</span>`}
                </td>
              </tr>`).join('');
        } catch (err) {
            if (loading) { loading.style.display = 'block'; loading.textContent = '❌ ' + err.message; }
        }
    }

    async _processWithdrawal(wdId, status) {
        if (status === 'completed') {
            this._openPayWithdrawalModal(wdId);
            return;
        }
        const note = await this._prompt(
            'Motivo da rejeição',
            'Ex: Dados bancários inválidos, valor excede saldo…',
            { icon: '❌', subtitle: 'Opcional — será notificado ao afiliado.', confirmLabel: 'Rejeitar' }
        );
        if (note === null) return; // cancelado
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'process_withdrawal', withdrawal_id: wdId, status, note }),
        });
        const d = await res.json();
        if (!res.ok) { this._notify('Erro: ' + d.error, 'error'); return; }
        this._notify('❌ Levantamento rejeitado. Saldo devolvido.', 'error');
        this._loadWithdrawals('pending');
    }

    // Pagar um levantamento de afiliado exige sempre o print da
    // transferência M-Pesa — vira o comprovativo do recibo (v43) que o
    // afiliado poderá baixar e que fica registado no Livro de Pagamentos
    // a Afiliados, no separador Finanças.
    _openPayWithdrawalModal(wdId) {
        this.showModal(`
            <p class="modal-title">💸 Confirmar Pagamento M-Pesa</p>
            <p class="modal-sub">Anexe o print da transferência M-Pesa. O sistema gera automaticamente um recibo que o afiliado poderá baixar.</p>
            <div class="modal-field">
                <label>Print / screenshot do M-Pesa</label>
                <input type="file" id="wdReceiptFile" accept="image/png,image/jpeg,image/webp">
                <div id="wdReceiptPreview" style="margin-top:8px;"></div>
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#16a34a;color:#fff" onclick="adminApp._confirmPayWithdrawal('${wdId}')">✅ Confirmar Pagamento</button>
            </div>
        `);
        document.getElementById('wdReceiptFile')?.addEventListener('change', (ev) => {
            const file = ev.target.files?.[0];
            const preview = document.getElementById('wdReceiptPreview');
            if (file && preview) {
                preview.innerHTML = `<img src="${URL.createObjectURL(file)}" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid #e2e8f0;">`;
            }
        });
    }

    // Redimensiona/comprime a imagem no browser antes de enviar, para
    // nunca ultrapassar o limite de corpo do pedido do Vercel (~4.5 MB) —
    // qualquer screenshot de telemóvel, mesmo em alta resolução, sai daqui
    // tipicamente com algumas centenas de KB.
    _compressImageToBase64(file, maxWidth = 1000, quality = 0.82) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro'));
            reader.onload = () => { img.src = reader.result; };
            img.onerror = () => reject(new Error('Imagem inválida'));
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            reader.readAsDataURL(file);
        });
    }

    async _confirmPayWithdrawal(wdId) {
        const file = document.getElementById('wdReceiptFile')?.files?.[0];
        if (!file) { this._notify('❌ Anexe o print da transferência M-Pesa', 'error'); return; }
        this.closeModal();
        this._notify('⏳ A processar pagamento…', 'info');
        try {
            const receiptBase64 = await this._compressImageToBase64(file);
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/affiliates', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'process_withdrawal', withdrawal_id: wdId, status: 'completed', receipt_image_base64: receiptBase64 }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || `Erro ${res.status}`);
            this._notify(`✅ Pago! Recibo ${d.receipt_number || ''} gerado e disponível ao afiliado.`, 'success');
            this._loadWithdrawals('pending');
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── FRAUDE ADMIN ──────────────────────────────────────────────────────
    async _loadFraudFlags() {
        const wrap = document.getElementById('fraudListWrap');
        if (!wrap) return;
        wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8" id="fraudLoading">A carregar alertas…</div>';

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/affiliates?sub=fraud', { headers: { Authorization: 'Bearer ' + token } });
            const data  = await res.json();
            if (!res.ok) throw new Error(data.error);

            const flags = data.flags || [];
            if (!flags.length) { wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px">✅ Sem alertas de fraude pendentes.</div>'; return; }

            const sevBg  = { low:'#f0fdf4', medium:'#fffbeb', high:'#fef2f2', critical:'#7f1d1d' };
            const sevClr = { low:'#166534', medium:'#92400e', high:'#991b1b', critical:'#fff' };
            const sevLbl = { low:'Baixo', medium:'Médio', high:'Alto', critical:'🚨 Crítico' };
            const typeIco = { self_referral:'🔄', ip_burst:'💥', fake_clicks:'🤖', suspicious_conversion:'⚠️' };

            wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;padding:4px">` +
            flags.map(f => `
              <div style="background:${sevBg[f.severity]};border:1.5px solid ${f.severity === 'critical' ? '#991b1b' : '#e2e8f0'};border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <div style="font-size:22px">${typeIco[f.flag_type] || '⚠️'}</div>
                <div style="flex:1;min-width:180px">
                  <div style="font-size:13px;font-weight:800;color:#0f172a">${f.affiliate?.full_name || '—'} <code style="background:rgba(0,0,0,.07);padding:1px 5px;border-radius:4px;font-size:10px">${f.affiliate?.ref_code || ''}</code></div>
                  <div style="font-size:11.5px;color:#475569;margin-top:2px">${f.description || f.flag_type}</div>
                  <div style="font-size:10.5px;color:#94a3b8;margin-top:2px">${new Date(f.created_at).toLocaleDateString('pt-MZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                </div>
                <span style="background:${sevBg[f.severity]};color:${sevClr[f.severity]};border:1px solid currentColor;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700">${sevLbl[f.severity]}</span>
                <div style="display:flex;gap:6px">
                  <button onclick="adminApp._resolveFraud('${f.id}')" style="background:#16a34a;color:#fff;border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">✅ Resolver</button>
                  <button onclick="adminApp._blockAffiliate('${f.affiliate_id}','Suspenso por actividade suspeita detectada automaticamente.')" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">⛔ Bloquear</button>
                </div>
              </div>`).join('') + '</div>';
        } catch (err) {
            wrap.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:13px">❌ ' + err.message + '</div>';
        }
    }

    async _resolveFraud(flagId) {
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resolve_fraud', flag_id: flagId }),
        });
        if (res.ok) this._loadFraudFlags();
        else this._notify('Erro ao resolver.', 'error');
    }

    // ── RANKING ADMIN ─────────────────────────────────────────────────────
    async _loadRankingAdmin() {
        const month = document.getElementById('rankingMonth')?.value || new Date().toISOString().slice(0, 7);
        const wrap  = document.getElementById('rankingAdminWrap');
        if (!wrap) return;
        wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">A carregar ranking…</div>';

        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/affiliates?sub=ranking&month=' + month, { headers: { Authorization: 'Bearer ' + token } });
            const data  = await res.json();
            if (!res.ok) throw new Error(data.error);

            const ranking = data.ranking || [];
            if (!ranking.length) { wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px">Sem dados de ranking para ' + month + '. Gere o ranking primeiro.</div>'; return; }

            const segIco = { papelaria:'🖨️', cyber:'💻', universidade:'🎓', explicacao:'📚', digitador:'⌨️', individual:'👤' };

            wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b">#</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b">PARCEIRO</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b">CONV.</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b">RECEITA</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b">COMISSÃO</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b">NÍVEL</th>
              </tr></thead>
              <tbody>
              ${ranking.map((r, i) => {
                const pos = r.rank_position || (i + 1);
                const posDisplay = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '#' + pos;
                const tierBadges = { bronze:'🥉 Bronze', prata:'🥈 Prata', ouro:'🥇 Ouro', diamante:'💎 Diamante' };
                return `<tr style="border-bottom:1px solid #f1f5f9;${pos <= 3 ? 'background:#fffbeb;' : ''}">
                  <td style="padding:10px 12px;font-size:16px;font-weight:800;text-align:center">${posDisplay}</td>
                  <td style="padding:10px 12px">
                    <div style="font-weight:700">${r.name}</div>
                    <div style="font-size:10.5px;color:#64748b">${segIco[r.segment] || '👤'} ${r.segment} · ${r.ref_code}</div>
                  </td>
                  <td style="padding:10px 12px;text-align:center;font-weight:800">${r.conversions}</td>
                  <td style="padding:10px 12px;text-align:center;font-weight:700">${(r.revenue_mzn || 0).toLocaleString('pt-MZ')} MZN</td>
                  <td style="padding:10px 12px;text-align:center;font-weight:800;color:#16a34a">${(r.commission_mzn || 0).toLocaleString('pt-MZ')} MZN</td>
                  <td style="padding:10px 12px;text-align:center;font-size:11px">${tierBadges[r.tier] || r.tier}</td>
                </tr>`;
              }).join('')}
              </tbody>
            </table>`;
        } catch (err) {
            wrap.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:13px">❌ ' + err.message + '</div>';
        }
    }

    async _generateRanking() {
        const month = await this._prompt(
            'Gerar ranking de afiliados',
            'AAAA-MM (ex: 2026-06)',
            { icon: '🏆', inputType: 'month', defaultValue: new Date().toISOString().slice(0, 7), confirmLabel: 'Gerar' }
        );
        if (!month || !/^\d{4}-\d{2}$/.test(month)) return;
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_ranking', month }),
        });
        const d = await res.json();
        this._notify(res.ok ? '✅ ' + d.message : '❌ ' + d.error, res.ok ? 'success' : 'error');
        if (res.ok) this._loadRankingAdmin();
    }

    // ══ TEMPLATES MARKETPLACE ══════════════════════════════════════════════
    // CORRIGIDO (v38 — bug real e confirmado): esta secção usava
    // this.supabase directamente no browser (cliente authenticated/anon).
    // A única política de escrita em templates_custom é "tpl_update_own"
    // (só o autor pode editar o seu próprio template) — um admin a tentar
    // aprovar/rejeitar/definir preço no template de OUTRO utilizador era
    // sempre bloqueado pela RLS. Pior: o update tentava gravar
    // approved_at/rejected_at, colunas que nunca chegaram a ser criadas em
    // nenhuma migração (só existem agora, a partir da migration_v38) — ou
    // seja, a operação falhava sempre com um erro SQL, mesmo para os
    // próprios templates do admin. A correcção usa a API
    // /api/admin/templates (já existia, corre com a service role e
    // ignora RLS de propósito), exactamente como todas as outras secções
    // do painel (Finanças, Afiliados, Utilizadores, etc.).
    async _loadTemplates(status = 'pending') {
        const container = document.getElementById('templates-list');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">⏳ A carregar…</div>';

        try {
            const token = await this._getAdminToken();
            const res   = await fetch(`/api/admin/templates?status=${encodeURIComponent(status)}&limit=50`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar templates');
            const data = d.templates || [];
            this._mznPerCredit = d.mzn_per_credit || 0; // v39: taxa dinâmica MZN/crédito, para o "≈ X MZN" ao vivo

            // Update badge with pending count
            if (status === 'pending') {
                const badge = document.getElementById('navBadgeTemplates');
                if (badge) badge.textContent = data.length || 0;
            }

            if (!data.length) {
                container.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">Nenhum template ${status === 'pending' ? 'pendente' : status === 'approved' ? 'aprovado' : 'rejeitado'} encontrado.</div>`;
                return;
            }

            const statusColor = { pending: '#f59e0b', approved: '#16a34a', rejected: '#dc2626' };
            const statusLabel = { pending: '⏳ Pendente', approved: '✅ Aprovado', rejected: '❌ Rejeitado' };

            container.innerHTML = data.map(tpl => {
                const previewCSS = tpl.template_css || 'body{font-family:sans-serif;font-size:10pt;padding:10mm;}';
                const previewHTML = (tpl.template_html || '').slice(0, 2000);
                const date = new Date(tpl.created_at).toLocaleDateString('pt');

                return `<div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.07)">
                  <!-- Preview miniatura -->
                  <div style="height:180px;background:#f1f5f9;overflow:hidden;position:relative;cursor:pointer" onclick="adminApp._previewTemplate('${tpl.id}')">
                    <iframe srcdoc="${escapeHtml(`<!DOCTYPE html><html><head><meta charset='UTF-8'><style>*{box-sizing:border-box;margin:0;padding:0;}${previewCSS}</style></head><body>${previewHTML}</body></html>`)}"
                      style="width:794px;height:1123px;border:none;transform:scale(0.22);transform-origin:top left;pointer-events:none"
                      sandbox="allow-same-origin"></iframe>
                    <div style="position:absolute;top:8px;right:8px;background:${statusColor[tpl.status]};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${statusLabel[tpl.status]}</div>
                    <div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:2px 8px;border-radius:6px">${tpl.service_type}</div>
                  </div>
                  <!-- Info -->
                  <div style="padding:14px">
                    <div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:4px">${tpl.template_name}</div>
                    <div style="font-size:12px;color:#64748b;margin-bottom:8px">${tpl.description || '—'}</div>
                    <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">📅 ${date} · 📥 ${tpl.downloads || 0} downloads</div>
                    ${tpl.rejection_note ? `<div style="font-size:11px;color:#dc2626;background:#fef2f2;border-radius:6px;padding:6px 10px;margin-bottom:10px">❌ ${tpl.rejection_note}</div>` : ''}
                    <!-- v39: preço SEMPRE em créditos (nunca um valor MZN fixo) — o
                         equivalente em MZN é só informativo, calculado ao vivo a
                         partir da taxa dinâmica dos pacotes activos, e a
                         repartição com o criador (60-70% para ele, resto para a
                         plataforma). -->
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;flex-wrap:wrap">
                      <label style="font-size:11px;font-weight:700;color:#475569;white-space:nowrap">⭐ Créditos:</label>
                      <input type="number" id="tplCost-${tpl.id}" value="${tpl.credit_cost || 0}" min="0" max="50" step="1"
                        oninput="adminApp._updateTplMznEstimate('${tpl.id}')"
                        style="width:54px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;font-weight:700;text-align:center"/>
                      <span id="tplMznEst-${tpl.id}" style="font-size:10.5px;color:#94a3b8;white-space:nowrap">≈ ${tpl.mzn_equivalent || 0} MZN</span>
                      <label style="font-size:11px;color:#475569;display:flex;align-items:center;gap:4px;white-space:nowrap;margin-left:4px">
                        <input type="checkbox" id="tplFeat-${tpl.id}" ${tpl.is_featured ? 'checked' : ''} style="cursor:pointer"/> Destaque
                      </label>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;flex-wrap:wrap">
                      <label style="font-size:11px;font-weight:700;color:#166534;white-space:nowrap">% para o criador:</label>
                      <input type="number" id="tplShare-${tpl.id}" value="${tpl.author_share_percent || 65}" min="60" max="70" step="1"
                        style="width:54px;padding:4px 6px;border:1px solid #86efac;border-radius:6px;font-size:12px;font-weight:700;text-align:center"/>
                      <span style="font-size:10px;color:#166534">(60-70%; resto fica para a plataforma, sempre pago em créditos)</span>
                      <button onclick="adminApp._saveTemplatePricing('${tpl.id}')"
                        style="margin-left:auto;padding:5px 10px;background:#0f172a;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">Guardar</button>
                    </div>
                    <!-- Acções -->
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      ${status !== 'approved' ? `<button onclick="adminApp._approveTemplate('${tpl.id}')" style="flex:1;padding:8px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">✅ Aprovar</button>` : ''}
                      ${status !== 'rejected' ? `<button onclick="adminApp._rejectTemplate('${tpl.id}')" style="flex:1;padding:8px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">❌ Rejeitar</button>` : ''}
                      <button onclick="adminApp._previewTemplate('${tpl.id}')" style="padding:8px 12px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">👁️</button>
                    </div>
                  </div>
                </div>`;
            }).join('');

            // Helper for HTML escaping in template literals
            function escapeHtml(s) {
                return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            }

        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:14px">❌ Erro: ${err.message}</div>`;
        }
    }

    async _approveTemplate(id) {
        const confirmed = await this._dialog(
            'Aprovar template?',
            'O template ficará disponível para todos os utilizadores.',
            { confirmLabel: 'Aprovar', confirmColor: '#22c55e', icon: '✅' }
        );
        if (!confirmed) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ updates: [{ id, status: 'approved', is_public: true }] }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao aprovar');
            if (d.results?.[0] && !d.results[0].ok) throw new Error(d.results[0].error || 'Erro ao aprovar');
            this._notify('✅ Template aprovado e publicado!');
            this._loadTemplates('pending');
        } catch (err) { this._notify('Erro ao aprovar: ' + err.message, 'error'); }
    }

    async _rejectTemplate(id) {
        const note = await this._prompt(
            'Rejeitar template',
            'Ex: Conteúdo inapropriado, qualidade insuficiente…',
            { icon: '❌', subtitle: 'Opcional — será enviado ao criador.', confirmLabel: 'Rejeitar' }
        );
        if (note === null) return; // cancelou
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ updates: [{ id, status: 'rejected', is_public: false, rejection_note: note || null }] }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao rejeitar');
            if (d.results?.[0] && !d.results[0].ok) throw new Error(d.results[0].error || 'Erro ao rejeitar');
            this._notify('Template rejeitado.');
            this._loadTemplates('pending');
        } catch (err) { this._notify('Erro ao rejeitar: ' + err.message, 'error'); }
    }

    // Permite ao admin definir o preço em créditos (uso normal na
    // plataforma), o destaque, e a percentagem que fica para o criador
    // quando outro utilizador usa o template — sempre entre 60% e 70%,
    // validado aqui e também no servidor/BD. NOTA (v39): o pagamento é
    // sempre em créditos — não existe preço em MZN definido manualmente;
    // o equivalente em MZN mostrado no card é só informativo (ver
    // _updateTplMznEstimate), calculado ao vivo a partir da taxa dinâmica
    // dos pacotes de créditos activos.
    async _saveTemplatePricing(id) {
        const costInput  = document.getElementById(`tplCost-${id}`);
        const featInput  = document.getElementById(`tplFeat-${id}`);
        const shareInput = document.getElementById(`tplShare-${id}`);
        if (!costInput) return;
        const cost = parseInt(costInput.value, 10);
        if (!Number.isFinite(cost) || cost < 0 || cost > 50) {
            this._notify('Créditos deve ser um número entre 0 e 50.', 'error');
            return;
        }
        const share = parseFloat(shareInput?.value ?? 65);
        if (!Number.isFinite(share) || share < 60 || share > 70) {
            this._notify('A percentagem do criador deve estar entre 60% e 70%.', 'error');
            return;
        }
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({
                    updates: [{
                        id, credit_cost: cost, is_featured: !!featInput?.checked,
                        author_share_percent: share,
                    }],
                }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao guardar');
            if (d.results?.[0] && !d.results[0].ok) throw new Error(d.results[0].error || 'Erro ao guardar');
            const estMzn = Math.round(cost * (this._mznPerCredit || 0) * 100) / 100;
            this._notify(cost > 0 ? `✅ Preço: ${cost} crédito(s) (≈ ${estMzn} MZN, ${share}% para o criador).` : '✅ Guardado — template gratuito.');
        } catch (err) {
            this._notify('Erro ao guardar preço: ' + err.message, 'error');
        }
    }

    // v39: actualiza ao vivo o "≈ X MZN" enquanto o admin altera os
    // créditos, usando a taxa dinâmica devolvida por /api/admin/templates
    // (this._mznPerCredit) — puramente informativo, nunca é gravado.
    _updateTplMznEstimate(id) {
        const costInput = document.getElementById(`tplCost-${id}`);
        const estEl      = document.getElementById(`tplMznEst-${id}`);
        if (!costInput || !estEl) return;
        const cost = parseInt(costInput.value, 10) || 0;
        const est  = Math.round(cost * (this._mznPerCredit || 0) * 100) / 100;
        estEl.textContent = `≈ ${est} MZN`;
    }

    _previewTemplate(id) {
        // Fetch and display full preview in a new window
        this.supabase.from('templates_custom')
            .select('template_name, template_html, template_css')
            .eq('id', id)
            .single()
            .then(({ data, error }) => {
                if (error || !data) return;
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${data.template_name}</title>
<style>*{box-sizing:border-box;}${data.template_css || ''}</style></head>
<body>${data.template_html || '<p>Sem conteúdo HTML</p>'}</body></html>`;
                const win = window.open('', '_blank');
                if (win) { win.document.write(html); win.document.close(); }
            });
    }

    // ── IA PROVIDERS ────────────────────────────────────────────────────
    _aiStatusMeta(status) {
        const map = {
            online:        { label: '🟢 Online',           color: '#16a34a' },
            degradado:     { label: '🟡 Degradado',         color: '#f59e0b' },
            offline:       { label: '🔴 Offline',           color: '#dc2626' },
            sem_uso_hoje:  { label: '⚪ Sem uso hoje',       color: '#94a3b8' },
            sem_chave:     { label: '⚫ Sem chave API',      color: '#64748b' },
        };
        return map[status] || { label: status, color: '#64748b' };
    }

    async _loadAiProviders() {
        const container = document.getElementById('aiProvidersTiers');
        const reserveContainer = document.getElementById('aiReserveList');
        const warning = document.getElementById('aiMigrationWarning');
        if (!container) return;

        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/ai-providers', {
                headers: { Authorization: 'Bearer ' + token },
            });
            if (!res.ok) throw new Error('ai-providers ' + res.status);
            const d = await res.json();

            if (warning) warning.style.display = d.migrationApplied ? 'none' : 'block';

            const updatedEl = document.getElementById('aiProvidersUpdatedAt');
            if (updatedEl) updatedEl.textContent = 'Actualizado: ' + new Date(d.generatedAt).toLocaleTimeString('pt-MZ');

            // Badge no menu lateral: nº de providers offline/degradados
            const badge = document.getElementById('navBadgeAiProviders');
            const problems = (d.providers || []).filter(p => p.status === 'offline' || p.status === 'degradado').length;
            if (badge) { badge.style.display = problems > 0 ? 'inline-block' : 'none'; badge.textContent = problems; }

            this._renderAiProviderTiers(container, d);
            this._renderAiChart(d.providers || []);
            this._renderAiReserve(reserveContainer, d.reserve || []);
        } catch (err) {
            console.error('[Admin] AI Providers:', err.message);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;font-size:13px">Erro ao carregar providers: ${err.message}</div>`;
        }
    }

    // ── QR Codes (Fase 3 — Marketing Analytics) ───────────────────────────
    _openQrCreateForm() {
        document.getElementById('qrCreateForm').style.display = 'block';
        document.getElementById('qrCreateResult').innerHTML = '';
    }

    _closeQrCreateForm() {
        document.getElementById('qrCreateForm').style.display = 'none';
        ['qrName', 'qrLocation'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
        document.getElementById('qrTargetPath').value = '/';
    }

    async _createQrCode() {
        const name       = document.getElementById('qrName')?.value.trim();
        const location   = document.getElementById('qrLocation')?.value.trim();
        const targetPath = document.getElementById('qrTargetPath')?.value.trim() || '/';
        const resultEl   = document.getElementById('qrCreateResult');
        if (!name) { resultEl.innerHTML = '<div style="color:#dc2626;font-size:13px">O nome é obrigatório.</div>'; return; }

        resultEl.innerHTML = '<div style="color:#94a3b8;font-size:13px">A criar…</div>';
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/qrcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'create', name, location, targetPath }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao criar QR');

            resultEl.innerHTML = `
                <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:12px">
                    <img src="${d.png}" style="width:120px;height:120px;border-radius:8px;background:#fff;padding:6px;border:1px solid #e2e8f0"/>
                    <div style="flex:1;min-width:200px">
                        <div style="font-weight:800;font-size:13px;color:#0f172a">✅ QR criado: ${d.qrcode.code}</div>
                        <div style="font-size:12px;color:#64748b;word-break:break-all;margin:4px 0">${d.url}</div>
                        <a href="${d.png}" download="qr-${d.qrcode.code}.png" style="font-size:12px;font-weight:700;color:#1d4ed8;text-decoration:underline">⬇️ Descarregar PNG</a>
                    </div>
                </div>`;
            this._loadQrCodes();
        } catch (err) {
            resultEl.innerHTML = `<div style="color:#dc2626;font-size:13px">${err.message}</div>`;
        }
    }

    async _toggleQrCode(id, currentlyActive) {
        try {
            const token = await this._getAdminToken();
            await fetch('/api/admin/qrcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'toggle', id, active: !currentlyActive }),
            });
            this._loadQrCodes();
        } catch (err) {
            console.error('[Admin] toggle QR:', err.message);
        }
    }

    async _loadQrCodes() {
        const container = document.getElementById('qrCodesList');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">A carregar…</div>';
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/qrcodes', { headers: { Authorization: 'Bearer ' + token } });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar QR codes');

            const rows = d.qrcodes || [];
            if (!rows.length) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">Ainda não criou nenhum QR code. Clique em "+ Criar QR Code" para começar.</div>';
                return;
            }

            const fmtMzn  = v => 'MZN ' + Number(v || 0).toLocaleString('pt-MZ', { maximumFractionDigits: 0 });
            const fmtDate = v => v ? new Date(v).toLocaleString('pt-MZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

            container.innerHTML = `
                <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <thead>
                        <tr style="text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1.5px solid #e2e8f0">
                            <th style="padding:8px 6px">Nome</th><th>Local</th><th>Código</th><th>Scans</th><th>Registos</th>
                            <th>Compras</th><th>Receita</th><th>Conv.</th><th>Último acesso</th><th>Estado</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(q => `
                        <tr style="border-bottom:1px solid #f1f5f9">
                            <td style="padding:8px 6px;font-weight:700">${q.name}</td>
                            <td style="color:#64748b">${q.location || '—'}</td>
                            <td><code style="font-size:11px">${q.code}</code></td>
                            <td>${q.scans}</td>
                            <td>${q.signups}</td>
                            <td>${q.purchases}</td>
                            <td style="font-weight:700;color:#047857">${fmtMzn(q.revenue)}</td>
                            <td>${q.conversion_rate}%</td>
                            <td style="color:#64748b;white-space:nowrap">${fmtDate(q.last_scan_at)}</td>
                            <td>${q.active
                                ? '<span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Activo</span>'
                                : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Inactivo</span>'}</td>
                            <td><button onclick="adminApp._toggleQrCode('${q.id}', ${q.active})" style="font-size:11px;font-weight:700;color:#1d4ed8;background:none;border:none;cursor:pointer">${q.active ? 'Desactivar' : 'Activar'}</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                </div>`;
        } catch (err) {
            console.error('[Admin] QR codes:', err.message);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;font-size:13px">Erro ao carregar: ${err.message}</div>`;
        }
    }

    // ── KIT DE MARKETING DOS AFILIADOS (v41) ─────────────────────────────
    // Gestão dos materiais (panfletos/banners/etc.) enviados pelo admin.
    // Cada material do tipo imagem tem uma "zona de QR" (obrigatória) e,
    // opcionalmente, uma "zona de texto" — ambas marcadas aqui visualmente
    // arrastando duas caixas sobre a pré-visualização da imagem, e gravadas
    // em percentagem (0-100) da imagem original, para funcionarem em
    // qualquer resolução quando o afiliado compuser o material com o seu
    // próprio QR (ver afiliado.html → _renderMaterialCanvas).
    async _loadMaterials() {
        const container = document.getElementById('materialsList');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;grid-column:1/-1">A carregar materiais…</div>';
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/marketing-materials', { headers: { Authorization: 'Bearer ' + token } });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar materiais');

            this._materialsCache = d.materials || [];
            if (!this._materialsCache.length) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;grid-column:1/-1">Ainda não enviou nenhum material. Clique em "➕ Novo Material" para começar.</div>';
                return;
            }

            const iconFor = t => ({ video: '🎬', audio: '🎵', pdf: '📄', outro: '📦' }[t] || '🖼️');
            container.innerHTML = this._materialsCache.map(m => `
                <div style="background:#fff;border:1.5px solid #e7e9ee;border-radius:14px;overflow:hidden">
                    <div style="height:140px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden">
                        ${m.media_type === 'image' && m.file_data
                            ? `<img src="${m.file_data}" style="width:100%;height:100%;object-fit:cover"/>`
                            : `<div style="font-size:36px">${iconFor(m.media_type)}</div>`}
                    </div>
                    <div style="padding:12px">
                        <div style="font-weight:800;font-size:13px;color:#0f172a;margin-bottom:2px">${m.title}</div>
                        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${m.category} · ${m.media_type}${m.is_active ? '' : ' · <span style="color:#dc2626;font-weight:700">inactivo</span>'}</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                            <button onclick="adminApp._openMaterialForm('${m.id}')" style="flex:1;padding:7px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:11.5px;cursor:pointer">✏️ Editar</button>
                            <button onclick="adminApp._toggleMaterialActive('${m.id}', ${m.is_active})" style="flex:1;padding:7px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:11.5px;cursor:pointer">${m.is_active ? '🚫 Desactivar' : '✅ Activar'}</button>
                            <button onclick="adminApp._deleteMaterial('${m.id}')" style="padding:7px 10px;border:1.5px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#b91c1c;font-weight:700;font-size:11.5px;cursor:pointer">🗑️</button>
                        </div>
                    </div>
                </div>`).join('');
        } catch (err) {
            console.error('[Admin] materiais:', err.message);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;font-size:13px;grid-column:1/-1">Erro ao carregar: ${err.message}</div>`;
        }
    }

    _openMaterialForm(id) {
        const card = document.getElementById('materialFormCard');
        card.style.display = 'block';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });

        this._matCurrentZones = { qr: { x: 10, y: 75, w: 20, h: 20 }, text: { x: 35, y: 80, w: 55, h: 12 } };
        this._matCurrentImage = null;

        const material = id ? (this._materialsCache || []).find(m => m.id === id) : null;

        document.getElementById('materialFormTitle').textContent = material ? '✏️ Editar Material' : '➕ Novo Material';
        document.getElementById('matId').value = material?.id || '';
        document.getElementById('matTitle').value = material?.title || '';
        document.getElementById('matDescription').value = material?.description || '';
        document.getElementById('matCategory').value = material?.category || 'panfleto';
        document.getElementById('matMediaType').value = material?.media_type || 'image';
        document.getElementById('matExternalUrl').value = material?.external_url || '';
        document.getElementById('matIsActive').checked = material ? !!material.is_active : true;
        document.getElementById('matFileInput').value = '';

        const hasText = !!material?.text_zone;
        document.getElementById('matTextZoneToggle').checked = hasText;
        document.getElementById('matTextZoneOptions').style.display = hasText ? 'flex' : 'none';
        document.getElementById('matTextBox').style.display = hasText ? 'block' : 'none';
        if (material?.text_zone) {
            document.getElementById('matTextField').value = material.text_zone.field || 'ref_code';
            document.getElementById('matTextFontSize').value = material.text_zone.font_size || 28;
            document.getElementById('matTextColor').value = material.text_zone.color || '#0f172a';
            document.getElementById('matTextAlign').value = material.text_zone.align || 'center';
        }

        this._toggleMaterialMediaFields();

        if (material?.media_type === 'image' && material?.file_data) {
            this._matCurrentImage = material.file_data;
            if (material.qr_zone) this._matCurrentZones.qr = material.qr_zone;
            if (material.text_zone) this._matCurrentZones.text = material.text_zone;
            this._showMaterialPreview(material.file_data);
        } else {
            document.getElementById('matZoneEditorWrap').style.display = 'none';
        }
    }

    _closeMaterialForm() {
        document.getElementById('materialFormCard').style.display = 'none';
        document.getElementById('matZoneEditorWrap').style.display = 'none';
        this._matCurrentImage = null;
    }

    _toggleMaterialMediaFields() {
        const type = document.getElementById('matMediaType').value;
        document.getElementById('matImageFields').style.display = type === 'image' ? 'block' : 'none';
        document.getElementById('matExternalFields').style.display = type !== 'image' ? 'block' : 'none';
        if (type !== 'image') document.getElementById('matZoneEditorWrap').style.display = 'none';
    }

    _toggleMaterialTextZone() {
        const on = document.getElementById('matTextZoneToggle').checked;
        document.getElementById('matTextZoneOptions').style.display = on ? 'flex' : 'none';
        document.getElementById('matTextBox').style.display = on ? 'block' : 'none';
    }

    _onMaterialImageSelected(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 3.2 * 1024 * 1024) {
            this._toast('Imagem demasiado grande (máx. ~3MB).', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            this._matCurrentImage = reader.result;
            this._matCurrentZones = { qr: { x: 10, y: 75, w: 20, h: 20 }, text: { x: 35, y: 80, w: 55, h: 12 } };
            this._showMaterialPreview(reader.result);
        };
        reader.readAsDataURL(file);
    }

    _showMaterialPreview(dataUrl) {
        const img = document.getElementById('matPreviewImg');
        img.src = dataUrl;
        document.getElementById('matZoneEditorWrap').style.display = 'block';
        img.onload = () => {
            this._positionMatBox('qr', this._matCurrentZones.qr);
            this._positionMatBox('text', this._matCurrentZones.text);
            this._setupMatZoneDragging();
        };
    }

    _positionMatBox(which, zone) {
        const box = document.getElementById(which === 'qr' ? 'matQrBox' : 'matTextBox');
        if (!box) return;
        box.style.left   = zone.x + '%';
        box.style.top    = zone.y + '%';
        box.style.width  = zone.w + '%';
        box.style.height = zone.h + '%';
    }

    // Arrasto/redimensionamento das caixas de zona (QR + texto), com
    // coordenadas sempre convertidas para percentagem do editor (que tem
    // exactamente o mesmo tamanho visual da imagem) — assim a posição
    // gravada funciona em qualquer resolução, tal como o front-end do
    // afiliado já espera (ver _renderMaterialCanvas em afiliado.html).
    _setupMatZoneDragging() {
        const editor = document.getElementById('matZoneEditor');
        if (!editor || editor.dataset.dragBound) return;
        editor.dataset.dragBound = '1';

        let dragState = null;

        const boxFor = which => document.getElementById(which === 'qr' ? 'matQrBox' : 'matTextBox');

        const startDrag = (which, mode, e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = editor.getBoundingClientRect();
            const point = e.touches ? e.touches[0] : e;
            dragState = {
                which, mode, rect,
                startX: point.clientX, startY: point.clientY,
                zone: { ...this._matCurrentZones[which] },
            };
        };

        const onMove = e => {
            if (!dragState) return;
            const point = e.touches ? e.touches[0] : e;
            const { rect, zone, mode, which } = dragState;
            const dxPct = ((point.clientX - dragState.startX) / rect.width) * 100;
            const dyPct = ((point.clientY - dragState.startY) / rect.height) * 100;
            let next = { ...zone };
            if (mode === 'move') {
                next.x = Math.min(100 - zone.w, Math.max(0, zone.x + dxPct));
                next.y = Math.min(100 - zone.h, Math.max(0, zone.y + dyPct));
            } else {
                next.w = Math.min(100 - zone.x, Math.max(5, zone.w + dxPct));
                next.h = Math.min(100 - zone.y, Math.max(5, zone.h + dyPct));
            }
            this._matCurrentZones[which] = next;
            this._positionMatBox(which, next);
        };

        const onEnd = () => { dragState = null; };

        ['matQrBox', 'matTextBox'].forEach(id => {
            const which = id === 'matQrBox' ? 'qr' : 'text';
            const box = document.getElementById(id);
            box.addEventListener('mousedown', e => { if (!e.target.classList.contains('mat-resize-handle')) startDrag(which, 'move', e); });
            box.addEventListener('touchstart', e => { if (!e.target.classList.contains('mat-resize-handle')) startDrag(which, 'move', e); }, { passive: false });
            const handle = box.querySelector('.mat-resize-handle');
            if (handle) {
                handle.addEventListener('mousedown', e => startDrag(which, 'resize', e));
                handle.addEventListener('touchstart', e => startDrag(which, 'resize', e), { passive: false });
            }
        });

        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }

    async _saveMaterial() {
        const id          = document.getElementById('matId').value || null;
        const title       = document.getElementById('matTitle').value.trim();
        const description = document.getElementById('matDescription').value.trim();
        const category    = document.getElementById('matCategory').value;
        const media_type  = document.getElementById('matMediaType').value;
        const is_active   = document.getElementById('matIsActive').checked;

        if (!title) { this._toast('O título é obrigatório.', 'error'); return; }

        const payload = { title, description, category, media_type, is_active };

        if (media_type === 'image') {
            if (!this._matCurrentImage) { this._toast('Escolha uma imagem para o material.', 'error'); return; }
            payload.file_data = this._matCurrentImage;
            payload.qr_zone   = this._matCurrentZones.qr;
            payload.text_zone = document.getElementById('matTextZoneToggle').checked ? {
                field:     document.getElementById('matTextField').value,
                font_size: parseInt(document.getElementById('matTextFontSize').value || '28'),
                color:     document.getElementById('matTextColor').value,
                align:     document.getElementById('matTextAlign').value,
                ...this._matCurrentZones.text,
            } : null;
        } else {
            const url = document.getElementById('matExternalUrl').value.trim();
            if (!url) { this._toast('Indique o link do ficheiro.', 'error'); return; }
            payload.external_url = url;
        }

        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/marketing-materials', {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(id ? { id, ...payload } : payload),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao gravar material');
            this._toast('✅ Material gravado com sucesso.', 'success');
            this._closeMaterialForm();
            this._loadMaterials();
        } catch (err) {
            this._toast('Erro: ' + err.message, 'error');
        }
    }

    async _toggleMaterialActive(id, currentlyActive) {
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/marketing-materials', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ id, is_active: !currentlyActive }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao actualizar material');
            this._loadMaterials();
        } catch (err) {
            this._toast('Erro: ' + err.message, 'error');
        }
    }

    async _deleteMaterial(id) {
        if (!confirm('Apagar este material? Esta acção não pode ser desfeita.')) return;
        try {
            const token = await this._getAdminToken();
            const res = await fetch(`/api/admin/marketing-materials?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao apagar material');
            this._toast('🗑️ Material apagado.', 'success');
            this._loadMaterials();
        } catch (err) {
            this._toast('Erro: ' + err.message, 'error');
        }
    }

    // ── FUNIL DE CONVERSÃO (Fase 4) ──────────────────────────────────────
    async _loadFunnel() {
        const days = document.getElementById('funnelDays')?.value || 30;
        try {
            const token = await this._getAdminToken();
            const res = await fetch(`/api/admin/funnel?days=${days}`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar funil');

            const el = id => document.getElementById(id);
            el('funnelNotApplied').style.display = d.applied === false ? 'block' : 'none';
            if (d.applied === false) {
                ['funnelVisits','funnelSignups','funnelDocs','funnelBuyers'].forEach(id => { if (el(id)) el(id).textContent = '—'; });
                return;
            }

            const t = d.totals || {};
            const c = d.conversion || {};
            this._funnelDaily = d.daily || []; // NOVO (Fase 5): usado pela exportação
            el('funnelVisits').textContent  = t.unique_visitors ?? 0;
            el('funnelSignups').textContent = t.signups ?? 0;
            el('funnelDocs').textContent    = t.doc_generators ?? 0;
            el('funnelBuyers').textContent  = t.buyers ?? 0;
            el('funnelRateSignup').textContent = `(${c.visit_to_signup ?? 0}%)`;
            el('funnelRateDoc').textContent    = `(${c.signup_to_doc ?? 0}%)`;
            el('funnelRateBuy').textContent    = `(${c.doc_to_buyer ?? 0}%)`;
            el('funnelOverallRate').textContent = `${c.overall_visit_to_buyer ?? 0}%`;

            // Gráfico de cascata (barras horizontais, cada passo do funil)
            const fc = el('funnelChart');
            if (fc && typeof Chart !== 'undefined') {
                if (this.charts?.funnel) { try { this.charts.funnel.destroy(); } catch (_) {} }
                if (!this.charts) this.charts = {};
                this.charts.funnel = new Chart(fc, {
                    type: 'bar',
                    data: {
                        labels: ['Visitantes', 'Registos', 'Geraram documento', 'Compraram'],
                        datasets: [{
                            data: [t.unique_visitors || 0, t.signups || 0, t.doc_generators || 0, t.buyers || 0],
                            backgroundColor: ['#3b82f6', '#16a34a', '#a855f7', '#f59e0b'],
                            borderRadius: 6,
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { x: { beginAtZero: true, ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 12 } } } }
                    }
                });
            }

            // Tendência diária (visitas vs. registos vs. compras)
            const tc = el('funnelTrendChart');
            const daily = d.daily || [];
            if (tc && typeof Chart !== 'undefined') {
                if (this.charts?.funnelTrend) { try { this.charts.funnelTrend.destroy(); } catch (_) {} }
                const labels = daily.map(r => { const [, m, dd] = r.day.split('-'); return `${dd}/${m}`; });
                this.charts.funnelTrend = new Chart(tc, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            { label: 'Visitantes', data: daily.map(r => r.unique_visitors), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)', tension: .3 },
                            { label: 'Registos',   data: daily.map(r => r.signups),         borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.1)', tension: .3 },
                            { label: 'Compras',    data: daily.map(r => r.buyers),          borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.1)', tension: .3 },
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }, x: { ticks: { font: { size: 10 } } } }
                    }
                });
            }
        } catch (err) {
            console.error('[Admin] Funil:', err.message);
            this._notify?.(`❌ Erro ao carregar funil: ${err.message}`);
        }
    }

    // ── TIMELINE / CRM POR UTILIZADOR (Fase 4) ───────────────────────────
    // ── REPUBLICAR TODOS OS ARTIGOS (aplica correcções do template a
    // artigos já publicados antes da correcção — tracking ?src= + IndexNow)
    async _republishAllBlog() {
        if (!confirm('Isto vai reprocessar todos os artigos já publicados através do template mais recente (liga com o novo tracking de origem e notifica o IndexNow). Pode demorar alguns minutos em sites com muitos artigos. Continuar?')) return;

        const statusEl = document.getElementById('republishBlogStatus');
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'A iniciar…'; }

        let offset = 0;
        let total = null;
        let okCount = 0, failCount = 0;

        try {
            const token = await this._getAdminToken();
            while (true) {
                const res = await fetch(`/api/admin/republish-blog?offset=${offset}&limit=15`, {
                    headers: { Authorization: 'Bearer ' + token },
                });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error || 'Erro ao republicar');

                total = d.total;
                okCount   += d.results?.ok?.length || 0;
                failCount += d.results?.failed?.length || 0;

                if (statusEl) statusEl.textContent = `🔁 A republicar… ${d.processed_so_far}/${total} (✅ ${okCount} · ❌ ${failCount})`;

                if (d.remaining <= 0 || d.processed_this_batch === 0) break;
                offset = d.next_offset;
            }
            if (statusEl) statusEl.textContent = `✅ Concluído! ${okCount} artigos republicados${failCount ? `, ${failCount} falharam (ver consola)` : ''}.`;
        } catch (err) {
            console.error('[Admin] Republicar blog:', err.message);
            if (statusEl) statusEl.textContent = `❌ Erro: ${err.message}`;
        }
    }

    async _openUserTimeline(userId, userName) {
        this.showModal(`
            <p class="modal-title">🕒 Timeline — ${userName}</p>
            <div id="userTimelineBody" style="max-height:60vh;overflow-y:auto;margin-top:10px">
                <div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">A carregar…</div>
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Fechar</button>
            </div>
        `);

        try {
            const token = await this._getAdminToken();
            const res = await fetch(`/api/admin/user-timeline?userId=${encodeURIComponent(userId)}`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar timeline');

            const body = document.getElementById('userTimelineBody');
            if (!body) return;

            if (!d.profile.has_visitor_link) {
                body.innerHTML = `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 12px;font-size:12px;color:#92400E;margin-bottom:10px">⚠️ Esta conta foi criada antes da ligação visitante→perfil existir — só mostra actividade pós-registo.</div>`;
            } else {
                body.innerHTML = '';
            }

            if (!d.timeline.length) {
                body.innerHTML += `<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">Sem eventos registados para este utilizador</div>`;
                return;
            }

            const icons = {
                signup: '📝', login: '🔑', document_generated: '📄', pdf_download: '⬇️',
                credit_purchase: '💰', plan_purchase: '💳', became_affiliate: '🤝',
                referred_friend: '👥', commission_earned: '💸', template_created: '🎨',
                template_purchased: '🛒',
            };
            const labels = {
                signup: 'Criou conta', login: 'Login', document_generated: 'Gerou documento',
                pdf_download: 'Descarregou PDF', credit_purchase: 'Comprou créditos',
                plan_purchase: 'Comprou plano', became_affiliate: 'Tornou-se afiliado',
                referred_friend: 'Referiu um amigo', commission_earned: 'Ganhou comissão',
                template_created: 'Criou template', template_purchased: 'Comprou template',
            };

            body.innerHTML += `<div style="display:flex;flex-direction:column;gap:2px">` + d.timeline.map(ev => `
                <div style="display:flex;gap:10px;padding:8px 4px;border-bottom:1px solid #f1f5f9">
                    <div style="font-size:18px;flex-shrink:0">${icons[ev.event] || '•'}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:700;color:#0f172a">
                            ${labels[ev.event] || ev.event}
                            ${ev.pre_signup ? '<span style="font-size:10px;font-weight:700;color:#94a3b8;margin-left:6px">· antes do registo</span>' : ''}
                        </div>
                        <div style="font-size:11px;color:#64748b">
                            ${new Date(ev.created_at).toLocaleString('pt-MZ')}
                            ${ev.document_type ? ' · ' + ev.document_type : ''}
                            ${ev.value != null ? ' · ' + ev.value + ' MZN' : ''}
                        </div>
                    </div>
                </div>
            `).join('') + `</div>`;
        } catch (err) {
            const body = document.getElementById('userTimelineBody');
            if (body) body.innerHTML = `<div style="text-align:center;padding:24px;color:#dc2626;font-size:13px">Erro: ${err.message}</div>`;
        }
    }

    // ── NOTIFICAÇÕES ADMINISTRATIVAS (Fase 5) ────────────────────────────
    async _loadNotifCount() {
        const token = await this._getAdminToken();
        const res = await fetch('/api/admin/notifications', { headers: { Authorization: 'Bearer ' + token } });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        this._notifCache = d.notifications || [];
        const badge = document.getElementById('notifBadge');
        if (badge) {
            if (d.unread > 0) { badge.style.display = 'block'; badge.textContent = d.unread > 99 ? '99+' : d.unread; }
            else badge.style.display = 'none';
        }
        return d;
    }

    _notifIcon(type) {
        const map = {
            pending_receipt: '🧾', withdrawal_request: '💸', affiliate_application: '🤝',
            blog_publish_failed: '⚠️', goal_reached: '🎯', campaign_ended: '📣',
        };
        return map[type] || '🔔';
    }

    async _toggleNotifPanel() {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        const opening = panel.style.display === 'none';
        panel.style.display = opening ? 'block' : 'none';
        if (!opening) return;

        const list = document.getElementById('notifList');
        list.innerHTML = `<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">A carregar…</div>`;
        try {
            const d = await this._loadNotifCount();
            const notifs = d.notifications || [];
            if (!notifs.length) {
                list.innerHTML = `<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">Sem notificações</div>`;
                return;
            }
            list.innerHTML = notifs.map(n => `
                <div style="display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid #f1f5f9;${n.read ? 'opacity:.55' : 'background:#F8FAFC'}">
                    <div style="font-size:18px;flex-shrink:0">${this._notifIcon(n.type)}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12.5px;font-weight:700;color:#0f172a">${n.title}</div>
                        <div style="font-size:11.5px;color:#64748b;margin-top:2px;line-height:1.4">${n.message || ''}</div>
                        <div style="font-size:10.5px;color:#94a3b8;margin-top:4px">${new Date(n.created_at).toLocaleString('pt-MZ')}</div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            list.innerHTML = `<div style="text-align:center;padding:24px;color:#dc2626;font-size:13px">Erro: ${err.message}</div>`;
        }
    }

    async _markAllNotifsRead() {
        try {
            const token = await this._getAdminToken();
            await fetch('/api/admin/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ markAll: true }),
            });
            await this._toggleNotifPanel(); // fecha
            await this._loadNotifCount();
        } catch (err) {
            console.error('[Admin] Marcar notificações:', err.message);
        }
    }

    // ── CAMPANHAS DE MARKETING (Fase 5) ──────────────────────────────────
    async _loadCampaigns() {
        const container = document.getElementById('campaignsList');
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/campaigns', { headers: { Authorization: 'Bearer ' + token } });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar campanhas');

            if (!d.campaigns?.length) {
                container.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">Ainda sem campanhas. Crie a primeira com "＋ Nova Campanha".</div>`;
                return;
            }

            const statusMap = {
                running:  { lbl: '🟢 A decorrer', color: '#16a34a' },
                scheduled:{ lbl: '🕓 Agendada',    color: '#f59e0b' },
                ended:    { lbl: '⚪ Terminada',   color: '#64748b' },
                inactive: { lbl: '⛔ Inactiva',    color: '#dc2626' },
            };

            container.innerHTML = d.campaigns.map(c => {
                const st = statusMap[c.status] || statusMap.inactive;
                const siteUrl = 'https://mzdocs.co.mz';
                return `
                <div class="card" style="margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
                        <div>
                            <div style="font-weight:800;font-size:15px;color:#0f172a">${c.name}</div>
                            <div style="font-size:12px;color:#64748b;margin-top:2px">${c.description || ''}</div>
                            <div style="font-size:11px;color:#94a3b8;margin-top:4px">${new Date(c.start_date).toLocaleDateString('pt-MZ')} ${c.end_date ? '→ ' + new Date(c.end_date).toLocaleDateString('pt-MZ') : '(sem fim definido)'}</div>
                        </div>
                        <span style="font-size:11px;font-weight:800;color:${st.color}">${st.lbl}</span>
                    </div>

                    <div style="display:flex;gap:8px;margin-top:10px;font-size:11px;color:#3b82f6;background:#EFF6FF;border-radius:8px;padding:8px 10px;align-items:center;overflow-x:auto">
                        <code style="white-space:nowrap">${siteUrl}/?src=${c.source_tag}</code>
                        <button class="btn-ghost" style="padding:2px 8px;font-size:11px" onclick="navigator.clipboard.writeText('${siteUrl}/?src=${c.source_tag}');this.textContent='Copiado!'">Copiar</button>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">
                        <div><div style="font-size:11px;color:#94a3b8">Visitas</div><div style="font-weight:800">${c.stats.visits}</div></div>
                        <div><div style="font-size:11px;color:#94a3b8">Registos</div><div style="font-weight:800">${c.stats.signups}${c.goal_signups > 0 ? ` <span style="font-size:10px;color:#94a3b8">/ ${c.goal_signups}</span>` : ''}</div></div>
                        <div><div style="font-size:11px;color:#94a3b8">Compras</div><div style="font-weight:800">${c.stats.buyers}</div></div>
                        <div><div style="font-size:11px;color:#94a3b8">Receita</div><div style="font-weight:800">${c.stats.revenue.toLocaleString('pt-MZ')} MZN${c.goal_revenue > 0 ? ` <span style="font-size:10px;color:#94a3b8">/ ${c.goal_revenue.toLocaleString('pt-MZ')}</span>` : ''}</div></div>
                    </div>

                    ${c.goal_revenue > 0 ? `
                    <div style="margin-top:10px">
                        <div style="height:6px;background:#f1f5f9;border-radius:4px;overflow:hidden">
                            <div style="height:100%;width:${Math.min(c.revenue_progress || 0, 100)}%;background:${(c.revenue_progress || 0) >= 100 ? '#16a34a' : '#3b82f6'}"></div>
                        </div>
                        <div style="font-size:10.5px;color:#94a3b8;margin-top:2px">${c.revenue_progress || 0}% da meta de receita</div>
                    </div>` : ''}

                    <div style="display:flex;gap:8px;margin-top:12px">
                        <button class="btn-ghost" onclick="adminApp._toggleCampaign('${c.id}', ${c.active})">${c.active ? '⏸ Desactivar' : '▶️ Activar'}</button>
                        <button class="btn-ghost" style="color:#dc2626" onclick="adminApp._deleteCampaign('${c.id}','${c.name.replace(/'/g,'')}')">🗑 Eliminar</button>
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('[Admin] Campanhas:', err.message);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;font-size:13px">Erro ao carregar: ${err.message}</div>`;
        }
    }

    _openCampaignForm() {
        this.showModal(`
            <p class="modal-title">📣 Nova Campanha</p>
            <div class="modal-field"><label>Nome</label><input type="text" id="campName" placeholder="Ex: Promoção Fim de Ano 2026"></div>
            <div class="modal-field"><label>Descrição (opcional)</label><input type="text" id="campDesc" placeholder="Notas internas sobre a campanha"></div>
            <div style="display:flex;gap:10px">
                <div class="modal-field" style="flex:1"><label>Início</label><input type="date" id="campStart"></div>
                <div class="modal-field" style="flex:1"><label>Fim (opcional)</label><input type="date" id="campEnd"></div>
            </div>
            <div style="display:flex;gap:10px">
                <div class="modal-field" style="flex:1"><label>Meta de Receita (MZN, opcional)</label><input type="number" id="campGoalRevenue" placeholder="0"></div>
                <div class="modal-field" style="flex:1"><label>Meta de Registos (opcional)</label><input type="number" id="campGoalSignups" placeholder="0"></div>
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#3b82f6;color:#fff" onclick="adminApp._createCampaign()">Criar Campanha</button>
            </div>
        `);
        const today = new Date().toISOString().split('T')[0];
        const s = document.getElementById('campStart'); if (s) s.value = today;
    }

    async _createCampaign() {
        const name = document.getElementById('campName')?.value?.trim();
        const description = document.getElementById('campDesc')?.value?.trim();
        const start_date = document.getElementById('campStart')?.value;
        const end_date = document.getElementById('campEnd')?.value || null;
        const goal_revenue = document.getElementById('campGoalRevenue')?.value || 0;
        const goal_signups = document.getElementById('campGoalSignups')?.value || 0;
        if (!name || !start_date) { this._notify?.('❌ Nome e data de início são obrigatórios'); return; }

        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ name, description, start_date, end_date, goal_revenue, goal_signups }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao criar campanha');
            this.closeModal();
            this._loadCampaigns();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    async _toggleCampaign(id, currentlyActive) {
        try {
            const token = await this._getAdminToken();
            await fetch('/api/admin/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'toggle', id, active: !currentlyActive }),
            });
            this._loadCampaigns();
        } catch (err) {
            console.error('[Admin] Toggle campanha:', err.message);
        }
    }

    async _deleteCampaign(id, name) {
        if (!confirm(`Eliminar a campanha "${name}"? Isto não apaga as visitas/vendas já registadas, só a campanha em si.`)) return;
        try {
            const token = await this._getAdminToken();
            await fetch('/api/admin/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'delete', id }),
            });
            this._loadCampaigns();
        } catch (err) {
            console.error('[Admin] Eliminar campanha:', err.message);
        }
    }

    // ── METAS MENSAIS (Fase 5) ────────────────────────────────────────────
    async _loadGoals() {
        const list = document.getElementById('goalsList');
        const label = document.getElementById('goalsMonthLabel');
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/goals', { headers: { Authorization: 'Bearer ' + token } });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar metas');

            if (label) {
                const [y, m] = d.month.split('-');
                const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                label.textContent = `${monthNames[parseInt(m) - 1]} de ${y}`;
            }

            const metricLabel = { revenue: '💰 Receita (MZN)', signups: '📝 Novos Registos' };

            list.innerHTML = d.goals.map(g => `
                <div class="stat-card" style="flex-direction:column;align-items:stretch;padding:16px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <span style="font-weight:800;font-size:14px">${metricLabel[g.metric]}</span>
                        <button class="btn-ghost" style="font-size:11px;padding:3px 8px" onclick="adminApp._openGoalForm('${g.metric}', ${g.target || 0})">${g.target ? '✏️ Editar' : '＋ Definir meta'}</button>
                    </div>
                    ${g.target ? `
                        <div style="font-size:22px;font-weight:800;color:${g.achieved ? '#16a34a' : '#0f172a'}">${g.current.toLocaleString('pt-MZ')} <span style="font-size:13px;color:#94a3b8;font-weight:600">/ ${g.target.toLocaleString('pt-MZ')}</span></div>
                        <div style="height:8px;background:#f1f5f9;border-radius:5px;overflow:hidden;margin-top:8px">
                            <div style="height:100%;width:${Math.min(g.percent || 0, 100)}%;background:${g.achieved ? '#16a34a' : '#3b82f6'}"></div>
                        </div>
                        <div style="font-size:12px;color:#94a3b8;margin-top:4px">${g.percent}% ${g.achieved ? '🎉 Meta atingida!' : 'da meta'}</div>
                    ` : `<div style="font-size:13px;color:#94a3b8;padding:10px 0">Sem meta definida para este mês. Actual: ${g.current.toLocaleString('pt-MZ')}</div>`}
                </div>
            `).join('');
        } catch (err) {
            console.error('[Admin] Metas:', err.message);
            list.innerHTML = `<div style="text-align:center;padding:30px;color:#dc2626;font-size:13px;grid-column:1/-1">Erro ao carregar: ${err.message}</div>`;
        }
    }

    _openGoalForm(metric, currentTarget) {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const metricLabel = { revenue: 'Receita (MZN)', signups: 'Novos Registos' };
        this.showModal(`
            <p class="modal-title">🎯 Meta de ${metricLabel[metric]} — ${monthStr}</p>
            <div class="modal-field"><label>Valor alvo</label><input type="number" id="goalTarget" value="${currentTarget || ''}" placeholder="Ex: 50000"></div>
            <input type="hidden" id="goalMetric" value="${metric}">
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#3b82f6;color:#fff" onclick="adminApp._saveGoal('${monthStr}')">Guardar</button>
            </div>
        `);
    }

    async _saveGoal(monthStr) {
        const metric = document.getElementById('goalMetric')?.value;
        const target_value = document.getElementById('goalTarget')?.value;
        if (!target_value || Number(target_value) <= 0) { this._notify?.('❌ Indique um valor válido'); return; }
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ metric, target_value, period_month: monthStr }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao guardar meta');
            this.closeModal();
            this._loadGoals();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    // ── Levantamentos de royalties de templates (v38) ────────────────────
    async _loadTemplateWithdrawals() {
        const list = document.getElementById('templateWithdrawalsList');
        if (!list) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/template-withdrawals?status=pending', { headers: { Authorization: 'Bearer ' + token } });
            const d     = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            list.innerHTML = (d.withdrawals || []).length
                ? d.withdrawals.map(w => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
                        <div>
                            <div style="font-weight:700;font-size:13px">${w.profiles?.full_name || w.profiles?.email || 'Criador'} — ${(w.amount ?? 0).toLocaleString('pt-MZ')} MZN</div>
                            <div style="color:#92400e;font-size:11px">📱 ${w.mpesa_phone} · ${new Date(w.created_at).toLocaleDateString('pt')}</div>
                        </div>
                        <div style="display:flex;gap:6px">
                            <button onclick="adminApp._processTemplateWithdrawal('${w.id}', 'completed')" style="padding:6px 10px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">✅ Pago</button>
                            <button onclick="adminApp._processTemplateWithdrawal('${w.id}', 'rejected')" style="padding:6px 10px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">❌ Rejeitar</button>
                        </div>
                    </div>
                `).join('')
                : '<div style="color:#94a3b8;font-size:13px;padding:12px 0">Nenhum levantamento pendente.</div>';
        } catch (err) {
            list.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:12px 0">Erro: ${err.message}</div>`;
        }
    }

    async _processTemplateWithdrawal(id, status) {
        const note = status === 'rejected' ? await this._prompt('Motivo da rejeição', 'Opcional', { icon: '❌' }) : null;
        if (status === 'rejected' && note === null) return; // cancelou
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/template-withdrawals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ withdrawal_id: id, status, note }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            this._notify(status === 'completed' ? '✅ Levantamento marcado como pago!' : 'Levantamento rejeitado.');
            this._loadTemplateWithdrawals();
        } catch (err) {
            this._notify('❌ ' + err.message, 'error');
        }
    }

    // ── FINANÇAS (v37) — Valor Levantável e despesas operacionais ────────
    // (v42: + Contabilidade — dados fiscais, livro de transacções e
    // relatório de período, para o contabilista/Fisco)
    async _loadFinance() {
        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);
        const ls = document.getElementById('ledgerStartDate'); if (ls && !ls.value) ls.value = monthStart;
        const le = document.getElementById('ledgerEndDate');   if (le && !le.value) le.value = todayStr;
        const rs = document.getElementById('reportStartDate'); if (rs && !rs.value) rs.value = monthStart;
        const re = document.getElementById('reportEndDate');   if (re && !re.value) re.value = todayStr;
        const ps = document.getElementById('payoutsStartDate'); if (ps && !ps.value) ps.value = monthStart;
        const pe = document.getElementById('payoutsEndDate');   if (pe && !pe.value) pe.value = todayStr;

        await Promise.all([
            this._loadFinanceSummary(),
            this._loadFinanceExpenses(),
            this._loadFinanceWithdrawals(),
            this._loadTransactionLedger(),
            this._loadAffiliatePayouts(),
        ]);
    }

    async _loadFinanceSummary() {
        const e   = id => document.getElementById(id);
        const fmt = n  => (n ?? 0).toLocaleString('pt-MZ', { maximumFractionDigits: 2 });
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', { headers: { Authorization: 'Bearer ' + token } });
            const d     = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao carregar finanças');

            if (e('finRevenueTotal'))      e('finRevenueTotal').textContent      = fmt(d.revenue_total_confirmed) + ' MZN';
            if (e('finAffiliateReserved')) e('finAffiliateReserved').textContent = fmt((d.affiliate_reserved || 0) + (d.template_authors_reserved || 0)) + ' MZN';
            if (e('finExpensesTotal'))     e('finExpensesTotal').textContent     = fmt(d.expenses_total_logged) + ' MZN';
            if (e('finWithdrawable'))      e('finWithdrawable').textContent      = fmt(d.withdrawable_mzn) + ' MZN';

            if (e('financeFxLabel')) {
                const fx = d.exchange_rate || {};
                e('financeFxLabel').textContent = fx.rate
                    ? `Câmbio: 1 USD ≈ ${fx.rate.toFixed(2)} MZN (${fx.live ? 'ao vivo' : 'reserva'})`
                    : '';
            }

            // Preencher formulário de custos recorrentes com os valores actuais
            const rc = d.recurring_costs || {};
            if (e('fin_domain_provider'))     e('fin_domain_provider').value     = rc.domain?.provider || '';
            if (e('fin_domain_annual_mzn'))   e('fin_domain_annual_mzn').value   = rc.domain?.annual_mzn ?? '';
            if (e('fin_domain_renewal_date')) e('fin_domain_renewal_date').value = rc.domain?.renewal_date || '';
            if (e('fin_vercel_plan'))         e('fin_vercel_plan').value         = rc.vercel?.plan || 'Hobby (Grátis)';
            if (e('fin_vercel_monthly_usd'))  e('fin_vercel_monthly_usd').value  = rc.vercel?.monthly_usd ?? '';
            if (e('fin_ai_monthly_usd'))      e('fin_ai_monthly_usd').value      = rc.ai_providers?.monthly_usd ?? '';
            if (e('fin_other_monthly_mzn'))   e('fin_other_monthly_mzn').value   = rc.other?.monthly_mzn ?? '';

            if (e('financeCostsBreakdown')) {
                e('financeCostsBreakdown').innerHTML = `
                    <div style="display:flex;justify-content:space-between;padding:3px 0"><span>🌐 Domínio (${rc.domain?.provider || '—'})</span><strong>${fmt(rc.domain?.monthly_mzn)} MZN/mês</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:3px 0"><span>▲ Vercel (${rc.vercel?.plan || '—'})</span><strong>${fmt(rc.vercel?.monthly_mzn)} MZN/mês</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:3px 0"><span>🤖 Providers de IA</span><strong>${fmt(rc.ai_providers?.monthly_mzn)} MZN/mês</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:3px 0"><span>➕ Outras</span><strong>${fmt(rc.other?.monthly_mzn)} MZN/mês</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0 0;border-top:1px dashed #e2e8f0;margin-top:4px"><span style="font-weight:700">Total estimado</span><strong>${fmt(rc.total_monthly_mzn)} MZN/mês</strong></div>
                `;
            }

            // Preencher formulário de dados fiscais (Contabilidade)
            const fc = d.fiscal_config || {};
            if (e('fis_company_name')) e('fis_company_name').value = fc.company_name || '';
            if (e('fis_nuit'))         e('fis_nuit').value         = fc.nuit || '';
            if (e('fis_address'))      e('fis_address').value      = fc.address || '';
            if (e('fis_regime'))       e('fis_regime').value       = fc.regime || '';
            if (e('fis_year_start'))   e('fis_year_start').value   = fc.year_start || '';
        } catch (err) {
            console.error('[Admin] Finanças (resumo):', err.message);
            this._notify?.(`❌ ${err.message}`);
        }
    }

    async _saveFinanceConfig() {
        const get = id => document.getElementById(id)?.value?.trim() ?? '';
        const body = {
            op: 'save-config',
            finance_domain_provider:     get('fin_domain_provider'),
            finance_domain_annual_mzn:   get('fin_domain_annual_mzn'),
            finance_domain_renewal_date: get('fin_domain_renewal_date'),
            finance_vercel_plan:         get('fin_vercel_plan'),
            finance_vercel_monthly_usd:  get('fin_vercel_monthly_usd'),
            finance_ai_monthly_usd:      get('fin_ai_monthly_usd'),
            finance_other_monthly_mzn:   get('fin_other_monthly_mzn'),
        };
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao guardar');
            this._notify?.('✅ Custos recorrentes guardados!', 'success');
            await this._loadFinanceSummary();
            await this._loadWithdrawableCard();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    async _loadFinanceExpenses() {
        const list = document.getElementById('financeExpensesList');
        if (!list) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance?sub=expenses', { headers: { Authorization: 'Bearer ' + token } });
            const d     = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            this._financeExpenses = d.expenses || [];
            const catLabel = { domain: '🌐 Domínio', hosting: '▲ Hosting', ai_providers: '🤖 IA', other: '➕ Outra' };
            list.innerHTML = (d.expenses || []).length
                ? d.expenses.map(x => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
                        <div>
                            <div style="font-weight:700">${catLabel[x.category] || x.category} — ${(x.amount_mzn ?? 0).toLocaleString('pt-MZ')} MZN</div>
                            <div style="color:#94a3b8;font-size:11px">${x.description || ''} · ${x.occurred_at}</div>
                        </div>
                        <button class="btn-ghost" style="padding:3px 8px;font-size:11px" onclick="adminApp._deleteFinanceExpense('${x.id}')">🗑️</button>
                    </div>
                `).join('')
                : '<div style="color:#94a3b8;text-align:center;padding:12px 0">Nenhuma despesa registada.</div>';
        } catch (err) {
            list.innerHTML = `<div style="color:#dc2626;text-align:center;padding:12px 0">Erro: ${err.message}</div>`;
        }
    }

    async _addFinanceExpense() {
        const category    = document.getElementById('expCategory')?.value;
        const description  = document.getElementById('expDescription')?.value?.trim();
        const amount_mzn    = document.getElementById('expAmount')?.value;
        const occurred_at  = document.getElementById('expDate')?.value;
        if (!amount_mzn || Number(amount_mzn) <= 0) { this._notify?.('❌ Indique um valor válido'); return; }
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'add-expense', category, description, amount_mzn, occurred_at }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao registar despesa');
            this._notify?.('✅ Despesa registada!', 'success');
            ['expDescription','expAmount','expDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            await this._loadFinanceExpenses();
            await this._loadFinanceSummary();
            await this._loadWithdrawableCard();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    async _deleteFinanceExpense(id) {
        if (!confirm('Eliminar esta despesa?')) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'delete-expense', id }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            await this._loadFinanceExpenses();
            await this._loadFinanceSummary();
            await this._loadWithdrawableCard();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    async _loadFinanceWithdrawals() {
        const list = document.getElementById('financeWithdrawalsList');
        if (!list) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance?sub=withdrawals', { headers: { Authorization: 'Bearer ' + token } });
            const d     = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            this._financeWithdrawals = d.withdrawals || [];
            list.innerHTML = (d.withdrawals || []).length
                ? d.withdrawals.map(x => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
                        <div>
                            <div style="font-weight:700">💸 ${(x.amount_mzn ?? 0).toLocaleString('pt-MZ')} MZN</div>
                            <div style="color:#94a3b8;font-size:11px">${x.note || ''} · ${x.withdrawn_at}</div>
                        </div>
                        <button class="btn-ghost" style="padding:3px 8px;font-size:11px" onclick="adminApp._deleteFinanceWithdrawal('${x.id}')">🗑️</button>
                    </div>
                `).join('')
                : '<div style="color:#94a3b8;text-align:center;padding:12px 0">Nenhum levantamento registado.</div>';
        } catch (err) {
            list.innerHTML = `<div style="color:#dc2626;text-align:center;padding:12px 0">Erro: ${err.message}</div>`;
        }
    }

    async _addFinanceWithdrawal() {
        const amount_mzn   = document.getElementById('wdAmount')?.value;
        const note          = document.getElementById('wdNote')?.value?.trim();
        const withdrawn_at = document.getElementById('wdDate')?.value;
        if (!amount_mzn || Number(amount_mzn) <= 0) { this._notify?.('❌ Indique um valor válido'); return; }
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'add-withdrawal', amount_mzn, note, withdrawn_at }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao registar levantamento');
            this._notify?.('✅ Levantamento registado!', 'success');
            ['wdAmount','wdNote','wdDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            await this._loadFinanceWithdrawals();
            await this._loadFinanceSummary();
            await this._loadWithdrawableCard();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    async _deleteFinanceWithdrawal(id) {
        if (!confirm('Eliminar este levantamento?')) return;
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ op: 'delete-withdrawal', id }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            await this._loadFinanceWithdrawals();
            await this._loadFinanceSummary();
            await this._loadWithdrawableCard();
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    // ── CONTABILIDADE (v42) — dados fiscais, livro de transacções e ──────
    // relatório de período, pensados para o contabilista da empresa e
    // para uma eventual inspecção do Fisco moçambicano.
    async _saveFiscalConfig() {
        const get = id => document.getElementById(id)?.value?.trim() ?? '';
        const body = {
            op: 'save-fiscal-config',
            fiscal_company_name: get('fis_company_name'),
            fiscal_nuit:         get('fis_nuit'),
            fiscal_address:      get('fis_address'),
            fiscal_regime:       get('fis_regime'),
            fiscal_year_start:   get('fis_year_start'),
        };
        try {
            const token = await this._getAdminToken();
            const res   = await fetch('/api/admin/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao guardar');
            this._notify?.('✅ Dados fiscais guardados!', 'success');
        } catch (err) {
            this._notify?.(`❌ ${err.message}`);
        }
    }

    _setReportPreset(kind) {
        const today = new Date();
        let start, end;
        if (kind === 'month') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end   = today;
        } else if (kind === 'quarter') {
            const q = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), q * 3, 1);
            end   = today;
        } else { // year
            start = new Date(today.getFullYear(), 0, 1);
            end   = today;
        }
        const fmt = d => d.toISOString().slice(0, 10);
        document.getElementById('reportStartDate').value = fmt(start);
        document.getElementById('reportEndDate').value   = fmt(end);
    }

    async _generatePeriodReport() {
        const start = document.getElementById('reportStartDate')?.value;
        const end   = document.getElementById('reportEndDate')?.value;
        const out   = document.getElementById('periodReportOutput');
        if (!start || !end) { this._notify?.('❌ Escolha as duas datas'); return; }
        if (out) out.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:16px 0">A gerar…</div>';
        try {
            const token = await this._getAdminToken();
            const res = await fetch(`/api/admin/finance?sub=period-report&start=${start}&end=${end}`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao gerar relatório');
            this._lastPeriodReport = d;

            const fmt = n => (n ?? 0).toLocaleString('pt-MZ', { maximumFractionDigits: 2 });
            const catLabel = { domain: '🌐 Domínio', hosting: '▲ Hosting', ai_providers: '🤖 IA', other: '➕ Outra' };
            const catRows = Object.entries(d.expenses.by_category || {})
                .map(([cat, v]) => `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>${catLabel[cat] || cat}</span><strong>${fmt(v)} MZN</strong></div>`)
                .join('') || '<div style="color:#94a3b8">Sem despesas neste período.</div>';

            if (out) out.innerHTML = `
                <div id="periodReportPrintable" style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
                    <div style="font-weight:800;font-size:14px;color:#0f172a;">${d.company.name}</div>
                    <div style="font-size:12px;color:#64748b;">NUIT: ${d.company.nuit}${d.company.regime ? ' · ' + d.company.regime : ''}</div>
                    <div style="font-size:12px;color:#64748b;margin-bottom:10px;">${d.company.address || ''}</div>
                    <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px;">Período: ${d.period.start} a ${d.period.end}</div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0"><span>💰 Receita confirmada (${d.revenue.transaction_count} transacções)</span><strong>${fmt(d.revenue.total_mzn)} MZN</strong></div>
                    <div style="margin:8px 0;padding:8px 0;border-top:1px dashed #e2e8f0;border-bottom:1px dashed #e2e8f0;">
                        <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:4px;">🧾 Despesas por categoria (${d.expenses.entry_count} lançamentos)</div>
                        ${catRows}
                        <div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:4px;"><span style="font-weight:700">Total despesas</span><strong>${fmt(d.expenses.total_mzn)} MZN</strong></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:13px;"><span>🤝 Comissões pagas a afiliados (${d.affiliate_payouts.count})</span><strong>${fmt(d.affiliate_payouts.total_mzn)} MZN</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:2px 0 8px;font-size:13px;"><span>🎨 Royalties pagos a criadores de templates (${d.template_royalties.count})</span><strong>${fmt(d.template_royalties.total_mzn)} MZN</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Resultado líquido do período</span><strong style="color:${d.net_result_mzn >= 0 ? '#16a34a' : '#dc2626'}">${fmt(d.net_result_mzn)} MZN</strong></div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#94a3b8;"><span>Levantamentos do dono no período</span><span>${fmt(d.withdrawals.total_mzn)} MZN</span></div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Gerado em ${new Date(d.generated_at).toLocaleString('pt-MZ')}</div>
                </div>
                <button type="button" onclick="adminApp._printPeriodReport()" style="margin-top:10px;padding:8px 16px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:13px;cursor:pointer">🖨️ Imprimir / Guardar PDF</button>
            `;
        } catch (err) {
            if (out) out.innerHTML = `<div style="color:#dc2626;text-align:center;padding:16px 0">Erro: ${err.message}</div>`;
        }
    }

    _printPeriodReport() {
        const html = document.getElementById('periodReportPrintable')?.outerHTML;
        if (!html) return;
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Relatório de Período — MzDocs Pro</title>
            <meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:24px;}</style>
            </head><body>${html}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    }

    async _loadTransactionLedger() {
        const tbody = document.getElementById('ledgerTransactionsTable');
        if (!tbody) return;
        const start  = document.getElementById('ledgerStartDate')?.value;
        const end    = document.getElementById('ledgerEndDate')?.value;
        const status = document.getElementById('ledgerStatus')?.value || 'completed';
        const params = new URLSearchParams({ sub: 'transactions', status });
        if (start) params.set('start', start);
        if (end)   params.set('end', end);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#94a3b8;">A carregar…</td></tr>';
        try {
            const token = await this._getAdminToken();
            const res = await fetch(`/api/admin/finance?${params.toString()}`, { headers: { Authorization: 'Bearer ' + token } });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            this._ledgerTransactions = d.transactions || [];
            const statusBadge = {
                completed: '<span style="background:#ECFDF5;color:#065F46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">✅ Confirmada</span>',
                pending:   '<span style="background:#FEF9C3;color:#713F12;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">⏳ Pendente</span>',
                failed:    '<span style="background:#FEE2E2;color:#991B1B;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">❌ Falhou</span>',
            };
            if (!this._ledgerTransactions.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#94a3b8;">Sem transacções neste intervalo.</td></tr>';
                return;
            }
            tbody.innerHTML = this._ledgerTransactions.map(t => {
                const user = t.profiles || {};
                const when = t.created_at ? new Date(t.created_at).toLocaleString('pt-MZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
                return `<tr>
                    <td style="font-size:12px;color:#64748b;">${when}</td>
                    <td style="font-size:12px;">${user.full_name || '—'}</td>
                    <td style="font-size:12px;">${t.phone_number || '—'}</td>
                    <td style="font-size:12px;">${(t.package_id || '—').toUpperCase()}</td>
                    <td style="font-size:12px;"><strong>${(t.amount ?? 0).toLocaleString('pt-MZ')}</strong></td>
                    <td>${statusBadge[t.status] || t.status}</td>
                    <td style="font-size:11px;color:#64748b;">${t.mpesa_receipt || '—'}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#ef4444;">Erro: ${err.message}</td></tr>`;
        }
    }

    async _loadAffiliatePayouts() {
        const tbody = document.getElementById('affPayoutsTable');
        if (!tbody) return;
        const start = document.getElementById('payoutsStartDate')?.value;
        const end   = document.getElementById('payoutsEndDate')?.value;
        const params = new URLSearchParams({ sub: 'affiliate-payouts' });
        if (start) params.set('start', start);
        if (end)   params.set('end', end);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#94a3b8;">A carregar…</td></tr>';
        try {
            const token = await this._getAdminToken();
            const res = await fetch(`/api/admin/finance?${params.toString()}`, { headers: { Authorization: 'Bearer ' + token } });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro');
            this._affiliatePayouts = d.payouts || [];
            if (!this._affiliatePayouts.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#94a3b8;">Sem pagamentos a afiliados neste intervalo.</td></tr>';
                return;
            }
            tbody.innerHTML = this._affiliatePayouts.map(p => {
                const user = p.profiles || {};
                const when = p.processed_at ? new Date(p.processed_at).toLocaleString('pt-MZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
                return `<tr>
                    <td style="font-size:12px;color:#64748b;">${when}</td>
                    <td style="font-size:12px;">${user.full_name || '—'}</td>
                    <td style="font-size:12px;"><strong>${(p.amount ?? 0).toLocaleString('pt-MZ')}</strong></td>
                    <td style="font-size:12px;">${p.mpesa_phone || '—'}</td>
                    <td style="font-size:11px;font-family:monospace;">${p.receipt_number || '—'}</td>
                    <td>${p.receipt_screenshot_url ? `<a href="${p.receipt_screenshot_url}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb;font-weight:700;">👁️ Ver</a>` : '—'}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:#ef4444;">Erro: ${err.message}</td></tr>`;
        }
    }

    // Exportação (CSV/Excel/PDF, reaproveitando o menu genérico) dos três
    // livros de contabilidade — dados já carregados em memória, nunca faz
    // um novo pedido só para exportar.
    _exportFinanceCsv(type) {
        if (type === 'expenses') {
            const headers = ['Categoria', 'Descrição', 'Valor (MZN)', 'Data', 'Recorrente'];
            const catLabel = { domain: 'Domínio', hosting: 'Hosting', ai_providers: 'Providers de IA', other: 'Outra' };
            const rows = (this._financeExpenses || []).map(x => [
                catLabel[x.category] || x.category, x.description || '', x.amount_mzn ?? 0, x.occurred_at || '', x.is_recurring ? 'Sim' : 'Não',
            ]);
            this._exportMenu('despesas', 'Despesas Operacionais — MzDocs Pro', headers, rows);
        } else if (type === 'withdrawals') {
            const headers = ['Valor (MZN)', 'Nota', 'Data'];
            const rows = (this._financeWithdrawals || []).map(x => [x.amount_mzn ?? 0, x.note || '', x.withdrawn_at || '']);
            this._exportMenu('levantamentos', 'Levantamentos do Dono — MzDocs Pro', headers, rows);
        } else if (type === 'transactions') {
            const headers = ['Data', 'Cliente', 'Telefone', 'Pacote', 'Valor (MZN)', 'Estado', 'Comprovativo M-Pesa'];
            const rows = (this._ledgerTransactions || []).map(t => {
                const user = t.profiles || {};
                return [
                    t.created_at ? new Date(t.created_at).toLocaleString('pt-MZ') : '',
                    user.full_name || '', t.phone_number || '', (t.package_id || '').toUpperCase(),
                    t.amount ?? 0, t.status || '', t.mpesa_receipt || '',
                ];
            });
            this._exportMenu('livro-transacoes', 'Livro de Transacções — MzDocs Pro', headers, rows);
        } else if (type === 'affiliate-payouts') {
            const headers = ['Data', 'Afiliado', 'Valor (MZN)', 'Telefone M-Pesa', 'Nº Recibo', 'Link Comprovativo'];
            const rows = (this._affiliatePayouts || []).map(p => {
                const user = p.profiles || {};
                return [
                    p.processed_at ? new Date(p.processed_at).toLocaleString('pt-MZ') : '',
                    user.full_name || '', p.amount ?? 0, p.mpesa_phone || '', p.receipt_number || '', p.receipt_screenshot_url || '',
                ];
            });
            this._exportMenu('pagamentos-afiliados', 'Pagamentos a Afiliados — MzDocs Pro', headers, rows);
        }
    }

    // ── EXPORTAÇÃO CSV / EXCEL / PDF (Fase 5) ────────────────────────────
    // Utilitários genéricos — qualquer secção só precisa de montar
    // {headers, rows} a partir dos dados já carregados (nunca faz um
    // pedido novo à API só para exportar).
    _downloadBlob(filename, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    _csvEscape(v) {
        const s = (v === null || v === undefined) ? '' : String(v);
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    _exportCSV(filename, headers, rows) {
        const lines = [headers.map(h => this._csvEscape(h)).join(';')];
        rows.forEach(r => lines.push(r.map(v => this._csvEscape(v)).join(';')));
        // BOM UTF-8 — sem isto o Excel abre acentos (ç, ã, é) corrompidos.
        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        this._downloadBlob(filename, blob);
    }

    async _loadXLSXLib() {
        if (window.XLSX) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            s.onload = () => window.XLSX ? resolve() : reject(new Error('XLSX não inicializado'));
            s.onerror = () => reject(new Error('Falha ao carregar SheetJS'));
            document.head.appendChild(s);
        });
    }

    async _exportExcel(filename, headers, rows) {
        try {
            await this._loadXLSXLib();
            const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Dados');
            const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            this._downloadBlob(filename, new Blob([buf], { type: 'application/octet-stream' }));
        } catch (err) {
            this._notify?.(`❌ Erro ao exportar Excel: ${err.message}`, 'error');
        }
    }

    async _loadJsPDFLib() {
        if (window.jspdf?.jsPDF) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload = () => window.jspdf?.jsPDF ? resolve() : reject(new Error('jsPDF não inicializado'));
            s.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
            document.head.appendChild(s);
        });
        if (window.jspdf.jsPDF.API.autoTable) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Falha ao carregar jspdf-autotable'));
            document.head.appendChild(s);
        });
    }

    async _exportPDF(filename, title, headers, rows) {
        try {
            await this._loadJsPDFLib();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: rows[0]?.length > 5 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
            doc.setFontSize(14);
            doc.text(title, 14, 15);
            doc.setFontSize(9);
            doc.text(`MzDocs Pro — gerado em ${new Date().toLocaleString('pt-MZ')}`, 14, 21);
            doc.autoTable({
                head: [headers], body: rows, startY: 26,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [15, 23, 42] },
            });
            doc.save(filename);
        } catch (err) {
            this._notify?.(`❌ Erro ao exportar PDF: ${err.message}`, 'error');
        }
    }

    // Menu simples de exportação — reaproveitado por qualquer secção,
    // passando só o nome base do ficheiro + headers + rows já montados.
    _exportMenu(baseFilename, title, headers, rows) {
        if (!rows.length) { this._notify?.('⚠️ Não há dados para exportar', 'warn'); return; }
        const stamp = new Date().toISOString().split('T')[0];
        const choice = prompt('Exportar como? Escreva: csv, excel ou pdf', 'csv');
        if (!choice) return;
        const c = choice.trim().toLowerCase();
        if (c === 'csv')        this._exportCSV(`${baseFilename}-${stamp}.csv`, headers, rows);
        else if (c === 'excel' || c === 'xlsx') this._exportExcel(`${baseFilename}-${stamp}.xlsx`, headers, rows);
        else if (c === 'pdf')   this._exportPDF(`${baseFilename}-${stamp}.pdf`, title, headers, rows);
        else this._notify?.('⚠️ Opção inválida. Use: csv, excel ou pdf', 'warn');
    }

    _exportUsers() {
        const headers = ['Nome', 'Telefone', 'Email', 'Créditos', 'Tipo de Conta', 'Registado em'];
        const rows = (this._users || []).map(u => [
            u.full_name || '', u.phone || '', u.email || '',
            u.credits ?? 0, u.account_type || 'normal',
            u.created_at ? new Date(u.created_at).toLocaleDateString('pt-MZ') : '',
        ]);
        this._exportMenu('utilizadores', 'Utilizadores — MzDocs Pro', headers, rows);
    }

    _exportTransactions() {
        const headers = ['Referência', 'Cliente', 'Pacote', 'Valor (MZN)', 'Créditos', 'Estado', 'Data'];
        const rows = (this._transactions || []).map(t => {
            const user = t.profiles || t.user_profile || {};
            return [
                t.reference_id || t.id?.slice(0, 8) || '', user.full_name || user.phone || 'Anónimo',
                (t.package_id || '-').toUpperCase(), t.amount ?? 0, t.credits ?? 0,
                t.status || '', t.created_at ? new Date(t.created_at).toLocaleString('pt-MZ') : '',
            ];
        });
        this._exportMenu('transacoes', 'Transações — MzDocs Pro', headers, rows);
    }

    _exportFunnel() {
        const headers = ['Dia', 'Visitantes Únicos', 'Registos', 'Geraram Documento', 'Compraram', 'Receita (MZN)'];
        const rows = (this._funnelDaily || []).map(r => [
            r.day, r.unique_visitors ?? 0, r.signups ?? 0, r.doc_generators ?? 0, r.buyers ?? 0, r.revenue ?? 0,
        ]);
        this._exportMenu('funil-diario', 'Funil de Conversão — MzDocs Pro', headers, rows);
    }

    _renderAiProviderTiers(container, data) {
        const byTier = {};
        (data.providers || []).forEach(p => { (byTier[p.tier] ||= []).push(p); });

        container.innerHTML = (data.tiers || []).filter(t => byTier[t.id]?.length).map(tier => `
            <div style="margin-bottom:22px">
                <h3 style="font-size:14px;font-weight:800;color:${tier.color};margin-bottom:10px;display:flex;align-items:center;gap:6px">
                    <span style="width:9px;height:9px;border-radius:50%;background:${tier.color};display:inline-block"></span>
                    ${tier.label}
                </h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
                    ${byTier[tier.id].map(p => this._aiProviderCard(p)).join('')}
                </div>
            </div>
        `).join('') || '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">Nenhum provider configurado.</div>';
    }

    _aiProviderCard(p) {
        const st = this._aiStatusMeta(p.status);
        const fmt = n => (n ?? 0).toLocaleString('pt-MZ');
        const pctBar = p.usagePct != null ? `
            <div style="background:#f1f5f9;border-radius:6px;height:8px;overflow:hidden;margin:8px 0 4px">
                <div style="height:100%;width:${p.usagePct}%;background:${p.usagePct > 85 ? '#dc2626' : p.usagePct > 60 ? '#f59e0b' : '#16a34a'}"></div>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${p.usagePct}% do limite estimado</div>
        ` : '<div style="height:12px"></div>';

        return `
            <div class="settings-card" style="margin:0;border-left:3px solid ${st.color}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                    <h3 style="margin-bottom:2px">${p.name}</h3>
                    <span class="badge" style="background:${st.color}22;color:${st.color};white-space:nowrap">${st.label}</span>
                </div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${p.limitLabel || ''}</div>
                ${pctBar}
                <div style="display:flex;justify-content:space-between;font-size:12px;color:#475569;margin-bottom:4px">
                    <span>✅ ${fmt(p.today.requestsOk)} ok</span>
                    <span>❌ ${fmt(p.today.requestsFail)} falhas</span>
                    <span>🔤 ${fmt(p.today.tokensTotal)} tok</span>
                </div>
                ${p.today.lastModel ? `<div style="font-size:11px;color:#64748b">Último modelo: ${p.today.lastModel}</div>` : ''}
                ${p.today.lastErrorMessage ? `<div style="font-size:11px;color:#dc2626;margin-top:4px">⚠️ ${p.today.lastErrorMessage.slice(0, 90)}</div>` : ''}
                <div style="margin-top:8px;font-size:11px">
                    ${p.configured
                        ? '<span style="color:#16a34a">🔑 Chave configurada</span>'
                        : `<a href="${p.signupUrl}" target="_blank" rel="noopener" style="color:#dc2626">🔑 Sem chave — obter em ${p.signupUrl.replace('https://', '')}</a>`}
                </div>
            </div>
        `;
    }

    _renderAiChart(providers) {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById('aiProvidersChart');
        if (!canvas) return;

        const days = [...new Set(providers.flatMap(p => p.last7Days.byDay.map(d => d.day)))].sort();
        const palette = ['#3B82F6', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

        const datasets = providers.map((p, i) => ({
            label: p.name,
            data: days.map(day => {
                const found = p.last7Days.byDay.find(d => d.day === day);
                return found ? found.tokens : 0;
            }),
            backgroundColor: palette[i % palette.length],
            borderRadius: 4,
        }));

        if (this.charts.aiProviders) this.charts.aiProviders.destroy();
        this.charts.aiProviders = new Chart(canvas, {
            type: 'bar',
            data: { labels: days.map(d => d.slice(5)), datasets },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
            },
        });
    }

    _renderAiReserve(container, reserve) {
        if (!container) return;
        container.innerHTML = reserve.map(r => `
            <div class="settings-card" style="margin:0">
                <h3 style="margin-bottom:4px">${r.name}</h3>
                <div style="font-size:11px;color:#64748b;margin-bottom:8px">${r.limitLabel}</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:10px">env: <code>${r.envVarSuggestion}</code></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <a href="${r.signupUrl}" target="_blank" rel="noopener" class="btn-ghost" style="font-size:12px;padding:6px 10px;text-decoration:none">🔗 Obter chave</a>
                    <button onclick="adminApp._toggleAiReserve('${r.id}')" style="font-size:12px;padding:6px 10px;border-radius:8px;border:1.5px solid ${r.activated ? '#16a34a' : '#cbd5e1'};background:${r.activated ? '#f0fdf4' : '#fff'};color:${r.activated ? '#15803d' : '#334155'};font-weight:700;cursor:pointer">
                        ${r.activated ? '✅ Activado' : '☐ Marcar como activado'}
                    </button>
                </div>
            </div>
        `).join('') || '<div style="color:#94a3b8;font-size:13px">Sem providers de reserva definidos.</div>';
    }

    async _toggleAiReserve(id) {
        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/ai-providers', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ toggleReserve: id }),
            });
            if (!res.ok) throw new Error('toggle ' + res.status);
            this._loadAiProviders();
        } catch (err) {
            this._toast('Erro ao actualizar provider de reserva: ' + err.message, 'error');
        }
    }

    // ── PUSH NOTIFICATIONS (admin) ─────────────────────────────────────────
    // Notificações reais do sistema operativo (Android/Chrome) — não confundir
    // com o sino interno (admin_notifications), que é só um feed dentro do
    // painel. Aqui o admin activa o SEU próprio telemóvel/browser para
    // receber alertas mesmo com a app fechada, e pode enviar um push para
    // todos os clientes e/ou todos os admins.
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    async _refreshPushButton() {
        const btn = document.getElementById('pushAdminToggleBtn');
        if (!btn) return;
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                btn.style.display = 'none';
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub && Notification.permission === 'granted') {
                btn.textContent = '🔔 Notificações activas neste telemóvel';
                btn.disabled = true;
            } else {
                btn.textContent = '🔔 Activar notificações neste telemóvel';
                btn.disabled = false;
            }
        } catch (_) { /* ignora — botão fica com o texto por omissão do HTML */ }
    }

    async _enableAdminPush() {
        const btn = document.getElementById('pushAdminToggleBtn');
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                this._toast('Este browser não suporta notificações push.', 'error');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                this._toast('Permissão de notificações não concedida.', 'error');
                return;
            }
            const cfgRes = await fetch('/api/misc?action=config');
            const cfg = await cfgRes.json();
            if (!cfg.vapidPublicKey) {
                this._toast('Chave VAPID não configurada no servidor — contacta o suporte técnico.', 'error');
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this._urlBase64ToUint8Array(cfg.vapidPublicKey),
                });
            }
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ subscription: sub.toJSON() }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao guardar subscrição');
            this._toast('✅ Notificações activadas neste telemóvel!', 'success');
            if (btn) { btn.textContent = '🔔 Notificações activas neste telemóvel'; btn.disabled = true; }
        } catch (err) {
            this._toast('Erro ao activar notificações: ' + err.message, 'error');
        }
    }

    _openPushSendForm() {
        this.showModal(`
            <p class="modal-title">📤 Enviar Notificação Push</p>
            <p class="modal-sub">Aparece como notificação do sistema (Android/Chrome), mesmo com a app fechada — só chega a quem já activou as notificações.</p>
            <div class="modal-field"><label>Título</label><input type="text" id="pushTitle" placeholder="Ex: Nova funcionalidade disponível!"></div>
            <div class="modal-field"><label>Mensagem</label><input type="text" id="pushBody" placeholder="Ex: Já podes gerar contratos automaticamente."></div>
            <div class="modal-field"><label>Link ao abrir (opcional)</label><input type="text" id="pushUrl" placeholder="/ (por omissão)"></div>
            <div class="modal-field">
                <label>Enviar para</label>
                <select id="pushTarget">
                    <option value="client">Clientes</option>
                    <option value="admin">Admins</option>
                    <option value="all">Todos</option>
                </select>
            </div>
            <div class="modal-actions">
                <button style="background:#f1f5f9;color:#0f172a" onclick="adminApp.closeModal()">Cancelar</button>
                <button style="background:#3b82f6;color:#fff" onclick="adminApp._sendPush()">Enviar</button>
            </div>
        `);
    }

    async _sendPush() {
        const title = document.getElementById('pushTitle')?.value?.trim();
        const body  = document.getElementById('pushBody')?.value?.trim();
        const url   = document.getElementById('pushUrl')?.value?.trim() || '/';
        const target = document.getElementById('pushTarget')?.value || 'client';
        if (!title || !body) { this._toast('Título e mensagem são obrigatórios.', 'error'); return; }

        try {
            const token = await this._getAdminToken();
            const res = await fetch('/api/admin/push-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ title, body, url, target }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Erro ao enviar');
            this.closeModal();
            this._toast(`✅ Enviado: ${d.sent} entregues, ${d.failed} falhas.`, 'success');
        } catch (err) {
            this._toast('Erro ao enviar notificação: ' + err.message, 'error');
        }
    }

    }

window.adminApp = new AdminApp();
