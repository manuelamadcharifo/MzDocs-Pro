// models/Payment.js — Payment validation and processing
import { Storage } from '../utils/Storage.js';
import { PUBLIC_CONFIG } from '../../config/public.js';

export class Payment {
  constructor(data = {}) {
    this.userId = Storage.getUserId();
    this.nome = data.nome || '';
    this.telefone = data.telefone || '';
    this.referencia_transacao = data.referencia_transacao || '';
    this.montante = data.montante || 0;
    this.pacote = data.pacote || null;
    this.status = 'pending';
    this.errors = [];
  }

  /**
   * Validate all payment fields
   * @returns {boolean} true if valid, false otherwise
   */
  validate() {
    this.errors = [];

    // Validate name
    if (!this.nome || this.nome.trim().length < 2) {
      this.errors.push('Nome deve ter pelo menos 2 caracteres');
    }

    // Validate phone (Mozambican format: 84 or 85)
    if (!this._validatePhone(this.telefone)) {
      this.errors.push('Telefone deve ser 84XXXXXX ou 85XXXXXX');
    }

    // Validate reference
    if (!this._validateReference(this.referencia_transacao)) {
      this.errors.push('Referência de transação inválida ou duplicada');
    }

    // Validate amount
    if (!this._validateAmount(this.montante)) {
      this.errors.push('Montante deve ser um número válido (150, 350 ou 750 MZN)');
    }

    // Validate amount matches package
    const pkg = this.calcularValorPacote();
    if (!pkg) {
      this.errors.push('Montante não corresponde a nenhum pacote disponível');
    } else {
      this.pacote = pkg.id;
    }

    return this.errors.length === 0;
  }

  /**
   * Validate Mozambican phone format (84/85 + 8 digits)
   * @param {string} phone
   * @returns {boolean}
   * @private
   */
  _validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;

    // Remove spaces and special chars
    const clean = phone.trim().replace(/[\s\-\(\)]/g, '');

    // Must be 84 or 85 followed by 8 digits
    const regex = /^(84|85)\d{8}$/;
    return regex.test(clean);
  }

  /**
   * Validate reference is present and not already used
   * @param {string} reference
   * @returns {boolean}
   * @private
   */
  _validateReference(reference) {
    if (!reference || reference.trim().length === 0) {
      return false;
    }

    // Check for minimum length (M-Pesa references are usually long)
    if (reference.trim().length < 5) {
      return false;
    }

    // Check if reference already exists in local storage
    const usedReferences = Storage.get('usedReferences', []);
    if (usedReferences.includes(reference.trim())) {
      return false;
    }

    return true;
  }

  /**
   * Validate amount is a valid number
   * @param {number|string} amount
   * @returns {boolean}
   * @private
   */
  _validateAmount(amount) {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      return false;
    }

    // Check if amount matches one of the packages
    const validAmounts = Object.values(PUBLIC_CONFIG.packages).map(pkg => pkg.amount);
    return validAmounts.includes(num);
  }

  /**
   * Calculate and return package info based on amount
   * Returns { id, label, amount, credits }
   * @returns {object|null}
   */
  calcularValorPacote() {
    const packages = PUBLIC_CONFIG.packages;

    for (const [key, pkg] of Object.entries(packages)) {
      if (pkg.amount === this.montante) {
        return {
          id: pkg.id,
          label: pkg.label,
          amount: pkg.amount,
          credits: pkg.credits
        };
      }
    }

    return null;
  }

  /**
   * Get package credits for current amount
   * @returns {number|null}
   */
  getCreditsForAmount() {
    const pkg = this.calcularValorPacote();
    return pkg ? pkg.credits : null;
  }

  /**
   * Add reference to used list (call after successful submission)
   */
  markReferenceAsUsed() {
    const usedReferences = Storage.get('usedReferences', []);
    if (!usedReferences.includes(this.referencia_transacao)) {
      usedReferences.push(this.referencia_transacao);
      Storage.set('usedReferences', usedReferences);
    }
  }

  /**
   * Prepare payment data for Supabase submission
   * @returns {object} Formatted for pagamentos_pendentes table
   */
  toSupabase() {
    if (!this.validate()) {
      throw new Error(`Validação falhou: ${this.errors.join(', ')}`);
    }

    return {
      user_id: this.userId,
      nome: this.nome.trim(),
      telefone: this.telefone.trim().replace(/[\s\-\(\)]/g, ''),
      referencia_transacao: this.referencia_transacao.trim(),
      montante: parseFloat(this.montante),
      pacote: this.pacote,
      status: this.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Get formatted phone number (without special chars)
   * @returns {string}
   */
  getFormattedPhone() {
    return this.telefone.trim().replace(/[\s\-\(\)]/g, '');
  }

  /**
   * Get first validation error
   * @returns {string|null}
   */
  getFirstError() {
    return this.errors.length > 0 ? this.errors[0] : null;
  }

  /**
   * Get all validation errors
   * @returns {string[]}
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Check if payment is valid
   * @returns {boolean}
   */
  isValid() {
    return this.errors.length === 0 && this.validate();
  }

  /**
   * Reset errors and state
   */
  reset() {
    this.nome = '';
    this.telefone = '';
    this.referencia_transacao = '';
    this.montante = 0;
    this.pacote = null;
    this.status = 'pending';
    this.errors = [];
  }

  /**
   * Create from form data (convenience method)
   * @static
   * @param {object} formData - { nome, telefone, referencia_transacao, montante }
   * @returns {Payment}
   */
  static fromFormData(formData) {
    return new Payment({
      nome: formData.nome || '',
      telefone: formData.telefone || '',
      referencia_transacao: formData.referencia_transacao || '',
      montante: parseFloat(formData.montante) || 0
    });
  }
}
