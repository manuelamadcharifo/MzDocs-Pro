// assets/js/controllers/DocumentController.js — v2.0 (auditado e corrigido)
// CORREÇÕES PRINCIPAIS:
//  1. handleReedit: crédito agora debitado no SERVIDOR via /api/deduct-credit
//     antes de chamar a IA (igual ao fluxo de geração normal).
//     Anteriormente só fazia creditModel.consume() local — bypass fácil.
//  2. handleReedit: se a IA falhar após dedução, crédito NÃO é devolvido
//     automaticamente (comportamento correcto — IA foi chamada).
//  3. handleReedit: envia documentType ao servidor para registo em credit_logs.

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
import { authManager } from '../auth/AuthManager.js';

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

   document.getElementById('btnTemplate')?.addEventListener('click', () => {
     const key     = this.docModel?.service || documentState.serviceType || '';
     const content = documentState.currentContent || this.docModel?.content || '';
     const svc     = SERVICES[key] || {};
     const templates = getTemplates(key);
     if (!templates.length) {
       if (!content) { _notifyInline('Gere um documento primeiro.'); return; }
       import('../components/PDFExporter.js')
         .then(({ pdfExporter }) => pdfExporter.export(content, `mzdocs-${key || 'doc'}-${Date.now()}.pdf`, {}))
         .catch(err => console.error('[btnTemplate] PDF export:', err));
       return;
     }
     templatePicker.open({
       serviceKey:     key,
       content:        content || '# Documento\n\nConteúdo gerado pelo MzDocs Pro.',
       svc:            svc,
       onApply:        (tpl) => { this._applyTemplate(tpl); },
       onDownloadPDF:  (tpl) => { this._downloadWithTemplate(tpl, 'pdf'); },
       onDownloadWord: (tpl) => { this._downloadWithTemplate(tpl, 'word'); },
     });
   });

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
    const editedContent = e.detail.content;
    this.docModel.setGenerated(editedContent, this.docModel.model);
    documentState.set(editedContent, this.docModel.service);
    const historyId = this.docModel.formData?._historyId;
    if (historyId && window.historyController?.updateDocumentContent) {
      window.historyController.updateDocumentContent(historyId, editedContent).catch(() => {});
    }
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
 this._generating = false;
 if (this._longRunning) {
  this.longEngine.abort();
  this._longRunning = false;
 }
 }

 closeResult() {
 ModalView.close('resultOverlay');
 this.docModel.reset();
 this._activeTemplate     = null;
 this._activeTemplateHtml = null;
 }

 async generate() {
 if (this._generating) {
  console.warn('[DocumentController] generate() chamado enquanto geração em curso — ignorado');
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

 if (this._abortCtrl) { try { this._abortCtrl.abort(); } catch (_) {} }
 this._abortCtrl = new AbortController();
 const { signal } = this._abortCtrl;

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
 } catch (_) {}

 const activeTemplate = this.templateCtrl.isActive() ? this.templateCtrl.getTemplateData() : null;
 if (activeTemplate) {
   this._activeTemplate = activeTemplate;
   try {
     const filledHtml = templatePicker._fillTemplate(activeTemplate.htmlTemplate, templatePicker._extractRealData(result.document, key));
     this._activeTemplateHtml = filledHtml;
   } catch (tplErr) {
     console.warn('[DocumentController] Template fill error:', tplErr.message);
     this._activeTemplateHtml = null;
   }
 } else {
   this._activeTemplate     = null;
   this._activeTemplateHtml = null;
 }

 ModalView.close('formOverlay');
 DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);
 ModalView.open('resultOverlay');
 this._bindEditBtn();

 if (isLastCreditNormal) {
  const accountType = window.authManager?.profile?.account_type || 'standard';
  window.paymentController?.showAfterLastCredit(accountType);
 }

 } catch (err) {
 if (err.message === 'cancelled') return;
 DocumentView.hideLoader(this._genIv);
 if (btn) btn.disabled = false;
 NotificationView.error('❌ ' + (err.message || 'Erro ao gerar documento.'));
 console.error('[DocumentController] _generateNormal error:', err);
 } finally {
 this._generating = false;
 if (btn) btn.disabled = false;
 }
 }

 async _generateLong(key, svc, data, cost, btn) {
 this._generating  = true;
 this._longRunning = true;
 try {
  const result = await this.longEngine.generate(key, data, svc, this.creditModel.value, cost);
  if (typeof result.creditsRemaining === 'number') {
   this.creditModel.applyServerDeduction(result.creditsRemaining);
  }
  await this.creditModel.consume(cost);
  this.docModel.setGenerated(result.document, result.model);
  documentState.set(result.document, this.docModel.service);
  this.docModel.formData = data;
  this._activeTemplate     = null;
  this._activeTemplateHtml = null;
  ModalView.close('formOverlay');
  DocumentView.renderResult(result.document, svc, this.creditModel.value, result.model);
  ModalView.open('resultOverlay');
  this._bindEditBtn();
 } catch (err) {
  NotificationView.error('❌ ' + (err.message || 'Erro ao gerar documento longo.'));
 } finally {
  this._generating  = false;
  this._longRunning = false;
  if (btn) btn.disabled = false;
 }
 }

 copyDoc() {
 if (!this.docModel.content) return;
 navigator.clipboard.writeText(this.docModel.content).then(() => {
  NotificationView.success('✅ Copiado!');
 });
 }

 downloadDoc() {
 this._showExportMenu();
 }

 _showExportMenu() {
 this._removeExportMenu();
 const btn = document.getElementById('btnDl');
 if (!btn) return;

 const menu = document.createElement('div');
 menu.id = 'exportMenu';
 const rect = btn.getBoundingClientRect();
 menu.style.cssText = [
  'position:fixed',
  `top:${rect.bottom + 8}px`,
  `left:${Math.max(8, rect.left - 60)}px`,
  'background:#fff',
  'border:1.5px solid #e2e8f0',
  'border-radius:12px',
  'box-shadow:0 8px 32px rgba(0,0,0,.15)',
  'padding:8px',
  'z-index:99999',
  'min-width:180px',
 ].join(';');

 const opts = [
  { label: '📄 PDF', fn: () => this._exportPDF() },
  { label: '📝 Word (.docx)', fn: () => this._exportWord() },
  { label: '📊 Excel (.xlsx)', fn: () => this._exportExcel() },
 ];

 opts.forEach(o => {
  const btn2 = document.createElement('button');
  btn2.textContent = o.label;
  btn2.style.cssText = 'display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;border-radius:8px;font-size:14px;cursor:pointer;color:#07101f;';
  btn2.onmouseenter = () => btn2.style.background = '#f8fafc';
  btn2.onmouseleave = () => btn2.style.background = 'none';
  btn2.onclick = () => { this._removeExportMenu(); o.fn(); };
  menu.appendChild(btn2);
 });

 document.body.appendChild(menu);

 this._menuOutside = (e) => {
  if (!menu.contains(e.target) && e.target !== btn) this._removeExportMenu();
 };
 setTimeout(() => document.addEventListener('click', this._menuOutside), 100);
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
   const svc      = SERVICES[this.docModel.service];
   const filename = `mzdocs-${this.docModel.service}-${Date.now()}`;
   const activeHtml = this._activeTemplateHtml || null;
   const activeCss  = this._activeTemplate?.css || null;

   if (activeHtml && activeCss) {
     const { HTMLPDFExporter } = await import('../components/HTMLPDFExporter.js');
     new HTMLPDFExporter().export(activeHtml, filename, {
       templateCss: activeCss,
       title: svc?.title || 'Documento MzDocs Pro',
     });
     NotificationView.success('✅ Abre a janela de impressão e escolhe "Guardar como PDF"!');
   } else if (activeCss) {
     const content = this.docModel.content;
     const { HTMLPDFExporter } = await import('../components/HTMLPDFExporter.js');
     new HTMLPDFExporter().export(content, filename, {
       templateCss: activeCss,
       title: svc?.title || 'Documento MzDocs Pro',
     });
     NotificationView.success('✅ Abre a janela de impressão e escolhe "Guardar como PDF"!');
   } else {
     const content = this.docModel.content;
     const { PDFExporter } = await import('../components/PDFExporter.js');
     await new PDFExporter().export(content, `${filename}.pdf`, this._buildExportMetadata(svc));
     NotificationView.success('✅ PDF descarregado!');
   }
 } catch (err) { NotificationView.error('❌ Erro PDF: ' + err.message); }
 }

 async _exportWord() {
 NotificationView.info('⏳ A gerar Word…');
 try {
 const svc      = SERVICES[this.docModel.service];
 const filename = `mzdocs-${this.docModel.service}-${Date.now()}`;
 const tpl      = this._activeTemplate;

 if (tpl?.htmlTemplate || tpl?.css) {
     const rawContent = documentState.currentContent || this.docModel.content;
     const exportContent = tpl?.htmlTemplate
         ? templatePicker._fillTemplate(tpl.htmlTemplate, templatePicker._extractRealData(rawContent, this.docModel.service))
         : rawContent;
     const { HTMLToDocxExporter } = await import('../components/HTMLToDocxExporter.js');
     await new HTMLToDocxExporter().export(exportContent, tpl?.css || '', filename);
     NotificationView.success('✅ Word (.docx) descarregado!');
     return;
 }

 const { WordExporter } = await import('../components/WordExporter.js');
 await new WordExporter().export(
  this.docModel.content,
  `${filename}.docx`,
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

   const templateHtml = this._activeTemplateHtml || null;
   const templateCss  = this._activeTemplate?.css  || null;
   window.documentEditor.loadDocument(editorContent, serviceType, templateCss, templateHtml);
   window.documentEditor._docController = this;
 }

 sendWA() {
 if (!this.docModel.content) return;
 const svc = SERVICES[this.docModel.service];
 const preview = this.docModel.content.slice(0, 1000).replace(/#{1,3} /g, '*');
 const msg = `📄 *${svc?.title || 'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`;
 window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
 }

 sendDirect() {
 const svc = SERVICES[this.docModel.service];
 const data = DocumentView.collectData(svc?.fields || []);
 const nome = data.nome || data.aluno || data.solicitante || 'Cliente';
 const msg = `📋 *Novo pedido — ${svc?.title || 'Documento'}*\n\n👤 Nome: ${nome}\n\n_Via MzDocs Pro_`;
 window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
 }

 _applyTemplate(tpl) {
 this._activeTemplate = tpl;
 const content = documentState.currentContent || this.docModel.content;
 if (!content) return;
 try {
  const filled = templatePicker._fillTemplate(tpl.htmlTemplate, templatePicker._extractRealData(content, this.docModel.service));
  this._activeTemplateHtml = filled;
  NotificationView.success('✅ Modelo aplicado!');
 } catch (e) {
  console.error('[_applyTemplate]', e);
 }
 }

 async _downloadWithTemplate(tpl, format) {
 const content = documentState.currentContent || this.docModel.content;
 if (!content) { NotificationView.warn('⚠️ Nenhum documento para exportar.'); return; }
 this._activeTemplate = tpl;
 this._activeTemplateHtml = templatePicker._fillTemplate(tpl.htmlTemplate, templatePicker._extractRealData(content, this.docModel.service));
 if (format === 'pdf') await this._exportPDF();
 else await this._exportWord();
 }

 // ────────────────────────────────────────────────────────────────────────────
 // handleReedit — CORRIGIDO v2.0
 // PROBLEMA ANTERIOR: debitava crédito apenas localmente (creditModel.consume)
 //   → utilizador podia recarregar a página e reedit era "gratuita"
 // CORRECÇÃO: debita no servidor via /api/deduct-credit ANTES de chamar a IA
 // ────────────────────────────────────────────────────────────────────────────
 async handleReedit({ currentContent, instruction, serviceType }) {
   // Verificação local (UX rápida — não substituí a verificação no servidor)
   if (!this.creditModel.canConsume(1)) {
     NotificationView.warn('⚠️ Créditos insuficientes para reedição por IA.');
     return;
   }

   NotificationView.info('🤖 A debitar crédito e reeditar documento…');

   try {
     // ── PASSO 1: Debitar crédito no SERVIDOR ────────────────────────────────
     let authToken = null;
     try {
       authToken = await authManager.getValidToken();
     } catch (_) {}

     if (!authToken) {
       NotificationView.error('❌ Sessão expirada. Inicie sessão novamente.');
       return;
     }

     const deductRes = await fetch('/api/deduct-credit', {
       method:  'POST',
       headers: {
         'Content-Type':  'application/json',
         'Authorization': `Bearer ${authToken}`,
       },
       body: JSON.stringify({
         cost:         1,
         documentType: serviceType || this.docModel.service || 'reedit',
       }),
     });

     if (deductRes.status === 401) {
       NotificationView.error('❌ Sessão expirada. Inicie sessão novamente.');
       return;
     }
     if (deductRes.status === 402) {
       NotificationView.warn('⚠️ Créditos insuficientes. Compre mais para continuar.');
       window.paymentController?.showPricing(false);
       return;
     }
     if (deductRes.status === 403) {
       NotificationView.error('❌ Conta bloqueada. Contacte o suporte.');
       return;
     }
     if (!deductRes.ok) {
       const d = await deductRes.json().catch(() => ({}));
       throw new Error(d.error || 'Erro ao verificar créditos.');
     }

     const { credits: creditsAfterDeduct } = await deductRes.json();

     // Actualizar créditos locais imediatamente (antes de esperar pela IA)
     this.creditModel.applyServerDeduction(creditsAfterDeduct);

     // ── PASSO 2: Chamar IA para reedição ────────────────────────────────────
     const result = await this.queue.add(() =>
       this.openRouter.generateRaw(
         `EDITAR DOCUMENTO conforme instrução: "${instruction}"\n\nDOCUMENTO ATUAL:\n"""\n${currentContent}\n"""\n\nINSTRUÇÃO: ${instruction}\n\nReescreva o documento completo aplicando as alterações. Mantenha formato Markdown.`,
         { serviceType: serviceType || this.docModel.service, currentContent, instruction },
         creditsAfterDeduct,
         true // skipDeduct = true — crédito já debitado acima
       )
     );

     // ── PASSO 3: Actualizar editor com conteúdo reeditado ───────────────────
     if (window.documentEditor) {
       window.documentEditor.loadDocument(result.document, serviceType || this.docModel.service);
     }
     this.docModel.setGenerated(result.document, result.model);
     documentState.set(result.document, this.docModel.service);

     // Aviso se ficou com 0 créditos
     if (creditsAfterDeduct === 0) {
       const accountType = window.authManager?.profile?.account_type || 'standard';
       window.paymentController?.showAfterLastCredit(accountType);
     }

     NotificationView.success('✅ Documento reeditado! (-1 crédito)');

   } catch (err) {
     NotificationView.error('❌ ' + (err.message || 'Erro na reedição.'));
     console.error('[DocumentController] handleReedit error:', err);
   }
 }
}
