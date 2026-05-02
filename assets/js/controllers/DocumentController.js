// assets/js/controllers/DocumentController.js
import { DocumentModel, QueueModel } from '../models/Models.js';
import { DocumentView, ModalView, NotificationView } from '../views/Views.js';
import { OpenRouterService } from '../services/Services.js';
import { SERVICES } from '../services/ServiceDefinitions.js';
import { Validator } from '../utils/Formatter.js';

const WA_NUMBER = '258858695506'; // ← SUBSTITUA PELO TEU NÚMERO WHATSAPP

export class DocumentController {
  constructor(creditModel) {
    this.creditModel = creditModel;
    this.docModel = new DocumentModel();
    this.queue = new QueueModel();
    this.openRouter = new OpenRouterService();
    this._genIv = null;
    this._bindEvents();
  }

  _bindEvents() {
    document.querySelectorAll('.sc[data-svc]').forEach(el => {
      el.addEventListener('click', () => this.open(el.dataset.svc));
    });
    document.getElementById('formClose')?.addEventListener('click', () => this.closeForm());
    document.getElementById('resultClose')?.addEventListener('click', () => this.closeResult());
    document.getElementById('formOverlay')?.addEventListener('click', e => { if (e.target.id === 'formOverlay') this.closeForm(); });
    document.getElementById('resultOverlay')?.addEventListener('click', e => { if (e.target.id === 'resultOverlay') this.closeResult(); });
    document.getElementById('btnCopy')?.addEventListener('click', () => this.copyDoc());
    document.getElementById('btnDl')?.addEventListener('click', () => this.downloadDoc());
    document.getElementById('btnWaResult')?.addEventListener('click', () => this.sendWA());
    document.addEventListener('document:reedit', (e) => this.handleReedit(e.detail));
  }

  open(key) {
    const svc = SERVICES[key];
    if (!svc) return;

    if (svc.hasAI && !this.creditModel.canConsume(1)) {
      window.paymentController?.showPricing();
      NotificationView.warn('⚠️ Créditos insuficientes. Compre mais para continuar.');
      return;
    }

    this.docModel.reset();
    this.docModel.service = key;

    document.getElementById('shIco').textContent = svc.icon;
    document.getElementById('shIco').style.background = svc.bg;
    document.getElementById('shTitle').textContent = svc.title;
    document.getElementById('shSub').textContent = svc.sub;

    document.getElementById('ocrZone').style.display = svc.hasAI ? 'block' : 'none';
    window.ocrController?.reset();

    DocumentView.renderForm(svc, document.getElementById('formBody'), document.getElementById('formFoot'));

    setTimeout(() => {
      const btnGen = document.getElementById('btnGen');
      const btnWa  = document.getElementById('btnWaDirect');
      if (btnGen) btnGen.onclick = () => this.generate();
      if (btnWa)  btnWa.onclick  = () => this.sendDirect();
    }, 50);

    ModalView.open('formOverlay');
  }

  closeForm()   { ModalView.close('formOverlay');  DocumentView.hideLoader(this._genIv); this.docModel.reset(); }
  closeResult() { ModalView.close('resultOverlay'); }

  async generate() {
    const key = this.docModel.service;
    const svc  = SERVICES[key];
    if (!svc) return;

    const data    = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) { NotificationView.warn(`⚠️ Campo obrigatório: ${missing}`); return; }
    if (!this.creditModel.canConsume(1)) { window.paymentController?.showPricing(); return; }

    const btn = document.getElementById('btnGen');
    if (btn) btn.disabled = true;

    const STEPS = [
      'A analisar dados do formulário…',
      'A consultar IA (OpenRouter)…',
      'A redigir o documento…',
      'A finalizar…'
    ];
    this._genIv = DocumentView.showLoader(STEPS);

    try {
      // CORRIGIDO: passa creditModel.value directamente para a API
      // evita leitura errada do localStorage com chave incorrecta
      const result = await this.queue.add(() =>
        this.openRouter.generate(key, data, this.docModel.ocrText, this.creditModel.value)
      );

      DocumentView.hideLoader(this._genIv);
      await this.creditModel.consume(1);

      this.docModel.setGenerated(result.document, result.model);
      this.docModel.formData = data;

      ModalView.close('formOverlay');
      DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);
      ModalView.open('resultOverlay');
      NotificationView.success('✅ Documento gerado!');

    } catch (err) {
      DocumentView.hideLoader(this._genIv);
      if (btn) btn.disabled = false;
      if (err.message === 'INSUFFICIENT_CREDITS') {
        window.paymentController?.showPricing();
      } else {
        NotificationView.error('❌ ' + (err.message || 'Erro ao gerar. Tente novamente.'));
      }
    }
  }

  sendDirect() {
    const key = this.docModel.service;
    const svc  = SERVICES[key];
    if (!svc?.buildWA) return;
    const data    = DocumentView.collectData(svc.fields);
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mzdocs-${this.docModel.service || 'doc'}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  sendWA() {
    if (!this.docModel.content) return;
    const svc     = SERVICES[this.docModel.service];
    const preview = this.docModel.content.slice(0, 1000).replace(/#{1,3} /g, '*');
    const msg     = `📄 *${svc?.title || 'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  async handleReedit({ currentContent, instruction, serviceType }) {
    if (!this.creditModel.canConsume(1)) {
      NotificationView.warn('⚠️ Créditos insuficientes para reedição.');
      return;
    }

    NotificationView.info('🤖 A reeditar documento...');

    try {
      const result = await this.queue.add(() =>
        this.openRouter.generateRaw(
          `EDITAR DOCUMENTO conforme instrução: "${instruction}"\n\nDOCUMENTO ATUAL:\n"""\n${currentContent}\n"""\n\nINSTRUÇÃO: ${instruction}\n\nReescreva o documento completo aplicando as alterações. Mantenha formato Markdown.`,
          {
            serviceType:    serviceType || this.docModel.service,
            currentContent,
            instruction,
          },
          this.creditModel.value  // CORRIGIDO: passa créditos reais
        )
      );

      if (window.documentEditor) {
        window.documentEditor.loadDocument(result.document, serviceType || this.docModel.service);
        this.docModel.setGenerated(result.document, result.model);
      }

      await this.creditModel.consume(1);
      NotificationView.success('✅ Documento reeditado!');

    } catch (err) {
      NotificationView.error('❌ ' + (err.message || 'Erro na reedição.'));
    }
  }
}