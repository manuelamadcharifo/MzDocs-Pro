// assets/js/controllers/PaymentController.js — v9.0 (Verificação automática de comprovativos)
//
// ALTERAÇÕES v9.0:
//  1. Substituição do botão "Enviar por WhatsApp" por área de upload de comprovativo.
//  2. Drag & drop + input file + preview da imagem.
//  3. Botão "Confirmar pagamento" chama /api/verify-receipt via /api/process-payment.
//  4. Status em tempo real: "A validar..." → "Confirmado! +X créditos" ou "Em revisão".
//  5. Fallback WhatsApp sempre disponível (link mostrado abaixo do upload).
//  6. Notificação push via Service Worker quando créditos são adicionados.
//  7. Mantida toda a lógica v8.0 de pacotes, selectPkg, showPricing, etc.

import { paymentService } from '../services/PaymentService.js';
import { ModalView, NotificationView } from '../views/Views.js';
import { Validator } from '../utils/Formatter.js';
import { Storage } from '../utils/Storage.js';
import { authManager } from '../auth/AuthManager.js';

// ─── Definição dos pacotes v8.0 ───────────────────────────────────────────────
const PACKAGES_V8 = {
  avulso: {
    id: 'avulso', name: 'Avulso', credits: 3, price: 50, pricePerCredit: 16.67,
    description: 'Experimente sem compromisso',
    features: ['3 documentos', 'Válido por 7 dias', 'Sem conta permanente'],
    popular: false, colorClass: 'pkg-gray',
  },
  starter: {
    id: 'starter', name: 'Starter', credits: 10, price: 120, pricePerCredit: 12.00,
    description: 'Ideal para estudantes',
    features: ['10 documentos', 'Economia 28%', 'Suporte WhatsApp'],
    popular: false, colorClass: 'pkg-blue',
  },
  basico: {
    id: 'basico', name: 'Básico', credits: 25, price: 280, pricePerCredit: 11.20,
    description: 'Para profissionais',
    features: ['25 documentos', 'Economia 33%', 'Prioridade na geração'],
    popular: true, colorClass: 'pkg-green',
  },
  pro: {
    id: 'pro', name: 'Pro', credits: 60, price: 600, pricePerCredit: 10.00,
    description: 'Pequenas empresas',
    features: ['60 documentos', 'Economia 40%', 'Suporte prioritário'],
    popular: false, colorClass: 'pkg-purple',
  },
  empresa: {
    id: 'empresa', name: 'Empresa', credits: 150, price: 1500, pricePerCredit: 10.00,
    description: 'Escritórios e ONGs',
    features: ['150 documentos', 'Multi-utilizador', 'Painel de admin'],
    popular: false, colorClass: 'pkg-gold',
  },
};

export class PaymentController {
  constructor(creditModel) {
    this.creditModel       = creditModel;
    this.payment           = paymentService;
    this.selectedPkg       = null;
    this._receiptBase64    = null;   // imagem do comprovativo
    this._receiptMime      = null;
    this._currentTxId      = null;   // transactionId devolvido pelo processo-payment
    this._currentRef       = null;   // referenceId
    this._waLink           = null;   // link WhatsApp fallback
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

  // ── Abrir modal de preços ─────────────────────────────────────────────────
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
      if (paySub)    paySub.textContent   = 'Pagamento via M-Pesa, e-Mola ou mKesh';
    }

