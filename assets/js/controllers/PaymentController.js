// assets/js/controllers/PaymentController.js — v8.0
// Controlador de pagamentos e pacotes de preços optimizados para Moçambique.
// Pacotes: Avulso (50 MZN / 3 créditos) · Starter · Básico · Pro · Empresa
// Fluxo pós-uso do último crédito: modal com aviso + opções de compra.

import { paymentService } from '../services/PaymentService.js';
import { ModalView, NotificationView } from '../views/Views.js';
import { Validator } from '../utils/Formatter.js';
import { Storage } from '../utils/Storage.js';

// ─── Definição dos pacotes v8.0 ───────────────────────────────────────────────
const PACKAGES_V8 = {
  avulso: {
    id:             'avulso',
    name:           'Avulso',
    credits:        3,
    price:          50,
    pricePerCredit: 16.67,
    description:    'Experimente sem compromisso',
    features:       ['3 documentos', 'Válido por 7 dias', 'Sem conta permanente'],
    popular:        false,
    colorClass:     'pkg-gray',
  },
  starter: {
    id:             'starter',
    name:           'Starter',
    credits:        10,
    price:          120,
    pricePerCredit: 12.00,
    description:    'Ideal para estudantes',
    features:       ['10 documentos', 'Economia 28%', 'Suporte WhatsApp'],
    popular:        false,
    colorClass:     'pkg-blue',
  },
  basico: {
    id:             'basico',
    name:           'Básico',
    credits:        25,
    price:          280,
    pricePerCredit: 11.20,
    description:    'Para profissionais',
    features:       ['25 documentos', 'Economia 33%', 'Prioridade na geração'],
    popular:        true,
    colorClass:     'pkg-green',
  },
  pro: {
    id:             'pro',
    name:           'Pro',
    credits:        60,
    price:          600,
    pricePerCredit: 10.00,
    description:    'Pequenas empresas',
    features:       ['60 documentos', 'Economia 40%', 'Suporte prioritário'],
    popular:        false,
    colorClass:     'pkg-purple',
  },
  empresa: {
    id:             'empresa',
    name:           'Empresa',
    credits:        150,
    price:          1500,
    pricePerCredit: 10.00,
    description:    'Escritórios e ONGs',
    features:       ['150 documentos', 'Multi-utilizador', 'Painel de admin'],
    popular:        false,
    colorClass:     'pkg-gold',
  },
};

export class PaymentController {
  constructor(creditModel) {
    this.creditModel  = creditModel;
    this.payment      = paymentService;
    this.selectedPkg  = null;
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnTopup')?.addEventListener('click', () => this.showPricing());
    document.getElementById('creditPill')?.addEventListener('click', () => this.showPricing());
    document.getElementById('payClose')?.addEventListener('click', () => this.close());
    document.getElementById('payOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'payOverlay') this.close();
    });

    document.querySelectorAll('.pkg').forEach(el => {
      el.addEventListener('click', () => this.selectPkg(el, el.dataset.pkg));
    });
    document.querySelector('.pkg-avulso-btn')?.addEventListener('click', e => {
      this.selectPkg(e.currentTarget, 'avulso');
    });

