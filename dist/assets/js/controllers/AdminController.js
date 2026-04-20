// controllers/AdminController.js — Admin panel for payment management
import { supabaseConfig } from '../config/supabase.js';
import { Storage } from '../utils/Storage.js';
import { NotificationView } from '../views/Views.js';

export class AdminController {
  constructor() {
    this.supabase = null;
    this.userId = Storage.getUserId();
    this.isAdmin = false;
    this.pendingPayments = [];
    this.allPayments = [];
    this._init();
  }

  /**
   * Initialize admin controller and verify permissions
   * @private
   */
  async _init() {
    try {
      this.supabase = await supabaseConfig.getInstance();
      if (this.supabase) {
        await this._checkAdminStatus();
        if (this.isAdmin) {
          await this.fetchPendingPayments();
          await this.fetchAllPayments();
        }
      }
    } catch (error) {
      console.error('[AdminController] Init failed:', error.message);
    }
  }

  /**
   * Check if current user is admin by inspecting JWT claims
   * @private
   * @returns {Promise<boolean>}
   */
  async _checkAdminStatus() {
    try {
      const session = supabaseConfig.getSession();
      if (!session || !session.user) {
        this.isAdmin = false;
        return false;
      }

      // Decode JWT to get role claim
      const token = session.access_token;
      const payloadBase64 = token.split('.')[1];
      const payloadStr = atob(payloadBase64);
      const payload = JSON.parse(payloadStr);

      // Check for admin role in JWT
      const role = payload.user_role || payload.role;
      this.isAdmin = role === 'admin' || payload.is_admin === true;

      console.log('[AdminController] Admin status:', this.isAdmin, 'Role:', role);

      // Emit event for UI reactivity
      if (this.isAdmin) {
        window.dispatchEvent(new CustomEvent('admin-verified', {
          detail: { userId: this.userId, role: role }
        }));
      }

      return this.isAdmin;
    } catch (error) {
      console.error('[AdminController] Admin check failed:', error.message);
      this.isAdmin = false;
      return false;
    }
  }

  /**
   * Verify admin status (must be called before admin operations)
   * @returns {boolean} True if user is admin
   */
  verifyAdmin() {
    if (!this.isAdmin) {
      console.warn('[AdminController] Unauthorized: user is not admin');
    }
    return this.isAdmin;
  }

  /**
   * Fetch all pending payments (admin only)
   * @returns {Promise<array>} Pending payments
   */
  async fetchPendingPayments() {
    try {
      if (!this.verifyAdmin()) {
        return [];
      }

      if (!this.supabase) {
        console.warn('[AdminController] Supabase not initialized');
        return this.pendingPayments;
      }

      const { data, error } = await this.supabase
        .from('pagamentos_pendentes')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AdminController] Fetch pending error:', error);
        return this.pendingPayments;
      }

      this.pendingPayments = data || [];
      console.log('[AdminController] Pending payments loaded:', this.pendingPayments.length);

      // Emit event
      window.dispatchEvent(new CustomEvent('pendingPaymentsUpdated', {
        detail: { payments: this.pendingPayments }
      }));

