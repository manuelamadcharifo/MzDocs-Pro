// assets/js/controllers/PaymentController.js
import { paymentService } from '../services/PaymentService.js';
import { ModalView, NotificationView } from '../views/Views.js';
import { Validator } from '../utils/Formatter.js';
import { Storage } from '../utils/Storage.js';

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
        const sec = document.getElementById('mpesaSection');
        if (sec) sec.style.display = 'none';
        document.querySelectorAll('.pkg').forEach(el => el.classList.remove('sel'));
    }

    selectPkg(el, key) {
        const pkg = this.payment.getPackages()[key];
        if (!pkg) return;
        document.querySelectorAll('.pkg').forEach(p => p.classList.remove('sel'));
        el.classList.add('sel');
        this.selectedPkg = key;
        const section = document.getElementById('mpesaSection');
        if (section) section.style.display = 'flex';
        const label = document.getElementById('mpEnvLabel');
        if (label) label.textContent = '⚠️ Pagamento manual via M-Pesa';
        const summary = document.getElementById('paySummary');
        if (summary) summary.innerHTML =
            `<span>Pacote <strong>${pkg.name}</strong></span><strong>MZN ${pkg.price} → ${pkg.credits} créditos</strong>`;
        this.onPhoneInput(document.getElementById('phoneInput'));
    }

    onPhoneInput(input) {
        const valid = Validator.phone(input?.value || '');
        const btn = document.getElementById('btnPay');
        if (btn) btn.disabled = !valid || !this.selectedPkg;
    }

    async pay() {
        const phone = document.getElementById('phoneInput')?.value;
        const pkg = this.payment.getPackages()[this.selectedPkg];
        if (!pkg || !phone) return;

        const btn = document.getElementById('btnPay');
        btn.disabled = true;
        btn.textContent = '⏳ A processar…';

        try {
            const result = await this.payment.processPayment(this.selectedPkg, phone, Storage.getUserId());

            if (result.mode === 'manual') {
                // CORRIGIDO: pagamento manual → NÃO adicionar créditos agora.
                // Créditos só são adicionados pelo admin após confirmação.
                NotificationView.info('📱 Envie o comprovativo pelo WhatsApp para receber os créditos.');
                if (result.whatsappLink) window.open(result.whatsappLink, '_blank');
                NotificationView.warn(`🆔 Referência: ${result.referenceId} — guarde este número`);
            } else if (result.mode === 'automatic') {
                // M-Pesa automático confirmado — adicionar créditos
                await this.creditModel.add(pkg.credits);
                NotificationView.success(`✅ ${pkg.credits} créditos adicionados!`);
            }

            this.close();
        } catch (err) {
            NotificationView.error('❌ ' + (err.message || 'Erro no pagamento'));
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirmar Pagamento';
        }
    }
}