// assets/js/components/DocumentEditor.js
// Editor com preview fiel A4 e tabs por formato (PDF / Word / Excel / Texto)

export class DocumentEditor {
  constructor() {
    this.content     = '';
    this.serviceType = '';
    this.modal       = null;
    this.onReedit    = null;
    this._previewFmt = 'pdf'; // formato activo no preview
    this._createModal();
  }

  _createModal() {
    document.getElementById('editorOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'editorOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);align-items:center;justify-content:center;padding:20px;';

    overlay.innerHTML = `
      <div class="ed-shell">
        <!-- HEADER -->
        <div class="ed-header">
          <h3 class="ed-title">✏️ Editor de Documento</h3>
          <div class="ed-fmt-tabs" id="edFmtTabs">
            <button class="ed-tab active" data-fmt="preview" title="Preview do documento">👁️ Preview</button>
            <button class="ed-tab" data-fmt="edit" title="Editar em texto">📝 Editar</button>
          </div>
          <button id="editorClose" class="ed-close" title="Fechar">✕</button>
        </div>

        <!-- SUB-TOOLBAR (preview formats) -->
        <div class="ed-subtoolbar" id="edSubtoolbar">
          <div class="ed-fmt-group">
            <span class="ed-fmt-label">Formato:</span>
            <button class="ed-fmtbtn active" data-preview="pdf">📄 PDF</button>
            <button class="ed-fmtbtn" data-preview="word">📃 Word</button>
            <button class="ed-fmtbtn" data-preview="excel">📊 Excel</button>
          </div>
          <div class="ed-fmt-group" style="margin-left:auto;">
            <button id="edBtnDownload" class="ed-action-btn primary">⬇️ Download</button>
            <button id="edBtnWa" class="ed-action-btn wa">💬 WhatsApp</button>
            <button id="edBtnCopy" class="ed-action-btn">📋 Copiar</button>
            <button id="edBtnReedit" class="ed-action-btn ai">🤖 Reeditar</button>
          </div>
        </div>

        <!-- EDIT TOOLBAR (só no modo edição) -->
        <div class="ed-subtoolbar" id="edEditToolbar" style="display:none;">
          <div class="ed-fmt-group">
            <button class="ed-action-btn" id="edBtnCopy2">📋 Copiar</button>
            <button class="ed-action-btn" id="edBtnMd">📥 Markdown</button>
            <button class="ed-action-btn ai" id="edBtnReedit2">🤖 Reeditar</button>
          </div>
          <div id="editorStats" class="ed-stats">0 palavras</div>
        </div>

        <!-- BODY -->
        <div class="ed-body">
          <!-- PREVIEW A4 -->
          <div class="ed-preview-wrap" id="edPreviewWrap">
            <div class="ed-a4-bg">
              <div class="ed-a4-label">A4 · 210×297 mm</div>
              <iframe id="edPreviewFrame" class="ed-a4-frame" sandbox="allow-same-origin"></iframe>
            </div>
          </div>

          <!-- EDITOR TEXTO -->
          <div class="ed-edit-wrap" id="edEditWrap" style="display:none;">
            <textarea id="editorTextarea" class="ed-textarea" placeholder="O documento aparecerá aqui…"></textarea>
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

    // Tabs principais (preview / editar)
    this.modal.querySelectorAll('[data-fmt]').forEach(btn => {
      btn.addEventListener('click', () => this._switchMode(btn.dataset.fmt));
    });

    // Tabs de formato de preview
    this.modal.querySelectorAll('[data-preview]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.modal.querySelectorAll('[data-preview]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._previewFmt = btn.dataset.preview;
        this._renderPreview(this._previewFmt);
        this.modal.querySelector('#edBtnDownload').textContent = `⬇️ ${btn.dataset.preview.toUpperCase()}`;
      });
    });

    // Acções
    this.modal.querySelector('#edBtnDownload')?.addEventListener('click',  () => this._download());
    this.modal.querySelector('#edBtnWa')?.addEventListener('click',        () => this._sendWA());
    this.modal.querySelector('#edBtnCopy')?.addEventListener('click',      () => this._copy());
    this.modal.querySelector('#edBtnCopy2')?.addEventListener('click',     () => this._copy());
    this.modal.querySelector('#edBtnMd')?.addEventListener('click',        () => this._downloadMd());
    this.modal.querySelector('#edBtnReedit')?.addEventListener('click',    () => this._reedit());
    this.modal.querySelector('#edBtnReedit2')?.addEventListener('click',   () => this._reedit());

    this.modal.querySelector('#editorTextarea')?.addEventListener('input', e => {
      this.content = e.target.value;
      this._updateStats();
    });
  }

  // ── Muda entre modo preview e edição ──────────────────────────
  _switchMode(mode) {
    const previewWrap   = this.modal.querySelector('#edPreviewWrap');
    const editWrap      = this.modal.querySelector('#edEditWrap');
    const subtoolbar    = this.modal.querySelector('#edSubtoolbar');
    const editToolbar   = this.modal.querySelector('#edEditToolbar');
    const textarea      = this.modal.querySelector('#editorTextarea');

    this.modal.querySelectorAll('[data-fmt]').forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === mode);
    });

    if (mode === 'preview') {
      previewWrap.style.display  = 'flex';
      editWrap.style.display     = 'none';
      subtoolbar.style.display   = 'flex';
      editToolbar.style.display  = 'none';
      // Sync content from textarea before switching back to preview
      if (textarea) this.content = textarea.value;
      this._renderPreview(this._previewFmt);
      this._updateA4Scale();
    } else {
      previewWrap.style.display  = 'none';
      editWrap.style.display     = 'flex';
      subtoolbar.style.display   = 'none';
      editToolbar.style.display  = 'flex';
      // Always sync latest content to textarea
      if (textarea) {
        textarea.value = this.content;
        // Focus and place cursor at start for usability
        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(0, 0); }, 50);
      }
      this._updateStats();
    }
  }

  // ── Calcula e aplica escala A4 para mobile ─────────────────────
  _updateA4Scale() {
    const frame = this.modal.querySelector('.ed-a4-frame');
    if (!frame) return;
    const wrap = this.modal.querySelector('.ed-preview-wrap');
    if (!wrap) return;
    const availW = wrap.clientWidth - 32; // padding
    const a4Px = 210 * 3.7795; // 210mm em px a 96dpi ≈ 794px
    const scale = Math.min(1, availW / a4Px);
    frame.style.setProperty('--a4-scale', scale);
    // Override inline via CSS variable on the element
    frame.style.transform = `scale(${scale})`;
    frame.style.transformOrigin = 'top center';
    const a4HeightPx = 297 * 3.7795;
    frame.style.marginBottom = `${(a4HeightPx * scale) - a4HeightPx}px`;
  }

  // ── Renderiza preview fiel no iframe ──────────────────────────
  _renderPreview(format) {
    const frame = this.modal.querySelector('#edPreviewFrame');
    if (!frame) return;

    const html = this._buildPreviewHTML(format);
    frame.srcdoc = html;
  }

  _buildPreviewHTML(format) {
    const css = this._getFormatCSS(format);
    const body = this._markdownToHTML(this.content);

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>
  <div class="doc-page">
    ${body}
  </div>
</body>
</html>`;
  }