    ModalView.open('payOverlay');
  }

  openAsGuest() { this.showPricing(true); }

  // ── Aviso após uso do último crédito ──────────────────────────────────────
  showAfterLastCredit(accountType) {
    const isAvulso = accountType === 'avulso';
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
    const safetyTimer = setTimeout(() => overlay.remove(), 60000);
    overlay.querySelector('#lastCreditBuy').addEventListener('click', () => {
      clearTimeout(safetyTimer); overlay.remove(); this.showPricing(false);
    });
    overlay.querySelector('#lastCreditClose').addEventListener('click', () => {
      clearTimeout(safetyTimer); overlay.remove();
    });
  }

  // ── Fechar modal ──────────────────────────────────────────────────────────
  close() {
    ModalView.close('payOverlay');
    this.selectedPkg    = null;
    this._receiptBase64 = null;
    this._receiptMime   = null;
    this._currentTxId   = null;
    this._currentRef    = null;
    this._waLink        = null;
    const sec = document.getElementById('mpesaSection');
    if (sec) sec.style.display = 'none';
    document.querySelectorAll('.pkg').forEach(el => el.classList.remove('sel'));
    const mpNote     = document.getElementById('mpNote');
    const manualInfo = document.getElementById('payManualInfo');
    const btnPay     = document.getElementById('btnPay');
    if (mpNote)     mpNote.style.display     = '';
    if (manualInfo) manualInfo.style.display = 'none';
    if (btnPay)     btnPay.textContent       = 'Continuar';
    // Limpar área de upload
    const uploadArea = document.getElementById('receiptUploadArea');
    if (uploadArea) uploadArea.remove();
  }

  // ── Seleccionar pacote ────────────────────────────────────────────────────
  selectPkg(el, key) {
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
    if (mpNote)     mpNote.style.display = 'none';
    if (manualInfo) {
      manualInfo.style.display = 'block';
      const receiverEl = document.getElementById('payReceiverInfo');
      if (receiverEl) {
        receiverEl.innerHTML =
          `<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:10px 14px;margin-bottom:8px;font-size:.82rem;">` +
          `<span style="color:#166534;font-weight:700;">📲 Recebedor (M-Pesa):</span><br>` +
          `<span style="font-size:1rem;font-weight:800;color:#15803d;letter-spacing:.5px;">Manuel Amad Charifo - 858695506</span><br>` +
          `<span style="color:#6b7280;font-size:.78rem;">Verifique o nome antes de confirmar o pagamento</span>` +
          `</div>`;
      }
    }
    if (btnPay) btnPay.textContent = 'Registar Pedido';

    this.onPhoneInput(document.getElementById('phoneInput'));
  }

  onPhoneInput(input) {
    const valid = Validator.phone(input?.value || '');
    const btn   = document.getElementById('btnPay');
    if (btn) btn.disabled = !valid || !this.selectedPkg;
  }

  // ── Processar pagamento (fase 1: registar + mostrar upload) ──────────────
  async pay() {
    const phone = document.getElementById('phoneInput')?.value;
    const pkg   = PACKAGES_V8[this.selectedPkg] || this.payment.getPackages()[this.selectedPkg];
    if (!pkg || !phone) return;

    const btn       = document.getElementById('btnPay');
    btn.disabled    = true;
    btn.textContent = '⏳ A registar…';

    try {
      const userId = authManager?.user?.id || null;
      const result = await this.payment.processPayment(this.selectedPkg, phone, userId);

      this._currentTxId = result.transactionId || null;
      this._currentRef  = result.referenceId   || null;
      this._waLink      = result.whatsappLink   || null;

      // Mostrar área de upload (tanto pedido novo como duplicado pendente)
      this._showReceiptUpload(pkg, result);

      if (result.duplicate) {
        // Pedido duplicado — reutilizar transacção existente
        btn.textContent = 'Confirmar Pagamento';
      } else {
        btn.textContent = 'Confirmar Pagamento';
      }
      btn.disabled = true; // espera imagem
    } catch (err) {
      NotificationView.error('❌ ' + (err.message || 'Erro no pagamento'));
      btn.disabled    = false;
      btn.textContent = 'Registar Pedido';
    }
  }

  // ── Mostrar área de upload após registo da transacção ────────────────────
  _showReceiptUpload(pkg, result) {
    // Remover área anterior se existir
    document.getElementById('receiptUploadArea')?.remove();

    const manualInfo = document.getElementById('payManualInfo');
    if (!manualInfo) return;

    const area = document.createElement('div');
    area.id = 'receiptUploadArea';
    area.innerHTML = `
      <div style="margin-top:14px;">
        <p style="font-size:.82rem;color:#374151;margin-bottom:6px;font-weight:600;">
          ✅ Pedido registado! Referência: <span style="color:#2563eb;font-family:monospace;">${result.referenceId || ''}</span>
        </p>
        <p style="font-size:.8rem;color:#6b7280;margin-bottom:10px;">
          Faça a transferência de <strong>${pkg.price} MZN</strong> para o número acima e depois envie o screenshot do comprovativo. A confirmação é automática em <strong>2-5 minutos</strong>.
        </p>

        <!-- Área de upload drag & drop -->
        <div id="receiptDropZone" style="
          border:2px dashed #3b82f6;border-radius:12px;padding:18px;text-align:center;
          cursor:pointer;background:#eff6ff;transition:background .2s;margin-bottom:10px;
        ">
          <div style="font-size:1.6rem;margin-bottom:4px;">📷</div>
          <p style="margin:0;font-size:.82rem;color:#1d4ed8;font-weight:600;">
            Toque para enviar screenshot do comprovativo
          </p>
          <p style="margin:2px 0 0;font-size:.75rem;color:#6b7280;">
            Screenshot do M-Pesa, e-Mola ou mKesh · JPEG/PNG · máx 2MB
          </p>
          <input type="file" id="receiptFileInput" accept="image/jpeg,image/png,image/webp"
            style="position:absolute;opacity:0;width:0;height:0;">
        </div>

        <!-- Preview da imagem -->
        <div id="receiptPreview" style="display:none;margin-bottom:10px;text-align:center;">
          <img id="receiptPreviewImg" style="max-width:100%;max-height:160px;border-radius:8px;border:1.5px solid #d1d5db;" alt="Comprovativo">
          <p style="font-size:.75rem;color:#16a34a;margin-top:4px;font-weight:600;">✓ Imagem carregada</p>
          <button id="receiptRemoveImg" style="
            font-size:.72rem;color:#ef4444;background:none;border:none;cursor:pointer;padding:0;
          ">Remover e escolher outra</button>
        </div>

        <!-- Status da verificação -->
        <div id="receiptStatus" style="display:none;padding:10px;border-radius:8px;margin-bottom:10px;font-size:.82rem;text-align:center;"></div>

        <!-- Botão confirmar -->
        <button id="btnConfirmReceipt" disabled style="
          width:100%;padding:12px;background:#16a34a;color:#fff;border:none;
          border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;
          opacity:.5;transition:opacity .2s;
        ">📤 Confirmar Pagamento</button>

        <!-- Fallback WhatsApp -->
        <div style="margin-top:10px;text-align:center;">
          <p style="font-size:.75rem;color:#9ca3af;margin-bottom:4px;">Problemas com o upload?</p>
          <a id="receiptWaFallback" href="${result.whatsappLink || '#'}" target="_blank"
            style="font-size:.78rem;color:#25d366;font-weight:600;text-decoration:none;">
            📱 Enviar screenshot pelo WhatsApp em vez disso
          </a>
        </div>
      </div>
    `;

    manualInfo.appendChild(area);
    this._bindUploadEvents();
  }

  _bindUploadEvents() {
    const dropZone    = document.getElementById('receiptDropZone');
    const fileInput   = document.getElementById('receiptFileInput');
    const preview     = document.getElementById('receiptPreview');
    const previewImg  = document.getElementById('receiptPreviewImg');
    const removeBtn   = document.getElementById('receiptRemoveImg');
    const confirmBtn  = document.getElementById('btnConfirmReceipt');
    const statusDiv   = document.getElementById('receiptStatus');

    if (!dropZone || !fileInput) return;

    // Click na drop zone abre file picker
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag & drop
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.background = '#dbeafe'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.background = '#eff6ff'; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.background = '#eff6ff';
      const file = e.dataTransfer?.files?.[0];
      if (file) this._loadReceiptFile(file, dropZone, preview, previewImg, confirmBtn, statusDiv);
    });

    // Input file change
    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this._loadReceiptFile(file, dropZone, preview, previewImg, confirmBtn, statusDiv);
    });

    // Remover imagem
    removeBtn?.addEventListener('click', () => {
      this._receiptBase64 = null;
      this._receiptMime   = null;
      preview.style.display  = 'none';
      dropZone.style.display = 'block';
      confirmBtn.disabled    = true;
      confirmBtn.style.opacity = '.5';
      fileInput.value = '';
      statusDiv.style.display = 'none';
    });

    // Confirmar pagamento
    confirmBtn?.addEventListener('click', () => this._submitReceipt(confirmBtn, statusDiv));
  }

  _loadReceiptFile(file, dropZone, preview, previewImg, confirmBtn, statusDiv) {
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      NotificationView.error('Imagem demasiado grande. Máximo 2MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      NotificationView.error('Formato não suportado. Use JPEG ou PNG.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl     = e.target.result;
      const base64      = dataUrl.split(',')[1];
      this._receiptBase64 = base64;
      this._receiptMime   = file.type;

      previewImg.src        = dataUrl;
      preview.style.display = 'block';
      dropZone.style.display = 'none';
      confirmBtn.disabled    = false;
      confirmBtn.style.opacity = '1';
      statusDiv.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  async _submitReceipt(confirmBtn, statusDiv) {
    if (!this._receiptBase64 || !this._currentTxId) return;

    const pkg    = PACKAGES_V8[this.selectedPkg];
    const userId = authManager?.user?.id || null;
    const phone  = document.getElementById('phoneInput')?.value || '';

    confirmBtn.disabled    = true;
    confirmBtn.textContent = '⏳ A verificar comprovativo…';
    this._showReceiptStatus(statusDiv, 'loading', '🔍 A verificar comprovativo… (pode demorar 10-20 segundos)');

    try {
      const resp = await fetch('/api/verify-receipt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64:   this._receiptBase64,
          mimeType:      this._receiptMime,
          reference:     this._currentRef,
          phone,
          amount:        pkg?.price,
          wallet:        this._detectWallet(phone),
          userId,
          transactionId: this._currentTxId,
          packageId:     this.selectedPkg,
        }),
      });

      // Ler JSON independentemente do status HTTP.
      // 400 pode ser resposta de negócio válida (ex: imagem inválida),
      // não necessariamente erro de rede.
      let data;
      const contentType = resp.headers.get('content-type') || '';

      if (resp.status === 404) {
        throw new Error('Serviço temporariamente indisponível. Tente de novo em alguns segundos.');
      }
      if (resp.status === 429) {
        throw new Error('Demasiados pedidos. Aguarde 1 minuto e tente de novo.');
      }
      if (resp.status >= 500) {
        throw new Error('Erro interno do servidor. Tente de novo ou use o WhatsApp abaixo.');
      }

      // Para 200, 400 e outros — tentar ler JSON sempre
      if (contentType.includes('json')) {
        try { data = await resp.json(); }
        catch { throw new Error('Resposta inválida. Tente de novo.'); }
      } else {
        // Servidor devolveu HTML (ex: erro Vercel) — erro de infra
        await resp.text(); // consumir body
        throw new Error('Serviço temporariamente indisponível. Tente de novo.');
      }

      // ── Tratar todas as respostas de negócio ──────────────────────────

      if (data.autoApproved && data.verified) {
        // ✅ Aprovação automática
        this._showReceiptStatus(statusDiv, 'success',
          `✅ Pagamento confirmado! <strong>+${data.creditsAdded} créditos</strong> adicionados à sua conta.`);
        confirmBtn.textContent = '✅ Confirmado!';

        await this.creditModel._syncFromServer().catch(() => {});
        NotificationView.success(`✅ +${data.creditsAdded} créditos adicionados!`);
        this._sendPushNotification(`+${data.creditsAdded} créditos adicionados ao MzDocs Pro!`);
        setTimeout(() => this.close(), 3000);

      } else if (data.code === 'NOT_A_RECEIPT' || (data.success === false && data.error)) {
        // ❌ Imagem não é comprovativo ou inválida — mostrar mensagem clara
        const userMsg = data.error || 'A imagem enviada não é um comprovativo de transferência. Envie o screenshot do M-Pesa, e-Mola ou mKesh após fazer o pagamento.';
        this._showReceiptStatus(statusDiv, 'error', `❌ ${userMsg}`);
        confirmBtn.textContent   = '📷 Escolher outra imagem';
        confirmBtn.disabled      = true;
        confirmBtn.style.opacity = '.5';
        // Resetar área de upload para nova tentativa
        this._receiptBase64 = null;
        this._receiptMime   = null;
        document.getElementById('receiptPreview') ?.style && (document.getElementById('receiptPreview').style.display  = 'none');
        document.getElementById('receiptDropZone')?.style && (document.getElementById('receiptDropZone').style.display = 'block');
        const fi = document.getElementById('receiptFileInput');
        if (fi) fi.value = '';

      } else if (data.nextStep === 'awaiting_review') {
        // ⏳ Revisão manual
        this._showReceiptStatus(statusDiv, 'pending',
          `⏳ ${data.message || 'Comprovativo recebido. A equipa irá verificar em até 15 minutos.'}`);
        confirmBtn.textContent = '⏳ Em revisão…';
        confirmBtn.disabled    = true;
        NotificationView.info('📋 Comprovativo em análise. Receberá os créditos em breve.');

      } else if (data.error) {
        // ❌ Outro erro de negócio
        this._showReceiptStatus(statusDiv, 'error', `❌ ${data.error}`);
        confirmBtn.textContent   = 'Tentar de Novo';
        confirmBtn.disabled      = false;
        confirmBtn.style.opacity = '1';

      } else {
        this._showReceiptStatus(statusDiv, 'pending', data.message || 'A processar…');
        confirmBtn.textContent   = 'Confirmar Pagamento';
        confirmBtn.disabled      = false;
        confirmBtn.style.opacity = '1';
      }

    } catch (err) {
      // Apenas erros reais de rede/infra chegam aqui
      console.error('[PaymentController] _submitReceipt:', err);
      this._showReceiptStatus(statusDiv, 'error',
        `❌ ${err.message || 'Erro de ligação. Verifique a internet e tente de novo.'}`);
      confirmBtn.textContent   = 'Tentar de Novo';
      confirmBtn.disabled      = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.disabled    = false;
      confirmBtn.style.opacity = '1';
    }
  }

  _showReceiptStatus(div, type, html) {
    if (!div) return;
    const styles = {
      loading: 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;',
      success: 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;',
      pending: 'background:#fffbeb;color:#92400e;border:1px solid #fde68a;',
      error:   'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;',
    };
    div.style.cssText = `display:block;padding:10px 12px;border-radius:8px;margin-bottom:10px;font-size:.82rem;text-align:center;${styles[type] || ''}`;
    div.innerHTML = html;
  }

  _detectWallet(phone) {
    const clean  = String(phone).replace(/\D/g, '').replace(/^258/, '');
    const prefix = clean.slice(0, 2);
    if (prefix === '84' || prefix === '85') return 'M-Pesa';
    if (prefix === '86' || prefix === '87') return 'e-Mola';
    if (prefix === '82' || prefix === '83') return 'mKesh';
    return 'carteira móvel';
  }

  _sendPushNotification(message) {
    try {
      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification('MzDocs Pro', {
            body: message,
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/icon-192x192.png',
            tag:  'payment-confirmed',
          });
        }).catch(() => {});
      }
    } catch (_) {}
  }

  static getPackagesV8() {
    return PACKAGES_V8;
  }
}
