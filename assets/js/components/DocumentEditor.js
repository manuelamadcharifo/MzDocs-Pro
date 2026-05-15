// assets/js/components/DocumentEditor.js
import { exportManager } from '../utils/ExportManager.js';
import { authManager } from '../auth/AuthManager.js';
import { sanitizeHtml } from '../utils/Sanitizer.js';

export class DocumentEditor {
 constructor() {
 this.content = '';
 this.serviceType = '';
 this.modal = null;
 this._docController = null;
 this._createModal();
 }

 _createModal() {
 if (document.getElementById('editorOverlay')) {
 this.modal = document.getElementById('editorOverlay');
 this._bindEvents();
 return;
 }

 const html = `
<div id="editorOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:16px;width:95%;max-width:900px;height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #e5e7eb;">
      <h3 style="margin:0;font-size:16px;color:#07101f;">✏️ Editor de Documento</h3>
      <button id="editorClose" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;">✕</button>
    </div>
    <div style="display:flex;flex:1;overflow:hidden;">
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <textarea id="editorTextarea" style="flex:1;width:100%;padding:16px;border:none;resize:none;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;outline:none;" placeholder="O documento aparecerá aqui..."></textarea>
        <div style="padding:8px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:#f9fafb;">
          <span id="editorStats" style="font-size:12px;color:#6b7280;">0 palavras | 0 caracteres</span>
          <div style="display:flex;gap:8px;">
            <button id="btnCopy" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:12px;cursor:pointer;">📋 Copiar</button>
            <button id="btnPreview" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:12px;cursor:pointer;">👁️ Pré-visualizar</button>
            <button id="btnReedit" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:12px;cursor:pointer;">🤖 Reeditar com IA</button>
          </div>
        </div>
      </div>
      <div id="previewPane" style="display:none;flex:1;border-left:1px solid #e5e7eb;overflow:auto;padding:16px;background:#f8fafc;">
        <div id="previewContent" style="font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;"></div>
      </div>
    </div>
    <div style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end;background:#f9fafb;">
      <button id="btnExportMd" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;font-size:13px;cursor:pointer;font-weight:500;">📝 Markdown</button>
      <button id="btnExportPdf" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;font-size:13px;cursor:pointer;font-weight:500;">📄 PDF</button>
      <button id="btnExportWord" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;font-size:13px;cursor:pointer;font-weight:500;">📃 Word</button>
    </div>
  </div>
</div>`;

 const div = document.createElement('div');
 div.innerHTML = html;
 document.body.appendChild(div.firstElementChild);
 this.modal = document.getElementById('editorOverlay');
 this._bindEvents();
 }

 _bindEvents() {
 document.getElementById('editorClose')?.addEventListener('click', () => this.close());
 document.getElementById('btnCopy')?.addEventListener('click', () => this._copyContent());
 document.getElementById('btnExportMd')?.addEventListener('click', () => this._downloadMarkdown());
 document.getElementById('btnExportPdf')?.addEventListener('click', () => this._exportPDF());
 document.getElementById('btnExportWord')?.addEventListener('click', () => this._exportWord());
 document.getElementById('btnPreview')?.addEventListener('click', () => this._togglePreview());
 document.getElementById('btnReedit')?.addEventListener('click', () => this._showReeditDialog());

 document.getElementById('editorTextarea')?.addEventListener('input', (e) => {
 this.content = e.target.value;
 this._updateStats();
 });
 }

 loadDocument(content, serviceType) {
 this.content = content || '';
 this.serviceType = serviceType || 'generic';

 const textarea = document.getElementById('editorTextarea');
 if (textarea) {
 textarea.value = this.content;
 this._updateStats();
 this.open();
 return;
 }

 const observer = new MutationObserver((mutations, obs) => {
 const ta = document.getElementById('editorTextarea');
 if (ta) {
 ta.value = this.content;
 this._updateStats();
 this.open();
 obs.disconnect();
 }
 });

 observer.observe(document.body, { childList: true, subtree: true });
 setTimeout(() => observer.disconnect(), 2000);
 }

