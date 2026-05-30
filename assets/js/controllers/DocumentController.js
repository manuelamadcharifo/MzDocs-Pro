// assets/js/controllers/DocumentController.js
import { DocumentModel, QueueModel } from '../models/Models.js';
import { DocumentView, ModalView, NotificationView } from '../views/Views.js';
import { OpenRouterService } from '../services/Services.js';
import { SERVICES } from '../services/ServiceDefinitions.js';
import { LongDocumentEngine } from '../services/LongDocumentEngine.js';
import { Validator } from '../utils/Formatter.js';
import { DocumentEditor } from '../components/DocumentEditor.js';
import { Storage } from '../utils/Storage.js';
import { offlineDB } from '../utils/IndexedDB.js';
import { TemplateController } from './TemplateController.js';
import { templatePicker } from '../marketplace/TemplatePicker.js';
import { academicUI } from '../academic/AcademicUI.js';
import { getTemplates } from '../marketplace/TemplateLibrary.js';

// ─── documentState: single source of truth for generated content ─────────────
export const documentState = {
  currentContent: '',
  serviceType: '',
  lastUpdated: null,
  set(content, serviceType) {
    this.currentContent = content || '';
    this.serviceType = serviceType || '';
    this.lastUpdated = Date.now();
    console.log('[documentState] set — length:', this.currentContent.length, 'service:', serviceType);
  },
  get() { return this.currentContent; },
  isValid() { return typeof this.currentContent === 'string' && this.currentContent.trim().length > 0; },
};
if (typeof window !== 'undefined') window.documentState = documentState;


const WA_NUMBER = '258858695506';

export class DocumentController {
 constructor(creditModel) {
 this.creditModel = creditModel;
 this.docModel = new DocumentModel();
 this.queue = new QueueModel();
 this.openRouter = new OpenRouterService();
 this.longEngine = new LongDocumentEngine();
 this.templateCtrl = new TemplateController(this.docModel, this.openRouter);
 this._genIv    = null;
 this._abortCtrl = null;
 this._menuOutside = null;
 this._longRunning = false;
 // CORRIGIDO: flag anti-duplo-clique — impede múltiplas gerações simultâneas
 // que causavam o modal de resultado não abrir e créditos debitados sem mostrar documento
 this._generating = false;

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
 document.getElementById('btnDl')?.addEventListener('click', () => this.downloadDoc());
 document.getElementById('btnWaResult')?.addEventListener('click', () => this.sendWA());

    // Botão "Escolher Modelo" — abre o TemplatePicker
    document.getElementById('btnTemplate')?.addEventListener('click', () => {
      const key     = this.docModel?.service || documentState.serviceType || '';
      const content = documentState.currentContent
                   || this.docModel?.content
                   || '';
      const svc     = SERVICES[key] || {};

      // Se não há templates para este serviço, fazer download PDF directo
      const templates = getTemplates(key);
      if (!templates.length) {
        if (!content) { _notifyInline('Gere um documento primeiro.'); return; }
        import('../components/PDFExporter.js')
          .then(({ pdfExporter }) => pdfExporter.export(content, `mzdocs-${key || 'doc'}-${Date.now()}.pdf`, {}))
          .catch(err => console.error('[btnTemplate] PDF export:', err));
        return;
      }

      // Abrir picker — mesmo sem content mostra os templates com preview vazio
      templatePicker.open({
        serviceKey:     key,
        content:        content || '# Documento\n\nConteúdo gerado pelo MzDocs Pro.',
        svc:            svc,
        onApply:        (tpl) => { this._applyTemplate(tpl); },
        onDownloadPDF:  (tpl) => { this._downloadWithTemplate(tpl, 'pdf'); },
        onDownloadWord: (tpl) => { this._downloadWithTemplate(tpl, 'word'); },
      });
    });

    // Helper de notificação inline para o controller
    function _notifyInline(msg) {
      const s = document.getElementById('notif-stack') || (() => {
        const el = document.createElement('div');
        el.id = 'notif-stack';
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
        document.body.appendChild(el);
        return el;
      })();
      const n = document.createElement('div');
      n.style.cssText = 'background:#0f172a;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.3)';
      n.textContent = msg;
      s.appendChild(n);
      setTimeout(() => n.remove(), 3000);
    }

    // Botão "Referências APA" — abre o painel académico
    document.getElementById('btnAcademic')?.addEventListener('click', () => {
      academicUI.open((bibMarkdown) => {
        const current = documentState.currentContent;
        const withBib = current + '\n\n' + bibMarkdown;
        this.docModel.setGenerated(withBib, this.docModel.model);
        documentState.set(withBib, this.docModel.service);
        const svc = SERVICES[this.docModel.service];
        DocumentView.renderResult(withBib, svc, this.creditModel.value, this.docModel.model);
        NotificationView.success('✅ Referências inseridas!');
      });
    });
 document.addEventListener('document:reedit', (e) => this.handleReedit(e.detail));

 document.addEventListener('editor:closed', (e) => {
 if (e.detail?.content) {
 this.docModel.setGenerated(e.detail.content, this.docModel.model);
      documentState.set(e.detail.content, this.docModel.service);
 }
 });
 }

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

