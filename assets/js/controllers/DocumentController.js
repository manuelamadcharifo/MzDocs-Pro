// assets/js/controllers/DocumentController.js
import { DocumentModel, QueueModel } from '../models/Models.js';
import { DocumentView, ModalView, NotificationView } from '../views/Views.js';
import { OpenRouterService } from '../services/Services.js';
import { SERVICES } from '../services/ServiceDefinitions.js';
import { LongDocumentEngine } from '../services/LongDocumentEngine.js';
import { Validator } from '../utils/Formatter.js';
import { DocumentEditor } from '../components/DocumentEditor.js';
import { Storage } from '../utils/Storage.js';

const WA_NUMBER = '258858695506';

export class DocumentController {
  constructor(creditModel) {
    this.creditModel  = creditModel;
    this.docModel     = new DocumentModel();
    this.queue        = new QueueModel();
    this.openRouter   = new OpenRouterService();
    this.longEngine   = new LongDocumentEngine();
    this._genIv       = null;
    this._menuOutside = null;
    this._longRunning = false; // flag para UI de longa duração

    if (!window.documentEditor) {
      window.documentEditor = new DocumentEditor();
    }

    this._bindEvents();
  }

  _bindEvents() {
    document.querySelectorAll('.sc[data-svc]').forEach(el => {
      el.addEventListener('click', () => this.open(el.dataset.svc));
    });

    document.getElementById('formClose')?.addEventListener('click', () => this.closeForm());
    document.getElementById('resultClose')?.addEventListener('click', () => this.closeResult());

    document.getElementById('formOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'formOverlay') this.closeForm();
    });

