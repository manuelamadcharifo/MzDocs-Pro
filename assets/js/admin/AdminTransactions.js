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
                    user_profile:profiles!transactions_user_id_fkey(full_name, email, phone)
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
            const profile = t.user_profile || {};
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
                            <button class="btn-confirm"
                                data-tx-id="${t.id}"
                                data-user-id="${t.user_id || ''}"
                                data-credits="${t.credits}"
                                data-pkg="${t.package_id}"
                                data-ref="${t.reference_id || ''}"
                                style="padding:6px 14px;background:${t.package_id === 'avulso' ? '#8b5cf6' : '#10b981'};color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                                ${t.package_id === 'avulso' ? '🎫 Criar Conta' : '✅ Confirmar'}
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
                    parseInt(btn.dataset.credits),
                    btn.dataset.pkg,
                    btn.dataset.ref
                );
            });
        });
    }

    confirmPayment(transactionId, userId, credits, packageId, referenceId) {
        this.selected = { id: transactionId, userId, credits, packageId, referenceId };
        const isAvulso = packageId === 'avulso';

        const modal = document.getElementById('confirmModal');
        const text  = document.getElementById('confirmText');
        if (modal && text) {
            text.innerHTML = isAvulso
                ? `<p>Confirma o pagamento avulso <strong>${referenceId || transactionId.slice(0,8)}</strong>?</p>
                   <p>Será criada uma <strong>conta temporária</strong> com <strong>${credits} créditos</strong>.</p>
                   <p style="font-size:12px;color:#64748b;margin-top:8px;">
                     ⚠️ A conta é eliminada automaticamente quando os créditos acabarem.<br>
                     As credenciais serão enviadas via WhatsApp ao cliente.
                   </p>`
                : `<p>Confirma o pagamento da transação <strong>${transactionId.slice(0,8)}</strong>?</p>
                   <p>Serão adicionados <strong>${credits} créditos</strong> ao utilizador.</p>`;
            modal.style.display = 'flex';
        }
    }

    async _confirmSelected() {
        if (!this.selected) return;
        const { id, userId, credits, packageId, referenceId } = this.selected;

        try {
            // ── Avulso: criar conta temporária ───────────────────────────
            if (packageId === 'avulso') {
                const token = authManager.getToken();
                const resp  = await fetch('/api/admin/confirm-avulso', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body:    JSON.stringify({ transactionId: id, referenceId }),
                });
                const result = await resp.json();
                if (!resp.ok) throw new Error(result.error || 'Erro ao confirmar avulso');

                document.getElementById('confirmModal').style.display = 'none';
                this.selected = null;
                await this.load();

                // Mostrar credenciais ao admin + botão para abrir WhatsApp
                this._showTempCredentials(result);
                return;
            }

            // ── Pacotes normais (starter/basico/pro) ─────────────────────
            // CORRIGIDO: usar /api/admin/confirm-payment em vez do Supabase client anon
            // (o endpoint usa service role key + chama process_affiliate_commission)
            const token = authManager.getToken();
            const resp = await fetch('/api/admin/confirm-payment', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body:    JSON.stringify({ transactionId: id, userId, credits }),
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Erro ao confirmar pagamento');

            document.getElementById('confirmModal').style.display = 'none';
            this.selected = null;
            await this.load();

            const notif = document.createElement('div');
            notif.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 20px;background:#10b981;color:#fff;border-radius:12px;font-weight:700;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
            notif.textContent = `✅ ${result.newCredits || credits} créditos adicionados!`;
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 3000);

        } catch (err) {
            console.error('[AdminTransactions] Erro ao confirmar:', err);
            alert('❌ Erro ao confirmar pagamento: ' + err.message);
        }
    }

    _showTempCredentials(result) {
        // Painel com as credenciais temporárias para o admin copiar/enviar
        const panel = document.createElement('div');
        panel.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:#fff;border-radius:16px;padding:28px 32px;
            box-shadow:0 20px 60px rgba(0,0,0,.25);z-index:9999;
            max-width:420px;width:90%;font-family:inherit;
        `;
        panel.innerHTML = `
            <div style="font-size:20px;font-weight:800;color:#065f46;margin-bottom:4px;">✅ Conta Temporária Criada</div>
            <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Envie estas credenciais ao cliente</div>

            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
                <div style="font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.5px;margin-bottom:6px;">CREDENCIAIS DE ACESSO</div>
                <div style="font-size:13px;margin-bottom:4px;">📧 <strong>Email:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${result.tempEmail}</code></div>
                <div style="font-size:13px;margin-bottom:4px;">🔐 <strong>Password:</strong> <code style="background:#fef9c3;padding:2px 6px;border-radius:4px;font-size:15px;font-weight:700;">${result.tempPass}</code></div>
                <div style="font-size:13px;">⚡ <strong>Créditos:</strong> ${result.credits}</div>
            </div>

            <div style="font-size:12px;color:#f59e0b;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:18px;">
                ⚠️ A conta é eliminada automaticamente quando os créditos acabarem.
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                ${result.waLink ? `
                <a href="${result.waLink}" target="_blank"
                   style="flex:1;min-width:140px;padding:10px 16px;background:#25D366;color:#fff;border-radius:10px;
                          font-weight:700;font-size:13px;text-align:center;text-decoration:none;display:block;">
                    📱 Enviar pelo WhatsApp
                </a>` : ''}
                <button onclick="
                    navigator.clipboard?.writeText('Email: ${result.tempEmail}\nPassword: ${result.tempPass}');
                    this.textContent='✅ Copiado!';setTimeout(()=>this.textContent='📋 Copiar',2000);
                " style="flex:1;min-width:100px;padding:10px 16px;background:#f1f5f9;border:none;border-radius:10px;
                         font-weight:700;font-size:13px;cursor:pointer;">
                    📋 Copiar
                </button>
                <button onclick="this.closest('div[style*=fixed]').remove()"
                    style="flex:1;min-width:80px;padding:10px 16px;background:#e2e8f0;border:none;border-radius:10px;
                           font-weight:700;font-size:13px;cursor:pointer;">
                    Fechar
                </button>
            </div>
        `;

        // Overlay de fundo
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;';
        overlay.addEventListener('click', () => { overlay.remove(); panel.remove(); });
        document.body.appendChild(overlay);
        document.body.appendChild(panel);
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
            avulso:  '🎫 Avulso (temp)',
            starter: 'Starter',
            basico:  'Básico',
            pro:     'Pro',
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