      return this.pendingPayments;
    } catch (error) {
      console.error('[AdminController] Fetch pending exception:', error);
      return this.pendingPayments;
    }
  }

  /**
   * Fetch all payments regardless of status (admin only)
   * @returns {Promise<array>} All payments
   */
  async fetchAllPayments() {
    try {
      if (!this.verifyAdmin()) {
        return [];
      }

      if (!this.supabase) {
        console.warn('[AdminController] Supabase not initialized');
        return this.allPayments;
      }

      const { data, error } = await this.supabase
        .from('pagamentos_pendentes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AdminController] Fetch all error:', error);
        return this.allPayments;
      }

      this.allPayments = data || [];
      console.log('[AdminController] All payments loaded:', this.allPayments.length);

      return this.allPayments;
    } catch (error) {
      console.error('[AdminController] Fetch all exception:', error);
      return this.allPayments;
    }
  }

  /**
   * Approve payment via RPC (admin only)
   * Triggers credit addition to user account automatically
   * @param {string} paymentId - Payment record ID
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async approvePayment(paymentId) {
    try {
      if (!this.verifyAdmin()) {
        return { success: false, error: 'Unauthorized: admin access required' };
      }

      if (!paymentId || typeof paymentId !== 'string') {
        return { success: false, error: 'Invalid payment ID' };
      }

      if (!this.supabase) {
        return { success: false, error: 'Sem conexão com servidor' };
      }

      // Verify payment exists and is pending
      const payment = this.pendingPayments.find(p => p.id === paymentId);
      if (!payment) {
        return { success: false, error: 'Pagamento não encontrado' };
      }

      if (payment.status !== 'pending') {
        return { success: false, error: `Pagamento já foi ${payment.status}` };
      }

      // Call RPC function (atomic operation)
      const { data, error } = await this.supabase.rpc('aprovar_pagamento_admin', {
        payment_id: paymentId
      });

      if (error) {
        console.error('[AdminController] Approve RPC error:', error);
        return { success: false, error: 'Erro ao aprovar pagamento' };
      }

      // Update local cache
      const index = this.pendingPayments.findIndex(p => p.id === paymentId);
      if (index >= 0) {
        this.pendingPayments[index].status = 'approved';
        this.pendingPayments.splice(index, 1); // Remove from pending
      }

      // Refresh both lists
      await this.fetchPendingPayments();
      await this.fetchAllPayments();

      // Emit success event
      window.dispatchEvent(new CustomEvent('paymentApproved', {
        detail: { paymentId, payment: payment }
      }));

      console.log('[AdminController] Payment approved:', paymentId);

      return { success: true, error: null };
    } catch (error) {
      console.error('[AdminController] Approve exception:', error);
      return { success: false, error: 'Erro desconhecido ao aprovar' };
    }
  }

  /**
   * Reject payment (admin only)
   * Marks payment as rejected
   * @param {string} paymentId - Payment record ID
   * @param {string} reason - Rejection reason (optional)
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async rejectPayment(paymentId, reason = '') {
    try {
      if (!this.verifyAdmin()) {
        return { success: false, error: 'Unauthorized: admin access required' };
      }

      if (!paymentId || typeof paymentId !== 'string') {
        return { success: false, error: 'Invalid payment ID' };
      }

      if (!this.supabase) {
        return { success: false, error: 'Sem conexão com servidor' };
      }

      // Verify payment exists and is pending
      const payment = this.pendingPayments.find(p => p.id === paymentId);
      if (!payment) {
        return { success: false, error: 'Pagamento não encontrado' };
      }

      if (payment.status !== 'pending') {
        return { success: false, error: `Pagamento já foi ${payment.status}` };
      }

      // Update payment status to rejected
      const { error } = await this.supabase
        .from('pagamentos_pendentes')
        .update({
          status: 'rejected',
          motivo_rejeicao: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId);

      if (error) {
        console.error('[AdminController] Reject error:', error);
        return { success: false, error: 'Erro ao rejeitar pagamento' };
      }

      // Update local cache
      const index = this.pendingPayments.findIndex(p => p.id === paymentId);
      if (index >= 0) {
        this.pendingPayments[index].status = 'rejected';
        this.pendingPayments[index].motivo_rejeicao = reason;
        this.pendingPayments.splice(index, 1); // Remove from pending
      }

      // Refresh lists
      await this.fetchPendingPayments();
      await this.fetchAllPayments();

      // Emit event
      window.dispatchEvent(new CustomEvent('paymentRejected', {
        detail: { paymentId, reason }
      }));

      console.log('[AdminController] Payment rejected:', paymentId);

      return { success: true, error: null };
    } catch (error) {
      console.error('[AdminController] Reject exception:', error);
      return { success: false, error: 'Erro desconhecido ao rejeitar' };
    }
  }

  /**
   * Get pending payments count
   * @returns {number}
   */
  getPendingCount() {
    return this.pendingPayments.length;
  }

  /**
   * Get all pending payments
   * @returns {array}
   */
  getPendingPayments() {
    return [...this.pendingPayments];
  }

  /**
   * Get all payments
   * @returns {array}
   */
  getAllPayments() {
    return [...this.allPayments];
  }

  /**
   * Get payment by ID
   * @param {string} paymentId
   * @returns {object|null}
   */
  getPaymentById(paymentId) {
    return this.allPayments.find(p => p.id === paymentId) || null;
  }

  /**
   * Get payments by status
   * @param {string} status - 'pending', 'approved', 'rejected'
   * @returns {array}
   */
  getPaymentsByStatus(status) {
    return this.allPayments.filter(p => p.status === status);
  }

  /**
   * Get payments by user ID (admin view of specific user)
   * @param {string} userId
   * @returns {array}
   */
  getPaymentsByUser(userId) {
    return this.allPayments.filter(p => p.user_id === userId);
  }

  /**
   * Search payments by reference or phone
   * @param {string} query - Search term (reference or phone number)
   * @returns {array}
   */
  searchPayments(query) {
    if (!query || typeof query !== 'string' || query.length < 2) {
      return [];
    }

    const search = query.toLowerCase().trim();
    return this.allPayments.filter(p =>
      p.referencia_transacao.toLowerCase().includes(search) ||
      p.telefone.includes(search) ||
      p.nome.toLowerCase().includes(search)
    );
  }

  /**
   * Get payment statistics
   * @returns {object} { pending: n, approved: n, rejected: n, totalAmount: n }
   */
  getStatistics() {
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      totalAmount: 0,
      totalApproved: 0,
      averageAmount: 0,
      dailyApprovals: {}
    };

    this.allPayments.forEach(p => {
      const status = p.status.toLowerCase();
      stats[status]++;
      stats.totalAmount += p.montante || 0;

      if (status === 'approved') {
        stats.totalApproved += p.montante || 0;
      }

      // Track daily approvals
      if (p.updated_at) {
        const date = new Date(p.updated_at).toLocaleDateString('pt-MZ');
        stats.dailyApprovals[date] = (stats.dailyApprovals[date] || 0) + 1;
      }
    });

    stats.averageAmount = stats.totalAmount > 0
      ? (stats.totalAmount / this.allPayments.length).toFixed(2)
      : 0;

    return stats;
  }

  /**
   * Manually add credits to user (admin override)
   * @param {string} userId
   * @param {number} amount
   * @param {string} reason
   * @returns {Promise<{success: boolean, newBalance: number|null, error: string|null}>}
   */
  async addCreditsToUser(userId, amount, reason = 'manual_admin') {
    try {
      if (!this.verifyAdmin()) {
        return { success: false, newBalance: null, error: 'Unauthorized' };
      }

      if (!userId || !amount || amount <= 0) {
        return { success: false, newBalance: null, error: 'Invalid input' };
      }

      if (!this.supabase) {
        return { success: false, newBalance: null, error: 'Sem conexão' };
      }

      // Get current balance
      const { data: user, error: fetchError } = await this.supabase
        .from('perfis_usuarios')
        .select('creditos')
        .eq('id', userId)
        .single();

      if (fetchError) {
        return { success: false, newBalance: null, error: 'Usuário não encontrado' };
      }

      const newBalance = (user.creditos || 0) + amount;

      // Update with new balance
      const { error: updateError } = await this.supabase
        .from('perfis_usuarios')
        .update({ creditos: newBalance })
        .eq('id', userId);

      if (updateError) {
        return { success: false, newBalance: null, error: 'Erro ao atualizar créditos' };
      }

      console.log('[AdminController] Credits added to', userId, 'amount:', amount);

      return { success: true, newBalance, error: null };
    } catch (error) {
      console.error('[AdminController] Add credits exception:', error);
      return { success: false, newBalance: null, error: 'Erro desconhecido' };
    }
  }

  /**
   * Export payments data as CSV string
   * @param {array} payments - Optional specific payments array
   * @returns {string} CSV content
   */
  exportAsCSV(payments = null) {
    const data = payments || this.allPayments;
    if (data.length === 0) return '';

    const headers = ['ID', 'Data', 'Utilizador', 'Telefone', 'Referência', 'Montante', 'Status'];
    const rows = data.map(p => [
      p.id.slice(0, 8),
      new Date(p.created_at).toLocaleDateString('pt-MZ'),
      p.nome,
      p.telefone,
      p.referencia_transacao,
      p.montante,
      p.status
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Clear admin session
   */
  destroy() {
    this.pendingPayments = [];
    this.allPayments = [];
    this.isAdmin = false;
  }
}