    document.getElementById('btnCopy')?.addEventListener('click', () => this.copyDoc());
    document.getElementById('btnDl')?.addEventListener('click',   () => this.downloadDoc());
    document.getElementById('btnWaResult')?.addEventListener('click', () => this.sendWA());
    document.addEventListener('document:reedit', (e) => this.handleReedit(e.detail));
  }

  // ── Abre formulário de serviço ─────────────────────────────────
  open(key) {
    const svc = SERVICES[key];
    if (!svc) return;

    const cost = svc.cost || 1;
    if (svc.hasAI && !this.creditModel.canConsume(cost)) {
      const isGuest = !window.authManager?.isAuthenticated();
      window.paymentController?.showPricing(isGuest);
      NotificationView.warn(isGuest
        ? '⚠️ Inicie sessão ou adquira acesso avulso para gerar documentos.'
        : '⚠️ Créditos insuficientes. Compre mais para continuar.');
      return;
    }

    this.docModel.reset();
    this.docModel.service = key;

    document.getElementById('shIco').textContent       = svc.icon;
    document.getElementById('shIco').style.background  = svc.bg;
    document.getElementById('shTitle').textContent     = svc.title;
    document.getElementById('shSub').textContent       = svc.sub;
    document.getElementById('ocrZone').style.display   = svc.hasAI ? 'block' : 'none';
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

  closeForm() {
    ModalView.close('formOverlay');
    DocumentView.hideLoader(this._genIv);
    this.docModel.reset();
    if (this._longRunning) {
      this.longEngine.abort();
      this._longRunning = false;
    }
  }
  closeResult() { ModalView.close('resultOverlay'); this._removeExportMenu(); }

  // ── Gera documento ─────────────────────────────────────────────
  async generate() {
    const key = this.docModel.service;
    const svc  = SERVICES[key];
    if (!svc) return;

    const data    = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) { NotificationView.warn(`⚠️ Campo obrigatório: ${missing}`); return; }

    const cost = svc.cost || 1;
    if (!this.creditModel.canConsume(cost)) {
      const isGuest = !window.authManager?.isAuthenticated();
      window.paymentController?.showPricing(isGuest);
      return;
    }

    const btn = document.getElementById('btnGen');
    if (btn) btn.disabled = true;

    // ── Decidir: fluxo normal ou geração em cadeia (longa)? ──────
    const isLongDoc = LongDocumentEngine.isLongDoc(key, data);

    if (isLongDoc) {
      await this._generateLong(key, svc, data, cost, btn);
    } else {
      await this._generateNormal(key, svc, data, cost, btn);
    }
  }

  // ── Geração Normal (corrida paralela — documentos curtos) ──────
  async _generateNormal(key, svc, data, cost, btn) {
    const STEPS = [
      'A analisar dados do formulário…',
      'A consultar IA…',
      'A redigir o documento…',
      'A finalizar…',
    ];
    this._genIv = DocumentView.showLoader(STEPS);

    try {
      const result = await this.queue.add(() =>
        this.openRouter.generate(key, data, this.docModel.ocrText, this.creditModel.value)
      );

      DocumentView.hideLoader(this._genIv);
      await this.creditModel.consume(cost);
      this.docModel.setGenerated(result.document, result.model);
      this.docModel.formData = data;

      await this._saveHistory(key, svc, result);
      ModalView.close('formOverlay');
      DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);
      ModalView.open('resultOverlay');
      this._bindEditBtn();
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

  // ── Geração Longa (cadeia de secções — documentos longos) ──────
  async _generateLong(key, svc, data, cost, btn) {
    this._longRunning = true;

    // Passos dinâmicos: Planeamento + N secções + Consolidação
    const pages    = parseInt(data.paginas || 10);
    const estSecs  = key === 'planonegocio' ? 8 : Math.max(4, Math.round(pages / 2));

    const STEPS = [
      '📋 A planear estrutura do documento…',
      ...Array.from({ length: estSecs }, (_, i) => `✍️ A redigir secção ${i + 1}/${estSecs}…`),
      '🔗 A consolidar e rever coerência…',
    ];
    this._genIv = DocumentView.showLoader(STEPS);

    // Liga progresso do LongDocEngine ao loader da UI
    let stepIndex = 0;
    this.longEngine.onProgress(({ phase, step, total, text, provider }) => {
      // Actualiza o passo activo no loader
      const steps = document.querySelectorAll('.lstep');
      steps.forEach((el, i) => {
        el.classList.remove('active', 'done');
        if (i < stepIndex) el.classList.add('done');
      });
      const activeEl = steps[stepIndex];
      if (activeEl) {
        activeEl.classList.add('active');
        const span = activeEl.querySelector('span:last-child');
        if (span) span.textContent = text + (provider ? ` [${provider}]` : '');
      }
      stepIndex = Math.min(stepIndex + 1, steps.length - 1);
    });

    try {
      // O prompt base (para fallback dentro do LongDocEngine)
      const prompt = this.openRouter._buildPrompt(key, data, this.docModel.ocrText);

      const result = await this.longEngine.generate(key, prompt, data, this.creditModel.value);

      if (!result) {
        // LongDocEngine caiu para null → usa fluxo normal como fallback
        this._longRunning = false;
        NotificationView.info('ℹ️ A usar geração normal como fallback…');
        await this._generateNormal(key, svc, data, cost, btn);
        return;
      }

      DocumentView.hideLoader(this._genIv);
      await this.creditModel.consume(cost);
      this.docModel.setGenerated(result.document, result.model);
      this.docModel.formData = data;

      await this._saveHistory(key, svc, result);
      ModalView.close('formOverlay');

      const displayModel = `⛓️ Cadeia de Geração · ${result.sections || '?'} secções`;
      DocumentView.renderResult(result.document, svc, this.creditModel.value, displayModel);
      ModalView.open('resultOverlay');
      this._bindEditBtn();
      NotificationView.success(`✅ Documento longo gerado! (${result.sections} secções)`);

    } catch (err) {
      DocumentView.hideLoader(this._genIv);
      if (btn) btn.disabled = false;
      this._longRunning = false;

      if (err.message === 'Abortado pelo utilizador') {
        NotificationView.warn('⚠️ Geração cancelada.');
      } else if (err.message === 'INSUFFICIENT_CREDITS') {
        window.paymentController?.showPricing();
      } else {
        // Fallback para geração normal se a cadeia falhar completamente
        NotificationView.warn('⚠️ Geração em cadeia falhou. A tentar geração normal…');
        try {
          await this._generateNormal(key, svc, data, cost, btn);
        } catch (e2) {
          NotificationView.error('❌ ' + (e2.message || 'Erro ao gerar.'));
        }
      }
    } finally {
      this._longRunning = false;
    }
  }

  // ── Guarda histórico (Supabase + IndexedDB offline) ───────────
  async _saveHistory(key, svc, result) {
    try {
      const userId = window.authManager?.user?.id || Storage.getUserId();
      await window.historyController?.saveDocument({
        id: crypto.randomUUID(),
        user_id: userId,
        service_type: key,
        title: svc.title,
        content: result.document,
        model_used: result.model,
        created_at: new Date().toISOString(),
      });
    } catch (_) { /* histórico não é crítico */ }
  }

  // ── Envio directo WhatsApp (serviços sem IA) ───────────────────
  sendDirect() {
    const key = this.docModel.service;
    const svc  = SERVICES[key];
    if (!svc?.buildWA) return;
    const data    = DocumentView.collectData(svc.fields);
    const missing = Validator.required(svc.fields, data);
    if (missing) { NotificationView.warn(`⚠️ Campo obrigatório: ${missing}`); return; }
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(svc.buildWA(data))}`, '_blank');
    this.closeForm();
    NotificationView.success('✅ A abrir WhatsApp…');
  }

  // ── Copiar ─────────────────────────────────────────────────────
  copyDoc() {
    if (!this.docModel.content) return;
    navigator.clipboard?.writeText(this.docModel.content)
      .then(() => NotificationView.success('📋 Copiado!'))
      .catch(()  => NotificationView.error('Não foi possível copiar'));
  }

  // ── Download — menu com 3 opções ───────────────────────────────
  downloadDoc() {
    if (!this.docModel.content) return;
    this._removeExportMenu();

    const menu = document.createElement('div');
    menu.id = 'exportMenu';
    Object.assign(menu.style, {
      position: 'fixed', bottom: '90px', left: '50%',
      transform: 'translateX(-50%)', background: '#fff',
      borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
      zIndex: '99999', minWidth: '220px', border: '1.5px solid #e5e7eb',
    });

    const opts = [
      { icon: '📄', label: 'PDF',           fn: () => this._exportPDF()   },
      { icon: '📃', label: 'Word (.docx)',   fn: () => this._exportWord()  },
      { icon: '📊', label: 'Excel (.xlsx)',  fn: () => this._exportExcel() },
    ];

    opts.forEach(({ icon, label, fn }) => {
      const btn = document.createElement('button');
      btn.textContent = `${icon}  ${label}`;
      Object.assign(btn.style, {
        padding: '12px 16px', border: 'none', background: 'none',
        borderRadius: '10px', fontSize: '14px', fontWeight: '600',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        width: '100%', color: '#07101f',
      });
      btn.onmouseenter = () => { btn.style.background = '#f3f4f6'; };
      btn.onmouseleave = () => { btn.style.background = 'none'; };
      btn.onclick = () => {
        this._removeExportMenu();
        const dlBtn = document.getElementById('btnDl');
        if (dlBtn) { dlBtn.textContent = '⏳ A preparar…'; dlBtn.disabled = true; }
        Promise.resolve(fn()).finally(() => {
          if (dlBtn) { dlBtn.textContent = '⬇️ Download'; dlBtn.disabled = false; }
        });
      };
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
    if (this._menuOutside) {
      document.removeEventListener('click', this._menuOutside);
      this._menuOutside = null;
    }
  }

  async _exportPDF() {
    NotificationView.info('⏳ A gerar PDF…');
    try {
      const { PDFExporter } = await import('../components/PDFExporter.js');
      const svc = SERVICES[this.docModel.service];
      await new PDFExporter().export(
        this.docModel.content,
        `mzdocs-${this.docModel.service}-${Date.now()}.pdf`,
        { title: svc?.title || 'Documento' }
      );
      NotificationView.success('✅ PDF descarregado!');
    } catch (err) { NotificationView.error('❌ Erro PDF: ' + err.message); }
  }

  async _exportWord() {
    NotificationView.info('⏳ A gerar Word…');
    try {
      const { WordExporter } = await import('../components/WordExporter.js');
      const svc = SERVICES[this.docModel.service];
      await new WordExporter().export(
        this.docModel.content,
        `mzdocs-${this.docModel.service}-${Date.now()}.docx`,
        { title: svc?.title || 'Documento' }
      );
      NotificationView.success('✅ Word descarregado!');
    } catch (err) { NotificationView.error('❌ Erro Word: ' + err.message); }
  }

  async _exportExcel() {
    NotificationView.info('⏳ A gerar Excel…');
    try {
      const { ExcelExporter } = await import('../components/ExcelExporter.js');
      const svc = SERVICES[this.docModel.service];
      await new ExcelExporter().export(
        this.docModel.content,
        `mzdocs-${this.docModel.service}-${Date.now()}.xlsx`,
        { title: svc?.title || 'Documento' }
      );
      NotificationView.success('✅ Excel descarregado!');
    } catch (err) { NotificationView.error('❌ Erro Excel: ' + err.message); }
  }

  _bindEditBtn() {
    const btn = document.getElementById('btnEdit');
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openEditor();
    });
  }

  _openEditor() {
    if (!this.docModel.content) {
      NotificationView.warn('⚠️ Nenhum documento gerado ainda.');
      return;
    }
    if (window.documentEditor) {
      try { window.documentEditor.close(); } catch(e) {}
    }
    window.documentEditor = new DocumentEditor();
    const svc = SERVICES[this.docModel.service] || {};
    window.documentEditor.loadDocument(
      this.docModel.content,
      svc.title || this.docModel.service || 'Documento'
    );
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
          { serviceType: serviceType || this.docModel.service, currentContent, instruction },
          this.creditModel.value
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
