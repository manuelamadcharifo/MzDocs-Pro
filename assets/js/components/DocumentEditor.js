// assets/js/components/DocumentEditor.js
// Editor WYSIWYG estilo Word — preview A4 fiel + edição rich text com toolbar
import { sanitizeHtml } from '../utils/Sanitizer.js';

export class DocumentEditor {
  constructor() {
    this.content     = '';
    this.serviceType = '';
    this.modal       = null;
    this.onReedit    = null;
    this._previewFmt = 'pdf';
    this._resizeHandler = null;
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
            <button class="ed-tab" data-fmt="edit" title="Editar documento">📝 Editar</button>
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
            <button id="edBtnWa"       class="ed-action-btn wa">💬 WhatsApp</button>
            <button id="edBtnCopy"     class="ed-action-btn">📋 Copiar</button>
            <button id="edBtnReedit" class="ed-action-btn ai" title="Redigir com IA (consome 1 crédito)">🤖 Redigir c/ IA <span style="font-size:10px;opacity:.75;font-weight:400;">(-1 cr.)</span></button>
            <button id="edBtnSign"    class="ed-action-btn" title="Inserir assinatura digital no documento">✍️ Assinar</button>
          </div>
        </div>

        <!-- WORD TOOLBAR (só no modo edição) -->
        <div class="ed-word-toolbar" id="edWordToolbar" style="display:none;">
          <!-- Linha 1: formatação de texto -->
          <div class="ed-word-row">
            <div class="ed-word-group">
              <select class="ed-sel" id="edFontFamily" title="Fonte">
                <option value="'Times New Roman',serif">Times New Roman</option>
                <option value="'Calibri',sans-serif" selected>Calibri</option>
                <option value="Arial,sans-serif">Arial</option>
                <option value="Georgia,serif">Georgia</option>
              </select>
              <select class="ed-sel ed-sel-sm" id="edFontSize" title="Tamanho">
                <option value="10">10</option>
                <option value="11">11</option>
                <option value="12" selected>12</option>
                <option value="14">14</option>
                <option value="16">16</option>
                <option value="18">18</option>
                <option value="20">20</option>
                <option value="24">24</option>
              </select>
            </div>
            <div class="ed-word-group">
              <button class="ed-wbtn" data-cmd="bold"        title="Negrito (Ctrl+B)"><b>B</b></button>
              <button class="ed-wbtn" data-cmd="italic"      title="Itálico (Ctrl+I)"><i>I</i></button>
              <button class="ed-wbtn" data-cmd="underline"   title="Sublinhado (Ctrl+U)"><u>U</u></button>
              <button class="ed-wbtn" data-cmd="strikeThrough" title="Riscado"><s>S</s></button>
            </div>
            <div class="ed-word-group">
              <button class="ed-wbtn" data-cmd="justifyLeft"    title="Alinhar esquerda">⬅</button>
              <button class="ed-wbtn" data-cmd="justifyCenter"  title="Centrar">≡</button>
              <button class="ed-wbtn" data-cmd="justifyRight"   title="Alinhar direita">➡</button>
              <button class="ed-wbtn" data-cmd="justifyFull"    title="Justificar">☰</button>
            </div>
            <div class="ed-word-group">
              <button class="ed-wbtn" data-cmd="insertUnorderedList" title="Lista com marcadores">• Lista</button>
              <button class="ed-wbtn" data-cmd="insertOrderedList"   title="Lista numerada">1. Lista</button>
              <button class="ed-wbtn" data-cmd="indent"   title="Aumentar recuo">→</button>
              <button class="ed-wbtn" data-cmd="outdent"  title="Diminuir recuo">←</button>
            </div>
            <div class="ed-word-group">
              <select class="ed-sel" id="edHeading" title="Estilo de parágrafo">
                <option value="p">Parágrafo</option>
                <option value="h1">Título 1</option>
                <option value="h2">Título 2</option>
                <option value="h3">Título 3</option>
                <option value="h4">Título 4</option>
              </select>
            </div>
          </div>
          <!-- Linha 2: cor, tabela, undo/redo, stats -->
          <div class="ed-word-row ed-word-row2">
            <div class="ed-word-group">
              <label class="ed-color-lbl" title="Cor do texto">A
                <input type="color" id="edColorText" value="#000000">
              </label>
              <label class="ed-color-lbl ed-color-bg" title="Cor de fundo">▣
                <input type="color" id="edColorBg" value="#ffffff">
              </label>
            </div>
            <div class="ed-word-group">
              <button class="ed-wbtn" id="edBtnTable" title="Inserir tabela">⊞ Tabela</button>
              <button class="ed-wbtn" id="edBtnHr"    title="Inserir linha separadora">― Linha</button>
              <button class="ed-wbtn" id="edBtnLink"  title="Inserir hiperligação">🔗 Link</button>
            </div>
            <div class="ed-word-group">
              <button class="ed-wbtn" data-cmd="undo" title="Desfazer (Ctrl+Z)">↩ Undo</button>
              <button class="ed-wbtn" data-cmd="redo" title="Refazer (Ctrl+Y)">↪ Redo</button>
            </div>
            <div class="ed-word-group" style="margin-left:auto;flex-wrap:wrap;gap:4px;">
              <button class="ed-wbtn" id="edBtnZoomOut" title="Ver página completa / reduzir zoom">🔍 Zoom</button>
              <button class="ed-action-btn" id="edBtnCopy2">📋 Copiar</button>
              <button class="ed-action-btn ai" id="edBtnReedit2" title="Reeditar com IA (consome 1 crédito)">🤖 Redigir c/ IA <span style="font-size:10px;opacity:.75;font-weight:400;">(-1 cr.)</span></button>
              <button class="ed-action-btn save" id="edBtnSave" title="Guardar edição e voltar ao preview">💾 Guardar</button>
              <div id="editorStats" class="ed-stats">0 palavras</div>
            </div>
          </div>
        </div>

        <!-- BODY -->
        <div class="ed-body">
          <!-- PREVIEW A4 -->
          <div class="ed-preview-wrap" id="edPreviewWrap">
            <div class="ed-a4-bg">
              <div class="ed-a4-label">A4 · 210×297 mm</div>
              <iframe id="edPreviewFrame" class="ed-a4-frame"></iframe>
            </div>
          </div>

          <!-- EDITOR WYSIWYG (estilo Word) -->
          <div class="ed-edit-wrap" id="edEditWrap" style="display:none;">
            <div class="ed-word-page-wrap">
              <div class="ed-word-page" id="edWordDoc" contenteditable="true" spellcheck="true"></div>
            </div>
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

    // Acções preview
    this.modal.querySelector('#edBtnDownload')?.addEventListener('click', () => this._download());
    this.modal.querySelector('#edBtnWa')?.addEventListener('click',       () => this._sendWA());
    this.modal.querySelector('#edBtnCopy')?.addEventListener('click',     () => this._copy());
    this.modal.querySelector('#edBtnCopy2')?.addEventListener('click',    () => this._copy());
    this.modal.querySelector('#edBtnReedit')?.addEventListener('click',   () => this._reedit());
    this.modal.querySelector('#edBtnReedit2')?.addEventListener('click',  () => this._reedit());
    this.modal.querySelector('#edBtnSave')?.addEventListener('click',     () => this._saveAndPreview());
    this.modal.querySelector('#edBtnSign')?.addEventListener('click',     () => this._openSignature());
    // FIX 2 — Botão de zoom para ver página completa no editor
    this.modal.querySelector('#edBtnZoomOut')?.addEventListener('click',  () => this._toggleEditorZoom());

    // Toolbar Word — botões execCommand
    this.modal.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault(); // não perder foco do editor
        document.execCommand(btn.dataset.cmd, false, null);
        this._syncContentFromEditor();
        this._updateToolbarState();
      });
    });

    // Fonte
    this.modal.querySelector('#edFontFamily')?.addEventListener('change', e => {
      document.execCommand('fontName', false, e.target.value);
      this._syncContentFromEditor();
    });

    // Tamanho
    this.modal.querySelector('#edFontSize')?.addEventListener('change', e => {
      // execCommand fontSize só aceita 1-7; usamos span style em vez disso
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = e.target.value + 'pt';
        range.surroundContents(span);
      }
      this._syncContentFromEditor();
    });

    // Estilo de parágrafo (heading)
    this.modal.querySelector('#edHeading')?.addEventListener('change', e => {
      document.execCommand('formatBlock', false, e.target.value);
      this._syncContentFromEditor();
    });

    // Cor do texto
    this.modal.querySelector('#edColorText')?.addEventListener('input', e => {
      document.execCommand('foreColor', false, e.target.value);
      this._syncContentFromEditor();
    });

    // Cor de fundo
    this.modal.querySelector('#edColorBg')?.addEventListener('input', e => {
      document.execCommand('hiliteColor', false, e.target.value);
      this._syncContentFromEditor();
    });

    // Inserir tabela
    this.modal.querySelector('#edBtnTable')?.addEventListener('click', () => this._insertTable());

    // Inserir linha
    this.modal.querySelector('#edBtnHr')?.addEventListener('click', () => {
      document.execCommand('insertHorizontalRule', false, null);
      this._syncContentFromEditor();
    });

    // Inserir link
    this.modal.querySelector('#edBtnLink')?.addEventListener('click', () => {
      const url = prompt('URL do link:');
      if (url) document.execCommand('createLink', false, url);
      this._syncContentFromEditor();
    });

    // Sync ao editar no contenteditable
    const wordDoc = this.modal.querySelector('#edWordDoc');
    if (wordDoc) {
      wordDoc.addEventListener('input', () => {
        this._syncContentFromEditor();
        this._updateStats();
      });
      wordDoc.addEventListener('keyup', () => this._updateToolbarState());
      wordDoc.addEventListener('mouseup', () => this._updateToolbarState());
    }
  }

  // ── Converte markdown → HTML rico para o editor Word ──────────
  _mdToRichHTML(md) {
    if (!md) return '<p><br></p>';
    // Normalizar "Nova Página" e variantes para o marcador canónico
    const normalized = md
      .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
      .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---');
    let html = normalized
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/---PAGE_BREAK---/g, '<div style="page-break-after:always;height:0;margin:0"></div><div style="display:flex;align-items:center;gap:8px;margin:16px 0;"><div style="height:1px;flex:1;background:#d1d5db"></div><span style="font-size:10px;color:#9ca3af;letter-spacing:.5px">— Nova Página —</span><div style="height:1px;flex:1;background:#d1d5db"></div></div>')
      .replace(/^######\s(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s(.+)$/gm,  '<h5>$1</h5>')
      .replace(/^####\s(.+)$/gm,   '<h4>$1</h4>')
      .replace(/^###\s(.+)$/gm,    '<h3>$1</h3>')
      .replace(/^##\s(.+)$/gm,     '<h2>$1</h2>')
      .replace(/^#\s(.+)$/gm,      '<h1>$1</h1>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,         '<em>$1</em>')
      .replace(/_(.+?)_/g,           '<u>$1</u>')
      .replace(/^---+$/gm, '<hr>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<oli>$2</oli>');

    // Tabelas markdown
    html = html.replace(/(\|.+\|\n?)+/g, match => this._mdTableToHTML(match));

    // Listas não ordenadas
    html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul style="margin:6pt 0 6pt 18pt;">${m}</ul>`);
    // Listas ordenadas
    html = html.replace(/(<oli>[\s\S]*?<\/oli>)+/g, m =>
      `<ol style="margin:6pt 0 6pt 18pt;">${m.replace(/<\/?oli>/g, tag => tag.replace('oli','li'))}</ol>`
    );

    // Parágrafos
    html = html.split('\n\n').map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|hr|table)/i.test(block)) return block;
      return `<p style="margin-bottom:8pt;text-align:justify;">${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return sanitizeHtml(html) || '<p><br></p>';
  }

  // ── Extrai texto do editor (HTML → markdown simplificado) ──────
  _richHTMLToMd(html) {
    // Step 1: convert tables HTML → markdown BEFORE stripping tags
    // Tables are otherwise destroyed by the generic tag-stripper
    html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableBody) => {
      const rows = [];
      const rowMatches = tableBody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      rowMatches.forEach((rowHtml, rowIdx) => {
        const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
        const cells = cellMatches.map(cell =>
          cell.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim()
        );
        if (cells.length === 0) return;
        rows.push('| ' + cells.join(' | ') + ' |');
        // Insert separator after header row
        if (rowIdx === 0) rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
      });
      return rows.length ? '\n' + rows.join('\n') + '\n' : '';
    });

    // Step 2: convert remaining elements
    return html
  .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
  .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
  .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
  .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<u[^>]*>(.*?)<\/u>/gi, '_$1_')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<hr[^>]*>/gi, '\n---\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  _syncContentFromEditor() {
    const doc = this.modal.querySelector('#edWordDoc');
    if (doc) {
      // Guardar o HTML rico E converter para markdown para o preview
      this._richHTML = doc.innerHTML;
      this.content   = this._richHTMLToMd(doc.innerHTML);
    }
  }

  // ── Actualiza estado visual dos botões da toolbar ──────────────
  _updateToolbarState() {
    const cmds = ['bold','italic','underline','strikeThrough',
                  'justifyLeft','justifyCenter','justifyRight','justifyFull',
                  'insertUnorderedList','insertOrderedList'];
    cmds.forEach(cmd => {
      const btn = this.modal.querySelector(`[data-cmd="${cmd}"]`);
      if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
    });
  }

  // ── Insere tabela ──────────────────────────────────────────────
  _insertTable() {
    const rows = parseInt(prompt('Número de linhas:', '3') || '3');
    const cols = parseInt(prompt('Número de colunas:', '3') || '3');
    if (!rows || !cols) return;

    let html = '<table style="width:100%;border-collapse:collapse;margin:10pt 0;">';
    html += '<thead><tr>';
    for (let c = 0; c < cols; c++) {
      html += `<th style="border:1px solid #555;padding:5pt 7pt;background:#f0f0f0;font-weight:bold;">Coluna ${c+1}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td style="border:1px solid #555;padding:5pt 7pt;" contenteditable="true"></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    document.execCommand('insertHTML', false, html);
    this._syncContentFromEditor();
  }

  // ── Muda entre modo preview e edição ──────────────────────────
  _switchMode(mode) {
    const previewWrap = this.modal.querySelector('#edPreviewWrap');
    const editWrap    = this.modal.querySelector('#edEditWrap');
    const subtoolbar  = this.modal.querySelector('#edSubtoolbar');
    const wordToolbar = this.modal.querySelector('#edWordToolbar');
    const wordDoc     = this.modal.querySelector('#edWordDoc');

    this.modal.querySelectorAll('[data-fmt]').forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === mode);
    });

    if (mode === 'preview') {
      // Sync do editor apenas se o modo edição foi usado
      if (this._templateHtml) {
        // Ler conteúdo editado do iframe de template
        const editFrame = this._templateEditFrame || this.modal.querySelector('#edTemplateEditFrame');
        if (editFrame && editFrame.contentDocument && editFrame.contentDocument.body) {
          try { this._templateHtml = editFrame.contentDocument.body.innerHTML; } catch(e) {}
        }
        // Ocultar iframe de edição e restaurar word-page-wrap
        if (editFrame) editFrame.style.display = 'none';
        const pageWrap = this.modal.querySelector('.ed-word-page-wrap');
        if (pageWrap) pageWrap.style.display = '';
        const wordDocEl = this.modal.querySelector('#edWordDoc');
        if (wordDocEl) wordDocEl.style.display = '';
      } else if (wordDoc && wordDoc.innerHTML && wordDoc.innerHTML.trim().length > 10) {
        this._syncContentFromEditor();
      }
      previewWrap.style.display = 'flex';
      editWrap.style.display    = 'none';
      subtoolbar.style.display  = 'flex';
      wordToolbar.style.display = 'none';
      this._renderPreview(this._previewFmt);
      this._updateA4Scale();
    } else {
      previewWrap.style.display = 'none';
      editWrap.style.display    = 'flex';
      subtoolbar.style.display  = 'none';
      wordToolbar.style.display = 'flex';
      // Renderizar conteúdo rico no editor
      if (wordDoc) {
        if (this._templateHtml && this._templateCss) {
          // Template HTML com layout estruturado (flexbox, 2 colunas, etc.)
          // Usar iframe com designMode='on' para preservar o layout visual exacto
          document.getElementById('ed-tpl-style')?.remove();
          const editWrapEl = this.modal.querySelector('#edEditWrap');
          // Ocultar o ed-word-page-wrap para não ocupar espaço
          const pageWrap = editWrapEl?.querySelector('.ed-word-page-wrap');
          if (pageWrap) pageWrap.style.display = 'none';
          // Criar ou reutilizar iframe de edição de template
          let editFrame = this.modal.querySelector('#edTemplateEditFrame');
          if (!editFrame) {
            editFrame = document.createElement('iframe');
            editFrame.id = 'edTemplateEditFrame';
            editFrame.style.cssText = 'flex:1;border:none;background:#fff;width:100%;min-height:0;';
            editWrapEl?.appendChild(editFrame);
          }
          editFrame.style.display = 'block';
          wordDoc.style.display = 'none';
          const editHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: #e8ecf0; }
            /* Centrar a página A4 dentro do iframe */
            .cv-page, .doc-page, [class*="-page"] {
              margin: 0 auto;
              box-shadow: 0 2px 16px rgba(0,0,0,.18);
            }
            ${this._templateCss}
          </style></head><body>${this._templateHtml}</body></html>`;
          editFrame.srcdoc = editHtml;
          editFrame.onload = () => {
            try {
              editFrame.contentDocument.designMode = 'on';
              this._templateEditFrame = editFrame;
            } catch(e) { console.warn('[editor] designMode failed:', e); }
          };
        } else {
          // Limpar iframe de edição de template se existir
          const editFrame = this.modal.querySelector('#edTemplateEditFrame');
          if (editFrame) { editFrame.style.display = 'none'; }
          // Restaurar ed-word-page-wrap
          const pageWrap = this.modal.querySelector('.ed-word-page-wrap');
          if (pageWrap) pageWrap.style.display = '';
          const wordDocWrap = this.modal.querySelector('#edWordDoc');
          if (wordDocWrap) { wordDocWrap.style.display = ''; }
          document.getElementById('ed-tpl-style')?.remove();
          wordDoc.style.padding = '';
          wordDoc.style.fontFamily = '';
          const isRawHTML = this.content && this.content.trimStart().startsWith('<');
          if (isRawHTML) {
            wordDoc.innerHTML = this.content;
          } else {
            wordDoc.innerHTML = this._richHTML || this._mdToRichHTML(this.content);
          }
        }
        setTimeout(() => { wordDoc.focus(); }, 50);
      }
      this._updateStats();
      this._updateToolbarState();
    }
  }

  // ── FIX 2: Toggle zoom no editor (ver página inteira / zoom normal) ──
  // Problema: no modo edição, a página A4 (794px) ficava cortada em mobile.
  // Solução: aplicar transform:scale() no ed-word-page igual ao preview A4,
  // toggle entre "zoom out (ver tudo)" e "zoom normal (editar confortável)".
  _toggleEditorZoom() {
    const editWrap = this.modal.querySelector('#edEditWrap');
    if (!editWrap) return;

    const btn = this.modal.querySelector('#edBtnZoomOut');

    // Para template (iframe): aplicar zoom no iframe
    const editFrame = this.modal.querySelector('#edTemplateEditFrame');
    if (editFrame && editFrame.style.display !== 'none') {
      const isZoomedOut = editFrame.dataset.zoomedOut === '1';
      if (isZoomedOut) {
        editFrame.style.transform = '';
        editFrame.style.transformOrigin = '';
        editFrame.style.width = '100%';
        editFrame.dataset.zoomedOut = '0';
        if (btn) btn.textContent = '🔍 Zoom';
      } else {
        const availW = editWrap.clientWidth;
        const a4Px   = 794; // aprox px de 210mm a 96dpi
        const scale  = Math.min(0.95, availW / a4Px);
        editFrame.style.transformOrigin = 'top left';
        editFrame.style.transform       = `scale(${scale})`;
        editFrame.style.width           = `${100 / scale}%`;
        editFrame.style.marginBottom    = `${(a4Px * 1.414 * scale) - (a4Px * 1.414)}px`;
        editFrame.dataset.zoomedOut = '1';
        if (btn) btn.textContent = '🔎 Normal';
      }
      return;
    }

    // Para editor de texto (div contenteditable)
    const wordPage = this.modal.querySelector('#edWordDoc');
    if (!wordPage) return;
    const isZoomedOut = wordPage.dataset.zoomedOut === '1';
    const pageWrap    = this.modal.querySelector('.ed-word-page-wrap');

    if (isZoomedOut) {
      // Voltar ao normal
      wordPage.style.transform       = '';
      wordPage.style.transformOrigin = '';
      wordPage.style.width           = '';
      wordPage.style.marginBottom    = '';
      if (pageWrap) pageWrap.style.overflow = '';
      wordPage.dataset.zoomedOut = '0';
      if (btn) btn.textContent = '🔍 Zoom';
    } else {
      // Aplicar zoom out para ver a página inteira
      const availW = editWrap.clientWidth || 360;
      const pageW  = 794; // largura A4 em px
      const scale  = Math.min(0.95, (availW - 16) / pageW);
      const marginLeft = Math.max(0, (availW - pageW * scale) / 2);
      wordPage.style.transformOrigin = 'top left';
      wordPage.style.transform       = `scale(${scale})`;
      wordPage.style.marginLeft      = `${marginLeft}px`;
      wordPage.style.marginBottom    = `${(1123 * scale) - 1123}px`; // 1123px ≈ A4 height
      wordPage.style.width           = `${pageW}px`;
      if (pageWrap) pageWrap.style.overflow = 'auto';
      wordPage.dataset.zoomedOut = '1';
      if (btn) btn.textContent = '🔎 Normal';
    }
  }

  // ── Escala A4 para mobile ──────────────────────────────────────
  _updateA4Scale() {
    const frame = this.modal.querySelector('.ed-a4-frame');
    if (!frame) return;
    const wrap  = this.modal.querySelector('.ed-preview-wrap');
    if (!wrap)  return;
    const availW     = wrap.clientWidth;
    const a4Px       = 210 * 3.7795;  // 210mm em px (96dpi)
    const a4HeightPx = 297 * 3.7795;
    const scale      = Math.min(1, availW / a4Px);

    // CORRIGIDO: antes usava transform-origin:top center e inline style.
    // Problema: o iframe de 210mm a começar no centro transbordava para a
    // direita em viewports < 210mm*2 — causando scroll horizontal e layout
    // partido (imagem 3). Solução: usar transform-origin:top left e centrar
    // via margin-left calculado, exposto como CSS var para o media query do CSS.
    const marginLeft = (availW - a4Px * scale) / 2;

    // Definir a variável CSS para que o media query do editor.css a use
    frame.closest('.ed-a4-bg')?.style.setProperty('--a4-scale', scale.toString());
    // Aplicar directamente no JS para desktop (onde o CSS var não é usado)
    if (scale < 1) {
      frame.style.transform       = `scale(${scale})`;
      frame.style.transformOrigin = 'top left';
      frame.style.marginLeft      = `${marginLeft}px`;
      frame.style.marginBottom    = `${(a4HeightPx * scale) - a4HeightPx}px`;
    } else {
      frame.style.transform    = '';
      frame.style.marginLeft   = '';
      frame.style.marginBottom = '';
    }
  }

  // ── Preview A4 no iframe ───────────────────────────────────────
  _renderPreview(format) {
    const frame = this.modal.querySelector('#edPreviewFrame');
    if (!frame) return;
    console.log('[DocumentEditor] _renderPreview — content length:', this.content?.length, 'format:', format);
    if (!this.content || this.content.trim().length === 0) {
      console.error('[DocumentEditor] _renderPreview: this.content is empty!');
      return;
    }
    const html = this._buildPreviewHTML(format);
    // srcdoc: most reliable cross-browser approach
    // - No contentDocument.write() (fails silently when iframe not yet painted)
    // - No blob: URL (blocked by CSP in sandboxed iframes)
    // - No scripts needed inside preview so 'unsafe-inline' not required
    frame.srcdoc = html;
  }

  _buildPreviewHTML(format) {
    // Prioridade 1: HTML estruturado do template (layout de 2 colunas, sidebar, etc.)
    // NÃO passar pelo sanitizeHtml — o templateHtml vem de TemplateLibrary.js (fonte interna
    // confiável) e o sanitizer removeria tags semânticas (section, aside, main, header, footer)
    // que são essenciais para o layout. Os dados do utilizador já foram limpos em _extractRealData.
    if (this._templateHtml && this._templateCss) {
      return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><style>${this._templateCss}</style></head><body>${this._templateHtml}</body></html>`;
    }

    const isRawHTML = this.content && this.content.trimStart().startsWith('<');

    if (isRawHTML) {
      // Conteúdo HTML estruturado (gerado via htmlTemplate da IA)
      const templateCss = this._templateCss || 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;padding:18mm;}';
      return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><style>${templateCss}</style></head><body>${this.content}</body></html>`;
    }

    // Conteúdo markdown → converter para HTML
    const body = sanitizeHtml(this._markdownToHTML(this.content));

    // CORRIGIDO: se há templateCss activo, aplicá-lo mesmo para conteúdo markdown.
    // Bug original: o templateCss só era usado para HTML raw — para markdown usava sempre
    // _getFormatCSS() genérico, fazendo o editor mostrar um layout completamente diferente
    // do preview do resultado após o utilizador escolher um template (imagem 4 vs imagem 3).
    if (this._templateCss) {
      return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><style>*{box-sizing:border-box;}${this._templateCss}</style></head>
<body>${body}</body>
</html>`;
    }

    const css = this._getFormatCSS(format);
    // Para PDF e Word: injectar script de simulacao de paginas (mostra divisores visuais)
    // Para Excel: sem simulacao (layout continuo em tabela)
    const pageSim = (format !== 'excel') ? this._pageSimJS() : '';
    return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><style>${css}</style></head>
<body><div class="doc-page">${body}</div>${pageSim}</body>
</html>`;
  }

  _getFormatCSS(format) {
    // NOTA: min-height removido de .doc-page — o preview agora simula paginas reais.
    // O script _pageSimJS() injeta separadores visuais em multiplos de 297mm,
    // exactamente como o PDF impresso. O utilizador ve o mesmo numero de paginas que vai descarregar.
    const base = `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{background:#e5e7eb;padding:20px 0;}
      .doc-page{
        width:174mm;padding:15mm 0;background:#fff;
        font-family:'Times New Roman',Georgia,serif;
        font-size:11.5pt;line-height:1.45;color:#000;
        margin:0 auto;
        box-shadow:0 2px 12px rgba(0,0,0,.15);
      }
      .page-break-ruler{
        width:210mm;margin:0 auto;
        border:none;border-top:2px dashed #94a3b8;
        position:relative;
        display:flex;align-items:center;justify-content:center;
      }
      .page-break-ruler::after{
        content:'— Quebra de página —';
        position:absolute;
        background:#e5e7eb;
        padding:0 10px;
        font-size:10px;color:#94a3b8;
        font-family:sans-serif;letter-spacing:.5px;
      }
      h1{font-size:16pt;font-weight:bold;text-align:center;margin-bottom:10pt;}
      h2{font-size:12.5pt;font-weight:bold;margin-top:10pt;margin-bottom:5pt;border-bottom:1px solid #ccc;padding-bottom:2pt;}
      h3{font-size:11.5pt;font-weight:bold;margin-top:7pt;margin-bottom:4pt;}
      h4{font-size:11pt;font-weight:bold;margin-top:6pt;margin-bottom:3pt;}
      p{margin-bottom:5pt;text-align:justify;}
      ul,ol{margin:4pt 0 4pt 16pt;}li{margin-bottom:2pt;}
      table{width:100%;border-collapse:collapse;margin:7pt 0;font-size:11pt;page-break-inside:avoid;}
      td,th{border:1px solid #000;padding:4pt 6pt;}th{background:#f0f0f0;font-weight:bold;}
      strong{font-weight:bold;}em{font-style:italic;}
      hr{border:none;border-top:1px solid #bbb;margin:7pt 0;}
      h1,h2,h3,h4{page-break-after:avoid;}
    `;
    if (format === 'word') return base + `
      body,.doc-page{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:11pt;}
      h1{color:#2E74B5;font-size:16pt;}h2{color:#2E74B5;font-size:13pt;border-bottom-color:#2E74B5;}
      td,th{border-color:#BFBFBF;}th{background:#D9E2F3;color:#1F3864;}
    `;
    if (format === 'excel') return `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Calibri',Arial,sans-serif;font-size:11pt;background:#fff;}
      .doc-page{padding:0;width:100%;min-height:100vh;}
      table{width:100%;border-collapse:collapse;}
      th{background:#4472C4;color:#fff;font-weight:bold;padding:6pt 8pt;border:1px solid #2F5597;}
      td{padding:5pt 8pt;border:1px solid #B4B4B4;}
      tr:nth-child(even) td{background:#F2F2F2;}
      h1,h2,h3{padding:8pt;font-size:13pt;}p{padding:4pt 8pt;}ul,ol{padding:4pt 8pt 4pt 24pt;}
    `;
    return base + `body,.doc-page{font-family:'Times New Roman',Georgia,serif;}`;
  }

  // Script injectado no iframe de preview para simular quebras de pagina visuais.
  // Mede a altura real do .doc-page e insere divisores "--- Quebra de pagina ---"
  // em cada multiplo de 297mm (area util: 297 - 25 topo - 20 base = 252mm de texto).
  // O utilizador ve EXACTAMENTE o numero de paginas que o PDF vai ter.
  _pageSimJS() {
    return `<script>
(function(){
  // Dimensoes correspondentes ao CSS de impressao do HTMLPDFExporter.exportWithPageWrap:
  // @page { margin: 15mm 18mm } → area util vertical = 297 - 15 - 15 = 267mm
  const MM_TO_PX = 96 / 25.4;
  const PAGE_H_MM = 297;
  const PAGE_H_PX = PAGE_H_MM * MM_TO_PX;
  // Margens @page (15mm topo + 15mm base)
  const PAD_TOP_PX  = 15 * MM_TO_PX;
  const PAD_BOT_PX  = 15 * MM_TO_PX;
  const USABLE_PX   = PAGE_H_PX - PAD_TOP_PX - PAD_BOT_PX; // area util de texto ~267mm

  function insertPageBreaks() {
    const page = document.querySelector('.doc-page');
    if (!page) return;
    const totalH = page.scrollHeight;
    if (totalH <= PAGE_H_PX) return; // cabe numa pagina — nada a fazer

    const numBreaks = Math.floor(totalH / PAGE_H_PX);
    for (let i = 1; i <= numBreaks; i++) {
      const breakPx = i * PAGE_H_PX;
      if (breakPx >= totalH) break;
      const ruler = document.createElement('div');
      ruler.className = 'page-break-ruler';
      ruler.style.cssText = 'height:20px;margin:0 auto;width:210mm;';
      ruler.style.position = 'absolute';
      ruler.style.top = breakPx + 'px';
      ruler.style.left = '0';
      ruler.style.right = '0';
      document.body.appendChild(ruler);
    }
    // Tornar body relativo para posicionamento absoluto dos rulers
    document.body.style.position = 'relative';
    document.body.style.minHeight = totalH + 'px';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertPageBreaks);
  } else {
    insertPageBreaks();
  }
})();
</script>`;
  }

  _markdownToHTML(md) {
    if (!md) return '<p><em>Sem conteúdo</em></p>';
    if (this._previewFmt === 'excel') {
      return `<div style="background:#E7E6E6;border-bottom:3px solid #4472C4;padding:6px 16px;font-weight:bold;display:inline-block;margin-bottom:8px;">📊 Folha 1</div>${this._mdToHTMLBasic(md)}`;
    }
    return this._mdToHTMLBasic(md);
  }

  _mdToHTMLBasic(md) {
    // Normalizar variantes de "Nova Página" para o marcador canónico
    const normalized = md
      .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
      .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---');
    // Replace PAGE_BREAK FIRST (before HTML-escaping) so it doesn't get mangled
    const PAGE_BREAK_PLACEHOLDER = '___PB___';
    let html = normalized
      .replace(/---PAGE_BREAK---/g, PAGE_BREAK_PLACEHOLDER)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(new RegExp(PAGE_BREAK_PLACEHOLDER,'g'),'<div style="page-break-after:always;height:0;margin:0"></div><div style="display:flex;align-items:center;gap:8px;margin:18px 0;"><div style="height:1px;flex:1;background:#d1d5db"></div><span style="font-size:10px;color:#9ca3af;letter-spacing:.5px">— Nova Página —</span><div style="height:1px;flex:1;background:#d1d5db"></div></div>')
      .replace(/^######\s(.+)$/gm,'<h6>$1</h6>')
      .replace(/^#####\s(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s(.+)$/gm,  '<h4>$1</h4>')
      .replace(/^###\s(.+)$/gm,   '<h3>$1</h3>')
      .replace(/^##\s(.+)$/gm,    '<h2>$1</h2>')
      .replace(/^#\s(.+)$/gm,     '<h1>$1</h1>')
      .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,    '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,        '<em>$1</em>')
      .replace(/^---+$/gm,'<hr>')
      .replace(/^- (.+)$/gm,'<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm,'<li>$2</li>')
      .replace(/\n\n/g,'</p><p>')
      .replace(/\n/g,'<br>');
    html = html.replace(/(<li>.*?<\/li>)+/gs, m => `<ul>${m}</ul>`);
    html = html.replace(/(\|.+\|\n?)+/g, m => this._mdTableToHTML(m));
    return `<p>${html}</p>`;
  }

  _mdTableToHTML(tableStr) {
    const rows = tableStr.trim().split('\n').filter(r => !/^[\|\s\-:]+$/.test(r));
    if (!rows.length) return tableStr;
    const headers = rows[0].split('|').map(c => c.trim()).filter(Boolean);
    const body    = rows.slice(1);
    const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const tbody = body.map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  // ── Downloads ─────────────────────────────────────────────────
  async _download() {
    const fmt = this._previewFmt;
    const btn = this.modal.querySelector('#edBtnDownload');
    const orig = btn.textContent;
    // Sync from rich-text editor before export ONLY when no template HTML is active
    // (syncContentFromEditor converts innerHTML back to markdown which would corrupt templateHtml)
    const wordDoc = this.modal.querySelector('#edWordDoc');
    if (!this._templateHtml && wordDoc && wordDoc.innerHTML && wordDoc.innerHTML.trim().length > 10) {
      this._syncContentFromEditor();
    }
    btn.disabled = true; btn.textContent = '⏳…';
    try {
      if (fmt === 'pdf')   await this._downloadPDF();
      if (fmt === 'word')  await this._downloadWord();
      if (fmt === 'excel') await this._downloadExcel();
    } catch (err) { alert('❌ Erro ao exportar: ' + err.message); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }

  async _downloadPDF() {
    // Se há HTML estruturado do template, usar sempre HTMLPDFExporter para preservar
    // o layout exacto (2 colunas, sidebar, cores, etc.) — igual ao preview.
    if (this._templateHtml && this._templateCss) {
      try {
        const { HTMLPDFExporter } = await import('./HTMLPDFExporter.js');
        new HTMLPDFExporter().export(this._templateHtml, `mzdocs-${this.serviceType}-${Date.now()}`, {
          templateCss: this._templateCss,
          title: this.serviceType || 'Documento MzDocs',
        });
        return;
      } catch (err) {
        console.error('[DocumentEditor] HTMLPDFExporter (templateHtml) falhou:', err.message);
      }
    }

    // If content is raw HTML (from htmlTemplate) or has template CSS, use HTMLPDFExporter
    const isRawHTML = this.content && this.content.trimStart().startsWith('<');
    const templateCss = this._templateCss;

    if (isRawHTML || templateCss) {
      try {
        const { HTMLPDFExporter } = await import('./HTMLPDFExporter.js');
        new HTMLPDFExporter().export(this.content, `mzdocs-${this.serviceType}-${Date.now()}`, {
          templateCss: templateCss || null,
          title: this.serviceType || 'Documento MzDocs',
        });
        return;
      } catch (err) {
        console.error('[DocumentEditor] HTMLPDFExporter falhou:', err.message);
      }
    }

    // Use the full PDFExporter (same pipeline as original generation)
    try {
      const { PDFExporter } = await import('./PDFExporter.js');
      // Build metadata from docController if available, else use serviceType as fallback
      const ctrl     = this._docController || window.docController;
      const metadata = ctrl ? ctrl._buildExportMetadata(
        (ctrl.docModel?.service ? (await import('../services/ServiceDefinitions.js').then(m => m.SERVICES[ctrl.docModel.service])) : null)
      ) : {
        title:   this.serviceType || 'Documento',
        docType: 'generic',
        cidade:  'Maputo',
        ano:     new Date().getFullYear(),
      };
      await new PDFExporter().export(
        this.content,
        `mzdocs-${this.serviceType}-${Date.now()}.pdf`,
        metadata
      );
    } catch (err) {
      console.error('[DocumentEditor] PDFExporter falhou, a usar fallback:', err.message);
      // Fallback: iframe print with preview HTML
      const html = this._buildPreviewHTML('pdf');
      const printFrame = document.createElement('iframe');
      printFrame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;';
      document.body.appendChild(printFrame);
      printFrame.srcdoc = html;
      printFrame.onload = () => {
        try { printFrame.contentWindow.focus(); printFrame.contentWindow.print(); } catch(_) {}
        setTimeout(() => document.body.removeChild(printFrame), 2000);
      };
    }
  }

  async _downloadWord() {
    // Se há HTML estruturado do template, usar HTMLToDocxExporter
    // que gera um .docx REAL (OOXML) preservando layout de 2 colunas,
    // cores de fundo, tipografia e estilos do template via docx-js.
    if (this._templateHtml && this._templateCss) {
      try {
        const { HTMLToDocxExporter } = await import('./HTMLToDocxExporter.js');
        await new HTMLToDocxExporter().export(
          this._templateHtml,
          this._templateCss,
          `mzdocs-${this.serviceType}-${Date.now()}`,
          this.serviceType || 'Documento MzDocs'
        );
        return;
      } catch (err) {
        console.error('[DocumentEditor] HTMLToDocxExporter falhou:', err.message);
      }
    }

    // Use the full WordExporter (same pipeline as original generation)
    try {
      const { WordExporter } = await import('./WordExporter.js');
      const ctrl     = this._docController || window.docController;
      const metadata = ctrl ? ctrl._buildExportMetadata(
        (ctrl.docModel?.service ? (await import('../services/ServiceDefinitions.js').then(m => m.SERVICES[ctrl.docModel.service])) : null)
      ) : {
        title:   this.serviceType || 'Documento',
        docType: 'generic',
        cidade:  'Maputo',
        ano:     new Date().getFullYear(),
      };
      await new WordExporter().export(
        this.content,
        `mzdocs-${this.serviceType}-${Date.now()}.docx`,
        metadata
      );
    } catch (err) {
      console.error('[DocumentEditor] WordExporter falhou, a usar fallback:', err.message);
      // Fallback: simple .doc via blob — handle both HTML and markdown content
      const isRawHTML = this.content && this.content.trimStart().startsWith('<');
      const richContent = isRawHTML ? this.content : this._mdToRichHTML(this.content);
      const templateCss = this._templateCss || '';
      const css = templateCss || this._getFormatCSS('word');
      const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset="UTF-8">
        <style>${css}
          @page{size:210mm 297mm;margin:25mm 22mm 20mm 25mm;}
        </style></head>
        <body>${richContent}</body></html>`;
      const blob = new Blob(['\uFEFF', html], { type:'application/msword' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href:url, download:`mzdocs-${this.serviceType}-${Date.now()}.doc` });
      a.click(); URL.revokeObjectURL(url);
    }
  }

  async _downloadExcel() {
    const html = `<html><head><meta charset="UTF-8"></head><body>${this._mdToHTMLBasic(this.content)}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type:'application/vnd.ms-excel' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href:url, download:`mzdocs-${this.serviceType}-${Date.now()}.xls` });
    a.click(); URL.revokeObjectURL(url);
  }

  _copy() {
    navigator.clipboard.writeText(this.content)
      .then(() => alert('✅ Copiado!'))
      .catch(() => { const ta = Object.assign(document.createElement('textarea'),{value:this.content}); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('✅ Copiado!'); });
  }

  _sendWA() {
    const preview = this.content.slice(0,800).replace(/#{1,3} /g,'*');
    window.open(`https://wa.me/258858695506?text=${encodeURIComponent(`📄 *${this.serviceType||'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`)}`, '_blank');
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


  // ── Assinatura Digital ─────────────────────────────────────────
  _openSignature() {
    // Criar modal de assinatura inline
    const existing = document.getElementById('signatureModal');
    if (existing) existing.remove();

    const sigModal = document.createElement('div');
    sigModal.id = 'signatureModal';
    sigModal.style.cssText = [
      'position:fixed','inset:0','z-index:99999',
      'background:rgba(0,0,0,0.7)','display:flex',
      'align-items:center','justify-content:center','padding:20px'
    ].join(';');

    sigModal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:16px;font-weight:700;color:#07101f;">✍️ Assinatura Digital</h3>
          <button id="sigModalClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;padding:4px;">✕</button>
        </div>
        <p style="font-size:13px;color:#6b7280;margin-bottom:12px;">Desenhe a sua assinatura com o dedo ou rato:</p>
        <canvas id="sigCanvas" width="420" height="160"
          style="border:2px dashed #d1d5db;border-radius:8px;width:100%;touch-action:none;cursor:crosshair;background:#fafafa;display:block;"></canvas>
        <p id="sigHint" style="font-size:11px;color:#9ca3af;text-align:center;margin-top:6px;">Toque e arraste para assinar</p>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button id="sigClear" style="flex:1;padding:10px;border:1.5px solid #d1d5db;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#374151;">🗑 Limpar</button>
          <button id="sigInsert" style="flex:2;padding:10px;background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">✅ Inserir no Documento</button>
        </div>
      </div>
    `;
    document.body.appendChild(sigModal);

    const canvas = document.getElementById('sigCanvas');
    const ctx    = canvas.getContext('2d');
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    let drawing     = false;
    let hasSig      = false;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * scaleX,
        y: (src.clientY - rect.top)  * scaleY,
      };
    };

    canvas.addEventListener('mousedown',  e => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSig = true; });
    canvas.addEventListener('mouseup',    () => { drawing = false; ctx.beginPath(); });
    canvas.addEventListener('mouseleave', () => { drawing = false; ctx.beginPath(); });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSig = true; }, { passive: false });
    canvas.addEventListener('touchend',   () => { drawing = false; ctx.beginPath(); });

    document.getElementById('sigClear').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasSig = false;
    });

    document.getElementById('sigModalClose').addEventListener('click', () => sigModal.remove());
    sigModal.addEventListener('click', e => { if (e.target === sigModal) sigModal.remove(); });

    document.getElementById('sigInsert').addEventListener('click', () => {
      if (!hasSig) { alert('⚠️ Desenhe uma assinatura primeiro.'); return; }
      const dataUrl = canvas.toDataURL('image/png');
      const sigHTML = `
        <div style="margin-top:24pt;border-top:1px solid #333;padding-top:8pt;display:inline-block;text-align:center;">
          <img src="${dataUrl}" style="max-width:200px;height:60px;object-fit:contain;display:block;margin-bottom:4pt;" alt="Assinatura">
          <div style="font-size:9pt;color:#555;">Assinado digitalmente via MzDocs Pro</div>
          <div style="font-size:9pt;color:#555;">${new Date().toLocaleDateString('pt-MZ')}</div>
        </div>
      `;

      // Inserir no editor: se estiver em modo edição, insere no cursor; senão appenda ao markdown
      const wordDoc = this.modal.querySelector('#edWordDoc');
      if (wordDoc && document.activeElement === wordDoc) {
        document.execCommand('insertHTML', false, sigHTML);
        this._syncContentFromEditor();
      } else {
        // Modo preview — appenda representação markdown e passa para edição
        this.content += `\n\n---\n**Assinatura Digital** — ${new Date().toLocaleDateString('pt-MZ')}`;
        // Guardar dataUrl para reapor no HTML rico do editor
        this._pendingSignatureImg = dataUrl;
        this._switchMode('edit');
        setTimeout(() => {
          const doc = this.modal.querySelector('#edWordDoc');
          if (doc) {
            doc.innerHTML += sigHTML;
            this._syncContentFromEditor();
          }
        }, 100);
      }

      sigModal.remove();
      // Feedback
      const hint = document.createElement('div');
      hint.textContent = '✍️ Assinatura inserida!';
      hint.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:99999;';
      document.body.appendChild(hint);
      setTimeout(() => hint.remove(), 2500);
    });
  }

  // ── Guardar edição e voltar ao preview ────────────────────────
  _saveAndPreview() {
    if (this._templateHtml) {
      // Ler conteúdo editado do iframe de template (designMode)
      const editFrame = this._templateEditFrame || this.modal.querySelector('#edTemplateEditFrame');
      if (editFrame && editFrame.contentDocument) {
        try {
          this._templateHtml = editFrame.contentDocument.body.innerHTML;
        } catch(e) { console.warn('[editor] Could not read template iframe:', e); }
      }
    } else {
      this._syncContentFromEditor();
    }
    this._switchMode('preview');
    const toast = document.createElement('div');
    toast.textContent = '💾 Edição guardada!';
    toast.style.cssText = [
      'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
      'background:#10b981','color:#fff','padding:8px 20px',
      'border-radius:20px','font-size:13px','font-weight:700',
      'z-index:99999','pointer-events:none'
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  _updateStats() {
    const words = this.content.trim().split(/\s+/).filter(w => w.length > 0).length;
    const el = this.modal?.querySelector('#editorStats');
    if (el) el.textContent = `${words} palavras | ${this.content.length} chars`;
  }

  // ── API pública ────────────────────────────────────────────────
  loadDocument(content, serviceType, templateCss, templateHtml) {
    // DEBUG: log incoming content
    console.log('[DocumentEditor] loadDocument — type:', typeof content, 'length:', content?.length);
    // Fallback: use window.documentState if content is invalid (Bug 2 fix)
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      const fallback = window.documentState?.get();
      if (fallback && fallback.trim().length > 0) {
        console.warn('[DocumentEditor] invalid content — using documentState fallback');
        content = fallback;
      } else {
        console.error('[DocumentEditor] loadDocument: no valid content available — aborting');
        return;
      }
    }
    this.content       = content;
    this.serviceType   = serviceType;
    this._previewFmt   = 'pdf';
    this._richHTML     = null;
    // FIX 1 — templateCss e templateHtml definidos ANTES do open()/setTimeout
    // Anteriormente o requestAnimationFrame corria antes de o browser pintar o
    // modal, pelo que _buildPreviewHTML encontrava _templateHtml como null.
    // Com setTimeout(0) o callback corre após o modal ser painted (micro-task).
    this._templateCss  = templateCss  || null;
    this._templateHtml = templateHtml || null;
    // Guardar historyId para actualizar o histórico ao fechar (FIX 3)
    this._historyId = window.documentController?.docModel?.formData?._historyId
                   || window.docController?.docModel?.formData?._historyId
                   || null;

    this._updateStats();
    this.open();

    // setTimeout(0) garante que o DOM do modal está pintado E que
    // this._templateHtml já está atribuído quando _buildPreviewHTML é chamado
    setTimeout(() => {
      console.log('[DocumentEditor] MOUNTED — template:', !!(this._templateHtml), 'css:', !!(this._templateCss));
      this._switchMode('preview');
    }, 0);

    this.modal.querySelectorAll('[data-preview]').forEach(b => {
      b.classList.toggle('active', b.dataset.preview === 'pdf');
    });
    const dlBtn = this.modal.querySelector('#edBtnDownload');
    if (dlBtn) dlBtn.textContent = '⬇️ PDF';

    setTimeout(() => this._updateA4Scale(), 120);

    if (!this._resizeHandler) {
      this._resizeHandler = () => this._updateA4Scale();
      window.addEventListener('resize', this._resizeHandler);
    }
  }

  open()  { if (this.modal) { this.modal.style.display='flex'; document.body.style.overflow='hidden'; } }

  // FIX 3 — close() agora despacha 'editor:closed' com o conteúdo final
  // e actualiza o histórico. DocumentController.js escuta este evento e
  // chama historyController.updateDocumentContent(historyId, content).
  close() {
    if (!this.modal) return;

    // Sincronizar conteúdo antes de fechar
    let finalContent  = this.content;
    let finalTemplate = this._templateHtml || null;

    if (this._templateHtml) {
      const editFrame = this._templateEditFrame || this.modal.querySelector('#edTemplateEditFrame');
      if (editFrame && editFrame.contentDocument?.body) {
        try { finalTemplate = editFrame.contentDocument.body.innerHTML; } catch(_) {}
      }
    } else {
      const wordDoc = this.modal.querySelector('#edWordDoc');
      if (wordDoc && wordDoc.innerHTML && wordDoc.innerHTML.trim().length > 10) {
        this._syncContentFromEditor();
        finalContent = this.content;
      }
    }

    // Despachar evento para DocumentController guardar no histórico
    document.dispatchEvent(new CustomEvent('editor:closed', {
      detail: {
        content:      finalContent,
        templateHtml: finalTemplate,
        templateCss:  this._templateCss || null,
        serviceType:  this.serviceType,
        historyId:    this._historyId,
      },
    }));

    this.modal.style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('ed-tpl-style')?.remove();
    this._templateEditFrame = null;
  }

  getContent() { return this.content; }
}
