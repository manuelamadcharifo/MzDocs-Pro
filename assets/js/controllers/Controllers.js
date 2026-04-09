// controllers/DocumentController.js
import { DocumentModel, CreditModel, QueueModel } from '../models/Models.js';
import { DocumentView } from '../views/Views.js';
import { ModalView, NotificationView } from '../views/Views.js';
import { OpenRouterService } from '../services/Services.js';
import { SERVICES } from '../services/ServiceDefinitions.js';
import { Validator } from '../utils/Validator.js';

const WA_NUMBER = '258858695506'; // ← ALTERE

export class DocumentController {
  constructor(creditModel) {
    this.creditModel = creditModel;
    this.docModel    = new DocumentModel();
    this.queue       = new QueueModel();
    this.openRouter  = new OpenRouterService();
    this._genIv      = null;
    this._bindEvents();
  }

  _bindEvents() {
    // Grid de serviços
    document.querySelectorAll('.sc[data-svc]').forEach(el => {
      el.addEventListener('click', () => this.open(el.dataset.svc));
    });
    // Fechar overlays
    document.getElementById('formClose')?.addEventListener('click', () => this.closeForm());
    document.getElementById('resultClose')?.addEventListener('click', () => this.closeResult());
    document.getElementById('formOverlay')?.addEventListener('click', e => { if (e.target.id==='formOverlay') this.closeForm(); });
    document.getElementById('resultOverlay')?.addEventListener('click', e => { if (e.target.id==='resultOverlay') this.closeResult(); });
    // Resultado: botões
    document.getElementById('btnCopy')?.addEventListener('click', () => this.copyDoc());
    document.getElementById('btnDl')?.addEventListener('click', () => this.downloadDoc());
    document.getElementById('btnWaResult')?.addEventListener('click', () => this.sendWA());
  }

  open(key) {
    const svc = SERVICES[key];
    if (!svc) return;

    // Verificar créditos para serviços IA
    if (svc.hasAI && !this.creditModel.canConsume(1)) {
      window.paymentController?.showPricing();
      NotificationView.warn('⚠️ Créditos insuficientes. Compre mais para continuar.');
      return;
    }

    this.docModel.reset();
    this.docModel.service = key;

    // Cabeçalho do modal
    document.getElementById('shIco').textContent   = svc.icon;
    document.getElementById('shIco').style.background = svc.bg;
    document.getElementById('shTitle').textContent = svc.title;
    document.getElementById('shSub').textContent   = svc.sub;

    // OCR zone
    document.getElementById('ocrZone').style.display = svc.hasAI ? 'block' : 'none';
    window.ocrController?.reset();

    // Formulário
    DocumentView.renderForm(svc, document.getElementById('formBody'), document.getElementById('formFoot'));

    // Bind botão de geração/envio
    setTimeout(() => {
      const btnGen = document.getElementById('btnGen');
      const btnWa  = document.getElementById('btnWaDirect');
      if (btnGen) btnGen.addEventListener('click', () => this.generate());
      if (btnWa)  btnWa.addEventListener('click',  () => this.sendDirect());
    }, 50);

    ModalView.open('formOverlay');
  }

  closeForm() { ModalView.close('formOverlay'); DocumentView.hideLoader(this._genIv); this.docModel.reset(); }
  closeResult() { ModalView.close('resultOverlay'); }

  async generate() {
    const key = this.docModel.service;
    const svc = SERVICES[key];
    if (!svc) return;

    const data = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) { NotificationView.warn(`⚠️ Campo obrigatório: ${missing}`); return; }
    if (!this.creditModel.canConsume(1)) { window.paymentController?.showPricing(); return; }

    // Bloquear botão
    const btn = document.getElementById('btnGen');
    if (btn) btn.disabled = true;

    const STEPS = ['A analisar dados do formulário…','A consultar IA (OpenRouter)…','A redigir o documento…','A finalizar…'];
    this._genIv = DocumentView.showLoader(STEPS);

