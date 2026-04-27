// assets/js/components/DocumentEditor.js
// Editor Markdown interativo com exportação multi-formato

export class DocumentEditor {
  constructor() {
    this.content = '';
    this.serviceType = '';
    this.modal = null;
    this.onReedit = null;
    this._createModal();
  }

  _createModal() {
    const html = `
      <div id="editorOverlay" class="overlay" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;padding:20px;">
        <div class="modal" style="background:#fff;border-radius:16px;width:100%;max-width:900px;height:90vh;display:flex;flex-direction:column;overflow:hidden;">
          <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:18px;">✏️ Editor de Documento</h3>
            <button id="editorClose" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
          </div>
          <div class="modal-body" style="flex:1;display:flex;overflow:hidden;">
            <div style="flex:1;display:flex;flex-direction:column;border-right:1px solid #e5e7eb;">
              <div style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;flex-wrap:wrap;">
                <button id="btnCopy" class="btn-sm" title="Copiar">📋 Copiar</button>
                <button id="btnExportMd" class="btn-sm" title="Markdown">📝 Markdown</button>
                <button id="btnExportPdf" class="btn-sm" title="PDF">📄 PDF</button>
                <button id="btnExportWord" class="btn-sm" title="Word">📃 Word</button>
                <button id="btnPreview" class="btn-sm" title="Pré-visualizar">👁️ Preview</button>
                <button id="btnReedit" class="btn-sm btn-primary" title="Reeditar com IA">🤖 Reeditar</button>
              </div>
              <textarea id="editorTextarea" style="flex:1;width:100%;padding:16px;border:none;resize:none;font-family:'Courier New',monospace;font-size:14px;line-height:1.6;outline:none;" placeholder="O documento aparecerá aqui..."></textarea>
              <div id="editorStats" style="padding:8px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">0 palavras | 0 caracteres</div>
            </div>
            <div id="previewPane" style="width:50%;padding:20px;overflow-y:auto;background:#f9fafb;display:none;">
              <div id="previewContent" style="background:#fff;padding:24px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);min-height:100%;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById('editorOverlay')) {
      const div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div.firstElementChild);
      this.modal = document.getElementById('editorOverlay');
      this._bindEvents();
    }
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
    this.content = content;
    this.serviceType = serviceType;

    const textarea = document.getElementById('editorTextarea');
    if (textarea) textarea.value = content;

    this._updateStats();
    this.open();
  }

  open() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  close() {
    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  async _exportPDF() {
    const btn = document.getElementById('btnExportPdf');
    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
      const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
      const doc = new jsPDF();
      const lines = doc.splitTextToSize(this.content, 180);
      doc.text(lines, 15, 20);
      doc.save(`mzdocs-${this.serviceType}-${Date.now()}.pdf`);
    } catch (err) {
      alert('❌ Erro ao gerar PDF: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '📄 PDF';
    }
  }

  async _exportWord() {
    const btn = document.getElementById('btnExportWord');
    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
      const html = `<html><body><pre>${this.content.replace(/</g, '&lt;')}</pre></body></html>`;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mzdocs-${this.serviceType}-${Date.now()}.doc`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('❌ Erro ao gerar Word: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '📃 Word';
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
    const isVisible = previewPane.style.display !== 'none';
    previewPane.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) this._renderPreview();
  }

  _renderPreview() {
    const preview = document.getElementById('previewContent');
    let html = this.content
      .replace(/#{6}\s(.+)/g, '<h6>$1</h6>')
      .replace(/#{5}\s(.+)/g, '<h5>$1</h5>')
      .replace(/#{4}\s(.+)/g, '<h4>$1</h4>')
      .replace(/#{3}\s(.+)/g, '<h3>$1</h3>')
      .replace(/#{2}\s(.+)/g, '<h2>$1</h2>')
      .replace(/#{1}\s(.+)/g, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');

    preview.innerHTML = html;
  }

  _showReeditDialog() {
    const instruction = prompt('💡 O que deseja alterar no documento?\n\nExemplo: "Adicione mais detalhes na introdução"');
    if (!instruction) return;

    if (this.onReedit) {
      this.onReedit({
        currentContent: this.content,
        instruction,
        serviceType: this.serviceType
      });
    } else {
      document.dispatchEvent(new CustomEvent('document:reedit', {
        detail: {
          currentContent: this.content,
          instruction,
          serviceType: this.serviceType
        }
      }));
    }
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