 document.getElementById('shIco').textContent = svc.icon;
 document.getElementById('shIco').style.background = svc.bg;
 document.getElementById('shTitle').textContent = svc.title;
 document.getElementById('shSub').textContent = svc.sub;
 document.getElementById('ocrZone').style.display = svc.hasAI ? 'block' : 'none';
 window.ocrController?.reset();

 DocumentView.renderForm(svc, document.getElementById('formBody'), document.getElementById('formFoot'));

 // Bind template controller after form is rendered (btn exists now)
 this.templateCtrl.reset();
 this.templateCtrl.bindEvents();

 setTimeout(() => {
 const btnGen = document.getElementById('btnGen');
 const btnWa = document.getElementById('btnWaDirect');
 if (btnGen) btnGen.onclick = () => this.generate();
 if (btnWa) btnWa.onclick = () => this.sendDirect();
 }, 50);

 ModalView.open('formOverlay');
 }

 closeForm() {
 ModalView.close('formOverlay');
 DocumentView.hideLoader(this._genIv);
 this.docModel.reset();
 this.templateCtrl.reset();
 // Resetar flag de geração ao fechar o formulário
 this._generating = false;
 if (this._longRunning) {
 this.longEngine.abort();
 this._longRunning = false;
 }
 }
 closeResult() {
    ModalView.close('resultOverlay');
    this._removeExportMenu();
    // CORRIGIDO: limpar o CSS do template activo ao fechar o resultado,
    // para que ao gerar um novo documento o preview comece sempre sem template aplicado.
    if (window.DocumentView) window.DocumentView._activeTemplateCss = null;
    this._activeTemplate = null;
  }

 async generate() {
 // CORRIGIDO: protecção anti-duplo-clique
 // O utilizador às vezes clicava várias vezes quando a geração demorava,
 // causando múltiplas chamadas à API, múltiplas deduções de crédito,
 // e race conditions onde o modal voltava ao estado inicial.
 if (this._generating) {
   console.log('[DocumentController] generate() ignorado — já em curso');
   return;
 }

 const key = this.docModel.service;
 const svc = SERVICES[key];
 if (!svc) return;

 const data = DocumentView.collectData(svc.fields);
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

 if (LongDocumentEngine.isLongDoc(key, data)) {
 await this._generateLong(key, svc, data, cost, btn);
 } else {
 await this._generateNormal(key, svc, data, cost, btn);
 }
 }

 async _generateNormal(key, svc, data, cost, btn) {
 const STEPS = [
 'A analisar dados do formulário…',
 'A consultar IA…',
 'A redigir o documento…',
 'A finalizar…',
 ];
 this._genIv = DocumentView.showLoader(STEPS);

 // Cancelar qualquer geração anterior pendente
 if (this._abortCtrl) { try { this._abortCtrl.abort(); } catch (_) {} }
 this._abortCtrl = new AbortController();
 const { signal } = this._abortCtrl;

 // CORRIGIDO: activar flag de geração
 this._generating = true;

 const timeout = new Promise((_, reject) =>
   setTimeout(() => reject(new Error('A geração demorou demasiado. Verifique a sua ligação e tente novamente.')), 90000)
 );

 try {
 const result = await Promise.race([
 this.queue.add(() =>
 this.openRouter.generate(key, data, this.docModel.ocrText, this.creditModel.value, cost, this.templateCtrl.isActive() ? this.templateCtrl.getTemplateData() : null, null)
 ),
 timeout,
 new Promise((_, reject) => { signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); }),
 ]);

 if (signal.aborted) return;

 DocumentView.hideLoader(this._genIv);

 if (!result?.document || result.document.trim().length < 20) {
 throw new Error('A IA devolveu uma resposta vazia. Tente novamente.');
 }

 if (typeof result.creditsRemaining === 'number') {
 this.creditModel.applyServerDeduction(result.creditsRemaining);
 }
 await this.creditModel.consume(cost);

 // Detectar último crédito APÓS dedução
 const remainingAfterNormal = this.creditModel.value;
 const isLastCreditNormal   = remainingAfterNormal === 0;

 this.docModel.setGenerated(result.document, result.model);
    documentState.set(result.document, this.docModel.service);
 this.docModel.formData = data;

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
 } catch (_) { }

 ModalView.close('formOverlay');
 DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);

 // CORRIGIDO: aguardar o DOM estabilizar antes de abrir o modal de resultado.
 // Sem este delay, quando o Service Worker está a actualizar módulos em background,
 // o ModalView.open() era chamado numa instância do controller que já não controlava
 // o DOM — o modal não abria, o utilizador via o formulário fechar e nada aparecer,
 // mas o documento ficava gravado no histórico (sintoma exacto reportado).
 await new Promise(resolve => setTimeout(resolve, 80));

 // Verificar novamente se não foi abortado durante o delay
 if (signal.aborted) return;

 // Garantia extra: confirmar que o overlay existe no DOM antes de abrir
 const resultOverlay = document.getElementById('resultOverlay');
 if (!resultOverlay) {
   // DOM pode estar em transição — aguardar um frame de animação
   await new Promise(resolve => requestAnimationFrame(resolve));
 }

 ModalView.open('resultOverlay');
 this._bindEditBtn();
 NotificationView.success('✅ Documento gerado!');

 // Feedback widget — aparece 4s após para não interromper a leitura do documento
 setTimeout(() => {
   if (typeof window.showFeedbackWidget === 'function') {
     window.showFeedbackWidget(this.docModel.service);
   }
 }, 4000);

 // Aviso de último crédito — 2s após para o utilizador ver o documento primeiro
 if (isLastCreditNormal) {
 const accountType = window.authManager?.profile?.account_type || 'normal';
 setTimeout(() => { window.paymentController?.showAfterLastCredit(accountType); }, 2000);
 }

 } catch (err) {
 DocumentView.hideLoader(this._genIv);

 const msg = err.message || '';

 if (msg === 'cancelled') return;

 if (!navigator.onLine || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
 await this._queueOffline(key, data, cost);
 return;
 }

 if (msg === 'INSUFFICIENT_CREDITS' || err.status === 402) {
 window.paymentController?.showPricing();
 NotificationView.warn('⚠️ Créditos insuficientes.');
 } else if (err.status === 401 || msg.includes('Sessão')) {
 NotificationView.error('🔒 Sessão expirada. Inicie sessão novamente.');
 setTimeout(() => window.authUI?.open('login'), 1500);
 } else if (err.status === 429 || msg === 'RATE_LIMIT') {
 NotificationView.warn('⏳ Demasiados pedidos. Aguarde 30 segundos e tente novamente.');
 } else if (msg.includes('demorou') || msg.includes('fetch') || msg.includes('network')) {
 NotificationView.error('🌐 Erro de ligação. Verifique o internet e tente novamente.');
 } else {
 NotificationView.error('❌ ' + (msg || 'Erro ao gerar. Tente novamente.'));
 }
 } finally {
 // CORRIGIDO: garantia absoluta de que a flag e o botão são sempre libertados
 this._generating = false;
 if (btn) { btn.disabled = false; btn.style.opacity = ''; }
 this._genIv = null;
 }
 }

 async _queueOffline(key, data, cost) {
 try {
 let authToken = null;
 try {
 const { authManager } = await import('../auth/AuthManager.js');
 authToken = await authManager.getValidToken();
 } catch { }

 await offlineDB.addPending({
 serviceType: key,
 formData: data,
 cost,
 _authToken: authToken,
 queuedAt: new Date().toISOString(),
 });

 if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
 const sw = await navigator.serviceWorker.ready;
 await sw.sync.register('document-sync');
 NotificationView.info('📶 Sem ligação. O documento será gerado automaticamente quando a internet voltar.');
 } else {
 NotificationView.warn('🌐 Sem ligação. Verifique o internet e tente novamente.');
 }
 } catch (e) {
 console.error('[DocController] Falha ao guardar offline:', e);
 NotificationView.error('🌐 Sem ligação. Verifique o internet e tente novamente.');
 }
 }

 async _generateLong(key, svc, data, cost, btn) {
 this._longRunning = true;
 // CORRIGIDO: activar flag de geração também para documentos longos
 this._generating = true;

 const estSecs = key === 'planonegocio' ? 8 : Math.max(3, Math.round((parseInt(data.paginas || 10) - 3) / 1.5));
 const STEPS = [
 '📋 A planear estrutura do documento…',
 ...Array.from({ length: estSecs }, (_, i) => `✍️ A redigir secção ${i + 1}/${estSecs}…`),
 '🔗 A montar documento final…',
 ];
 this._genIv = DocumentView.showLoader(STEPS);

 let stepIdx = 0;
 this.longEngine.onProgress(({ text }) => {
 const steps = document.querySelectorAll('.lstep');
 steps.forEach((el, i) => {
 el.classList.remove('active', 'done');
 if (i < stepIdx) el.classList.add('done');
 });
 if (steps[stepIdx]) {
 steps[stepIdx].classList.add('active');
 const span = steps[stepIdx].querySelector('span:last-child');
 if (span) span.textContent = text;
 }
 if (stepIdx < steps.length - 1) stepIdx++;
 });

 try {
 const result = await this.longEngine.generate(key, data, this.creditModel.value, cost);

 if (!result) {
 this._longRunning = false;
 this._generating = false;
 DocumentView.hideLoader(this._genIv);
 NotificationView.info('ℹ️ A usar geração normal…');
 if (btn) btn.disabled = false;
 await this._generateNormal(key, svc, data, cost, btn);
 return;
 }

 DocumentView.hideLoader(this._genIv);
 this._longRunning = false;

 if (typeof result.creditsRemaining === 'number') {
 this.creditModel.applyServerDeduction(result.creditsRemaining);
 }
 await this.creditModel.consume(cost);

 this.docModel.setGenerated(result.document, result.model);
    documentState.set(result.document, this.docModel.service);
 this.docModel.formData = data;

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
 } catch (_) { }

 ModalView.close('formOverlay');
 DocumentView.renderResult(
 result.document, svc, this.creditModel.value,
 `⛓️ Cadeia ${result.sections} secções · multi-provider`
 );

 // CORRIGIDO: mesmo delay aplicado para documentos longos
 await new Promise(resolve => setTimeout(resolve, 80));

 const resultOverlayLong = document.getElementById('resultOverlay');
 if (!resultOverlayLong) {
   await new Promise(resolve => requestAnimationFrame(resolve));
 }

 ModalView.open('resultOverlay');
 this._bindEditBtn();
 NotificationView.success(`✅ Documento longo gerado! (${result.sections} secções)`);

 const remainingAfterLong = this.creditModel.value;
 if (remainingAfterLong === 0) {
 const accountTypeLong = window.authManager?.profile?.account_type || 'normal';
 setTimeout(() => { window.paymentController?.showAfterLastCredit(accountTypeLong); }, 2000);
 }

 } catch (err) {
 DocumentView.hideLoader(this._genIv);
 this._longRunning = false;

 if (err.message === 'Abortado pelo utilizador') {
 NotificationView.warn('⚠️ Geração cancelada.');
 return;
 }

 console.warn('[DocController] Cadeia falhou, a tentar geração normal:', err.message);
 NotificationView.warn('⚠️ Modo cadeia falhou — a tentar geração normal…');
 // Resetar flag antes de tentar geração normal para não bloquear
 this._generating = false;
 try {
 await this._generateNormal(key, svc, data, cost, btn);
 } catch (e2) {
 if (e2.message === 'INSUFFICIENT_CREDITS') {
 window.paymentController?.showPricing();
 } else {
 NotificationView.error('❌ ' + (e2.message || 'Erro ao gerar.'));
 }
 }
 } finally {
 // CORRIGIDO: garantir que a flag é sempre libertada
 this._generating = false;
 if (btn) { btn.disabled = false; }
 }
 }

 sendDirect() {
 const key = this.docModel.service;
 const svc = SERVICES[key];
 if (!svc?.buildWA) return;
 const data = DocumentView.collectData(svc.fields);
 const missing = Validator.required(svc.fields, data);
 if (missing) { NotificationView.warn(`⚠️ Campo obrigatório: ${missing}`); return; }
 window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(svc.buildWA(data))}`, '_blank');
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
 Object.assign(menu.style, {
 position: 'fixed', bottom: '90px', left: '50%',
 transform: 'translateX(-50%)', background: '#fff',
 borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,.18)',
 padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
 zIndex: '99999', minWidth: '220px', border: '1.5px solid #e5e7eb',
 });

 const opts = [
 { icon: '📄', label: this._activeTemplate ? '📄 PDF (com modelo)' : '📄 PDF', fn: () => this._exportPDF() },
 { icon: '📃', label: 'Word (.docx)', fn: () => this._exportWord() },
 { icon: '📊', label: 'Excel (.xlsx)', fn: () => this._exportExcel() },
 ];

 opts.forEach(({ icon, label, fn }) => {
 const btn = document.createElement('button');
 btn.textContent = `${icon} ${label}`;
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

    // ── Template Picker integration ──────────────────────────────────────
    _applyTemplate(tpl) {
        if (!tpl) return;
        this._activeTemplate = tpl;

        // ── Documento do histórico ───────────────────────────────────────────
        const fd = this.docModel.formData;
        if (fd?._fromHistory) {
            const current = documentState.currentContent || fd._existingContent;
            const svc     = SERVICES[this.docModel.service];
            if (current && svc) {
                DocumentView.renderResult(current, svc, this.creditModel.value, this.docModel.model, tpl.css || null);
            }
            NotificationView.success(`✅ Modelo "${tpl.name}" aplicado!`);
            return;
        }

        // ── CORRIGIDO: não regenerar o documento com nova chamada à IA ───────
        // Bug original: ao clicar "Usar este Modelo" o código chamava
        // _regenerateWithHTMLTemplate que pedia à IA para gerar um documento
        // completamente novo — alterando o conteúdo real (nome, experiências,
        // objectivo) que o utilizador já tinha gerado, substituindo por dados
        // genéricos ou [PREENCHER]. O utilizador via o seu CV mudar para outro.
        //
        // Solução correcta: o template define apenas LAYOUT e ESTILO, não conteúdo.
        // Pegamos no conteúdo HTML já gerado (se existir) ou no markdown actual,
        // e aplicamos o CSS do template por cima sem tocar no conteúdo.
        //
        // Se o template tem htmlTemplate mas não temos HTML gerado ainda
        // (documento gerado em markdown puro), fazemos uma única re-renderização
        // injectando o markdown no wrapper do template — sem chamar a IA.
        const current = documentState.currentContent;
        const svc     = SERVICES[this.docModel.service];
        if (!current || !svc) {
            NotificationView.warn('⚠️ Nenhum documento gerado. Gere primeiro o documento.');
            return;
        }

        // Aplicar CSS do template ao conteúdo existente (sem nova chamada à IA)
        DocumentView.renderResult(current, svc, this.creditModel.value, this.docModel.model, tpl.css || null);
        NotificationView.success(`✅ Modelo "${tpl.name}" aplicado!`);
    }

    // ── Regenerar documento com HTML estruturado fiel ao template ────────────
    async _regenerateWithHTMLTemplate(tpl) {
        const key  = this.docModel.service;
        const svc  = SERVICES[key];
        const data = this.docModel.formData;

        if (!this.creditModel.canConsume(1)) {
            NotificationView.warn('⚠️ Créditos insuficientes para aplicar modelo estruturado.');
            return;
        }

        NotificationView.info(`🎨 A regenerar com modelo "${tpl.name}"…`);

        // Mostrar loader simples
        const loadEl = document.createElement('div');
        loadEl.id = 'tplRegenLoader';
        loadEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
        loadEl.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px 32px;text-align:center;font-family:sans-serif"><div style="font-size:28px;margin-bottom:12px">🎨</div><div style="font-size:15px;font-weight:700;color:#0f172a">A aplicar modelo estruturado…</div><div style="font-size:12px;color:#64748b;margin-top:6px">Isto pode demorar alguns segundos</div></div>';
        document.body.appendChild(loadEl);

        try {
            const result = await this.queue.add(() =>
                this.openRouter.generate(key, data, this.docModel.ocrText, this.creditModel.value, 1, null, tpl)
            );

            if (!result?.document || result.document.trim().length < 20) {
                throw new Error('Resposta vazia da IA. Tente novamente.');
            }

            await this.creditModel.consume(1);
            if (typeof result.creditsRemaining === 'number') {
                this.creditModel.applyServerDeduction(result.creditsRemaining);
            }

            this.docModel.setGenerated(result.document, result.model);
            documentState.set(result.document, key);

            // Renderizar com CSS do template
            DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model, tpl.css);

            NotificationView.success(`✅ Modelo "${tpl.name}" aplicado com estrutura fiel!`);

        } catch (err) {
            NotificationView.error('❌ Erro ao aplicar modelo: ' + (err.message || 'Tente novamente.'));
        } finally {
            document.getElementById('tplRegenLoader')?.remove();
        }
    }

    _downloadWithTemplate(tpl, format) {
        const content = documentState.currentContent;
        if (!content) return;
        const filename = `mzdocs-${this.docModel.service}-${Date.now()}`;
        const svc      = SERVICES[this.docModel.service];
        const meta     = this._buildExportMetadata(svc); // CORRIGIDO: _buildMeta não existe

        if (format === 'pdf') {
            // CORRIGIDO: usar HTMLPDFExporter quando há CSS de template.
            // O PDFExporter jsPDF ignora completamente o templateCss — o PDF saía
            // sempre com o layout padrão independentemente do modelo escolhido.
            if (tpl?.css) {
                import('../components/HTMLPDFExporter.js').then(({ HTMLPDFExporter }) => {
                    new HTMLPDFExporter().export(content, filename, {
                        templateCss: tpl.css,
                        title: svc?.title || 'Documento MzDocs Pro',
                    });
                    if (window.NotificationView) {
                        NotificationView.success('✅ Abre a janela de impressão e escolhe "Guardar como PDF"!');
                    }
                });
            } else {
                import('../components/PDFExporter.js').then(({ pdfExporter }) => {
                    pdfExporter.export(content, `${filename}.pdf`, meta);
                });
            }
        } else {
            import('../components/WordExporter.js').then(({ wordExporter }) => {
                wordExporter.export(content, `${filename}.docx`, meta);
            });
        }
    }

 _getDocType(serviceKey) {
 const map = {
 trabalho: 'trabalho',
 planonegocio: 'planonegocio',
 requerimento: 'requerimento',
 licenca: 'requerimento',
 acta: 'generic',
 cv: 'none',
 carta: 'none',
 arrendamento: 'generic',
 procuracao: 'generic',
 residencia: 'generic',
 prestacao: 'generic',
 recibo: 'none',
 recomendacao: 'none',
 orcamento: 'generic',
 };
 return map[serviceKey] || 'generic';
 }

 _buildExportMetadata(svc) {
 const data = this.docModel.formData || {};
 const base = {
 title: svc?.title || 'Documento',
 docType: this._getDocType(this.docModel.service),
 cidade: data.local || data.cidade || 'Maputo',
 ano: new Date().getFullYear(),
 };
 const extra = {
 trabalho: { disciplina: data.disciplina, nivel: data.nivel, aluno: data.aluno || data.nome, docente: data.docente, subtitulo: data.tema },
 planonegocio: { nomeNegocio: data.nomeNegocio, sector: data.sector, proprietario: data.proprietario, local: data.local, investimento: data.investimento, retorno: data.retorno },
 requerimento: { subtitulo: data.assunto },
 licenca: { subtitulo: data.tipoLicenca },
 };
 return { ...base, ...(extra[this.docModel.service] || {}) };
 }

 _removeExportMenu() {
 document.getElementById('exportMenu')?.remove();
 if (this._menuOutside) {
 document.removeEventListener('click', this._menuOutside);
 this._menuOutside = null;
 }
 }

 async _exportPDF() {
 NotificationView.info('⏳ A preparar PDF…');
 try {
   const content  = this.docModel.content;
   const svc      = SERVICES[this.docModel.service];
   const filename = `mzdocs-${this.docModel.service}-${Date.now()}`;

   // CORRIGIDO: se houver template activo, usar HTMLPDFExporter que aplica o CSS real.
   // O PDFExporter original usa jsPDF imperativo e ignora completamente o templateCss.
   const activeCss = this._activeTemplate?.css || null;

   if (activeCss) {
     const { HTMLPDFExporter } = await import('../components/HTMLPDFExporter.js');
     new HTMLPDFExporter().export(content, filename, {
       templateCss: activeCss,
       title: svc?.title || 'Documento MzDocs Pro',
     });
     NotificationView.success('✅ Abre a janela de impressão e escolhe "Guardar como PDF"!');
   } else {
     const { PDFExporter } = await import('../components/PDFExporter.js');
     await new PDFExporter().export(content, `${filename}.pdf`, this._buildExportMetadata(svc));
     NotificationView.success('✅ PDF descarregado!');
   }
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
 this._buildExportMetadata(svc)
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
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openEditor();
    });
  }

 _openEditor() {
 if (!this.docModel.content) {
 NotificationView.warn('⚠️ Nenhum documento gerado ainda.');
 return;
 }
 const svc = SERVICES[this.docModel.service] || {};
 const content = this.docModel.content;
 const serviceType = this.docModel.service || 'generic';

 if (!window.documentEditor) {
 window.documentEditor = new DocumentEditor();
 }

    const editorContent = (content && typeof content === 'string' && content.trim().length > 0)
      ? content
      : documentState.get();

    if (!editorContent || typeof editorContent !== 'string' || editorContent.trim().length === 0) {
      console.error('[DocumentController] _openEditor: invalid content — aborting');
      NotificationView.warn('⚠️ Conteúdo inválido. Tente gerar novamente.');
      return;
    }
    console.log('[DocumentController] _openEditor — content length:', editorContent.length, 'service:', serviceType);
    window.documentEditor.loadDocument(editorContent, serviceType, this._activeTemplate?.css || null);
    window.documentEditor._docController = this;
 }

 sendWA() {
 if (!this.docModel.content) return;
 const svc = SERVICES[this.docModel.service];
 const preview = this.docModel.content.slice(0, 1000).replace(/#{1,3} /g, '*');
 const msg = `📄 *${svc?.title || 'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`;
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
    documentState.set(result.document, this.docModel.service);
 }
 await this.creditModel.consume(1);
 NotificationView.success('✅ Documento reeditado!');
 } catch (err) {
 NotificationView.error('❌ ' + (err.message || 'Erro na reedição.'));
 }
 }
}
