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
        document.querySelector('.pkg-avulso-btn')?.addEventListener('click', (e) => {
            this.selectPkg(e.currentTarget, 'avulso');
        });
        document.getElementById('phoneInput')?.addEventListener('input', e => this.onPhoneInput(e.target));
        document.getElementById('btnPay')?.addEventListener('click', () => this.pay());
    }

    showPricing(guestMode = false) {
        const avulsoSec = document.getElementById('avulsoSection');
        const payTitle  = document.getElementById('payTitle');
        const paySub    = document.getElementById('paySubtitle');
        if (guestMode) {
            if (avulsoSec) avulsoSec.style.display = 'block';
            if (payTitle)  payTitle.textContent  = 'Acesso sem conta';
            if (paySub)    paySub.textContent    = 'Pague 50 MZN e gere 1 documento agora';
        } else {
            if (avulsoSec) avulsoSec.style.display = 'none';
            if (payTitle)  payTitle.textContent  = 'Adquirir Créditos';
            if (paySub)    paySub.textContent    = 'Pagamento rápido via M-Pesa';
        }
        ModalView.open('payOverlay');
    }

    openAsGuest() { this.showPricing(true); }

    close() {
        ModalView.close('payOverlay');
        this.selectedPkg = null;
        const sec = document.getElementById('mpesaSection');
        if (sec) sec.style.display = 'none';
        document.querySelectorAll('.pkg').forEach(el => el.classList.remove('sel'));
        const mpNote = document.getElementById('mpNote');
        const manualInfo = document.getElementById('payManualInfo');
        const btnPay = document.getElementById('btnPay');
        if (mpNote) mpNote.style.display = '';
        if (manualInfo) manualInfo.style.display = 'none';
        if (btnPay) btnPay.textContent = 'Pagar com M-Pesa';
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

        const mpNote = document.getElementById('mpNote');
        const manualInfo = document.getElementById('payManualInfo');
        const btnPay = document.getElementById('btnPay');
        if (mpNote) mpNote.style.display = 'none';
        if (manualInfo) manualInfo.style.display = 'block';
        if (btnPay) btnPay.textContent = 'Confirmar e Abrir WhatsApp';

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
                // Pagamento manual → créditos adicionados APENAS pelo admin após confirmação.
                // NÃO tocar nos créditos do cliente aqui.
                NotificationView.info('📱 Envie o comprovativo pelo WhatsApp para receber os créditos.');
                if (result.whatsappLink) window.open(result.whatsappLink, '_blank');
                NotificationView.warn(`🆔 Referência: ${result.referenceId} — guarde este número`);
            } else if (result.mode === 'automatic') {
                // M-Pesa automático confirmado pelo servidor.
                // Segurança: buscar os créditos actualizados DO SERVIDOR — nunca somar no cliente.
                await this.creditModel._syncFromServer();
                NotificationView.success(`✅ Pagamento confirmado! Créditos adicionados.`);
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