 open() {
 if (!this.modal) this._createModal();
 this.modal.style.display = 'flex';
 document.body.style.overflow = 'hidden';
 }

 close() {
 const textarea = document.getElementById('editorTextarea');
 if (textarea) {
 this.content = textarea.value;
 }

 document.dispatchEvent(new CustomEvent('editor:closed', {
 detail: { content: this.content, serviceType: this.serviceType }
 }));

 if (this.modal) this.modal.style.display = 'none';
 document.body.style.overflow = '';
 }

 async _exportPDF() {
 const btn = document.getElementById('btnExportPdf');
 if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
 try {
 await exportManager.toPDF(this.content, 'Documento', {
 type: this.serviceType,
 user: authManager.user?._profile?.full_name || authManager.user?.user_metadata?.full_name
 });
 } catch (err) {
 alert('❌ Erro ao gerar PDF: ' + err.message);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = '📄 PDF'; }
 }
 }

 async _exportWord() {
 const btn = document.getElementById('btnExportWord');
 if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
 try {
 await exportManager.toWord(this.content, 'Documento', {
 type: this.serviceType,
 user: authManager.user?._profile?.full_name || authManager.user?.user_metadata?.full_name
 });
 } catch (err) {
 alert('❌ Erro ao gerar Word: ' + err.message);
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = '📝 Word'; }
 }
 }

 _downloadMarkdown() {
 const blob = new Blob([this.content], { type: 'text/markdown;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `mzdocs-${this.serviceType}-${Date.now()}.md`;
 a.click();
 URL.revokeObjectURL(url);
 }

 _copyContent() {
 navigator.clipboard.writeText(this.content)
 .then(() => alert('✅ Copiado!'))
 .catch(() => alert('❌ Não foi possível copiar'));
 }

 _togglePreview() {
 const previewPane = document.getElementById('previewPane');
 const isVisible = previewPane && previewPane.style.display !== 'none';
 if (isVisible) {
 previewPane.style.display = 'none';
 } else {
 previewPane.style.display = 'block';
 this._renderPreview();
 }
 }

 _renderPreview() {
 const preview = document.getElementById('previewContent');
 if (!preview) return;

 let html = this.content
 .replace(/#{6}\s(.+)/g, '<h6>$1</h6>')
 .replace(/#{5}\s(.+)/g, '<h5>$1</h5>')
 .replace(/#{4}\s(.+)/g, '<h4>$1</h4>')
 .replace(/#{3}\s(.+)/g, '<h3>$1</h3>')
 .replace(/#{2}\s(.+)/g, '<h2>$1</h2>')
 .replace(/#{1}\s(.+)/g, '<h1>$1</h1>')
 .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
 .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
 .replace(/\*(.+?)\*/g, '<em>$1</em>')
 .replace(/`(.+?)`/g, '<code>$1</code>')
 .replace(/\n/g, '<br>');

 preview.innerHTML = sanitizeHtml(html);
 }

 _showReeditDialog() {
 const instruction = prompt('💡 O que deseja alterar no documento?\n\nExemplo: "Adicione mais detalhes na introdução"');
 if (!instruction) return;

 document.dispatchEvent(new CustomEvent('document:reedit', {
 detail: {
 currentContent: this.content,
 instruction,
 serviceType: this.serviceType
 }
 }));
 }

 _updateStats() {
 const words = this.content.trim().split(/\s+/).filter(w => w.length > 0).length;
 const chars = this.content.length;
 const el = document.getElementById('editorStats');
 if (el) el.textContent = `${words} palavras | ${chars} caracteres`;
 }

 getContent() {
 return this.content;
 }
}

export const documentEditor = new DocumentEditor();
window.documentEditor = documentEditor;
