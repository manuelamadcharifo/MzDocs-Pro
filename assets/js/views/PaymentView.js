// views/PaymentView.js — Complete payment UI management
import { PUBLIC_CONFIG } from '../../config/public.js';

export const PaymentView = {
  /**
   * Render credit packages with pricing and benefits
   * @param {HTMLElement} container - Container to render packages in
   */
  renderPackages(container) {
    if (!container) return;

    const packages = PUBLIC_CONFIG.packages;
    container.innerHTML = Object.entries(packages).map(([key, pkg]) => {
      const isPopular = key === 'basico';
      return `
        <div class="pkg ${isPopular ? 'popular' : ''}" data-pkg="${pkg.id}">
          ${isPopular ? '<div class="pkg-badge">Popular</div>' : ''}
          <div class="pkg-name">${pkg.label}</div>
          <div class="pkg-price">MZN ${pkg.amount}</div>
          <div class="pkg-cr">${pkg.credits} créditos</div>
          <div class="pkg-per">MZN ${(pkg.amount / pkg.credits).toFixed(2)}/doc</div>
          <div class="pkg-select">Seleccionar</div>
        </div>
      `;
    }).join('');
  },

  /**
   * Show M-Pesa payment instructions
   * @param {string} phoneNumber - User's phone number for context
   * @param {number} amount - Amount in MZN
   * @param {string} reference - Transaction reference
   */
  showMPesaInstructions(phoneNumber, amount, reference) {
    const section = document.getElementById('mpesaSection');
    if (!section) return;

    const instructions = `
      <div class="mp-instructions">
        <div class="instr-item">
          <span class="instr-num">1</span>
          <div class="instr-text">
            <strong>Digite *118#</strong> no seu telefone M-Pesa
          </div>
        </div>
        <div class="instr-item">
          <span class="instr-num">2</span>
          <div class="instr-text">
            <strong>Seleccione "Enviar Dinheiro"</strong> na opção 1
          </div>
        </div>
        <div class="instr-item">
          <span class="instr-num">3</span>
          <div class="instr-text">
            <strong>Insira o número ${this._formatPhoneDisplay(phoneNumber)}</strong>
          </div>
        </div>
        <div class="instr-item">
          <span class="instr-num">4</span>
          <div class="instr-text">
            <strong>Insira o valor MZN ${amount}</strong>
          </div>
        </div>
        <div class="instr-item">
          <span class="instr-num">5</span>
          <div class="instr-text">
            <strong>Confirme e insira o PIN</strong>
          </div>
        </div>
      </div>
    `;

    // Inject instructions above the payment summary
    const summary = document.getElementById('paySummary');
    if (summary && !summary.querySelector('.mp-instructions')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = instructions;
      summary.parentNode.insertBefore(wrapper.firstElementChild, summary);
    }
  },

  /**
   * Format phone number for display
   * @param {string} phone
   * @returns {string}
   * @private
   */
  _formatPhoneDisplay(phone) {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 9) {
      return `+258 ${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`;
    }
    return phone;
  },

  /**
   * Validate phone input and update UI feedback
   * @param {string} phone
   * @returns {boolean} Valid or not
   */
  validatePhone(phone) {
    const clean = phone.replace(/\D/g, '');
    const isValid = /^(84|85)\d{8}$/.test(clean);

    const input = document.getElementById('phoneInput');
    const btn = document.getElementById('btnPay');

    if (input) {
      input.classList.toggle('error', !isValid && phone.length > 0);
      input.classList.toggle('valid', isValid);
    }

    if (btn) {
      btn.disabled = !isValid;
    }

    // Show inline error
    if (!isValid && phone.length > 3) {
      this.showPhoneError('Formato inválido. Use 84/85 + 8 dígitos');
    } else {
      this.clearPhoneError();
    }

    return isValid;
  },

  /**
   * Show phone validation error
   * @param {string} message
   */
  showPhoneError(message) {
    let errorEl = document.getElementById('phoneError');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'phoneError';
      errorEl.className = 'field-error';
      const phoneWrap = document.querySelector('.phone-wrap');
      phoneWrap?.parentNode.insertBefore(errorEl, phoneWrap.nextSibling);
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  },

  /**
   * Clear phone validation error
   */
  clearPhoneError() {
    const errorEl = document.getElementById('phoneError');
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  },

  /**
   * Update payment summary display
   * @param {string} packageLabel - e.g. "Básico"
   * @param {number} amount - e.g. 350
   * @param {number} credits - e.g. 25
   */
  updatePaymentSummary(packageLabel, amount, credits) {
    const summary = document.getElementById('paySummary');
    if (!summary) return;

    summary.innerHTML = `
      <div class="pay-summary-detail">
        <div class="pay-item">
          <span>Pacote</span>
          <strong>${packageLabel}</strong>
        </div>
        <div class="pay-item">
          <span>Valor</span>
          <strong>MZN ${amount}</strong>
        </div>
        <div class="pay-item">
          <span>Créditos</span>
          <strong>${credits} × ⚡</strong>
        </div>
      </div>
    `;
  },

  /**
   * Show loading state during payment processing
   */
  showPaymentLoading() {
    const btn = document.getElementById('btnPay');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> A processar…';
    }

    const section = document.getElementById('mpesaSection');
    if (section) {
      const inputs = section.querySelectorAll('input');
      inputs.forEach(i => i.disabled = true);
    }
  },

  /**
   * Hide loading state
   */
  hidePaymentLoading() {
    const btn = document.getElementById('btnPay');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Confirmar Pagamento';
    }

    const section = document.getElementById('mpesaSection');
    if (section) {
      const inputs = section.querySelectorAll('input');
      inputs.forEach(i => i.disabled = false);
    }
  },

  /**
   * Show success message with details
   * @param {string} packageName
   * @param {number} credits
   */
  showPaymentSuccess(packageName, credits) {
    const msg = `✅ ${packageName} activado! +${credits} créditos adicionados.`;
    window.dispatchEvent(new CustomEvent('showNotification', {
      detail: { message: msg, type: 'success' }
    }));
  },

  /**
   * Show error message
   * @param {string} message
   */
  showPaymentError(message) {
    const msg = `❌ Erro: ${message}`;
    window.dispatchEvent(new CustomEvent('showNotification', {
      detail: { message: msg, type: 'error' }
    }));
  },

  /**
   * Render payment history table
   * @param {HTMLElement} container - Container for history
   * @param {array} payments - Array of payment records
   */
  renderPaymentHistory(container, payments = []) {
    if (!container) return;

    if (payments.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div>📋 Histórico vazio</div>
          <p>Nenhum pagamento realizado ainda</p>
        </div>
      `;
      return;
    }

    const html = `
      <div class="payment-history">
        <div class="hist-header">
          <div class="hist-col">Data</div>
          <div class="hist-col">Referência</div>
          <div class="hist-col">Valor</div>
          <div class="hist-col">Status</div>
        </div>
        ${payments.map((p, i) => this._renderPaymentRow(p, i)).join('')}
      </div>
    `;
    container.innerHTML = html;
  },

  /**
   * Render single payment row
   * @param {object} payment
   * @param {number} index
   * @returns {string}
   * @private
   */
  _renderPaymentRow(payment, index) {
    const date = new Date(payment.created_at).toLocaleDateString('pt-MZ');
    const status = payment.status === 'approved' ? '✅ Aprovado' :
                   payment.status === 'pending' ? '⏳ Pendente' :
                   '❌ Rejeitado';
    const statusClass = payment.status.toLowerCase();

    return `
      <div class="hist-row" data-payment-id="${payment.id}">
        <div class="hist-col">${date}</div>
        <div class="hist-col code">${payment.referencia_transacao.slice(0, 12)}…</div>
        <div class="hist-col">MZN ${payment.montante}</div>
        <div class="hist-col"><span class="status ${statusClass}">${status}</span></div>
      </div>
    `;
  },

  /**
   * Show inline field validation feedback
   * @param {string} fieldId
   * @param {boolean} isValid
   * @param {string} errorMessage
   */
  showFieldValidation(fieldId, isValid, errorMessage = '') {
    const field = document.getElementById(fieldId);
    if (!field) return;

    if (isValid) {
      field.classList.remove('error');
      field.classList.add('valid');
      const errorEl = field.querySelector('.field-error');
      if (errorEl) errorEl.remove();
    } else {
      field.classList.remove('valid');
      field.classList.add('error');

      let errorEl = field.querySelector('.field-error');
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'field-error';
        field.parentNode.appendChild(errorEl);
      }
      errorEl.textContent = errorMessage;
    }
  },

  /**
   * Display M-Pesa environment info (sandbox vs production)
   * @param {string} environment - 'sandbox' or 'production'
   */
  showMPesaEnvironment(environment) {
    const label = document.getElementById('mpEnvLabel');
    if (!label) return;

    if (environment === 'sandbox') {
      label.innerHTML = '<em style="color:#FF9800">🧪 Modo teste — dados não reais</em>';
      label.style.fontSize = '0.85em';
    } else {
      label.innerHTML = '<em style="color:#4CAF50">✓ Modo produção</em>';
    }
  },

  /**
   * Clear payment form
   */
  clearPaymentForm() {
    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) phoneInput.value = '';

    const pkgs = document.querySelectorAll('.pkg');
    pkgs.forEach(p => p.classList.remove('sel'));

    this.clearPhoneError();
  },

  /**
   * Get selected package details
   * @returns {object|null}
   */
  getSelectedPackage() {
    const selected = document.querySelector('.pkg.sel');
    if (!selected) return null;

    const pkgId = selected.dataset.pkg;
    return PUBLIC_CONFIG.packages[pkgId] || null;
  },

  /**
   * Highlight package selection
   * @param {string} packageId
   */
  selectPackage(packageId) {
    document.querySelectorAll('.pkg').forEach(p => p.classList.remove('sel'));
    const pkg = document.querySelector(`.pkg[data-pkg="${packageId}"]`);
    if (pkg) pkg.classList.add('sel');
  },

  /**
   * Show payment details modal/section
   * @param {string} packageId
   * @param {string} phoneNumber
   */
  showPaymentDetails(packageId, phoneNumber) {
    const pkg = PUBLIC_CONFIG.packages[packageId];
    if (!pkg) return;

    this.selectPackage(packageId);
    this.updatePaymentSummary(pkg.label, pkg.amount, pkg.credits);
    this.showMPesaInstructions(phoneNumber, pkg.amount, 'TXN_' + Date.now());

    const section = document.getElementById('mpesaSection');
    if (section) section.style.display = 'flex';
  },

  /**
   * Hide payment details
   */
  hidePaymentDetails() {
    const section = document.getElementById('mpesaSection');
    if (section) section.style.display = 'none';
  },

  /**
   * Render credit balance display
   * @param {number} balance
   * @param {HTMLElement} container
   */
  renderCreditBalance(balance, container) {
    if (!container) return;

    let statusClass = 'low';
    let statusText = 'Baixo';

    if (balance >= 50) {
      statusClass = 'high';
      statusText = 'Abundante';
    } else if (balance >= 10) {
      statusClass = 'medium';
      statusText = 'Adequado';
    }

    container.innerHTML = `
      <div class="credit-balance ${statusClass}">
        <div class="balance-value">⚡ ${balance}</div>
        <div class="balance-status">${statusText}</div>
        ${balance <= 3 ? '<div class="balance-warning">⚠️ Compre créditos em breve</div>' : ''}
      </div>
    `;
  },

  /**
   * Show toast notification
   * @param {string} message
   * @param {string} type - 'success', 'error', 'info', 'warn'
   * @param {number} duration - milliseconds
   */
  showToast(message, type = 'info', duration = 3500) {
    const stack = document.getElementById('notifStack');
    if (!stack) return;

    const toast = document.createElement('div');
    toast.className = `notif ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Disable/enable payment UI
   * @param {boolean} disabled
   */
  setPaymentUIDisabled(disabled) {
    const pkgs = document.querySelectorAll('.pkg');
    const phoneInput = document.getElementById('phoneInput');
    const btnPay = document.getElementById('btnPay');

    pkgs.forEach(p => p.style.pointerEvents = disabled ? 'none' : '');
    if (phoneInput) phoneInput.disabled = disabled;
    if (btnPay) btnPay.disabled = disabled;
  },

  /**
   * Animate credit addition
   * @param {number} addedCredits
   */
  animateCreditsAddition(addedCredits) {
    const pill = document.getElementById('creditPill');
    if (!pill) return;

    const label = document.createElement('span');
    label.textContent = `+${addedCredits}`;
    label.style.cssText = `
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      color: #4CAF50;
      font-weight: 700;
      font-size: 18px;
      animation: float-up 1.5s ease-out forwards;
    `;
    pill.appendChild(label);

    setTimeout(() => label.remove(), 1500);
  },

  /**
   * Focus phone input
   */
  focusPhoneInput() {
    const input = document.getElementById('phoneInput');
    if (input) input.focus();
  },

  /**
   * Get rendered payment history HTML as string
   * @returns {string}
   */
  exportPaymentHistory() {
    const container = document.querySelector('.payment-history');
    if (!container) return '';
    return container.outerHTML;
  },
};
