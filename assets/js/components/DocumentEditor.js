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
    // Remover overlay anterior se existir (garante estado limpo)
    const existing = document.getElementById('editorOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'editorOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);align-items:center;justify-content:center;padding:20px;';

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;width:100%;max-width:900px;height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:18px;">✏️ Editor de Documento</h3>
          <button id="editorClose" style="background:none;border:none;font-size:24px;cursor:pointer;line-height:1;">&times;</button>
        </div>
        <div style="flex:1;display:flex;overflow:hidden;">
          <div style="flex:1;display:flex;flex-direction:column;border-right:1px solid #e5e7eb;">
            <div style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;flex-wrap:wrap;">
              <button id="editorBtnCopy"    style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">📋 Copiar</button>
              <button id="editorBtnMd"      style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">📝 Markdown</button>
              <button id="editorBtnPdf"     style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">📄 PDF</button>
              <button id="editorBtnWord"    style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">📃 Word</button>
              <button id="editorBtnPreview" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">👁️ Preview</button>
              <button id="editorBtnReedit"  style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#1d4ed8;color:#fff;cursor:pointer;font-size:13px;">🤖 Reeditar</button>
            </div>
            <textarea id="editorTextarea" style="flex:1;width:100%;padding:16px;border:none;resize:none;font-family:'Courier New',monospace;font-size:14px;line-height:1.6;outline:none;box-sizing:border-box;" placeholder="O documento aparecerá aqui..."></textarea>
            <div id="editorStats" style="padding:8px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">0 palavras | 0 caracteres</div>
          </div>
          <div id="editorPreviewPane" style="width:50%;padding:20px;overflow-y:auto;background:#f9fafb;display:none;">
            <div id="editorPreviewContent" style="background:#fff;padding:24px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);min-height:100%;"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modal = overlay;
    this._bindEvents();
  }

  _bindEvents() {
    this.modal.querySelector('#editorClose')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#editorBtnCopy')?.addEventListener('click', () => this._copyContent());
    this.modal.querySelector('#editorBtnMd')?.addEventListener('click', () => this._downloadMarkdown());
    this.modal.querySelector('#editorBtnPdf')?.addEventListener('click', () => this._exportPDF());
    this.modal.querySelector('#editorBtnWord')?.addEventListener('click', () => this._exportWord());
    this.modal.querySelector('#editorBtnPreview')?.addEventListener('click', () => this._togglePreview());
    this.modal.querySelector('#editorBtnReedit')?.addEventListener('click', () => this._showReeditDialog());
    this.modal.querySelector('#editorTextarea')?.addEventListener('input', (e) => {
      this.content = e.target.value;
      this._updateStats();
    });
  }

  loadDocument(content, serviceType) {
    this.content = content;
    this.serviceType = serviceType;

    const textarea = this.modal?.querySelector('#editorTextarea');
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
    const btn = this.modal.querySelector('#editorBtnPdf');
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
    const btn = this.modal.querySelector('#editorBtnWord');
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
    const previewPane = this.modal.querySelector('#editorPreviewPane');
    const isVisible = previewPane.style.display !== 'none';
    previewPane.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) this._renderPreview();
  }

  _renderPreview() {
    const preview = this.modal.querySelector('#editorPreviewContent');
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
    const el = this.modal?.querySelector('#editorStats');
    if (el) el.textContent = `${words} palavras | ${chars} caracteres`;
  }

  getContent() {
    return this.content;
  }
}

// DocumentEditor é instanciado pelo DocumentController quando necessário
// Não instanciar aqui para evitar problemas de timing com o DOM