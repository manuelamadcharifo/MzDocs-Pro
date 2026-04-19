// controllers/PaymentController.js — Payment processing with Supabase integration
import { Payment } from '../models/Payment.js';
import { supabaseConfig } from '../config/supabase.js';
import { Storage } from '../utils/Storage.js';
import { NotificationView } from '../views/Views.js';
import { PUBLIC_CONFIG } from '../../config/public.js';

export class PaymentController {
  constructor() {
    this.supabase = null;
    this.userId = Storage.getUserId();
    this.currentPayment = null;
    this.paymentHistory = [];
    this.creditsBalance = 0;
    this._init();
  }

  /**
   * Initialize Supabase client
   * @private
   */
  async _init() {
    try {
      this.supabase = await supabaseConfig.getInstance();
      if (this.supabase) {
        await this.refreshCreditsBalance();
        await this.fetchPaymentHistory();
      }
    } catch (error) {
      console.error('[PaymentController] Init failed:', error.message);
    }
  }

  /**
   * Submit a payment for processing
   * @param {object} paymentData - { nome, telefone, referencia_transacao, montante }
   * @returns {Promise<{success: boolean, paymentId: string|null, error: string|null}>}
   */
  async submitPayment(paymentData) {
    try {
      // Validate payment
      const payment = new Payment(paymentData);
      if (!payment.validate()) {
        const error = payment.getFirstError();
        return { success: false, paymentId: null, error };
      }

      // Check for duplicate reference
      if (this._isReferenceDuplicate(payment.referencia_transacao)) {
        return {
          success: false,
          paymentId: null,
          error: 'Referência de transação já foi submetida'
        };
      }

      // Ensure we have Supabase connection
      if (!this.supabase) {
        return {
          success: false,
          paymentId: null,
          error: 'Sem conexão com servidor. Tente novamente.'
        };
      }

      // Submit to database
      const paymentRecord = payment.toSupabase();
      const { data, error } = await this.supabase
        .from('pagamentos_pendentes')
        .insert([paymentRecord])
        .select()
        .single();

      if (error) {
        console.error('[PaymentController] Submit error:', error);
        return {
          success: false,
          paymentId: null,
          error: 'Erro ao submeter pagamento. Tente novamente.'
        };
      }

      // Mark reference as used locally
      payment.markReferenceAsUsed();
      this.currentPayment = payment;
      this.paymentHistory.unshift(data);

      return {
        success: true,
        paymentId: data.id,
        error: null
      };
    } catch (error) {
      console.error('[PaymentController] Submit exception:', error);
      return {
        success: false,
        paymentId: null,
        error: 'Erro desconhecido. Contacte o suporte.'
      };
    }
  }

  /**
   * Check if reference already exists (locally or in history)
   * @param {string} reference
   * @returns {boolean}
   * @private
   */
  _isReferenceDuplicate(reference) {
    // Check local storage
    const usedReferences = Storage.get('usedReferences', []);
    if (usedReferences.includes(reference)) {
      return true;
    }

    // Check payment history
    const isDuplicate = this.paymentHistory.some(
      p => p.referencia_transacao === reference && p.user_id === this.userId
    );

    return isDuplicate;
  }

