// assets/js/admin/AdminApp.js — v4.1 FIXED

import { authManager } from '../auth/AuthManager.js';

class AdminApp {
    constructor() {
        this.supabase = null;
        this._users = [];
        this._docs = [];
        this._section = 'dashboard';
        this.charts = {};
        this._boot();
    }

    async _boot() {
        await authManager.ready();
        this.supabase = authManager.supabase;

        if (!authManager.isAuthenticated()) {
            await new Promise(r => setTimeout(r, 800));
            await authManager.ready();
        }

        if (!authManager.isAuthenticated()) {
            window.location.href = '/?auth=required';
            return;
        }

        if (!authManager.isAdmin()) {
            alert('⛔ Acesso restrito a administradores.');
            window.location.href = '/';
            return;
        }

        const name = authManager.user?._profile?.full_name
            || authManager.user?.user_metadata?.full_name
            || authManager.user?._profile?.phone
            || 'Admin';

        const el = id => document.getElementById(id);

        if (el('adminName')) {
            el('adminName').textContent = name;
        }

        if (el('adminDate')) {
            el('adminDate').textContent = new Date().toLocaleDateString('pt-MZ', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
        }

        this._bindNav();
        this._bindEvents();

        await this._loadDashboard();
    }

    _bindNav() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();

                const sec = item.dataset.section;

                if (sec) {
                    this.nav(sec);
                    this.closeSidebar();
                }
            });
        });
    }

    nav(section) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

        document
            .querySelector(`[data-section="${section}"]`)
            ?.classList.add('active');

        document.querySelectorAll('.admin-section').forEach(s => {
            s.classList.remove('active');
        });

        document
            .getElementById(`section-${section}`)
            ?.classList.add('active');

        const titles = {
            dashboard: 'Dashboard',
            users: 'Utilizadores',
            transactions: 'Transações',
            documents: 'Documentos',
            blog: 'Blog / Páginas',
            settings: 'Configurações'
        };

        const pageTitle = document.getElementById('pageTitle');

        if (pageTitle) {
            pageTitle.textContent = titles[section] || section;
        }

        this._section = section;

        if (section === 'dashboard') this._loadDashboard();
        if (section === 'users') this._loadUsers();
        if (section === 'transactions') this._loadTransactions();
        if (section === 'documents') this._loadDocuments();
        if (section === 'blog') this._loadBlog();
        if (section === 'settings') this._loadSettings();
    }

    refresh() {
        this.nav(this._section);
    }

    openSidebar() {
        document.getElementById('adminSidebar')?.classList.add('open');
        document.getElementById('sidebarOverlay')?.classList.add('show');
    }

    closeSidebar() {
        document.getElementById('adminSidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('show');
    }

    _bindEvents() {
        document.getElementById('adminLogout')?.addEventListener('click', () => {
            authManager.signOut().then(() => {
                window.location.href = '/';
            });
        });

        document.getElementById('filterStatus')?.addEventListener('change', () => {
            this._loadTransactions();
        });

        document.getElementById('filterDate')?.addEventListener('change', () => {
            this._loadTransactions();
        });
    }

    filterDocs(query) {
        const q = (query || '').toLowerCase();

        const filtered = this._docs.filter(d =>
            this._typeLabel(d.service_type).toLowerCase().includes(q)
            || (d.profiles?.full_name || '').toLowerCase().includes(q)
            || (d.profiles?.phone || '').includes(q)
        );

        this._renderDocs(filtered);
    }

    closeModal(e) {
        if (e && e.target !== document.getElementById('globalModal')) {
            return;
        }

        const modal = document.getElementById('globalModal');

        if (modal) {
            modal.style.display = 'none';
        }
    }

    _statusLabel(s) {
        return {
            pending: '⏳ Pendente',
            completed: '✅ Confirmado',
            failed: '❌ Falhado',
            refunded: '↩️ Reembolsado'
        }[s] || s;
    }

    _typeLabel(t) {
        return {
            trabalho: '📚 Trabalho',
            cv: '📋 CV',
            carta: '✉️ Carta',
            orcamento: '🏗️ Orçamento',
            impressao: '🖨️ Impressão',
            foto: '📷 Foto',
            conversao: '🔄 Conversão'
        }[t] || (t || '—');
    }

    async _getAdminToken() {
        const { data } = await this.supabase.auth.getSession();
        return data?.session?.access_token || null;
    }

    async loadAuditLog() {
        const container = document.getElementById('auditLogList');

        if (!container) {
            return;
        }

        container.innerHTML = '<div style="color:#94a3b8;font-size:.8rem;">A carregar…</div>';

        try {
            const token = await this._getAdminToken();

            const res = await fetch('/api/admin/audit-log?limit=30', {
                headers: {
                    Authorization: 'Bearer ' + token
                }
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Erro');
            }

            const logs = data.logs || [];

            if (!logs.length) {
                container.innerHTML = '<div style="color:#94a3b8;font-size:.8rem;">Nenhuma acção registada ainda.</div>';
                return;
            }

            container.innerHTML = logs.map(l => {
                const date = new Date(l.created_at).toLocaleString('pt-MZ', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const actionIcons = {
                    update_settings: '⚙️',
                    approve_payment: '✅',
                    reject_payment: '❌',
                    delete_user: '🗑️',
                    block_user: '🔒',
                    unblock_user: '🔓',
                    add_credits: '➕',
                    edit_credits: '✏️',
                    update_pricing: '💰'
                };

                const icon = actionIcons[l.action] || '📋';

                return (
                    '<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;display:flex;gap:8px;align-items:flex-start;">'
                    + '<span style="font-size:14px;">' + icon + '</span>'
                    + '<div>'
                    + '<div style="font-weight:600;font-size:.78rem;">' + (l.action || '—').replace(/_/g, ' ') + '</div>'
                    + '<div style="color:#94a3b8;font-size:.72rem;">' + date + (l.target_type ? ' · ' + l.target_type : '') + '</div>'
                    + '</div>'
                    + '</div>'
                );
            }).join('');

        } catch (err) {
            container.innerHTML = '<div style="color:#ef4444;font-size:.8rem;">⚠️ ' + err.message + '</div>';
        }
    }
}

window.adminApp = new AdminApp();
