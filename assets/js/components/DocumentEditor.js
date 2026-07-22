// assets/js/components/DocumentEditor.js
// Editor WYSIWYG estilo Word — preview A4 fiel + edição rich text com toolbar
import { sanitizeHtml } from '../utils/Sanitizer.js';
import { getFormatCSS } from './DocumentEditorStyles.js';
import { renderA4Pages, A4_PAGES_CONTAINER_CSS, scalePage, markdownToHtml as a4MarkdownToHtml, DEFAULT_PAGE_CSS } from '../utils/A4Renderer.js';

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
          <!-- PREVIEW A4 — agora usa o MESMO motor renderA4Pages() do resultado/
               TemplatePicker: folhas A4 reais separadas por página, tabelas
               markdown "|" convertidas em <table> real (GFM), igual em toda a app. -->
          <div class="ed-preview-wrap" id="edPreviewWrap">
            <div class="a4-pages-outer" id="edA4Wrap"></div>
          </div>

          <!-- EDITOR WYSIWYG (estilo Word) — múltiplas folhas A4 reais, uma por
               página, visualmente separadas (igual ao Preview), cada uma editável. -->
          <div class="ed-edit-wrap" id="edEditWrap" style="display:none;">
            <div class="ed-word-page-wrap" id="edWordPagesWrap"></div>
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

    // Sync ao editar no contenteditable — delegação de eventos no contentor,
    // porque as folhas (.ed-word-page) são criadas dinamicamente em
    // _renderEditorPages() e podem não existir ainda neste momento do setup.
    const pagesWrap = this._getEditorPagesWrap();
    if (pagesWrap) {
      pagesWrap.addEventListener('input', (e) => {
        if (!e.target.classList?.contains('ed-word-page')) return;
        this._syncContentFromEditor();
        this._updateStats();
      });
      pagesWrap.addEventListener('keyup', (e) => {
        if (e.target.classList?.contains('ed-word-page')) this._updateToolbarState();
      });
      pagesWrap.addEventListener('mouseup', (e) => {
        if (e.target.classList?.contains('ed-word-page')) this._updateToolbarState();
      });
    }
  }

  // ── Helpers para múltiplas folhas editáveis (#edWordPagesWrap) ──────────
  // Substituem o antigo #edWordDoc único — cada página real é agora a sua
  // própria folha A4 (div contenteditable), visualmente separada, igual ao
  // Preview, sem depender do A4Renderer (que usa iframes, incompatíveis com
  // edição directa de texto).
  _getEditorPagesWrap() {
    return this.modal?.querySelector('#edWordPagesWrap') || null;
  }

  _getEditorPages() {
    const wrap = this._getEditorPagesWrap();
    return wrap ? Array.from(wrap.querySelectorAll('.ed-word-page')) : [];
  }

  // Folha actualmente focada pelo utilizador, ou a primeira como fallback —
  // usada pela toolbar (bold/italic/listas/tabela) e por inserções (assinatura).
  _getActiveEditorPage() {
    const pages = this._getEditorPages();
    if (!pages.length) return null;
    const active = pages.find(p => p.contains(document.activeElement) || p === document.activeElement);
    return active || pages[0];
  }

  // Cria as folhas A4 editáveis a partir de um array de blocos HTML (1 por página).
  _renderEditorPages(htmlPages) {
    const wrap = this._getEditorPagesWrap();
    if (!wrap) return;
    wrap.innerHTML = '';
    const pages = (Array.isArray(htmlPages) && htmlPages.length) ? htmlPages : ['<p><br></p>'];
    pages.forEach((pageHtml, idx) => {
      if (idx > 0) {
        const sep = document.createElement('div');
        sep.className = 'ed-word-page-sep-label';
        sep.textContent = `Página ${idx + 1}`;
        wrap.appendChild(sep);
      }
      const pageEl = document.createElement('div');
      pageEl.className = 'ed-word-page';
      pageEl.contentEditable = 'true';
      pageEl.spellcheck = true;
      pageEl.dataset.pageIndex = String(idx);
      pageEl.innerHTML = pageHtml;
      wrap.appendChild(pageEl);
    });
  }


  // CORRIGIDO: antes devolvia uma única string com um separador visual inline
  // ("— Nova Página —" dentro do mesmo contenteditable) — agora devolve um
  // array, uma página por folha A4 real e editável, igual ao Preview.
  _mdToRichHTML(md) {
    if (!md) return ['<p><br></p>'];
    // Normalizar "Nova Página" e variantes para o marcador canónico
    const normalized = md
      .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
      .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---');

    const pages = normalized.split(/---PAGE_BREAK---/g).map(p => p.trim());
    return (pages.length ? pages : [normalized]).map(pageMd => this._mdToRichHTMLSingle(pageMd));
  }

  // ── Converte o markdown de UMA página → HTML rico (sem separador) ──
  _mdToRichHTMLSingle(md) {
    if (!md) return '<p><br></p>';
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    const pages = this._getEditorPages();
    if (!pages.length) return;
    // Guardar o HTML rico de cada folha (para reabrir o editor sem reconverter)
    // e o markdown equivalente (para o Preview), juntando as páginas com o
    // marcador canónico — exactamente como o conteúdo original gerado pela IA.
    this._richHTMLPages = pages.map(p => p.innerHTML);
    this._richHTML = this._richHTMLPages.join('\n---PAGE_BREAK---\n'); // compat. com código antigo que lia _richHTML
    this.content = pages.map(p => this._richHTMLToMd(p.innerHTML)).join('\n\n---PAGE_BREAK---\n\n');
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
    const pagesWrap   = this._getEditorPagesWrap();

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
        if (pagesWrap) pagesWrap.style.display = '';
      } else if (this._getEditorPages().some(p => p.innerHTML && p.innerHTML.trim().length > 10)) {
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
      // Renderizar conteúdo rico no editor — múltiplas folhas A4 reais
      if (pagesWrap) {
        if (this._templateHtml && this._templateCss) {
          // Template HTML com layout estruturado (flexbox, 2 colunas, etc.)
          // Usar iframe com designMode='on' para preservar o layout visual exacto
          document.getElementById('ed-tpl-style')?.remove();
          const editWrapEl = this.modal.querySelector('#edEditWrap');
          // Ocultar o wrap de páginas para não ocupar espaço
          if (pagesWrap) pagesWrap.style.display = 'none';
          // Criar ou reutilizar iframe de edição de template
          let editFrame = this.modal.querySelector('#edTemplateEditFrame');
          if (!editFrame) {
            editFrame = document.createElement('iframe');
            editFrame.id = 'edTemplateEditFrame';
            editFrame.style.cssText = 'flex:1;border:none;background:#fff;width:100%;min-height:0;';
            editWrapEl?.appendChild(editFrame);
          }
          editFrame.style.display = 'block';
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
            this._updateTemplateFrameScale();
          };
        } else {
          // Limpar iframe de edição de template se existir
          const editFrame = this.modal.querySelector('#edTemplateEditFrame');
          if (editFrame) { editFrame.style.display = 'none'; }
          // Restaurar wrap de páginas
          if (pagesWrap) pagesWrap.style.display = '';
          document.getElementById('ed-tpl-style')?.remove();
          const isRawHTML = this.content && this.content.trimStart().startsWith('<');
          if (isRawHTML) {
            // HTML estruturado sem template (ex: gerado via htmlTemplate da IA) —
            // tratado como uma única página editável (não há ---PAGE_BREAK--- aqui).
            this._renderEditorPages([this.content]);
          } else if (this._richHTMLPages && this._richHTMLPages.length) {
            this._renderEditorPages(this._richHTMLPages);
          } else {
            this._renderEditorPages(this._mdToRichHTML(this.content));
          }
        }
        setTimeout(() => {
          this._getEditorPages()[0]?.focus();
          this._updateEditorScale();
        }, 50);
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
        // Voltar ao modo padrão "encaixar" (~90%)
        editFrame.dataset.zoomedOut = '0';
        this._updateTemplateFrameScale();
        if (btn) btn.textContent = '🔍 Zoom';
      } else {
        // Tamanho real (1:1)
        editFrame.style.transform       = '';
        editFrame.style.transformOrigin = '';
        editFrame.style.marginLeft      = '';
        editFrame.style.marginBottom    = '';
        editFrame.style.width           = '100%';
        editFrame.dataset.zoomedOut = '1';
        if (btn) btn.textContent = '🔎 Normal';
      }
      return;
    }

    // Para editor de texto (múltiplas folhas .ed-word-page)
    const pagesWrap = this._getEditorPagesWrap();
    const pages = this._getEditorPages();
    if (!pagesWrap || !pages.length) return;
    const isZoomedOut = pagesWrap.dataset.zoomedOut === '1';

    if (isZoomedOut) {
      // CORRIGIDO: "zoomedOut=1" aqui significa tamanho real (1:1) — voltar
      // ao modo padrão "encaixar" (~90%, igual ao Preview) via _updateEditorScale.
      pagesWrap.dataset.zoomedOut = '0';
      this._updateEditorScale();
      pagesWrap.style.overflow = '';
      if (btn) btn.textContent = '🔍 Zoom';
    } else {
      // Tamanho real (1:1) — útil para editar com mais precisão/zoom do dedo.
      pages.forEach(p => {
        p.style.transform       = '';
        p.style.transformOrigin = '';
        p.style.marginLeft      = '';
        p.style.marginBottom    = '';
      });
      pagesWrap.style.overflow = 'auto';
      pagesWrap.dataset.zoomedOut = '1';
      if (btn) btn.textContent = '🔎 Normal';
    }
  }

  // ── Escala o iframe de edição de template (~90% em mobile, igual aos outros previews) ──
  _updateTemplateFrameScale() {
    const editFrame = this.modal?.querySelector('#edTemplateEditFrame');
    const editWrap  = this.modal?.querySelector('#edEditWrap');
    if (!editFrame || !editWrap) return;
    if (editFrame.dataset.zoomedOut === '1') return; // utilizador pediu tamanho real

    const isMobile = window.innerWidth <= 900;
    if (!isMobile) {
      editFrame.style.transform    = '';
      editFrame.style.marginLeft   = '';
      editFrame.style.marginBottom = '';
      editFrame.style.width        = '100%';
      return;
    }

    // CORRIGIDO: mesma consistência aplicada em _updateEditorScale — subtrair
    // o padding do contentor (se existir) UMA VEZ, e usar esse valor já
    // corrigido tanto na escala como no marginLeft, para a folha ficar
    // sempre centrada (nunca descentrada para a esquerda).
    const rawW = editWrap.clientWidth || window.innerWidth;
    const availW = Math.max(0, rawW - 16);
    const a4Px       = 794;
    const a4HeightPx = a4Px * 1.414; // proporção A4
    const scale = Math.min(0.9, availW / a4Px);
    const marginLeft = Math.max(0, (availW - a4Px * scale) / 2);

    editFrame.style.transformOrigin = 'top left';
    editFrame.style.transform       = `scale(${scale})`;
    editFrame.style.width           = `${a4Px}px`;
    editFrame.style.marginLeft      = `${marginLeft}px`;
    editFrame.style.marginBottom    = `${(a4HeightPx * scale) - a4HeightPx}px`;
  }

  // ── Escala A4 para mobile ──────────────────────────────────────
  // ── Reescalar todas as folhas A4 do preview (motor partilhado A4Renderer) ──
  _updateA4Scale() {
    const outer = this.modal.querySelector('#edA4Wrap');
    if (!outer) return;
    outer.querySelectorAll('.a4-page').forEach(pageEl => {
      const iframe = pageEl.querySelector('iframe');
      if (iframe) scalePage(outer, pageEl, iframe);
    });
    // O modo Editar (contenteditable, sem iframe) usa a sua própria escala —
    // mantém a mesma aparência (folha A4 reduzida a ~90%, centrada) em
    // ambos os modos, em vez do antigo width:100% que esticava a folha.
    this._updateEditorScale();
    this._updateTemplateFrameScale();
  }

  // ── Escala todas as folhas editáveis para caber a ~90% da largura ──────
  // disponível, igual ao Preview — só em mobile (≤900px). Em desktop a folha
  // já tem largura A4 fixa (210mm) e não precisa de escala. Chamado sempre
  // que o modo "edit" é activado e ao redimensionar a janela; o "Zoom" do
  // toolbar só alterna entre este modo "encaixar tudo" e tamanho real (1:1).
  _updateEditorScale() {
    const pageWrap = this.modal?.querySelector('#edWordPagesWrap');
    const pages    = this._getEditorPages();
    if (!pageWrap || !pages.length) return;
    // Não reaplicar se o utilizador pediu explicitamente tamanho real (zoom 1:1)
    if (pageWrap.dataset.zoomedOut === '1') return;

    const isMobile = window.innerWidth <= 900;
    if (!isMobile) {
      // Desktop: sem escala — folhas A4 no tamanho real definido pelo CSS base.
      pages.forEach(p => {
        p.style.transform    = '';
        p.style.marginLeft   = '';
        p.style.marginBottom = '';
      });
      return;
    }

    // CORRIGIDO: clientWidth do pageWrap já INCLUI o seu próprio padding
    // (8px de cada lado = 16px). Antes a escala subtraía esses 16px mas o
    // marginLeft (que centra a folha) usava a largura cheia sem subtrair —
    // a folha ficava descentrada para a esquerda, com um vazio à direita
    // (exactamente o problema reportado: "muito à esquerda... a escapar").
    // Agora subtrai o padding UMA VEZ e usa esse valor em todos os cálculos.
    const rawW = pageWrap.clientWidth || window.innerWidth;
    const availW = Math.max(0, rawW - 16); // 16 = 8px padding × 2 lados
    const a4Px       = 794;  // 210mm @ 96dpi
    const a4HeightPx = 1123; // 297mm @ 96dpi
    // CORRIGIDO: 0.9 — a folha ocupa ~90% da largura disponível por padrão,
    // com margem cinza visível ao redor (igual ao Preview/TemplatePicker),
    // em vez de width:100% que ia de borda a borda sem respiro visual.
    const scale = Math.min(0.9, availW / a4Px);
    const marginLeft = Math.max(0, (availW - a4Px * scale) / 2);

    // Aplicar a MESMA escala a todas as folhas — mantém a paginação visual
    // consistente (todas as páginas com o mesmo tamanho), igual ao Preview.
    pages.forEach(p => {
      p.style.transformOrigin = 'top left';
      p.style.transform       = `scale(${scale})`;
      p.style.marginLeft      = `${marginLeft}px`;
      p.style.marginBottom    = `${(a4HeightPx * scale) - a4HeightPx}px`;
    });
  }

  // ── Preview A4 — MESMO motor renderA4Pages() usado no resultado/TemplatePicker ──
  // Folhas A4 reais separadas por página (---PAGE_BREAK---), tabelas markdown
  // "|" convertidas em <table> real (GFM). Substitui o antigo iframe único
  // com script de simulação de páginas, que não reflectia a paginação real.
  _renderPreview(format) {
    const outer = this.modal.querySelector('#edA4Wrap');
    if (!outer) return;
    console.log('[DocumentEditor] _renderPreview — content length:', this.content?.length, 'format:', format);
    if (!this.content || this.content.trim().length === 0) {
      console.error('[DocumentEditor] _renderPreview: this.content is empty!');
      outer.innerHTML = '<p style="color:#fff;text-align:center;padding:40px 20px;">⚠️ Sem conteúdo para mostrar.</p>';
      return;
    }

    // Injectar CSS partilhado das folhas A4 uma única vez (idempotente)
    if (!document.getElementById('a4PagesSharedStyle')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'a4PagesSharedStyle';
      styleEl.textContent = A4_PAGES_CONTAINER_CSS;
      document.head.appendChild(styleEl);
    }

    try {
      this._renderPreviewInner(outer, format);
    } catch (err) {
      console.error('[DocumentEditor] _renderPreview erro:', err);
      outer.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:14px;color:#991b1b;font-size:13px;line-height:1.6;">
          <strong>⚠️ Erro ao mostrar o preview</strong><br><br>
          <code style="display:block;white-space:pre-wrap;word-break:break-word;background:#fff;border-radius:6px;padding:8px;margin-top:6px;font-size:11.5px;">${(err?.message || String(err)).replace(/</g,'&lt;')}</code>
        </div>`;
    }

    // CORRIGIDO (bug: "app mostra 1 página, download sai com 3"): a
    // renderização acima usa o conteúdo bruto (rápida, instantânea). Em
    // paralelo, calculamos a paginação REAL — medindo no browser quanto
    // conteúdo cabe mesmo numa folha A4 com as margens/tipografia reais —
    // e assim que estiver pronta, o preview é refeito com os mesmos
    // marcadores ---PAGE_BREAK--- que o PDF e o Word também vão respeitar
    // (ver _downloadPDF/_downloadWord e assets/js/utils/Paginator.js).
    // Isto garante que o nº de páginas mostrado aqui é o MESMO que sai no
    // ficheiro descarregado — não uma estimativa.
    this._schedulePagination(outer, format);
  }

  _schedulePagination(outer, format) {
    if (this._templateHtml) return; // templates HTML paginam-se a si próprios
    if (!this.content || this.content.trimStart().startsWith('<')) return;

    const source = this.content;
    if (this._paginationSource === source && this._paginatedContent) return; // já pronto

    const token = Symbol('pagination');
    this._paginationToken = token;
    import('../utils/Paginator.js')
      .then(({ getPaginatedContent }) => getPaginatedContent(source))
      .then(paginated => {
        // Ignorar resultado obsoleto — o conteúdo já mudou entretanto
        if (this._paginationToken !== token || this.content !== source) return;
        this._paginatedContent = paginated;
        this._paginationSource = source;
        if (paginated !== source && this.modal?.querySelector('#edA4Wrap') === outer) {
          this._renderPreviewInner(outer, format);
        }
      })
      .catch(err => console.warn('[DocumentEditor] paginação real falhou, mantém estimativa:', err.message));
  }

  _renderPreviewInner(outer, format) {
    // Prioridade 1: HTML estruturado do template (layout de 2 colunas, sidebar, etc.)
    // NÃO passar pelo sanitizeHtml — o templateHtml vem de TemplateLibrary.js (fonte interna
    // confiável) e o sanitizer removeria tags semânticas (section, aside, main, header, footer)
    // que são essenciais para o layout. Os dados do utilizador já foram limpos em _extractRealData.
    if (this._templateHtml && this._templateCss) {
      renderA4Pages(outer, this._templateHtml, { css: this._templateCss, isRawHTML: true, showPageLabel: true });
      return;
    }

    const isRawHTML = this.content && this.content.trimStart().startsWith('<');

    if (isRawHTML) {
      // Conteúdo HTML estruturado (gerado via htmlTemplate da IA)
      const templateCss = this._templateCss || 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;padding:18mm;}';
      renderA4Pages(outer, this.content, { css: templateCss, isRawHTML: true, showPageLabel: true });
      return;
    }

    // CORRIGIDO: se há templateCss activo, aplicá-lo mesmo para conteúdo markdown.
    // Bug original: o templateCss só era usado para HTML raw — para markdown usava sempre
    // _getFormatCSS() genérico, fazendo o editor mostrar um layout completamente diferente
    // do preview do resultado após o utilizador escolher um template (imagem 4 vs imagem 3).
    // CORRIGIDO: usar o MESMO CSS base do resultado/TemplatePicker (DEFAULT_PAGE_CSS)
    // em vez de _getFormatCSS() — esse CSS antigo foi desenhado para o sistema
    // anterior de "simulação de páginas" num único scroll e não tinha margem A4
    // horizontal própria (só padding vertical), fazendo o texto aparecer colado
    // à esquerda/topo da folha, sem a margem de 30mm/25mm esperada.
    const css = this._templateCss
      ? `*{box-sizing:border-box;}${this._templateCss}`
      : DEFAULT_PAGE_CSS;

    // Conteúdo markdown → renderA4Pages faz o split por ---PAGE_BREAK--- e a
    // conversão markdown→HTML internamente (com tabelas GFM reais incluídas,
    // corrigindo o bug do parser antigo _mdTableToHTML que perdia células vazias).
    // Usa o conteúdo já paginado (com quebras REAIS medidas no browser) quando
    // disponível para o conteúdo actual — ver _schedulePagination() acima.
    const contentForPreview = (this._paginationSource === this.content && this._paginatedContent)
      ? this._paginatedContent
      : this.content;
    renderA4Pages(outer, contentForPreview, { css, isRawHTML: false, showPageLabel: true });
  }

  _getFormatCSS(format) {
    return getFormatCSS(format);
  }


  _mdTableToHTML(tableStr) {
    // CORRIGIDO: bug que desalinhava tabelas no editor (imagem reportada:
    // colunas extra com "-" soltos, células deslocadas). Causa: .filter(Boolean)
    // ao dividir células por "|" descartava células vazias LEGÍTIMAS (ex: uma
    // célula em branco no meio da linha), fazendo cada linha da tabela ter um
    // número de colunas diferente do cabeçalho. Agora preserva todas as células,
    // mesmo vazias — igual ao parser GFM usado no resto da app (A4Renderer.js).
    //
    // CORRIGIDO (bug: "o editor está a criar tabelas automaticamente sem eu
    // acionar o mecanismo de criação de tabelas"): esta função era chamada
    // para QUALQUER linha do tipo "| texto |", mesmo sem nenhuma linha
    // separadora "|---|" a seguir — ou seja, mesmo sem ser realmente uma
    // tabela markdown (GFM exige header + linha separadora). Isso fazia com
    // que texto que a IA usa apenas para "destacar" um campo único (ex: o
    // e-mail ou o nome da instituição, escrito como "| julia@x.com |") virasse
    // uma <table> real de uma só célula dentro do editor — exactamente as
    // caixas cinzentas indevidas vistas no telemóvel (e-mail, escola, etc.).
    // O preview (A4Renderer.js) já tinha uma salvaguarda para tabela "só
    // cabeçalho, sem linhas de dados"; agora aplicamos a MESMA regra aqui e,
    // adicionalmente, exigimos uma linha separadora válida antes de sequer
    // considerar o bloco uma tabela — sem separador não há tabela, é só texto.
    const allLines = tableStr.trim().split('\n').filter(l => l.trim() !== '');
    if (!allLines.length) return tableStr;

    // A linha separadora é "|---|:---:|---:|" — só "-", ":", "|" e espaços.
    const isSepLine = (l) => /^[\s|:-]+$/.test(l) && l.includes('-');
    const sepLine = allLines.find(isSepLine);

    const splitCells = (l) => {
      let t = l.trim();
      if (t.startsWith('|')) t = t.slice(1);
      if (t.endsWith('|'))   t = t.slice(0, -1);
      return t.split('|').map(c => c.trim());
    };

    // Sem linha separadora = não é uma tabela GFM válida (é apenas a IA a usar
    // "|" para destacar texto). Devolver como texto simples, sem criar <table>.
    if (!sepLine) {
      return allLines.map(l => splitCells(l).join(' ')).join('<br>');
    }

    const rows = allLines.filter(l => !isSepLine(l));
    if (!rows.length) return tableStr;

    const aligns = splitCells(sepLine).map(c => {
      const left  = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });

    const headerCells = splitCells(rows[0]);
    const bodyRows     = rows.slice(1).map(splitCells);

    // Tabela "só cabeçalho" (com separador, mas sem nenhuma linha de dados) —
    // mesma regra do A4Renderer.js: é quase sempre a IA a destacar um único
    // campo, não uma tabela real. Devolver como texto simples.
    if (!bodyRows.length) {
      return headerCells.join(' &nbsp; ');
    }

    const cellsHtml = (cells, tag) => cells.map((c, i) => {
      const al = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
      return `<${tag}${al}>${c}</${tag}>`;
    }).join('');

    const thead = `<tr>${cellsHtml(headerCells, 'th')}</tr>`;
    const tbody = bodyRows.map(cells => `<tr>${cellsHtml(cells, 'td')}</tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse;margin:8pt 0;">${
      ''}<thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  // ── Downloads ─────────────────────────────────────────────────
  // CORRIGIDO: devolve o MESMO conteúdo (com as mesmas quebras ---PAGE_BREAK---
  // reais, já medidas para o preview) para ser usado no PDF e no Word — em vez
  // de cada exportador decidir a paginação sozinho com a sua própria métrica de
  // fonte, o que era a causa do "1 página na app, 3 no download". Ver
  // assets/js/utils/Paginator.js para o motor de medição partilhado.
  async _getExportContent() {
    if (this._templateHtml) return this.content; // templates HTML paginam-se a si próprios
    if (!this.content || this.content.trimStart().startsWith('<')) return this.content;

    // Reaproveita a paginação já calculada para o preview, se ainda válida
    if (this._paginationSource === this.content && this._paginatedContent) {
      return this._paginatedContent;
    }
    try {
      const { getPaginatedContent } = await import('../utils/Paginator.js');
      const paginated = await getPaginatedContent(this.content);
      this._paginatedContent = paginated;
      this._paginationSource = this.content;
      return paginated;
    } catch (err) {
      console.warn('[DocumentEditor] paginação real falhou no download, a usar conteúdo bruto:', err.message);
      return this.content;
    }
  }

  async _download() {
    const fmt = this._previewFmt;
    const btn = this.modal.querySelector('#edBtnDownload');
    const orig = btn.textContent;
    // Sync from rich-text editor before export ONLY when no template HTML is active
    // (syncContentFromEditor converts innerHTML back to markdown which would corrupt templateHtml)
    const hasEditedContent = this._getEditorPages().some(p => p.innerHTML && p.innerHTML.trim().length > 10);
    if (!this._templateHtml && hasEditedContent) {
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
        const exportContent = await this._getExportContent();
        new HTMLPDFExporter().export(exportContent, `mzdocs-${this.serviceType}-${Date.now()}`, {
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
      // CORRIGIDO: exportar o conteúdo já paginado (mesmas quebras reais do
      // preview) — não o markdown bruto — para o PDF sair com o MESMO número
      // de páginas que o utilizador viu no editor.
      const exportContent = await this._getExportContent();
      await new PDFExporter().export(
        exportContent,
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
      // CORRIGIDO: mesmas quebras reais do preview (ver _getExportContent),
      // para o Word sair com o mesmo nº de páginas mostrado no editor.
      const exportContent = await this._getExportContent();
      await new WordExporter().export(
        exportContent,
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
    // CORRIGIDO: usar o parser GFM do A4Renderer (a4MarkdownToHtml) em vez de
    // _mdToHTMLBasic/_mdTableToHTML — este último perdia células vazias nas
    // tabelas (.filter(Boolean) descartava "" legítimos), desalinhando colunas
    // no ficheiro .xls exportado.
    const html = `<html><head><meta charset="UTF-8"></head><body>${a4MarkdownToHtml(this.content)}</body></html>`;
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
    // CORRIGIDO (Junho/2026): número hard-coded, desligado de
    // whatsapp_support em system_settings — ver app.js/PaymentService.js
    // para o mesmo padrão de correcção nos outros 3 locais.
    const raw = window._mzConfig?.whatsappSupport;
    let waNumber = '258858695506';
    if (raw) {
      const digits = String(raw).replace(/\D/g, '');
      if (digits.length === 9) waNumber = `258${digits}`;
      else if (digits.length >= 11) waNumber = digits;
    }
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(`📄 *${this.serviceType||'Documento'} – MzDocs Pro*\n\n${preview}\n\n_Gerado por IA via MzDocs Pro_`)}`, '_blank');
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

      // Inserir no editor: se estiver em modo edição, insere no cursor da folha
      // activa; senão appenda à última página (local típico de uma assinatura).
      const activePage = this._getActiveEditorPage();
      if (activePage && document.activeElement === activePage) {
        document.execCommand('insertHTML', false, sigHTML);
        this._syncContentFromEditor();
      } else {
        // Modo preview — appenda representação markdown e passa para edição
        this.content += `\n\n---\n**Assinatura Digital** — ${new Date().toLocaleDateString('pt-MZ')}`;
        // Guardar dataUrl para reapor no HTML rico do editor
        this._pendingSignatureImg = dataUrl;
        this._switchMode('edit');
        setTimeout(() => {
          const pages = this._getEditorPages();
          const lastPage = pages[pages.length - 1];
          if (lastPage) {
            lastPage.innerHTML += sigHTML;
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
    // v40: snapshot do conteúdo/template tal como chegam, para ao fechar
    // sabermos se houve mesmo uma alteração real gravada (ver close()) —
    // o contador de edições do documento só deve ser gasto nesse caso,
    // nunca só por abrir e fechar o editor sem mexer em nada.
    this._originalContent      = content;
    this._originalTemplateHtml = templateHtml || null;
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
      const hasEditedContent = this._getEditorPages().some(p => p.innerHTML && p.innerHTML.trim().length > 10);
      if (hasEditedContent) {
        this._syncContentFromEditor();
        finalContent = this.content;
      }
    }

    // v40: só conta como "edição real" se o conteúdo final (ou o template
    // editado) for de facto diferente do que estava quando o editor abriu.
    // Isto é o que decide se o contador de edições do documento é gasto —
    // ver DocumentController.js → editor:closed.
    const contentChanged  = (finalContent || '').trim()  !== (this._originalContent || '').trim();
    const templateChanged = (finalTemplate || '') !== (this._originalTemplateHtml || '');
    const hasRealChange    = contentChanged || templateChanged;

    // Despachar evento para DocumentController guardar no histórico
    document.dispatchEvent(new CustomEvent('editor:closed', {
      detail: {
        content:      finalContent,
        templateHtml: finalTemplate,
        templateCss:  this._templateCss || null,
        serviceType:  this.serviceType,
        historyId:    this._historyId,
        hasRealChange,
      },
    }));

    this.modal.style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('ed-tpl-style')?.remove();
    this._templateEditFrame = null;
  }

  getContent() { return this.content; }
}
