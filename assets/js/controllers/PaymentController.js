// assets/js/controllers/PaymentController.js
import { paymentService } from '../services/PaymentService.js';
import { ModalView, NotificationView } from '../views/Views.js';
import { Validator } from '../utils/Formatter.js';

export class PaymentController {
  constructor(creditModel) {
    this.creditModel = creditModel;
    this.payment = paymentService;
    this.selectedPkg = null;
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnTopup')?.addEventListener('click', () => this.showPricing());
    document.getElementById('creditPill')?.addEventListener('click', () => this.showPricing());
    document.getElementById('payClose')?.addEventListener('click', () => this.close());
    document.getElementById('payOverlay')?.addEventListener('click', e => { if (e.target.id === 'payOverlay') this.close(); });
    document.querySelectorAll('.pkg').forEach(el => {
      el.addEventListener('click', () => this.selectPkg(el, el.dataset.pkg));
    });
    document.getElementById('phoneInput')?.addEventListener('input', e => this.onPhoneInput(e.target));
    document.getElementById('btnPay')?.addEventListener('click', () => this.pay());
  }

  showPricing() { ModalView.open('payOverlay'); }

  close() {
    ModalView.close('payOverlay');
    this.selectedPkg = null;
    document.getElementById('mpesaSection').style.display = 'none';
    document.querySelectorAll('.pkg').forEach(el => el.classList.remove('sel'));
  }

  selectPkg(el, key) {
    const pkg = this.payment.getPackages()[key];
    if (!pkg) return;
    document.querySelectorAll('.pkg').forEach(p => p.classList.remove('sel'));
    el.classList.add('sel');
    this.selectedPkg = key;
    const section = document.getElementById('mpesaSection');
    section.style.display = 'flex';
    document.getElementById('mpEnvLabel').textContent = '⚠️ Pagamento manual via M-Pesa';
    document.getElementById('paySummary').innerHTML =
      `<span>Pacote <strong>${pkg.name}</strong></span><strong>MZN ${pkg.price} → ${pkg.credits} créditos</strong>`;
    this.onPhoneInput(document.getElementById('phoneInput'));
  }

  onPhoneInput(input) {
    const valid = Validator.phone(input?.value || '');
    const btn = document.getElementById('btnPay');
    if (btn) btn.disabled = !valid || !this.selectedPkg;
  }

  async pay() {
    const phone = document.getElementById('phoneInput').value;
    const pkg = this.payment.getPackages()[this.selectedPkg];
    if (!pkg) return;

    const btn = document.getElementById('btnPay');
    btn.disabled = true;
    btn.textContent = '⏳ A processar…';

    try {
      const result = await this.payment.processPayment(this.selectedPkg, phone, Storage.getUserId());

      if (result.mode === 'manual') {
        NotificationView.info('📱 Envie o comprovativo pelo WhatsApp');
        if (result.whatsappLink) {
          window.open(result.whatsappLink, '_blank');
        }
      }

      await this.creditModel.add(pkg.credits);
      NotificationView.success(`✅ ${pkg.credits} créditos adicionados!`);
      this.close();
    } catch (err) {
      NotificationView.error('❌ ' + (err.message || 'Erro no pagamento'));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar Pagamento';
    }
  }
}