  /**
   * Fetch user's payment history from Supabase
   * @returns {Promise<void>}
   */
  async fetchPaymentHistory() {
    try {
      if (!this.supabase) {
        console.warn('[PaymentController] Supabase not initialized');
        return;
      }

      const { data, error } = await this.supabase
        .from('pagamentos_pendentes')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[PaymentController] Fetch history error:', error);
        return;
      }

      this.paymentHistory = data || [];
      console.log('[PaymentController] History loaded:', this.paymentHistory.length, 'payments');
    } catch (error) {
      console.error('[PaymentController] Fetch history exception:', error);
    }
  }

  /**
   * Get user's payment history
   * @returns {array} Payment records
   */
  getPaymentHistory() {
    return [...this.paymentHistory];
  }

  /**
   * Get pending payments only
   * @returns {array} Pending payment records
   */
  getPendingPayments() {
    return this.paymentHistory.filter(p => p.status === 'pending');
  }

  /**
   * Get approved payments only
   * @returns {array} Approved payment records
   */
  getApprovedPayments() {
    return this.paymentHistory.filter(p => p.status === 'approved');
  }

  /**
   * Refresh credits balance from Supabase
   * @returns {Promise<number>} Current credits balance
   */
  async refreshCreditsBalance() {
    try {
      if (!this.supabase) {
        console.warn('[PaymentController] Supabase not initialized');
        return this.creditsBalance;
      }

      const { data, error } = await this.supabase
        .from('perfis_usuarios')
        .select('creditos')
        .eq('id', this.userId)
        .single();

      if (error) {
        console.error('[PaymentController] Fetch credits error:', error);
        return this.creditsBalance;
      }

      this.creditsBalance = data?.creditos || 0;
      console.log('[PaymentController] Credits refreshed:', this.creditsBalance);

      // Emit event for UI update
      window.dispatchEvent(new CustomEvent('creditsBalanceUpdated', {
        detail: { credits: this.creditsBalance }
      }));

      return this.creditsBalance;
    } catch (error) {
      console.error('[PaymentController] Fetch credits exception:', error);
      return this.creditsBalance;
    }
  }

  /**
   * Get current credits balance
   * @returns {Promise<number>}
   */
  async getCreditsBalance() {
    return await this.refreshCreditsBalance();
  }

  /**
   * Consume credits via Supabase RPC (atomic operation)
   * @param {number} amount - Number of credits to consume
   * @returns {Promise<{success: boolean, remaining: number|null, error: string|null}>}
   */
  async consumeCredits(amount = 1) {
    try {
      // Validate input
      if (typeof amount !== 'number' || amount <= 0) {
        return {
          success: false,
          remaining: this.creditsBalance,
          error: 'Quantidade de créditos inválida'
        };
      }

      // Check balance
      if (this.creditsBalance < amount) {
        return {
          success: false,
          remaining: this.creditsBalance,
          error: 'Créditos insuficientes'
        };
      }

      // Ensure Supabase is available
      if (!this.supabase) {
        return {
          success: false,
          remaining: this.creditsBalance,
          error: 'Sem conexão com servidor'
        };
      }

      // Call RPC function for atomic credit deduction
      const { data, error } = await this.supabase.rpc('consumir_creditos', {
        user_id: this.userId,
        amount: amount
      });

      if (error) {
        console.error('[PaymentController] Consume credits error:', error);
        return {
          success: false,
          remaining: this.creditsBalance,
          error: 'Erro ao descontar créditos. Tente novamente.'
        };
      }

      // Update local balance
      this.creditsBalance = data || 0;

      // Emit event
      window.dispatchEvent(new CustomEvent('creditsConsumed', {
        detail: { amount, remaining: this.creditsBalance }
      }));

      return {
        success: true,
        remaining: this.creditsBalance,
        error: null
      };
    } catch (error) {
      console.error('[PaymentController] Consume credits exception:', error);
      return {
        success: false,
        remaining: this.creditsBalance,
        error: 'Erro ao processar. Contacte o suporte.'
      };
    }
  }

  /**
   * Add credits (usually after admin approval)
   * @param {number} amount
   * @returns {Promise<{success: boolean, newBalance: number|null, error: string|null}>}
   */
  async addCredits(amount) {
    try {
      if (typeof amount !== 'number' || amount <= 0) {
        return {
          success: false,
          newBalance: this.creditsBalance,
          error: 'Quantidade inválida'
        };
      }

      if (!this.supabase) {
        return {
          success: false,
          newBalance: this.creditsBalance,
          error: 'Sem conexão'
        };
      }

      const newBalance = this.creditsBalance + amount;
      const { error } = await this.supabase
        .from('perfis_usuarios')
        .update({ creditos: newBalance })
        .eq('id', this.userId);

      if (error) {
        console.error('[PaymentController] Add credits error:', error);
        return {
          success: false,
          newBalance: this.creditsBalance,
          error: 'Erro ao adicionar créditos'
        };
      }

      this.creditsBalance = newBalance;

      window.dispatchEvent(new CustomEvent('creditsAdded', {
        detail: { amount, newBalance }
      }));

      return {
        success: true,
        newBalance,
        error: null
      };
    } catch (error) {
      console.error('[PaymentController] Add credits exception:', error);
      return {
        success: false,
        newBalance: this.creditsBalance,
        error: 'Erro desconhecido'
      };
    }
  }

  /**
   * Get package information
   * @param {string} packageId - 'starter', 'basico', or 'pro'
   * @returns {object|null}
   */
  getPackageInfo(packageId) {
    return PUBLIC_CONFIG.packages[packageId] || null;
  }

  /**
   * Get all available packages
   * @returns {object} All packages with metadata
   */
  getAllPackages() {
    return PUBLIC_CONFIG.packages;
  }

  /**
   * Format currency for display
   * @param {number} amount
   * @returns {string}
   */
  formatCurrency(amount) {
    return `MZN ${parseFloat(amount).toFixed(2)}`;
  }

  /**
   * Check if payment is pending approval
   * @param {string} paymentId
   * @returns {boolean}
   */
  isPaymentPending(paymentId) {
    return this.paymentHistory.some(p => p.id === paymentId && p.status === 'pending');
  }

  /**
   * Get payment by ID
   * @param {string} paymentId
   * @returns {object|null}
   */
  getPaymentById(paymentId) {
    return this.paymentHistory.find(p => p.id === paymentId) || null;
  }

  /**
   * Clear payment history cache
   */
  clearHistory() {
    this.paymentHistory = [];
  }

  /**
   * Destroy controller and cleanup
   */
  destroy() {
    this.currentPayment = null;
    this.paymentHistory = [];
  }
}
