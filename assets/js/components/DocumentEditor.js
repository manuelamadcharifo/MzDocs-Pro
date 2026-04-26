// assets/js/components/DocumentEditor.js
// Editor Markdown + Preview ao vivo + Toolbar
import { exportService } from '../utils/ExportService.js';

export class DocumentEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.content = '';
    this.originalContent = '';
    this.onSave = null;
    this.onExport = null;
    this.onReedit = null;
    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="doc-editor" style="
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      ">
        <!-- Toolbar -->
        <div class="editor-toolbar" style="
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          flex-wrap: wrap;
          align-items: center;
        ">
          <span style="font-weight: 600; color: #1e293b; margin-right: 8px;">✏️ Editor</span>
          
          <button data-action="bold" title="Negrito" style="${this._btnStyle()}">
            <strong>B</strong>
          </button>
          <button data-action="italic" title="Itálico" style="${this._btnStyle()}">
            <em>I</em>
          </button>
          <button data-action="heading" title="Título" style="${this._btnStyle()}">
            H
          </button>
          <button data-action="list" title="Lista" style="${this._btnStyle()}">
            • List
          </button>
          <div style="width: 1px; height: 24px; background: #cbd5e1; margin: 0 4px;"></div>
          
          <button data-action="undo" title="Desfazer" style="${this._btnStyle()}">
            ↩️
          </button>
          <button data-action="reset" title="Original" style="${this._btnStyle()}">
            🔄
          </button>
          <div style="width: 1px; height: 24px; background: #cbd5e1; margin: 0 4px;"></div>
          
          <button data-action="reedit" title="Pedir reedição à IA" style="${this._btnStyle('#7c3aed', '#fff')}">
            🤖 Reeditar
          </button>
          <div style="flex: 1;"></div>
          
          <button data-action="copy" title="Copiar" style="${this._btnStyle()}">
            📋 Copiar
          </button>
          <button data-action="download-txt" title="Download TXT" style="${this._btnStyle()}">
            📝 .txt
          </button>
          <button data-action="download-pdf" title="Download PDF" style="${this._btnStyle('#dc2626', '#fff')}">
            📕 PDF
          </button>
          <button data-action="download-word" title="Download Word" style="${this._btnStyle('#2563eb', '#fff')}">
            📘 Word
          </button>
          <button data-action="whatsapp" title="Enviar WhatsApp" style="${this._btnStyle('#25d366', '#fff')}">
            📱 WhatsApp
          </button>
        </div>

        <!-- Área principal: Editor + Preview -->
        <div class="editor-body" style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 0 16px 16px;
          min-height: 500px;
        ">
          <!-- Editor -->
          <div class="editor-pane">
            <label style="
              display: block;
              font-size: 12px;
              font-weight: 600;
              color: #64748b;
              margin-bottom: 6px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">Editar Markdown</label>
            <textarea class="editor-textarea" style="
              width: 100%;
              min-height: 500px;
              padding: 16px;
              border: 2px solid #e2e8f0;
              border-radius: 8px;
              font-family: 'Monaco', 'Consolas', monospace;
              font-size: 14px;
              line-height: 1.6;
              resize: vertical;
              background: #fafafa;
            "></textarea>
          </div>

          <!-- Preview -->
          <div class="preview-pane">
            <label style="
              display: block;
              font-size: 12px;
              font-weight: 600;
              color: #64748b;
              margin-bottom: 6px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">👁️ Preview</label>
            <div class="preview-content" style="
              width: 100%;
              min-height: 500px;
              padding: 24px;
              border: 2px solid #e2e8f0;
              border-radius: 8px;
              background: white;
              overflow-y: auto;
              font-family: 'Georgia', 'Times New Roman', serif;
              line-height: 1.8;
            "></div>
          </div>
        </div>
      </div>
    `;

    this.textarea = this.container.querySelector('.editor-textarea');
    this.preview = this.container.querySelector('.preview-content');
    
    this._bindEvents();
  }

  _btnStyle(bg = '#f1f5f9', color = '#334155') {
    return `
      padding: 6px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: ${bg};
      color: ${color};
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    `;
  }

  _bindEvents() {
    // Live preview
    this.textarea.addEventListener('input', () => {
      this.content = this.textarea.value;
      this._renderPreview();
    });

    // Toolbar
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => this._handleAction(e.target.dataset.action));
    });
  }

  // ============================================
  // CARREGAR DOCUMENTO
  // ============================================
  loadDocument(markdown, serviceType = 'documento') {
    this.originalContent = markdown;
    this.content = markdown;
    this.serviceType = serviceType;
    this.textarea.value = markdown;
    this._renderPreview();
  }

  // ============================================
  // RENDERIZAR PREVIEW (Markdown → HTML)
  // ============================================
  _renderPreview() {
    const html = this._markdownToHtml(this.content);
    this.preview.innerHTML = html;
  }

  _markdownToHtml(md) {
    let html = md
      // Headers
      .replace(/^### (.*$)/gim, '<h3 style="color:#1e293b;margin-top:24px;margin-bottom:12px;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="color:#0f172a;margin-top:28px;margin-bottom:14px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 style="color:#0f172a;font-size:28px;margin-bottom:16px;text-align:center;">$1</h1>')
      
      // Bold e Italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      
      // Listas
      .replace(/^\- (.*$)/gim, '<li style="margin-bottom:6px;">$1</li>')
      .replace(/(<li.*<\/li>\n?)+/g, '<ul style="margin-left:20px;margin-bottom:16px;">$&</ul>')
      
      // Tabelas (simples)
      .replace(/\|(.+)\|/g, (match) => {
        const cells = match.split('|').filter(c => c.trim());
        if (cells.length === 0) return '';
        const isHeader = match.includes('---');
        if (isHeader) return '';
        return `<tr>${cells.map(c => `<td style="border:1px solid #e2e8f0;padding:8px;">${c.trim()}</td>`).join('')}</tr>`;
      })
      
      // Parágrafos
      .replace(/\n\n/g, '</p><p style="margin-bottom:12px;">')
      .replace(/^(?!<[hlu]|$)(.*$)/gim, '<p style="margin-bottom:12px;">$1</p>');

    // Envolve em container
    return `<div style="max-width:100%;">${html}</div>`;
  }

  // ============================================
  // AÇÕES DA TOOLBAR
  // ============================================
  _handleAction(action) {
    const ta = this.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);

    switch (action) {
      case 'bold':
        this._insertWrap('**', '**');
        break;
      case 'italic':
        this._insertWrap('*', '*');
        break;
      case 'heading':
        this._insertAtLineStart('## ');
        break;
      case 'list':
        this._insertAtLineStart('- ');
        break;
      case 'undo':
        // Simples: volta ao original se não houve alteração manual significativa
        if (confirm('Desfazer todas as alterações?')) {
          this.loadDocument(this.originalContent);
        }
        break;
      case 'reset':
        if (confirm('Voltar ao documento original gerado pela IA?')) {
          this.loadDocument(this.originalContent);
        }
        break;
      case 'reedit':
        this._askReedit();
        break;
      case 'copy':
        navigator.clipboard.writeText(this.content);
        this._toast('✅ Copiado!');
        break;
      case 'download-txt':
        this._downloadTxt();
        break;
      case 'download-pdf':
        this._downloadPdf();
        break;
      case 'download-word':
        this._downloadWord();
        break;
      case 'whatsapp':
        this._sendWhatsApp();
        break;
    }
  }

  _insertWrap(before, after) {
    const ta = this.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    ta.value = text.substring(0, start) + before + text.substring(start, end) + after + text.substring(end);
    ta.focus();
    ta.setSelectionRange(start + before.length, end + before.length);
    this.content = ta.value;
    this._renderPreview();
  }

  _insertAtLineStart(prefix) {
    const ta = this.textarea;
    const start = ta.selectionStart;
    const text = ta.value;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    ta.value = text.substring(0, lineStart) + prefix + text.substring(lineStart);
    ta.focus();
    this.content = ta.value;
    this._renderPreview();
  }

  // ============================================
  // REEDIÇÃO COM IA
  // ============================================
  _askReedit() {
    const instruction = prompt(
      '🤖 O que deseja alterar?\n\n' +
      'Exemplos:\n' +
      '• "Adicionar mais experiência profissional"\n' +
      '• "Tornar mais formal"\n' +
      '• "Adicionar secção de habilidades técnicas"\n' +
      '• "Reduzir para 1 página"'
    );

    if (!instruction || !this.onReedit) return;

    this.onReedit({
      currentContent: this.content,
      instruction: instruction,
      serviceType: this.serviceType,
    });
  }

  // ============================================
  // EXPORTAR
  // ============================================
  _downloadTxt() {
    exportService.toTxt(this.content, `mzdocs-${this.serviceType}-${Date.now()}.txt`);
    this._toast('📥 Download TXT iniciado');
  }

  async _downloadPdf() {
    const html = this._markdownToHtml(this.content);
    const filename = `mzdocs-${this.serviceType}-${Date.now()}.pdf`;
    await exportService.toPdf(html, filename);
    this._toast('📕 Download PDF iniciado');
  }

  _downloadWord() {
    const html = this._markdownToHtml(this.content);
    const filename = `mzdocs-${this.serviceType}-${Date.now()}.doc`;
    exportService.toWord(html, filename);
    this._toast('📘 Download Word iniciado');
  }

  _sendWhatsApp() {
    // Usa o número do ExportService
    exportService.toWhatsApp(this.content, this.serviceType || 'Documento');
  }

  // ============================================
  // UTILS
  // ============================================
  _toast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  getContent() {
    return this.content;
  }

  getHtml() {
    return this._markdownToHtml(this.content);
  }
}