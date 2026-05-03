// assets/js/controllers/DocumentController.js
import { DocumentModel, QueueModel } from '../models/Models.js';
import { DocumentView, ModalView, NotificationView } from '../views/Views.js';
import { OpenRouterService } from '../services/Services.js';
import { SERVICES } from '../services/ServiceDefinitions.js';
import { Validator } from '../utils/Formatter.js';
import { DocumentEditor } from '../components/DocumentEditor.js';

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
    document.getElementById('btnEdit')?.addEventListener('click', () => this._openEditor());
    document.addEventListener('document:reedit', (e) => this.handleReedit(e.detail));

    // Garante que o DocumentEditor está inicializado e acessível globalmente
    if (!window.documentEditor) {
      window.documentEditor = new DocumentEditor();
    }
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
    this._removeExportMenu();

    const menu = document.createElement('div');
    menu.id = 'exportMenu';
    menu.style.cssText = [
      'position:fixed','bottom:90px','left:50%','transform:translateX(-50%)',
      'background:#fff','border-radius:14px','box-shadow:0 8px 32px rgba(0,0,0,.18)',
      'padding:8px','display:flex','flex-direction:column','gap:4px',
      'z-index:99999','min-width:210px','border:1.5px solid #e5e7eb',
    ].join(';');

    const opts = [
      { icon:'📄', label:'PDF',           fn: () => this._exportPDF()  },
      { icon:'📃', label:'Word (.docx)',  fn: () => this._exportWord() },
      { icon:'📊', label:'Excel (.xlsx)', fn: () => this._exportExcel()},
    ];

    opts.forEach(({ icon, label, fn }) => {
      const btn = document.createElement('button');
      btn.textContent = `${icon} ${label}`;
      btn.style.cssText = [
        'padding:12px 16px','border:none','background:none','border-radius:10px',
        'font-size:14px','font-weight:600','cursor:pointer','text-align:left',
        'font-family:inherit','width:100%','color:#07101f',
      ].join(';');
      btn.onmouseenter = () => { btn.style.background = '#f3f4f6'; };
      btn.onmouseleave = () => { btn.style.background = 'none'; };
      btn.onclick = () => { this._removeExportMenu(); fn(); };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
      this._menuOutside = (e) => { if (!menu.contains(e.target)) this._removeExportMenu(); };
      document.addEventListener('click', this._menuOutside);
    }, 100);
  }

  _removeExportMenu() {
    document.getElementById('exportMenu')?.remove();
    if (this._menuOutside) { document.removeEventListener('click', this._menuOutside); this._menuOutside = null; }
  }

  async _exportPDF() {
    NotificationView.info('⏳ A gerar PDF…');
    try {
      const { PDFExporter } = await import('../components/PDFExporter.js');
      const exp = new PDFExporter();
      const svc = SERVICES[this.docModel.service];
      await exp.export(this.docModel.content, `mzdocs-${this.docModel.service}-${Date.now()}.pdf`, { title: svc?.title || 'Documento' });
      NotificationView.success('✅ PDF descarregado!');
    } catch (err) { NotificationView.error('❌ Erro no PDF: ' + err.message); }
  }

  async _exportWord() {
    NotificationView.info('⏳ A gerar Word…');
    try {
      const { WordExporter } = await import('../components/WordExporter.js');
      const exp = new WordExporter();
      const svc = SERVICES[this.docModel.service];
      await exp.export(this.docModel.content, `mzdocs-${this.docModel.service}-${Date.now()}.docx`, { title: svc?.title || 'Documento' });
      NotificationView.success('✅ Word descarregado!');
    } catch (err) { NotificationView.error('❌ Erro no Word: ' + err.message); }
  }

  async _exportExcel() {
    NotificationView.info('⏳ A gerar Excel…');
    try {
      const { ExcelExporter } = await import('../components/ExcelExporter.js');
      const exp = new ExcelExporter();
      const svc = SERVICES[this.docModel.service];
      await exp.export(this.docModel.content, `mzdocs-${this.docModel.service}-${Date.now()}.xlsx`, { title: svc?.title || 'Documento' });
      NotificationView.success('✅ Excel descarregado!');
    } catch (err) { NotificationView.error('❌ Erro no Excel: ' + err.message); }
  }

  _openEditor() {
    if (!this.docModel.content) { NotificationView.warn('⚠️ Nenhum documento gerado ainda.'); return; }
    if (!window.documentEditor) { window.documentEditor = new DocumentEditor(); }
    const svc = SERVICES[this.docModel.service];
    window.documentEditor.loadDocument(this.docModel.content, svc?.title || this.docModel.service);
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