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
        if (!authManager.isAdmin())         { alert('⛔ Acesso restrito a administradores.'); window.location.href = '/'; return; }

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

        // Realtime: subscrever mudanças na tabela online_sessions via Supabase Realtime
        this._startOnlineRealtime();
        // Polling de fallback a cada 20s (caso realtime falhe)
        this._onlinePoller = setInterval(() => this._pollOnline(), 20000);
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
            affiliates: 'Afiliados',
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
        if (section === 'templates') {
                    this._tplStatus = 'pending';
                    this._tplType   = '';
                    this._loadTemplates('pending');
                    this._loadTemplateStats();
                }
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
        if (!confirm(`Tem a certeza que deseja ${action} este utilizador?`)) return;
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

            tbody.innerHTML = data.map(t => `
                <tr>
                    <td><code style="font-size:.75rem">${t.reference_id || t.id.slice(0,8)}</code></td>
                    <td>
                        <div style="font-size:.85rem">${t.user_profile?.full_name || t.user_profile?.phone || 'An\u00f3nimo'}</div>
                        <div style="font-size:.72rem;color:#64748b">${t.user_profile?.email || ''}</div>
                    </td>
                    <td>${(t.package_id||'-').toUpperCase()}</td>
                    <td style="font-weight:700">${(t.amount||0).toLocaleString('pt-MZ')} MZN</td>
                    <td><span class="credit-badge">${t.credits} cr</span></td>
                    <td><span class="status-badge status-${t.status}">${this._statusLabel(t.status)}</span></td>
                    <td style="font-size:.78rem">${new Date(t.created_at).toLocaleString('pt-MZ')}</td>
                    <td>
                        ${t.status === 'pending' ? `
                            <div class="action-group">
                                <button class="btn-success" onclick="adminApp._confirmPayment('${t.id}','${t.user_id}',${t.credits})">\u2705</button>
                                <button class="btn-danger" onclick="adminApp._rejectPayment('${t.id}')">\u274c</button>
                            </div>` : '—'}
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8">Nenhuma transa\u00e7\u00e3o</td></tr>';
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
        if (!confirm('Rejeitar este pagamento?')) return;
        try {
            const { error } = await this.supabase.from('transactions').update({ status: 'failed' }).eq('id', txId);
            if (error) throw error;
            this._notify('✅ Pagamento rejeitado');
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
        if (!confirm('Eliminar este documento?')) return;
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
        return { pending:'⏳ Pendente', completed:'✅ Confirmado', failed:'❌ Falhado', refunded:'↩️ Reembolsado' }[s] || s;
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
            this.filterBlog();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">Erro: ' + err.message + '</td></tr>';
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

        if (!aiTitle) { alert('Introduza um título para gerar com IA.'); return; }

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

        if (!title)   { alert('O título é obrigatório.'); return; }
        if (!content) { alert('O conteúdo é obrigatório.'); return; }

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
            alert(publish ? '🚀 Página publicada com sucesso!' : '💾 Rascunho guardado com sucesso!');

        } catch (err) {
            alert('❌ Erro: ' + err.message);
        }
    }

    async deletePage(pageId, pageTitle) {
        if (!confirm('Eliminar a página "' + pageTitle + '"?\nEsta acção não pode ser desfeita.')) return;
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
            alert('❌ Erro: ' + err.message);
        }
    }


    // ════════════════════════════════════════════════════════════════════
    // ANALYTICS — visitas, online, serviços mais usados
    // ════════════════════════════════════════════════════════════════════

    async _loadAnalytics() {
        const el = id => document.getElementById(id);
        const setEl = (id, html) => { const e = el(id); if (e) e.innerHTML = html; };

        // Estado de carregamento
        const analyticsSection = el('section-analytics');
        if (analyticsSection) {
            setEl('topServicesList', '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
            setEl('feedbackList',    '<div style="color:#94a3b8;font-size:.8rem;padding:.5rem">A carregar…</div>');
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
            const pending  = this._affData.filter(a => !a.is_affiliate && a.ref_code).length;
            const approved = this._affData.filter(a => a.is_affiliate).length;
            const clicks   = this._affData.reduce((s, a) => s + (a.aff_clicks || 0), 0);
            const earned   = this._affData.reduce((s, a) => s + (a.aff_total_earned || 0), 0);
            const e = id => document.getElementById(id);
            if (e('affStatTotal'))    e('affStatTotal').textContent    = total;
            if (e('affStatPending'))  e('affStatPending').textContent  = pending;
            if (e('affStatApproved')) e('affStatApproved').textContent = approved;
            if (e('affStatClicks'))   e('affStatClicks').textContent   = clicks.toLocaleString('pt-MZ');
            if (e('affStatEarned'))   e('affStatEarned').textContent   = earned.toFixed(2) + ' MZN';
            const badge = document.getElementById('navBadgeAffiliates');
            if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-flex' : 'none'; }
        } catch (err) {
            if (loading) { loading.style.display = 'block'; loading.textContent = '❌ ' + err.message; }
        }
    }

    _affFilter(filter) {
        if (!this._affData) return;
        let filtered = this._affData;
        if (filter === 'pending')  filtered = this._affData.filter(a => !a.is_affiliate && a.ref_code);
        if (filter === 'approved') filtered = this._affData.filter(a => a.is_affiliate);
        this._renderAffiliates(filtered);
    }

    _renderAffiliates(list) {
        const loading = document.getElementById('affLoading');
        const table   = document.getElementById('affTable');
        const tbody   = document.getElementById('affTableBody');
        if (!tbody) return;
        if (loading) loading.style.display = 'none';
        if (!list.length) {
            if (loading) { loading.style.display = 'block'; loading.textContent = 'Nenhum afiliado encontrado.'; }
            if (table) table.style.display = 'none';
            return;
        }
        if (table) table.style.display = 'table';
        tbody.innerHTML = list.map(a => {
            const badge = a.is_affiliate
                ? '<span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">✅ Aprovado</span>'
                : '<span style="background:#fef9c3;color:#854d0e;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">⏳ Pendente</span>';
            const action = !a.is_affiliate
                ? `<button onclick="adminApp._approveAffiliate('${a.id}')" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px">✅ Aprovar</button>`
                : `<button onclick="adminApp._revokeAffiliate('${a.id}')" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px">🚫 Revogar</button>`;
            return `<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:10px 12px"><div style="font-weight:700;font-size:13px">${a.full_name||'—'}</div><div style="font-size:11px;color:#64748b">${a.email||a.phone||'—'}</div></td>
                <td style="padding:10px 12px;text-align:center"><code style="background:#f1f5f9;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:700">${a.ref_code||'—'}</code></td>
                <td style="padding:10px 12px;text-align:center">${badge}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:700">${(a.aff_clicks||0).toLocaleString('pt-MZ')}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:700">${a.aff_conversions||0}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:700;color:${(a.aff_balance||0)>0?'#16a34a':'#64748b'}">${(a.aff_balance||0).toFixed(2)}</td>
                <td style="padding:10px 12px;text-align:center">${action}<button onclick="adminApp._viewAffiliate('${a.id}')" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">👁 Ver</button></td>
            </tr>`;
        }).join('');
    }

    async _approveAffiliate(userId) {
        if (!confirm('Aprovar este afiliado?')) return;
        const token = await this._getAdminToken();
        const res   = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve', user_id: userId }),
        }).catch(e => ({ ok: false, json: () => ({ error: e.message }) }));
        const d = await res.json();
        if (!res.ok) { alert('Erro: ' + d.error); return; }
        alert('✅ Afiliado aprovado!');
        this._loadAffiliates();
    }

    async _revokeAffiliate(userId) {
        if (!confirm('Revogar aprovação?')) return;
        const token = await this._getAdminToken();
        const res   = await fetch('/api/admin/affiliates', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'revoke', user_id: userId }),
        }).catch(e => ({ ok: false, json: () => ({ error: e.message }) }));
        const d = await res.json();
        if (!res.ok) { alert('Erro: ' + d.error); return; }
        alert('🚫 Aprovação revogada.');
        this._loadAffiliates();
    }

    _viewAffiliate(userId) {
        const aff = (this._affData || []).find(a => a.id === userId);
        if (!aff) return;
        const modal   = document.getElementById('affDetailModal');
        const content = document.getElementById('affDetailContent');
        if (!modal || !content) return;
        const refLink = 'https://mzdocs.co.mz/?ref=' + aff.ref_code;
        content.innerHTML = `<h3 style="font-size:16px;font-weight:800;margin:0 0 16px">${aff.full_name||'Afiliado'}</h3>
            <div style="display:grid;gap:10px">
            <div style="background:#f8fafc;border-radius:10px;padding:12px">
                <div style="font-size:11px;color:#64748b;margin-bottom:4px">CÓDIGO</div>
                <div style="font-size:18px;font-weight:800;color:#1e40af">${aff.ref_code||'—'}</div>
            </div>
            <div style="background:#f8fafc;border-radius:10px;padding:12px">
                <div style="font-size:11px;color:#64748b;margin-bottom:4px">LINK</div>
                <div style="font-size:12px;word-break:break-all">${refLink}</div>
                <button onclick="navigator.clipboard.writeText('${refLink}')" style="margin-top:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">📋 Copiar</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:#7c3aed">${(aff.aff_clicks||0).toLocaleString()}</div><div style="font-size:11px;color:#64748b">Cliques</div></div>
                <div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:#0891b2">${aff.aff_conversions||0}</div><div style="font-size:11px;color:#64748b">Conversões</div></div>
                <div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:#16a34a">${(aff.aff_total_earned||0).toFixed(2)} MZN</div><div style="font-size:11px;color:#64748b">Total Ganho</div></div>
                <div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:#d97706">${(aff.aff_balance||0).toFixed(2)} MZN</div><div style="font-size:11px;color:#64748b">Saldo</div></div>
            </div>
            <div style="display:flex;gap:8px;margin-top:4px">
            ${!aff.is_affiliate
                ? `<button onclick="adminApp._approveAffiliate('${aff.id}');document.getElementById('affDetailModal').style.display='none'" style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:700;cursor:pointer">✅ Aprovar</button>`
                : `<button onclick="adminApp._revokeAffiliate('${aff.id}');document.getElementById('affDetailModal').style.display='none'" style="flex:1;background:#ef4444;color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:700;cursor:pointer">🚫 Revogar</button>`
            }
            </div></div>`;
        modal.style.display = 'flex';
    }

    // ══ TEMPLATES MARKETPLACE ══════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    // TEMPLATES v12 — Gestão completa (aprovação, rejeição, destaque, tipo, edição)
    // ══════════════════════════════════════════════════════════════════════════

    async _loadTemplates(status = 'pending') {
        const container = document.getElementById('templates-list');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">⏳ A carregar…</div>';

        try {
            const token = this._getAdminToken();
            const params = new URLSearchParams({ status, limit: 60 });
            const r = await fetch(`/api/admin/templates?${params}`, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const { templates: data = [], meta = {} } = await r.json();

            // Actualizar badge pendentes
            const badge = document.getElementById('navBadgeTemplates');
            if (badge) {
                const n = meta.pending || 0;
                badge.textContent = n;
                badge.style.display = n > 0 ? 'inline-flex' : 'none';
            }
            // Badge de reports
            if (meta.reports > 0) this._notify(`⚑ ${meta.reports} report(s) por resolver`, 'warning');

            if (!data.length) {
                const labels = { pending:'pendente', approved:'aprovado', rejected:'rejeitado', all:'no sistema' };
                container.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px">
                    Nenhum template ${labels[status] || status} encontrado.</div>`;
                return;
            }

            this._renderTemplateCards(data, status, meta);
            return;

        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:14px">❌ Erro: ${err.message}</div>`;
        }
    }

    async _approveTemplate(id) {
        const featured = confirm('Destacar este template na galeria? (OK=sim, Cancelar=não)');
        const note     = prompt('Nota interna (opcional):') || '';
        try {
            const r = await fetch('/api/admin/template-approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._getAdminToken()}` },
                body: JSON.stringify({ template_id: id, note, featured }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'Erro desconhecido');
            this._notify('✅ Template aprovado e publicado!', 'success');
            this._loadTemplates('pending');
        } catch (err) { this._notify('Erro ao aprovar: ' + err.message, 'error'); }
    }

    async _rejectTemplate(id) {
        const note = prompt('Motivo da rejeição (será enviado ao utilizador):') ?? '';
        if (note === null) return; // cancelled
        try {
            const r = await fetch('/api/admin/template-reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._getAdminToken()}` },
                body: JSON.stringify({ template_id: id, note }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'Erro desconhecido');
            this._notify('❌ Template rejeitado.', 'info');
            this._loadTemplates('pending');
        } catch (err) { this._notify('Erro ao rejeitar: ' + err.message, 'error'); }
    }

    async _featureTemplate(id, setFeatured) {
        let order = null;
        if (setFeatured) {
            const o = prompt('Ordem de destaque (1=primeiro, deixe em branco=automático):');
            order = o ? parseInt(o) : null;
        }
        try {
            const r = await fetch('/api/admin/template-feature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._getAdminToken()}` },
                body: JSON.stringify({ template_id: id, featured: setFeatured, featured_order: order }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'Erro');
            this._notify(setFeatured ? '⭐ Template destacado!' : '☆ Destaque removido', 'success');
            this._loadTemplates('approved');
        } catch (err) { this._notify('Erro: ' + err.message, 'error'); }
    }

    async _changeTemplateType(id, currentType) {
        const types = { '1':'official', '2':'community', '3':'premium', '4':'private' };
        const choice = prompt(
            `Tipo actual: ${currentType}\n\nNovo tipo:\n1 = 🏛️ Official (equipa MzDocs)\n2 = 👥 Community\n3 = ⭐ Premium (pago)\n4 = 🔒 Private\n\nEscreva o número:`
        );
        if (!choice) return;
        const newType = types[choice.trim()];
        if (!newType) { this._notify('Opção inválida', 'error'); return; }
        let creditCost = 0;
        if (newType === 'premium') {
            const c = prompt('Custo em créditos para este template premium (ex: 2):');
            creditCost = parseInt(c) || 1;
        }
        const note = prompt('Nota interna sobre a mudança (opcional):') || '';
        try {
            const r = await fetch('/api/admin/template-type', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._getAdminToken()}` },
                body: JSON.stringify({ template_id: id, new_type: newType, credit_cost: creditCost, note }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'Erro');
            this._notify(`🔄 Tipo alterado para ${newType}`, 'success');
            this._loadTemplates('approved');
        } catch (err) { this._notify('Erro: ' + err.message, 'error'); }
    }

    async _editTemplate(id) {
        // Buscar dados actuais
        const { data: tpl } = await this.supabase
            .from('templates_custom')
            .select('template_name, description, thumbnail_url, preview_url, admin_note, tags')
            .eq('id', id).single();
        if (!tpl) return;

        const newName = prompt('Nome do template:', tpl.template_name);
        if (newName === null) return;
        const newDesc = prompt('Descrição:', tpl.description || '');
        if (newDesc === null) return;
        const newThumb = prompt('URL da miniatura:', tpl.thumbnail_url || '');
        const newNote  = prompt('Nota admin (interna):', tpl.admin_note || '');

        const updates = {};
        if (newName !== tpl.template_name)  updates.template_name = newName.trim();
        if (newDesc !== tpl.description)     updates.description   = newDesc.trim();
        if (newThumb !== (tpl.thumbnail_url || '')) updates.thumbnail_url = newThumb || null;
        if (newNote  !== (tpl.admin_note || ''))    updates.admin_note   = newNote  || null;
        if (!Object.keys(updates).length) return;

        try {
            const r = await fetch('/api/admin/template-edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._getAdminToken()}` },
                body: JSON.stringify({ template_id: id, ...updates }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'Erro');
            this._notify('✏️ Template actualizado!', 'success');
            this._loadTemplates('approved');
        } catch (err) { this._notify('Erro ao editar: ' + err.message, 'error'); }
    }

    _previewTemplate(id) {
        this.supabase.from('templates_custom')
            .select('template_name, template_html, template_css, thumbnail_url, preview_url')
            .eq('id', id).single()
            .then(({ data, error }) => {
                if (error || !data) return;
                if (data.preview_url) { window.open(data.preview_url, '_blank'); return; }
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${data.template_name}</title>
<style>*{box-sizing:border-box;}body{margin:0;padding:20px;font-family:sans-serif;}${data.template_css||''}</style>
</head><body>${data.template_html||'<p style="color:#94a3b8;font-size:14px;text-align:center;padding:40px">Sem HTML de pré-visualização.<br/>Veja o CSS no painel de edição.</p>'}</body></html>`;
                const win = window.open('', '_blank');
                if (win) { win.document.write(html); win.document.close(); }
            });
    }



    }

    // ── Template filter helpers (estado + tipo) ───────────────────────────────
    _filterTemplates(status) {
        this._tplStatus = status;
        // Highlight active button
        ['pending','approved','rejected','all'].forEach(s => {
            const btn = document.getElementById(`tplBtn${s.charAt(0).toUpperCase()+s.slice(1)}`);
            if (!btn) return;
            const isActive = s === status;
            btn.style.background = isActive ? '#0f172a' : '#f8fafc';
            btn.style.color      = isActive ? '#fff'    : '#475569';
            btn.style.borderColor= isActive ? '#0f172a' : '#e2e8f0';
        });
        this._loadTemplates(status);
    }

    _filterTemplateType(type) {
        this._tplType = type;
        ['All','Official','Community','Premium','Private'].forEach(t => {
            const btn = document.getElementById(`tplTypeBtn${t}`);
            if (!btn) return;
            const val  = t === 'All' ? '' : t.toLowerCase();
            const colors = { official:'#3B82F6', community:'#10B981', premium:'#F59E0B', private:'#6B7280' };
            const bg     = { official:'#eff6ff',  community:'#ecfdf5',  premium:'#fffbeb',  private:'#f9fafb' };
            const fg     = { official:'#1d4ed8',  community:'#065f46',  premium:'#92400e',  private:'#374151' };
            if (val === type) {
                btn.style.background  = val === '' ? '#0f172a' : bg[val];
                btn.style.color       = val === '' ? '#fff'    : fg[val];
                btn.style.fontWeight  = '800';
                btn.style.borderWidth = '2px';
            } else {
                btn.style.background  = val === '' ? '#f8fafc' : bg[val] || '#f8fafc';
                btn.style.color       = val === '' ? '#475569' : fg[val] || '#475569';
                btn.style.fontWeight  = '700';
                btn.style.borderWidth = '1.5px';
                btn.style.opacity     = '0.65';
            }
        });
        // Reload with both filters
        this._loadTemplatesFiltered();
    }

    async _loadTemplatesFiltered() {
        const status = this._tplStatus || 'pending';
        const type   = this._tplType   || '';
        const container = document.getElementById('templates-list');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;grid-column:1/-1">⏳ A filtrar…</div>';
        try {
            const token  = await this._getAdminToken();
            const params = new URLSearchParams({ status, limit: 60 });
            if (type) params.set('type', type);
            const r = await fetch(`/api/admin/templates?${params}`, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const { templates: data = [], meta = {} } = await r.json();
            this._renderTemplateCards(data, status, meta);
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:14px;grid-column:1/-1">❌ Erro: ${err.message}</div>`;
        }
    }

    async _loadTemplateStats() {
        try {
            const token = await this._getAdminToken();
            // Load counts for each status in parallel
            const [rPending, rApproved, rRejected, rReports] = await Promise.all([
                fetch('/api/admin/templates?status=pending&limit=1',  { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/templates?status=approved&limit=1', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/templates?status=rejected&limit=1', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/templates?status=pending&limit=1',  { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            const [dPend, dAppr, dRej] = await Promise.all([rPending.json(), rApproved.json(), rRejected.json()]);
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setEl('tplStatPending',  dPend.meta?.pending  ?? dPend.templates?.length  ?? '—');
            setEl('tplStatApproved', dAppr.templates?.length ?? '—');
            setEl('tplStatRejected', dRej.templates?.length  ?? '—');
            setEl('tplStatReports',  dPend.meta?.reports ?? 0);
        } catch { /* silently fail */ }
    }

    _renderTemplateCards(data, status, meta = {}) {
        const container = document.getElementById('templates-list');
        if (!container) return;

        // Update stat badges
        const badge = document.getElementById('navBadgeTemplates');
        if (badge) {
            const n = meta.pending || 0;
            badge.textContent = n;
            badge.style.display = n > 0 ? 'inline-flex' : 'none';
        }
        if (meta.reports > 0) this._notify(`⚑ ${meta.reports} report(s) por resolver`, 'warning');

        if (!data.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;grid-column:1/-1">Nenhum template encontrado.</div>';
            return;
        }

        const statusColor = { pending:'#f59e0b', approved:'#16a34a', rejected:'#dc2626' };
        const statusLabel = { pending:'⏳ Pendente', approved:'✅ Aprovado', rejected:'❌ Rejeitado' };
        const typeColor   = { official:'#3B82F6', community:'#10B981', premium:'#F59E0B', private:'#6B7280' };
        const typeLabel   = { official:'🏛️ Oficial', community:'👥 Comunidade', premium:'⭐ Premium', private:'🔒 Privado' };

        container.innerHTML = data.map(tpl => {
            const date    = new Date(tpl.created_at).toLocaleDateString('pt');
            const author  = tpl.author?.full_name || tpl.author?.email || '—';
            const uses    = tpl.use_count || 0;
            const dl      = tpl.downloads || 0;
            const tType   = tpl.template_type || 'community';
            const isFeat  = tpl.is_featured;
            const creditBadge = tpl.credit_cost > 0
                ? `<span style="background:#F59E0B;color:#fff;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:800">⭐ ${tpl.credit_cost} cr</span>` : '';
            const previewSrc = tpl.thumbnail_url
                ? `<img src="${tpl.thumbnail_url}" style="width:100%;height:100%;object-fit:cover"/>`
                : `<span style="font-size:40px">🎨</span>`;

            return `<div style="background:#fff;border:1.5px solid ${isFeat ? '#F59E0B' : '#e2e8f0'};border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
              <div style="height:150px;background:#f8fafc;overflow:hidden;position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center"
                   onclick="adminApp._previewTemplate('${tpl.id}')">
                ${previewSrc}
                <span style="position:absolute;top:7px;left:7px;background:${statusColor[tpl.status]||'#94a3b8'};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${statusLabel[tpl.status]||tpl.status}</span>
                <span style="position:absolute;top:7px;right:7px;background:${typeColor[tType]||'#94a3b8'};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${typeLabel[tType]||tType}</span>
                ${isFeat ? '<span style="position:absolute;bottom:7px;right:7px;background:#EF4444;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⭐ Destaque</span>' : ''}
                <span style="position:absolute;bottom:7px;left:7px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:2px 8px;border-radius:6px">${tpl.service_type}</span>
              </div>
              <div style="padding:12px">
                <div style="font-size:13.5px;font-weight:800;color:#0f172a;margin-bottom:2px">${tpl.template_name}</div>
                <div style="font-size:11.5px;color:#64748b;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${tpl.description||'—'}</div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">👤 ${author} · 📅 ${date}</div>
                <div style="font-size:11px;color:#64748b;margin-bottom:9px;display:flex;gap:8px;flex-wrap:wrap">
                  <span>📄 ${uses} usos</span><span>⬇️ ${dl}</span>${creditBadge}
                </div>
                ${tpl.rejection_note ? `<div style="font-size:11px;color:#dc2626;background:#fef2f2;border-radius:6px;padding:5px 9px;margin-bottom:8px">❌ ${tpl.rejection_note}</div>` : ''}
                ${tpl.admin_note && tpl.status!=='rejected' ? `<div style="font-size:11px;color:#0369a1;background:#e0f2fe;border-radius:6px;padding:5px 9px;margin-bottom:8px">ℹ️ ${tpl.admin_note}</div>` : ''}
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                  ${tpl.status!=='approved' ? `<button onclick="adminApp._approveTemplate('${tpl.id}')" style="flex:1;padding:7px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;min-width:70px">✅ Aprovar</button>` : ''}
                  ${tpl.status!=='rejected' ? `<button onclick="adminApp._rejectTemplate('${tpl.id}')"  style="flex:1;padding:7px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;min-width:70px">❌ Rejeitar</button>` : ''}
                  <button onclick="adminApp._previewTemplate('${tpl.id}')" style="padding:7px 10px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">👁️</button>
                </div>
                ${tpl.status==='approved' ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button onclick="adminApp._featureTemplate('${tpl.id}',${!isFeat})" style="flex:1;padding:6px;background:${isFeat?'#fef3c7':'#fffbeb'};color:${isFeat?'#92400e':'#b45309'};border:1.5px solid #fcd34d;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">${isFeat?'☆ Remover':'⭐ Destacar'}</button>
                  <button onclick="adminApp._changeTemplateType('${tpl.id}','${tType}')" style="flex:1;padding:6px;background:#f1f5f9;color:#475569;border:1.5px solid #cbd5e1;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">🔄 Tipo</button>
                  <button onclick="adminApp._editTemplate('${tpl.id}')" style="padding:6px 10px;background:#f0fdf4;color:#15803d;border:1.5px solid #86efac;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">✏️</button>
                </div>` : ''}
              </div>
            </div>`;
        }).join('');
    }

window.adminApp = new AdminApp();
