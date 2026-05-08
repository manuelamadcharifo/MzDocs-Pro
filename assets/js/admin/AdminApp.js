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
            transactions: 'Transações', documents: 'Documentos', settings: 'Configurações'
        };
        document.getElementById('pageTitle').textContent = titles[section] || section;
        this._section = section;

        if (section === 'dashboard')    this._loadDashboard();
        if (section === 'users')        this._loadUsers();
        if (section === 'transactions') this._loadTransactions();
        if (section === 'documents')    this._loadDocuments();
        if (section === 'settings')     this._loadSettings();
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
        try {
            // Totais REAIS (sem filtro de data — todos os registos)
            const [
                { count: totalUsers },
                { count: totalDocs },
                { data: revenue },
                { count: pending }
            ] = await Promise.all([
                this.supabase.from('profiles').select('*', { count: 'exact', head: true }),
                this.supabase.from('documents').select('*', { count: 'exact', head: true }),
                this.supabase.from('transactions').select('amount').eq('status', 'completed'),
                this.supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            ]);

            const totalRevenue = (revenue || []).reduce((s, t) => s + (t.amount || 0), 0);

            const e = id => document.getElementById(id);
            if (e('statTotalUsers')) e('statTotalUsers').textContent = totalUsers ?? '—';
            if (e('statTotalDocs'))  e('statTotalDocs').textContent  = totalDocs ?? '—';
            if (e('statRevenue'))    e('statRevenue').textContent    = totalRevenue.toLocaleString('pt-MZ') + ' MZN';
            if (e('statPending'))    e('statPending').textContent    = pending ?? '—';
            if (e('navBadgeUsers'))  e('navBadgeUsers').textContent  = totalUsers ?? 0;
            if (e('navBadgePending')) e('navBadgePending').textContent = pending ?? 0;

            await this._loadCharts();
        } catch (err) { console.error('[Admin] Dashboard:', err); }
    }

    async _loadCharts() {
        if (!this.supabase || typeof Chart === 'undefined') return;
        try {
            const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString();
            const [{ data: txData }, { data: docData }] = await Promise.all([
                this.supabase.from('transactions').select('amount,created_at').eq('status','completed').gte('created_at', sevenDays),
                this.supabase.from('documents').select('service_type').gte('created_at', sevenDays),
            ]);

            const days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(Date.now() - (6 - i) * 86400000);
                return d.toISOString().slice(0, 10);
            });

            // Revenue chart
            const rc = document.getElementById('revenueChart');
            if (rc) {
                if (this.charts.revenue) this.charts.revenue.destroy();
                this.charts.revenue = new Chart(rc, {
                    type: 'line',
                    data: {
                        labels: days.map(d => d.slice(5)),
                        datasets: [{
                            label: 'MZN',
                            data: days.map(day => (txData||[]).filter(t=>t.created_at.slice(0,10)===day).reduce((s,t)=>s+t.amount,0)),
                            borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,.1)',
                            tension: .4, fill: true, pointRadius: 4
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }

            // Docs chart
            const typeMap = {};
            (docData||[]).forEach(d => { typeMap[d.service_type] = (typeMap[d.service_type]||0) + 1; });
            const dc = document.getElementById('documentsChart');
            if (dc && Object.keys(typeMap).length) {
                if (this.charts.docs) this.charts.docs.destroy();
                this.charts.docs = new Chart(dc, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(typeMap).map(k => this._typeLabel(k)),
                        datasets: [{ data: Object.values(typeMap),
                            backgroundColor: ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'] }]
                    },
                    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
                });
            }
        } catch (err) { console.warn('[Admin] Charts:', err); }
    }

    // ── UTILIZADORES ────────────────────────────────────────────────────
    async _loadUsers() {
        if (!this.supabase) return;
        try {
            // Tentar com is_blocked; se coluna não existir (erro 42703), tentar sem ela
            let data, error;
            ({ data, error } = await this.supabase
                .from('profiles')
                .select('id, full_name, phone, email, credits, total_documents, is_admin, is_blocked, created_at')
                .order('created_at', { ascending: false }));

            if (error && error.code === '42703') {
                console.warn('[Admin] is_blocked ausente — a carregar sem ela. Execute a migração SQL.');
                this._isBlockedMissing = true;
                ({ data, error } = await this.supabase
                    .from('profiles')
                    .select('id, full_name, phone, email, credits, total_documents, is_admin, created_at')
                    .order('created_at', { ascending: false }));
            } else {
                this._isBlockedMissing = false;
            }

            if (error) throw error;
            // Normalizar: garantir is_blocked=false se coluna ausente
            this._users = (data || []).map(u => ({ ...u, is_blocked: u.is_blocked ?? false }));
            this._renderUsers(this._users);

            if (this._isBlockedMissing && !this._blockWarnShown) {
                this._blockWarnShown = true;
                this._notify('⚠ Execute a migração SQL para activar o bloqueio de utilizadores.', 'warn');
            }
        } catch (err) { console.error('[Admin] Utilizadores:', err); this._notify('❌ Erro ao carregar utilizadores', 'error'); }
    }

    filterUsers(query) {
        const q = (query || document.getElementById('searchUsers')?.value || '').toLowerCase();
        const type = document.getElementById('userTypeFilter')?.value || 'all';
        let filtered = this._users.filter(u =>
            (u.full_name || '').toLowerCase().includes(q) ||
            (u.phone || '').includes(q) ||
            (u.email || '').toLowerCase().includes(q)
        );
        if (type === 'admin')   filtered = filtered.filter(u => u.is_admin);
        if (type === 'blocked') filtered = filtered.filter(u => u.is_blocked);
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
                            ${u.is_temp    ? '<span class="badge badge-orange">⏳ Avulso</span>' : ''}
                            ${u.is_admin ? '<span class="badge badge-purple">⭐ Admin</span>' : ''}
                            ${u.is_blocked ? '<span class="badge badge-red">🚫 Bloqueado</span>' : '<span class="badge badge-green">✅ Activo</span>'}
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
                ${u.is_temp     ? '<span class="badge badge-orange">⏳ Avulso</span>' : ''}
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
            const token = authManager.getToken();
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
            // Eliminar documentos primeiro (evitar violação FK)
            await this.supabase.from('documents').delete().eq('user_id', userId);
            // Eliminar transações
            await this.supabase.from('transactions').delete().eq('user_id', userId);
            // Eliminar perfil
            const { error } = await this.supabase.from('profiles').delete().eq('id', userId);
            if (error) throw error;
            this._notify('✅ Utilizador eliminado com sucesso!');
            this._loadUsers();
            this._loadDashboard();
        } catch (err) {
            this._notify('❌ Erro ao eliminar: ' + err.message + ' (pode precisar de service_role para eliminar do Auth)', 'error');
        }
    }

    // ── TRANSAÇÕES ──────────────────────────────────────────────────────
    async _loadTransactions() {
        if (!this.supabase) return;
        try {
            const status = document.getElementById('filterStatus')?.value;
            const date   = document.getElementById('filterDate')?.value;

            let q = this.supabase
                .from('transactions')
                .select('*, profiles(full_name, phone, email)')
                .order('created_at', { ascending: false })
                .limit(200);

            if (status && status !== 'all') q = q.eq('status', status);
            if (date) q = q.gte('created_at', date).lte('created_at', date + 'T23:59:59');

            const { data, error } = await q;
            if (error) throw error;

            const tbody = document.getElementById('transactionsTable');
            if (!tbody) return;
            tbody.innerHTML = (data || []).map(t => `
                <tr>
                    <td><code style="font-size:.75rem">${t.reference_id || t.id.slice(0,8)}</code></td>
                    <td>
                        <div style="font-size:.85rem">${t.profiles?.full_name || t.profiles?.phone || 'Anónimo'}</div>
                        <div style="font-size:.72rem;color:#64748b">${t.profiles?.email || ''}</div>
                    </td>
                    <td>${(t.package_id||'-').toUpperCase()}</td>
                    <td style="font-weight:700">${(t.amount||0).toLocaleString('pt-MZ')} MZN</td>
                    <td><span class="credit-badge">${t.credits} cr</span></td>
                    <td><span class="status-badge status-${t.status}">${this._statusLabel(t.status)}</span></td>
                    <td style="font-size:.78rem">${new Date(t.created_at).toLocaleString('pt-MZ')}</td>
                    <td>
                        ${t.status === 'pending' ? `
                            <div class="action-group">
                                <button class="btn-success" onclick="adminApp._confirmPayment('${t.id}','${t.user_id}',${t.credits})">✅</button>
                                <button class="btn-danger" onclick="adminApp._rejectPayment('${t.id}')">❌</button>
                            </div>` : '—'}
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8">Nenhuma transação</td></tr>';
        } catch (err) { console.error('[Admin] Transações:', err); }
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
            const token = authManager.getToken();
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
        if (!this.supabase) return;
        try {
            const { data, error } = await this.supabase
                .from('documents')
                .select('id, service_type, title, model_used, created_at, content, profiles(full_name, phone)')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            this._docs = data || [];
            this._renderDocs(this._docs);
        } catch (err) { console.error('[Admin] Documentos:', err); }
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
            const { error } = await this.supabase.from('documents').delete().eq('id', docId);
            if (error) throw error;
            this._notify('✅ Documento eliminado');
            this._loadDocuments();
        } catch (err) { this._notify('❌ ' + err.message, 'error'); }
    }

    // ── CONFIGURAÇÕES ────────────────────────────────────────────────────
    _loadSettings() {
        const saved = JSON.parse(localStorage.getItem('mz_admin_settings') || '{}');
        const e = id => document.getElementById(id);
        if (saved.mpesaEnv && e('mpesaEnv')) e('mpesaEnv').value = saved.mpesaEnv;
        if (e('pkgStarterCredits')) e('pkgStarterCredits').value = saved.starterCredits || 10;
        if (e('pkgStarterPrice'))   e('pkgStarterPrice').value   = saved.starterPrice   || 150;
        if (e('pkgBasicoCredits'))  e('pkgBasicoCredits').value  = saved.basicoCredits  || 25;
        if (e('pkgBasicoPrice'))    e('pkgBasicoPrice').value    = saved.basicoPrice    || 350;
        if (e('pkgProCredits'))     e('pkgProCredits').value     = saved.proCredits     || 60;
        if (e('pkgProPrice'))       e('pkgProPrice').value       = saved.proPrice       || 750;
    }
    _savePricing() {
        const v = id => parseInt(document.getElementById(id)?.value) || 0;
        const s = JSON.parse(localStorage.getItem('mz_admin_settings') || '{}');
        s.starterCredits = v('pkgStarterCredits'); s.starterPrice = v('pkgStarterPrice');
        s.basicoCredits  = v('pkgBasicoCredits');  s.basicoPrice  = v('pkgBasicoPrice');
        s.proCredits     = v('pkgProCredits');      s.proPrice     = v('pkgProPrice');
        localStorage.setItem('mz_admin_settings', JSON.stringify(s));
        this._notify('✅ Preços guardados localmente');
    }
    _saveSettings() {
        const s = JSON.parse(localStorage.getItem('mz_admin_settings') || '{}');
        s.mpesaEnv = document.getElementById('mpesaEnv')?.value || 'sandbox';
        localStorage.setItem('mz_admin_settings', JSON.stringify(s));
        this._notify('✅ Configuração M-Pesa guardada');
    }

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
            const token = authManager.getToken();
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
}

window.adminApp = new AdminApp();