    document.getElementById('phoneInput')?.addEventListener('input', e => this.onPhoneInput(e.target));
    document.getElementById('btnPay')?.addEventListener('click', () => this.pay());
  }

  // ── Abrir modal de preços ────────────────────────────────────────────────
  showPricing(guestMode = false) {
    const avulsoSec = document.getElementById('avulsoSection');
    const payTitle  = document.getElementById('payTitle');
    const paySub    = document.getElementById('paySubtitle');

    if (guestMode) {
      if (avulsoSec) avulsoSec.style.display = 'block';
      if (payTitle)  payTitle.textContent = 'Acesso sem conta';
      if (paySub)    paySub.textContent   = 'Pague 50 MZN e gere 3 documentos agora';
    } else {
      if (avulsoSec) avulsoSec.style.display = 'none';
      if (payTitle)  payTitle.textContent = 'Adquirir Créditos';
      if (paySub)    paySub.textContent   = 'Pagamento rápido via M-Pesa';
    }

    ModalView.open('payOverlay');
  }

  openAsGuest() { this.showPricing(true); }

  // ── Mostrar aviso após uso do último crédito (v8.0) ──────────────────────
  showAfterLastCredit(accountType) {
    const isAvulso = accountType === 'avulso';

    // Criar overlay de aviso temporário (não bloqueia visualização do documento)
    const overlay = document.createElement('div');
    overlay.id = 'lastCreditWarning';
    overlay.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
      'background:#fff', 'border-radius:16px', 'box-shadow:0 8px 32px rgba(0,0,0,.18)',
      'padding:20px 24px', 'z-index:99998', 'max-width:360px', 'width:90%',
      'border-top:4px solid #f59e0b', 'text-align:center',
    ].join(';');

    overlay.innerHTML = `
      <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
      <h3 style="margin:0 0 8px;font-size:1rem;color:#07101f;">Último crédito utilizado!</h3>
      <p style="margin:0 0 4px;font-size:.875rem;color:#374151;">
        Seu documento foi gerado com sucesso.
      </p>
      ${isAvulso ? `
        <p style="margin:0 0 16px;font-size:.8rem;color:#ef4444;font-weight:600;">
          ⏰ Sua conta será removida em 24h se não comprar créditos.
        </p>
      ` : `
        <p style="margin:0 0 16px;font-size:.8rem;color:#6b7280;">
          Compre mais créditos para continuar a gerar documentos.
        </p>
      `}
      <button id="lastCreditBuy" style="
        background:#2563eb;color:#fff;border:none;border-radius:10px;
        padding:10px 20px;font-size:.875rem;font-weight:600;cursor:pointer;
        margin-right:8px;
      ">Comprar Créditos</button>
      <button id="lastCreditClose" style="
        background:none;border:1.5px solid #e5e7eb;border-radius:10px;
        padding:10px 16px;font-size:.875rem;cursor:pointer;
      ">Fechar</button>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#lastCreditBuy').addEventListener('click', () => {
      overlay.remove();
      this.showPricing(false);
    });
    overlay.querySelector('#lastCreditClose').addEventListener('click', () => {
      overlay.remove();
    });

    // Auto-remover após 12 segundos
    setTimeout(() => overlay.remove(), 12000);
  }

  // ── Fechar modal ─────────────────────────────────────────────────────────
  close() {
    ModalView.close('payOverlay');
    this.selectedPkg = null;
    const sec        = document.getElementById('mpesaSection');
    if (sec) sec.style.display = 'none';
    document.querySelectorAll('.pkg').forEach(el => el.classList.remove('sel'));
    const mpNote     = document.getElementById('mpNote');
    const manualInfo = document.getElementById('payManualInfo');
    const btnPay     = document.getElementById('btnPay');
    if (mpNote)     mpNote.style.display     = '';
    if (manualInfo) manualInfo.style.display = 'none';
    if (btnPay)     btnPay.textContent       = 'Pagar com M-Pesa';
  }

  // ── Seleccionar pacote ────────────────────────────────────────────────────
  selectPkg(el, key) {
    // Usar tabela interna v8.0 primeiro, depois fallback para PaymentService
    const pkg = PACKAGES_V8[key] || this.payment.getPackages()[key];
    if (!pkg) return;

    document.querySelectorAll('.pkg').forEach(p => p.classList.remove('sel'));
    el.classList.add('sel');
    this.selectedPkg = key;

    const section = document.getElementById('mpesaSection');
    if (section) section.style.display = 'flex';

    const summary = document.getElementById('paySummary');
    if (summary) {
      summary.innerHTML =
        `<span>Pacote <strong>${pkg.name}</strong></span>` +
        `<strong>MZN ${pkg.price} → ${pkg.credits} créditos</strong>`;
    }

    const mpNote     = document.getElementById('mpNote');
    const manualInfo = document.getElementById('payManualInfo');
    const btnPay     = document.getElementById('btnPay');
    if (mpNote)     mpNote.style.display     = 'none';
    if (manualInfo) {
      manualInfo.style.display = 'block';
      // Mostrar nome do recebedor para o utilizador confirmar antes de pagar
      const receiverEl = document.getElementById('payReceiverInfo');
      if (receiverEl) {
        receiverEl.innerHTML =
          `<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:.82rem;">` +
          `<span style="color:#166534;font-weight:700;">📲 Recebedor M-Pesa:</span><br>` +
          `<span style="font-size:1rem;font-weight:800;color:#15803d;letter-spacing:.5px;">Manuel Amad Charifo</span><br>` +
          `<span style="color:#6b7280;font-size:.78rem;">Verifique o nome antes de confirmar o pagamento</span>` +
          `</div>`;
      }
    }
    if (btnPay)     btnPay.textContent = 'Confirmar e Abrir WhatsApp';

    this.onPhoneInput(document.getElementById('phoneInput'));
  }

  onPhoneInput(input) {
    const valid = Validator.phone(input?.value || '');
    const btn   = document.getElementById('btnPay');
    if (btn) btn.disabled = !valid || !this.selectedPkg;
  }

  // ── Processar pagamento ───────────────────────────────────────────────────
  async pay() {
    const phone = document.getElementById('phoneInput')?.value;
    const pkg   = PACKAGES_V8[this.selectedPkg] || this.payment.getPackages()[this.selectedPkg];
    if (!pkg || !phone) return;

    const btn     = document.getElementById('btnPay');
    btn.disabled  = true;
    btn.textContent = '⏳ A processar…';

    try {
      const result = await this.payment.processPayment(this.selectedPkg, phone, Storage.getUserId());

      if (result.mode === 'manual') {
        NotificationView.info('📱 Envie o comprovativo pelo WhatsApp para receber os créditos.');
        if (result.whatsappLink) window.open(result.whatsappLink, '_blank');
        NotificationView.warn('🆔 Referência: ' + result.referenceId + ' — guarde este número');
      } else if (result.mode === 'automatic') {
        // Segurança: buscar créditos actualizados do servidor — nunca somar no cliente
        await this.creditModel._syncFromServer();
        NotificationView.success('✅ Pagamento confirmado! Créditos adicionados.');
      }

      this.close();
    } catch (err) {
      NotificationView.error('❌ ' + (err.message || 'Erro no pagamento'));
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Confirmar Pagamento';
    }
  }

  // ── Expor tabela de pacotes v8.0 para outros módulos ─────────────────────
  static getPackagesV8() {
    return PACKAGES_V8;
  }
}
