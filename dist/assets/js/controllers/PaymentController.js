// controllers/PaymentController.js — v4
import { Storage } from '../utils/Storage.js';
import { NotificationView, ModalView } from '../views/Views.js';
import { PUBLIC_CONFIG } from '../../config/public.js';

const PACKAGES = PUBLIC_CONFIG.packages;
const WA_NUMBER = '258858695506';

export class PaymentController {
  constructor() {
    this.userId         = Storage.getUserId();
    this.selectedPkg    = null;
    this.creditsBalance = 0;
    this._bindEvents();
  }

  _bindEvents() {
    // Fechar modal
    document.getElementById('payClose')?.addEventListener('click', () => {
      ModalView.close('payOverlay');
    });
    document.getElementById('payOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'payOverlay') ModalView.close('payOverlay');
    });

    // Selecção de plano
    document.querySelectorAll('.plan-card[data-pkg]').forEach(el => {
      el.addEventListener('click', () => this.selectPkg(el, el.dataset.pkg));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectPkg(el, el.dataset.pkg);
        }
      });
    });

    // Input telefone
    document.getElementById('phoneInput')?.addEventListener('input', e => {
      this.onPhoneInput(e.target);
    });

    // Botão pagar
    document.getElementById('btnPay')?.addEventListener('click', () => this.pay());
  }

  showPricing() {
    ModalView.open('payOverlay');
    // Pré-seleccionar plano popular
    const popular = document.querySelector('.plan-card.plan-popular');
    if (popular && !this.selectedPkg) {
      setTimeout(() => this.selectPkg(popular, popular.dataset.pkg), 100);
    }
  }

  selectPkg(el, pkgId) {
    const pkg = PACKAGES[pkgId];
    if (!pkg) return;

    this.selectedPkg = pkg;

    // Highlight visual
    document.querySelectorAll('.plan-card').forEach(p => p.classList.remove('sel'));
    el.classList.add('sel');
    el.setAttribute('aria-checked', 'true');

    // Mostrar secção M-Pesa
    const mpSection = document.getElementById('mpesaSection');
    if (mpSection) mpSection.style.display = 'flex';

    // Ambiente
    const mpEnvLabel = document.getElementById('mpEnvLabel');
    const env = process?.env?.MPESA_ENV === 'sandbox' ? 'Ambiente de teste' : '';
    if (mpEnvLabel) mpEnvLabel.textContent = env;

    // Resumo
    const paySummary = document.getElementById('paySummary');
    if (paySummary) {
      paySummary.innerHTML = `
        <span>${pkg.label} — ${pkg.credits} créditos</span>
        <strong>MZN ${pkg.amount}</strong>`;
    }

    // Reset e validar
    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) {
      phoneInput.value = '';
      this.onPhoneInput(phoneInput);
    }

    // Focar input
    setTimeout(() => document.getElementById('phoneInput')?.focus(), 150);
  }

  onPhoneInput(input) {
    if (!input) return;
    // Aceitar só dígitos
    input.value = input.value.replace(/\D/g, '').slice(0, 9);

    const phone = input.value;
    const isValid = /^(84|85|86|87)\d{7}$/.test(phone);

    const btnPay = document.getElementById('btnPay');
    if (btnPay) btnPay.disabled = !isValid || !this.selectedPkg;

    // Feedback visual no campo
    input.style.borderColor = phone.length > 2 && !isValid ? '#EF4444' : '';
  }

  async pay() {
    if (!this.selectedPkg) {
      NotificationView.warn('Selecciona um plano primeiro.');
      return;
    }

    const phoneInput = document.getElementById('phoneInput');
    const phone = phoneInput?.value?.trim() || '';

    if (!/^(84|85|86|87)\d{7}$/.test(phone)) {
      NotificationView.warn('Número de telemóvel inválido. Usa 84XXXXXXX ou 85XXXXXXX.');
      phoneInput?.focus();
      return;
    }

    const btnPay = document.getElementById('btnPay');
    if (btnPay) {
      btnPay.disabled = true;
      btnPay.textContent = 'A processar…';
    }

    try {
      const fullPhone = `258${phone}`;
      const res = await fetch('/.netlify/functions/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber:  fullPhone,
          amount:       this.selectedPkg.amount,
          packageId:    this.selectedPkg.id,
          environment:  'production',
          userId:       this.userId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro no pagamento. Tenta novamente.');
      }

      // Sucesso
      ModalView.close('payOverlay');
      NotificationView.success(`+${data.creditsAdded} créditos adicionados! ⚡`);

      // Actualizar créditos localmente
      const stored = Storage.get('credits', 0);
      Storage.set('credits', stored + data.creditsAdded);
      window.dispatchEvent(new CustomEvent('creditsChanged', {
        detail: stored + data.creditsAdded
      }));

    } catch (err) {
      NotificationView.error(err.message || 'Não foi possível processar o pagamento. Tenta novamente.');
      console.error('[PaymentController] Erro:', err);
    } finally {
      if (btnPay) {
        btnPay.disabled = false;
        btnPay.textContent = 'Confirmar e pagar';
      }
    }
  }
}