    try {
      // Adicionar à fila inteligente (resolve rate limit)
      const result = await this.queue.add(() =>
        this.openRouter.generate(key, data, this.docModel.ocrText)
      );

      DocumentView.hideLoader(this._genIv);

      // Consumir crédito apenas no sucesso
      await this.creditModel.consume(1);

      this.docModel.setGenerated(result.document, result.model);
      this.docModel.formData = data;

      // Mostrar resultado
      ModalView.close('formOverlay');
      DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);
      ModalView.open('resultOverlay');
      NotificationView.success('✅ Documento gerado!');

    } catch (err) {
      DocumentView.hideLoader(this._genIv);
      if (err.message === 'INSUFFICIENT_CREDITS') {
        window.paymentController?.showPricing();
      } else {
        NotificationView.error('❌ ' + (err.message || 'Erro ao gerar. Tente novamente.'));
      }
    }
  }

  sendDirect() {
    const key = this.docModel.service;
    const svc = SERVICES[key];
    if (!svc?.buildWA) return;
    const data = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) { NotificationView.warn(`⚠️ Campo obrigatório: ${missing}`); return; }
    const msg = svc.buildWA(data);
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    this.closeForm();
    NotificationView.success('✅ A abrir WhatsApp…');
  }

  copyDoc() {
    if (!this.docModel.content) return;
    navigator.clipboard?.writeText(this.docModel.content)
      .then(() => NotificationView.success('📋 Copiado!'))
      .catch(() => NotificationView.error('Não foi possível copiar'));
  }

  downloadDoc() {
    if (!this.docModel.content) return;
    const blob = new Blob([this.docModel.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mzdocs-${this.docModel.service || 'doc'}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  sendWA() {
    if (!this.docModel.content) return;
    const svc = SERVICES[this.docModel.service];
    const preview = this.docModel.content.slice(0, 1000).replace(/#{1,3} /g, '*');
    const msg = `📄 *${svc?.title||'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

// controllers/PaymentController.js
import { MPesaService } from '../services/Services.js';
import { ModalView, NotificationView } from '../views/Views.js';

const PACKAGES = {
  starter: { amount:150, credits:10 },
  basico:  { amount:350, credits:25 },
  pro:     { amount:750, credits:60 },
};

export class PaymentController {
  constructor(creditModel) {
    this.creditModel = creditModel;
    this.mpesa       = new MPesaService();
    this.selectedPkg = null;
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnTopup')?.addEventListener('click', () => this.showPricing());
    document.getElementById('creditPill')?.addEventListener('click', () => this.showPricing());
    document.getElementById('payClose')?.addEventListener('click', () => this.close());
    document.getElementById('payOverlay')?.addEventListener('click', e => { if (e.target.id==='payOverlay') this.close(); });
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
    const pkg = PACKAGES[key];
    if (!pkg) return;
    document.querySelectorAll('.pkg').forEach(p => p.classList.remove('sel'));
    el.classList.add('sel');
    this.selectedPkg = key;
    const section = document.getElementById('mpesaSection');
    section.style.display = 'flex';
    document.getElementById('mpEnvLabel').textContent = 'Pagamento M-Pesa';
    document.getElementById('paySummary').innerHTML =
      `<span>Pacote <strong>${key.charAt(0).toUpperCase()+key.slice(1)}</strong></span><strong>MZN ${pkg.amount} → ${pkg.credits} créditos</strong>`;
    this.onPhoneInput(document.getElementById('phoneInput'));
  }

  onPhoneInput(input) {
    const valid = Validator.phone(input?.value || '');
    const btn = document.getElementById('btnPay');
    if (btn) btn.disabled = !valid || !this.selectedPkg;
  }

  async pay() {
    const phone = document.getElementById('phoneInput').value;
    const pkg = PACKAGES[this.selectedPkg];
    if (!pkg) return;

    const btn = document.getElementById('btnPay');
    btn.disabled = true;
    btn.textContent = '⏳ A processar…';

    try {
      const result = await this.mpesa.processPayment(phone, pkg.amount, this.selectedPkg);
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

// controllers/OCRController.js
export class OCRController {
  constructor(docModel) {
    this.docModel = docModel;
    this._worker  = null;
    this._loaded  = false;
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnCam')?.addEventListener('click', () => this.trigger('cam'));
    document.getElementById('btnFile')?.addEventListener('click', () => this.trigger('file'));
    document.getElementById('ocrInput')?.addEventListener('change', e => this.processFile(e));
    document.getElementById('btnUseOcr')?.addEventListener('click', () => this.use());
    document.getElementById('btnDiscardOcr')?.addEventListener('click', () => this.discard());
  }

  trigger(mode) {
    const input = document.getElementById('ocrInput');
    if (!input) return;
    if (mode === 'cam') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  async processFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { NotificationView.error('Imagem muito grande (máx. 5MB)'); return; }

    document.getElementById('ocrBar').style.display = 'block';
    document.getElementById('ocrResultBox').style.display = 'none';
    document.getElementById('ocrFill').style.width = '0%';
    document.getElementById('ocrStatusTxt').textContent = 'A inicializar OCR…';

    try {
      if (!this._loaded) {
        await this._loadTesseract();
      }
      if (!this._worker) {
        document.getElementById('ocrStatusTxt').textContent = 'A carregar modelo de linguagem…';
        this._worker = await Tesseract.createWorker('por', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const p = Math.round(m.progress * 100);
              document.getElementById('ocrFill').style.width = p + '%';
              document.getElementById('ocrStatusTxt').textContent = `A reconhecer… ${p}%`;
            }
          }
        });
      }

      const result = await this._worker.recognize(file);
      const text = result.data.text.trim();
      const conf = Math.round(result.data.confidence);

      document.getElementById('ocrBar').style.display = 'none';
      document.getElementById('ocrTxt').value = text;
      document.getElementById('ocrConf').textContent = `Confiança: ${conf}%`;
      document.getElementById('ocrResultBox').style.display = 'block';

      if (conf < 50) NotificationView.warn('⚠️ Reconhecimento com baixa confiança. Revise o texto.');

    } catch (err) {
      document.getElementById('ocrBar').style.display = 'none';
      NotificationView.error('❌ Erro no OCR: ' + err.message);
    }
    e.target.value = '';
  }

  _loadTesseract() {
    return new Promise((res, rej) => {
      if (window.Tesseract) { this._loaded = true; res(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/tesseract.js@5.0.2/dist/tesseract.min.js';
      s.onload = () => { this._loaded = true; res(); };
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  use() {
    const text = document.getElementById('ocrTxt')?.value.trim();
    if (text && this.docModel) this.docModel.ocrText = text;
    document.getElementById('ocrResultBox').style.display = 'none';
    NotificationView.info('✅ Texto OCR incorporado');
  }

  discard() {
    if (this.docModel) this.docModel.ocrText = null;
    this.reset();
  }

  reset() {
    document.getElementById('ocrBar').style.display = 'none';
    document.getElementById('ocrResultBox').style.display = 'none';
    const input = document.getElementById('ocrInput');
    if (input) input.value = '';
    const txt = document.getElementById('ocrTxt');
    if (txt) txt.value = '';
    const fill = document.getElementById('ocrFill');
    if (fill) fill.style.width = '0%';
  }
}
