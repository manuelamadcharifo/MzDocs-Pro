// controllers/Controllers.js — MzDocs Pro v4
import { DocumentModel, CreditModel, QueueModel } from '../models/Models.js';
import { DocumentView, ModalView, NotificationView } from '../views/Views.js';
import { OpenRouterService } from '../services/Services.js';
import { SERVICES } from '../services/ServiceDefinitions.js';
import { Validator } from '../utils/Validator.js';

const WA_NUMBER = '258858695506'; // ← altere para o número de suporte

// ─────────────────────────────────────────────────────────────
// DOCUMENT CONTROLLER
// ─────────────────────────────────────────────────────────────
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
    // Cards de serviço
    document.querySelectorAll('.svc-card[data-svc]').forEach(el => {
      el.addEventListener('click', () => this.open(el.dataset.svc));
      // Acessibilidade: teclado
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.open(el.dataset.svc);
        }
      });
    });

    // Fechar overlays
    document.getElementById('formClose')?.addEventListener('click', () => this.closeForm());
    document.getElementById('resultClose')?.addEventListener('click', () => this.closeResult());
    document.getElementById('formOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'formOverlay') this.closeForm();
    });
    document.getElementById('resultOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'resultOverlay') this.closeResult();
    });

    // Botões de resultado
    document.getElementById('btnCopy')?.addEventListener('click', () => this.copyDoc());
    document.getElementById('btnDl')?.addEventListener('click', () => this.downloadDoc());
    document.getElementById('btnWaResult')?.addEventListener('click', () => this.sendWA());

    // Fechar com ESC
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (ModalView.isOpen('resultOverlay')) this.closeResult();
        else if (ModalView.isOpen('formOverlay')) this.closeForm();
      }
    });
  }

  open(key) {
    const svc = SERVICES[key];
    if (!svc) return;

    // Verificar créditos para serviços IA
    if (svc.hasAI && !this.creditModel.canConsume(1)) {
      window.paymentController?.showPricing?.();
      NotificationView.warn('Precisas de mais créditos para continuar.');
      return;
    }

    this.docModel.reset();
    this.docModel.service = key;

    // Cabeçalho do modal
    const shIco = document.getElementById('shIco');
    if (shIco) {
      shIco.textContent = svc.icon;
      shIco.style.background = svc.bg;
    }
    const shTitle = document.getElementById('shTitle');
    if (shTitle) shTitle.textContent = svc.title;
    const shSub = document.getElementById('shSub');
    if (shSub) shSub.textContent = svc.sub;

    // OCR zone — só para serviços IA
    const ocrZone = document.getElementById('ocrZone');
    if (ocrZone) ocrZone.style.display = svc.hasAI ? 'block' : 'none';
    window.ocrController?.reset?.();

    // Renderizar formulário
    DocumentView.renderForm(
      svc,
      document.getElementById('formBody'),
      document.getElementById('formFoot')
    );

    // Bind dos botões gerados dinamicamente
    setTimeout(() => {
      const btnGen = document.getElementById('btnGen');
      const btnWa  = document.getElementById('btnWaDirect');
      if (btnGen) btnGen.addEventListener('click', () => this.generate());
      if (btnWa)  btnWa.addEventListener('click',  () => this.sendDirect());
    }, 50);

    ModalView.open('formOverlay');
  }

  closeForm() {
    ModalView.close('formOverlay');
    DocumentView.hideLoader(this._genIv);
    this.docModel.reset();
  }

  closeResult() {
    ModalView.close('resultOverlay');
  }

  async generate() {
    const key = this.docModel.service;
    const svc = SERVICES[key];
    if (!svc) return;

    const data    = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) {
      NotificationView.warn(`Preenche o campo: ${missing}`);
      // Focar o campo em falta
      document.getElementById(missing)?.focus?.();
      return;
    }

    if (!this.creditModel.canConsume(1)) {
      window.paymentController?.showPricing?.();
      NotificationView.warn('Precisas de créditos para gerar documentos com IA.');
      return;
    }

    // Bloquear botão e mostrar loader
    const btn = document.getElementById('btnGen');
    if (btn) btn.disabled = true;

    const STEPS = [
      'A verificar os teus dados…',
      'A consultar a IA…',
      'A escrever o documento…',
      'A finalizar…',
    ];
    this._genIv = DocumentView.showLoader(STEPS);

    try {
      const result = await this.queue.add(() =>
        this.openRouter.generate(key, data, this.docModel.ocrText)
      );

      DocumentView.hideLoader(this._genIv);

      // Consumir crédito apenas após sucesso
      await this.creditModel.consume(1);

      this.docModel.setGenerated(result.document, result.model);
      this.docModel.formData = data;

      ModalView.close('formOverlay');
      DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);
      ModalView.open('resultOverlay');
      NotificationView.success('Documento pronto! ✅');

    } catch (err) {
      DocumentView.hideLoader(this._genIv);

      if (err.message === 'INSUFFICIENT_CREDITS') {
        window.paymentController?.showPricing?.();
        NotificationView.warn('Precisas de mais créditos.');
      } else if (err.message === 'RATE_LIMIT' || err.status === 429) {
        NotificationView.warn('Demasiados pedidos. Aguarda uns segundos e tenta de novo.');
      } else if (err.name === 'AbortError' || err.message === 'Request timeout') {
        NotificationView.error('A IA demorou demasiado. Verifica a ligação e tenta novamente.');
      } else {
        NotificationView.error('Algo correu mal. Tenta novamente em breve.');
        console.error('[DocumentController] Erro ao gerar:', err);
      }
    }
  }

  sendDirect() {
    const key = this.docModel.service;
    const svc = SERVICES[key];
    if (!svc?.buildWA) return;

    const data    = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) {
      NotificationView.warn(`Preenche o campo: ${missing}`);
      document.getElementById(missing)?.focus?.();
      return;
    }

    const msg = svc.buildWA(data);
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    this.closeForm();
    NotificationView.success('A abrir o WhatsApp… 💬');
  }

  copyDoc() {
    if (!this.docModel.content) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(this.docModel.content)
        .then(() => NotificationView.success('Copiado para a área de transferência 📋'))
        .catch(() => this._fallbackCopy());
    } else {
      this._fallbackCopy();
    }
  }

  _fallbackCopy() {
    const ta = document.createElement('textarea');
    ta.value = this.docModel.content;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      NotificationView.success('Copiado! 📋');
    } catch {
      NotificationView.error('Não foi possível copiar. Selecciona o texto manualmente.');
    }
    document.body.removeChild(ta);
  }

  downloadDoc() {
    if (!this.docModel.content) return;
    const svcName = this.docModel.service || 'documento';
    const blob = new Blob([this.docModel.content], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mzdocs-${svcName}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    NotificationView.success('Download iniciado ⬇️');
  }

  sendWA() {
    if (!this.docModel.content) return;
    const svc     = SERVICES[this.docModel.service];
    const preview = this.docModel.content.slice(0, 800).replace(/#{1,3} /g, '*');
    const msg     = `📄 *${svc?.title || 'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado com IA via MzDocs Pro_`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

// ─────────────────────────────────────────────────────────────
// OCR CONTROLLER
// ─────────────────────────────────────────────────────────────
export class OCRController {
  constructor(docModel) {
    this.docModel = docModel;
    this._worker  = null;
    this._loaded  = false;
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnCam')?.addEventListener('click',  () => this.trigger('cam'));
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

    if (file.size > 5 * 1024 * 1024) {
      NotificationView.error('Imagem demasiado grande. Máximo: 5 MB.');
      return;
    }

    const ocrBar       = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    const ocrFill      = document.getElementById('ocrFill');
    const ocrStatusTxt = document.getElementById('ocrStatusTxt');

    if (ocrBar) ocrBar.style.display = 'block';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    if (ocrFill) ocrFill.style.width = '0%';
    if (ocrStatusTxt) ocrStatusTxt.textContent = 'A inicializar…';

    try {
      if (!this._loaded) {
        if (ocrStatusTxt) ocrStatusTxt.textContent = 'A carregar motor de reconhecimento…';
        await this._loadTesseract();
      }

      if (!this._worker) {
        if (ocrStatusTxt) ocrStatusTxt.textContent = 'A preparar para português…';
        this._worker = await Tesseract.createWorker('por', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const p = Math.round(m.progress * 100);
              if (ocrFill) ocrFill.style.width = `${p}%`;
              if (ocrStatusTxt) ocrStatusTxt.textContent = `A reconhecer texto… ${p}%`;
            }
          }
        });
      }

      const result = await this._worker.recognize(file);
      const text   = result.data.text.trim();
      const conf   = Math.round(result.data.confidence);

      if (ocrBar) ocrBar.style.display = 'none';

      const ocrTxt  = document.getElementById('ocrTxt');
      const ocrConf = document.getElementById('ocrConf');

      if (ocrTxt) ocrTxt.value = text;
      if (ocrConf) ocrConf.textContent = `Confiança: ${conf}%`;
      if (ocrResultBox) ocrResultBox.style.display = 'block';

      if (!text) {
        NotificationView.warn('Não consegui ler texto nesta imagem. Tenta com outra foto.');
      } else if (conf < 50) {
        NotificationView.warn('Texto reconhecido com baixa confiança — revê antes de usar.');
      } else {
        NotificationView.info('Texto reconhecido! Revê e clica em "Usar este texto".');
      }

    } catch (err) {
      if (ocrBar) ocrBar.style.display = 'none';
      NotificationView.error('Não consegui ler a imagem. Tenta com uma foto mais nítida.');
      console.error('[OCR] Erro:', err);
    }

    e.target.value = '';
  }

  _loadTesseract() {
    return new Promise((res, rej) => {
      if (window.Tesseract) { this._loaded = true; res(); return; }
      const s    = document.createElement('script');
      s.src      = 'https://unpkg.com/tesseract.js@5.0.2/dist/tesseract.min.js';
      s.onload   = () => { this._loaded = true; res(); };
      s.onerror  = () => rej(new Error('Não foi possível carregar o motor OCR'));
      document.head.appendChild(s);
    });
  }

  use() {
    const text = document.getElementById('ocrTxt')?.value.trim();
    if (text && this.docModel) {
      this.docModel.ocrText = text;
      NotificationView.info('Texto incorporado no formulário ✓');
    }
    const ocrResultBox = document.getElementById('ocrResultBox');
    if (ocrResultBox) ocrResultBox.style.display = 'none';
  }

  discard() {
    if (this.docModel) this.docModel.ocrText = null;
    this.reset();
    NotificationView.info('Texto descartado');
  }

  reset() {
    const ocrBar       = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    const ocrInput     = document.getElementById('ocrInput');
    const ocrTxt       = document.getElementById('ocrTxt');
    const ocrFill      = document.getElementById('ocrFill');

    if (ocrBar) ocrBar.style.display = 'none';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    if (ocrInput) ocrInput.value = '';
    if (ocrTxt) ocrTxt.value = '';
    if (ocrFill) ocrFill.style.width = '0%';
  }
}

// Re-exportar controllers dos seus módulos
export { PaymentController } from './PaymentController.js';
export { AdminController }   from './AdminController.js';
