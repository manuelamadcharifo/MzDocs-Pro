// assets/js/admin/AdminTransactions.js
// Gestão de transações do painel admin

import { authManager } from '../auth/AuthManager.js';

export class AdminTransactions {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.selected = null;
        this._bindModalEvents();
    }

    async load() {
        try {
            const filterStatus = document.getElementById('filterStatus')?.value || 'all';
            const filterDate = document.getElementById('filterDate')?.value;

            let query = this.supabase
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
                `)
                .order('created_at', { ascending: false });

            if (filterStatus !== 'all') {
                query = query.eq('status', filterStatus);
            }
            if (filterDate) {
                const dayStart = `${filterDate}T00:00:00.000Z`;
                const dayEnd = `${filterDate}T23:59:59.999Z`;
                query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
            }

            const { data, error } = await query.limit(100);

            if (error) throw error;

            this._renderTable(data || []);

        } catch (err) {
            console.error('[AdminTransactions] Erro:', err);
        }
    }

    _renderTable(transactions) {
        const tbody = document.getElementById('transactionsTable');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">
                        Nenhuma transação encontrada
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transactions.map(t => {
            const profile = t.profiles || {};
            const isPending = t.status === 'pending';
            const date = new Date(t.created_at).toLocaleDateString('pt-MZ');
            const time = new Date(t.created_at).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });

            return `
                <tr data-id="${t.id}" style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:12px;font-size:13px;">
                        <div style="font-weight:600;color:#1e293b;">${t.reference_id || t.id.slice(0, 8)}</div>
                        <div style="font-size:11px;color:#94a3b8;">${date} ${time}</div>
                    </td>
                    <td style="padding:12px;font-size:13px;">
                        <div style="font-weight:600;">${profile.full_name || 'Anónimo'}</div>
                        <div style="font-size:11px;color:#64748b;">${profile.email || profile.phone || '-'}</div>
                    </td>
                    <td style="padding:12px;font-size:13px;">
                        <span style="text-transform:capitalize;">${this._translateType(t.package_id)}</span>
                    </td>
                    <td style="padding:12px;font-size:13px;font-weight:700;color:#1e293b;">
                        MZN ${t.amount}
                    </td>
                    <td style="padding:12px;font-size:13px;">
                        ${t.credits} créd.
                    </td>
                    <td style="padding:12px;">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;${this._statusStyle(t.status)}">
                            ${this._translateStatus(t.status)}
                        </span>
                    </td>
                    <td style="padding:12px;font-size:12px;color:#64748b;">
                        ${t.payment_method === 'mpesa' ? '💳 M-Pesa' : '📱 Manual'}
                    </td>
                    <td style="padding:12px;">
                        ${isPending ? `
                            <button class="btn-confirm" data-tx-id="${t.id}" data-user-id="${t.user_id}" data-credits="${t.credits}"
                                style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                                ✅ Confirmar
                            </button>
                        ` : `<span style="font-size:12px;color:#94a3b8;">${t.confirmed_at ? new Date(t.confirmed_at).toLocaleDateString('pt-MZ') : '-'}</span>`}
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-confirm').forEach(btn => {
            btn.addEventListener('click', () => {
                this.confirmPayment(
                    btn.dataset.txId,
                    btn.dataset.userId,
                    parseInt(btn.dataset.credits)
                );
            });
        });
    }

    confirmPayment(transactionId, userId, credits) {
        this.selected = { id: transactionId, userId, credits };

        const modal = document.getElementById('confirmModal');
        const text = document.getElementById('confirmText');
        if (modal && text) {
            text.innerHTML = `
                <p>Confirma o pagamento da transação <strong>${transactionId.slice(0, 8)}</strong>?</p>
                <p>Serão adicionados <strong>${credits} créditos</strong> ao utilizador.</p>
            `;
            modal.style.display = 'flex';
        }
    }

    async _confirmSelected() {
        if (!this.selected) return;

        try {
            const { id, userId, credits } = this.selected;
            const adminId = authManager.user?.id;

            const { error: txErr } = await this.supabase
                .from('transactions')
                .update({
                    status: 'completed',
                    confirmed_by: adminId,
                    confirmed_at: new Date().toISOString()
                })
                .eq('id', id);

            if (txErr) throw txErr;

            const { data: newCredits, error: rpcErr } = await this.supabase
                .rpc('add_credits', { user_id: userId, amount: credits });

            if (rpcErr) throw rpcErr;

            document.getElementById('confirmModal').style.display = 'none';
            this.selected = null;
            await this.load();

            const notif = document.createElement('div');
            notif.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 20px;background:#10b981;color:#fff;border-radius:12px;font-weight:700;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
            notif.textContent = `✅ ${credits} créditos adicionados!`;
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 3000);

        } catch (err) {
            console.error('[AdminTransactions] Erro ao confirmar:', err);
            alert('❌ Erro ao confirmar pagamento: ' + err.message);
        }
    }

    _bindModalEvents() {
        document.getElementById('btnCancelConfirm')?.addEventListener('click', () => {
            document.getElementById('confirmModal').style.display = 'none';
            this.selected = null;
        });

        document.getElementById('btnConfirmPayment')?.addEventListener('click', () => {
            this._confirmSelected();
        });

        document.getElementById('confirmModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'confirmModal') {
                document.getElementById('confirmModal').style.display = 'none';
                this.selected = null;
            }
        });
    }

    _translateStatus(status) {
        const map = {
            pending: '⏳ Pendente',
            completed: '✅ Confirmado',
            failed: '❌ Falhado',
            refunded: '↩️ Reembolsado'
        };
        return map[status] || status;
    }

    _statusStyle(status) {
        const styles = {
            pending: 'background:#fef3c7;color:#92400e;',
            completed: 'background:#d1fae5;color:#065f46;',
            failed: 'background:#fee2e2;color:#991b1b;',
            refunded: 'background:#e0e7ff;color:#3730a3;'
        };
        return styles[status] || '';
    }

    _translateType(type) {
        const map = {
            starter: 'Starter',
            basico: 'Básico',
            pro: 'Pro',
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

export default AdminTransactions;