  _getFormatCSS(format) {
    const base = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; }
      .doc-page {
        width: 210mm;
        min-height: 297mm;
        padding: 25mm 22mm 20mm 25mm;
        background: #fff;
        font-size: 12pt;
        line-height: 1.5;
        color: #000;
      }
      h1 { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 16pt; }
      h2 { font-size: 14pt; font-weight: bold; margin-top: 14pt; margin-bottom: 8pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
      h3 { font-size: 12pt; font-weight: bold; margin-top: 10pt; margin-bottom: 6pt; }
      p  { margin-bottom: 8pt; text-align: justify; }
      ul, ol { margin: 6pt 0 6pt 18pt; }
      li { margin-bottom: 3pt; }
      table { width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 11pt; }
      td, th { border: 1px solid #000; padding: 5pt 7pt; }
      th { background: #f0f0f0; font-weight: bold; }
      strong { font-weight: bold; }
      em { font-style: italic; }
      hr { border: none; border-top: 1px solid #888; margin: 12pt 0; }
      .sig-line { border-top: 1px solid #000; width: 55%; margin-top: 28pt; padding-top: 4pt; font-size: 10pt; }
    `;

    if (format === 'word') {
      return base + `
        body, .doc-page { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; }
        h1 { color: #2E74B5; font-size: 16pt; }
        h2 { color: #2E74B5; font-size: 13pt; border-bottom-color: #2E74B5; }
        td, th { border-color: #BFBFBF; }
        th { background: #D9E2F3; color: #1F3864; }
      `;
    }

    if (format === 'excel') {
      return `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; background: #fff; }
        .doc-page { padding: 0; width: 100%; min-height: 100vh; }
        .excel-sheet-tab {
          background: #E7E6E6; border-bottom: 3px solid #4472C4;
          padding: 6px 16px; font-weight: bold; font-size: 12pt;
          display: inline-block; color: #333;
        }
        table { width: 100%; border-collapse: collapse; }
        th { background: #4472C4; color: #fff; font-weight: bold; padding: 6pt 8pt; border: 1px solid #2F5597; }
        td { padding: 5pt 8pt; border: 1px solid #B4B4B4; }
        tr:nth-child(even) td { background: #F2F2F2; }
        h1, h2, h3 { padding: 8pt; font-size: 13pt; }
        p { padding: 4pt 8pt; }
        ul, ol { padding: 4pt 8pt 4pt 24pt; }
      `;
    }

    // PDF (padrão)
    return base + `
      body, .doc-page { font-family: 'Times New Roman', Georgia, serif; }
    `;
  }

  // ── Converte Markdown → HTML estruturado ──────────────────────
  _markdownToHTML(md) {
    if (!md) return '<p><em>Sem conteúdo</em></p>';

    // Excel: envolve em tab falso
    if (this._previewFmt === 'excel') {
      const tableHTML = this._mdToHTMLBasic(md);
      return `<div class="excel-sheet-tab">📊 Folha 1</div>${tableHTML}`;
    }

    return this._mdToHTMLBasic(md);
  }

  _mdToHTMLBasic(md) {
    let html = md
      // Escapar XSS
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Quebras de página
      .replace(/---PAGE_BREAK---/g, '<hr class="page-break">')
      // Headings
      .replace(/^######\s(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s(.+)$/gm,  '<h5>$1</h5>')
      .replace(/^####\s(.+)$/gm,   '<h4>$1</h4>')
      .replace(/^###\s(.+)$/gm,    '<h3>$1</h3>')
      .replace(/^##\s(.+)$/gm,     '<h2>$1</h2>')
      .replace(/^#\s(.+)$/gm,      '<h1>$1</h1>')
      // Bold / Italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,         '<em>$1</em>')
      // HR
      .replace(/^---+$/gm, '<hr>')
      // Listas
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      // Parágrafos (dupla linha em branco)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // Envolver listas <li> em <ul>
    html = html.replace(/(<li>.*?<\/li>)+/gs, match => `<ul>${match}</ul>`);

    // Tabelas Markdown
    html = html.replace(/(\|.+\|\n)+/g, match => this._mdTableToHTML(match));

    return `<p>${html}</p>`;
  }

  _mdTableToHTML(tableStr) {
    const rows = tableStr.trim().split('\n').filter(r => !/^[\|\s\-:]+$/.test(r));
    if (rows.length === 0) return tableStr;

    const headers = rows[0].split('|').map(c => c.trim()).filter(Boolean);
    const body    = rows.slice(1);

    const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const tbody = body.map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  // ── Download no formato activo ────────────────────────────────
  async _download() {
    const fmt = this._previewFmt;
    const btn = this.modal.querySelector('#edBtnDownload');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳…';

    try {
      if (fmt === 'pdf')   await this._downloadPDF();
      if (fmt === 'word')  await this._downloadWord();
      if (fmt === 'excel') await this._downloadExcel();
    } catch (err) {
      alert('❌ Erro ao exportar: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async _downloadPDF() {
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const lines = doc.splitTextToSize(this.content, 170);
    let y = 25;
    const lineH = 7;
    lines.forEach(line => {
      if (y > 270) { doc.addPage(); y = 25; }
      const isH1 = line.startsWith('# ');
      const isH2 = line.startsWith('## ');
      if (isH1) {
        doc.setFontSize(18); doc.setFont('times','bold');
        doc.text(line.replace(/^#+ /, ''), 105, y, { align: 'center' });
        y += 10;
      } else if (isH2) {
        doc.setFontSize(14); doc.setFont('times','bold');
        doc.text(line.replace(/^#+ /, ''), 25, y);
        y += 9;
      } else {
        doc.setFontSize(12); doc.setFont('times','normal');
        doc.text(line, 25, y);
        y += lineH;
      }
    });
    doc.save(`mzdocs-${this.serviceType}-${Date.now()}.pdf`);
  }

  async _downloadWord() {
    const html = `<html><head><meta charset="UTF-8">
      <style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:2.5cm;line-height:1.5;}
      h1{font-size:16pt;color:#2E74B5;}h2{font-size:13pt;color:#2E74B5;}
      table{border-collapse:collapse;width:100%;}td,th{border:1px solid #BFBFBF;padding:5pt;}</style>
    </head><body>${this._mdToHTMLBasic(this.content)}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mzdocs-${this.serviceType}-${Date.now()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _downloadExcel() {
    const html = `<html><head><meta charset="UTF-8"></head>
      <body>${this._mdToHTMLBasic(this.content)}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mzdocs-${this.serviceType}-${Date.now()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _downloadMd() {
    const blob = new Blob([this.content], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mzdocs-${this.serviceType}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _copy() {
    navigator.clipboard.writeText(this.content)
      .then(() => alert('✅ Copiado!'))
      .catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = this.content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('✅ Copiado!');
      });
  }

  _sendWA() {
    const preview = this.content.slice(0, 800).replace(/#{1,3} /g, '*');
    const msg = `📄 *${this.serviceType || 'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`;
    window.open(`https://wa.me/258858695506?text=${encodeURIComponent(msg)}`, '_blank');
  }

  _reedit() {
    const instruction = prompt('💡 O que deseja alterar no documento?\n\nExemplo: "Adicione mais detalhes na introdução"');
    if (!instruction) return;
    if (this.onReedit) {
      this.onReedit({ currentContent: this.content, instruction, serviceType: this.serviceType });
    } else {
      document.dispatchEvent(new CustomEvent('document:reedit', {
        detail: { currentContent: this.content, instruction, serviceType: this.serviceType }
      }));
    }
  }

  _updateStats() {
    const words = this.content.trim().split(/\s+/).filter(w => w.length > 0).length;
    const el = this.modal?.querySelector('#editorStats');
    if (el) el.textContent = `${words} palavras | ${this.content.length} caracteres`;
  }

  // ── API pública ────────────────────────────────────────────────
  loadDocument(content, serviceType) {
    this.content     = content;
    this.serviceType = serviceType;
    this._previewFmt = 'pdf';

    const textarea = this.modal?.querySelector('#editorTextarea');
    if (textarea) textarea.value = content;

    this._updateStats();
    this.open();

    // Activa modo preview por defeito
    this._switchMode('preview');

    // Reset tabs de formato
    this.modal.querySelectorAll('[data-preview]').forEach(b => {
      b.classList.toggle('active', b.dataset.preview === 'pdf');
    });
    const dlBtn = this.modal.querySelector('#edBtnDownload');
    if (dlBtn) dlBtn.textContent = '⬇️ PDF';

    // Actualiza escala A4 após render
    setTimeout(() => this._updateA4Scale(), 100);

    // Recalcula ao redimensionar janela
    if (!this._resizeHandler) {
      this._resizeHandler = () => this._updateA4Scale();
      window.addEventListener('resize', this._resizeHandler);
    }
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

  getContent() { return this.content; }
}
