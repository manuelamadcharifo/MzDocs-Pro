// assets/js/utils/A4Renderer.js
// ──────────────────────────────────────────────────────────────────────────
// MOTOR ÚNICO de renderização A4 — partilhado pelo TemplatePicker e pelo
// preview do resultado (Views.js). Garante que "o que o utilizador vê no
// preview é exactamente o que sai no PDF/Word".
//
// Resolve 3 problemas:
//  1. Tabelas markdown "| col | col |" não eram convertidas em <table> real
//     — agora há um parser GFM completo (cabeçalho + separador + linhas).
//  2. O preview do TemplatePicker cortava o documento numa única folha
//     (aspect-ratio:210/297 + overflow:hidden) — agora cada ---PAGE_BREAK---
//     gera uma folha A4 separada e visível, com sombra, como páginas de PDF.
//  3. O preview do resultado (#resPreview) usava um único iframe de altura
//     fixa (1123px) — agora usa o mesmo sistema de páginas A4 separadas.
//
// Dimensões A4 reais usadas em toda a app: 210mm × 297mm a 96dpi
//   210mm × 3.7795275591 px/mm ≈ 793.7 px  → 794px
//   297mm × 3.7795275591 px/mm ≈ 1122.5px  → 1123px
// Margens alinhadas com o PDFExporter.js real (ML30/MR25/MT30/MB25 mm) e
// com o WordExporter.js (Times New Roman, espaçamento 1.5).
// ──────────────────────────────────────────────────────────────────────────

export const A4_WIDTH_MM  = 210;
export const A4_HEIGHT_MM = 297;
export const A4_WIDTH_PX  = 794;   // 210mm @ 96dpi
export const A4_HEIGHT_PX = 1123;  // 297mm @ 96dpi

// ── CSS base de página — usado quando o template/documento não traz o seu ──
// Espelha as margens reais do PDFExporter.js (30/25/30/25mm) e a tipografia
// do WordExporter.js (Times New Roman 12pt, 1.5 de entrelinha) para que o
// preview seja fiel ao ficheiro final exportado.
export const DEFAULT_PAGE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:'Times New Roman',Times,serif;
  font-size:12pt;
  line-height:1.5;
  color:#111827;
  padding:30mm 25mm 25mm 30mm;
}
h1{font-size:18pt;font-weight:700;text-align:center;margin:0 0 8pt;}
h2{font-size:14pt;font-weight:700;margin:14pt 0 7pt;border-bottom:1px solid #888;padding-bottom:3pt;}
h3{font-size:12pt;font-weight:700;font-style:italic;margin:10pt 0 5pt;}
h4{font-size:12pt;font-weight:700;margin:8pt 0 4pt;color:#333;}
p{margin:0 0 8pt;text-align:justify;}
ul,ol{margin:6pt 0 6pt 20pt;padding:0;}
li{margin-bottom:3pt;}
hr{border:none;border-top:1px solid #aaa;margin:10pt 0;}
strong{font-weight:700;}
em{font-style:italic;}
blockquote{margin:8pt 0;padding:4pt 12pt;border-left:3px solid #ccc;color:#444;}
code{font-family:'Courier New',monospace;background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:10.5pt;}
/* ── Tabela real (GFM) — espelha o _drawTable do PDFExporter.js ── */
table{
  width:100%;border-collapse:collapse;margin:8pt 0 10pt;
  font-size:10.5pt;
}
table thead tr,table tr.a4-thead-row{background:#28508c;}
table th{
  background:#28508c;color:#fff;font-weight:700;
  border:1px solid #c8d2e1;padding:5pt 7pt;text-align:left;
}
table td{
  border:1px solid #c8d2e1;padding:5pt 7pt;
  background:#f8fafc;color:#141414;
}
table tr:nth-child(even) td{background:#f1f5f9;}
.a4-page-sep-mark{
  display:flex;align-items:center;justify-content:center;gap:8px;
  margin:18pt 0 14pt;
}
.a4-page-sep-mark span{font-size:9pt;color:#9ca3af;letter-spacing:.5px;white-space:nowrap}
.a4-page-sep-mark .a4-line{height:1px;flex:1;background:#d1d5db}
`;

// ── Parser GFM de tabelas markdown ("| a | b |\n|---|---|\n| 1 | 2 |") ─────
// Devolve { html, consumed } — html da <table>, consumed = nº de linhas usadas.
function _parseMarkdownTable(lines, startIdx) {
  const isRow = (l) => /^\s*\|.*\|\s*$|^\s*\|.+/.test(l) && l.trim().includes('|');
  const headerLine = lines[startIdx];
  const sepLine     = lines[startIdx + 1];

  if (!headerLine || !sepLine) return null;
  if (!isRow(headerLine)) return null;
  // Linha separadora válida: |---|:---:|---:|  (apenas -, :, |, espaços)
  if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(sepLine) || !sepLine.includes('-')) return null;

  const splitCells = (l) => {
    let t = l.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    return t.split('|').map(c => c.trim());
  };

  const aligns = splitCells(sepLine).map(c => {
    const left  = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });

  const headerCells = splitCells(headerLine);
  let i = startIdx + 2;
  const bodyRows = [];
  while (i < lines.length && isRow(lines[i]) && lines[i].trim() !== '') {
    bodyRows.push(splitCells(lines[i]));
    i++;
  }

  const td = (cells, tag) => cells.map((c, ci) => {
    const al = aligns[ci] ? ` style="text-align:${aligns[ci]}"` : '';
    return `<${tag}${al}>${_inlineMd(c)}</${tag}>`;
  }).join('');

  const headHtml = `<thead><tr>${td(headerCells, 'th')}</tr></thead>`;
  const bodyHtml = `<tbody>${bodyRows.map(r => `<tr>${td(r, 'td')}</tr>`).join('')}</tbody>`;

  return { html: `<table>${headHtml}${bodyHtml}</table>`, consumed: i - startIdx };
}

// ── Formatação inline: bold, italic, code (reutilizado em células de tabela) ──
function _inlineMd(text) {
  return (text || '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ── Conversor Markdown → HTML completo (GFM: tabelas reais incluídas) ──────
// Único parser partilhado — substitui o _mdToHtml (TemplatePicker.js) e o
// _markdownToHTML (Views.js), que não tratavam tabelas "|".
export function markdownToHtml(md) {
  if (!md) return '<p style="color:#94a3b8;text-align:center;padding:40px 20px">Página vazia.</p>';

  // Escapar HTML primeiro, preservando a estrutura de linhas
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const out = [];
  let i = 0;
  let listBuffer = null; // 'ul' | 'ol' | null

  const flushList = () => {
    if (listBuffer) { out.push(`</${listBuffer}>`); listBuffer = null; }
  };

  while (i < lines.length) {
    const raw  = lines[i];
    const line = raw.trim();

    // ── Linha vazia ──────────────────────────────────────────────────────
    if (!line) { flushList(); i++; continue; }

    // ── Tabela GFM real ──────────────────────────────────────────────────
    if (line.includes('|')) {
      const table = _parseMarkdownTable(lines, i);
      if (table) {
        flushList();
        out.push(table.html);
        i += table.consumed;
        continue;
      }
    }

    // ── Headings ─────────────────────────────────────────────────────────
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushList();
      const level = Math.min(h[1].length, 6);
      out.push(`<h${level}>${_inlineMd(h[2].trim())}</h${level}>`);
      i++; continue;
    }

    // ── HR ───────────────────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList();
      out.push('<hr>');
      i++; continue;
    }

    // ── Blockquote ───────────────────────────────────────────────────────
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushList();
      out.push(`<blockquote>${_inlineMd(bq[1])}</blockquote>`);
      i++; continue;
    }

    // ── Lista não ordenada ───────────────────────────────────────────────
    const ulItem = line.match(/^[-*+]\s+(.+)$/);
    if (ulItem) {
      if (listBuffer !== 'ul') { flushList(); out.push('<ul>'); listBuffer = 'ul'; }
      out.push(`<li>${_inlineMd(ulItem[1])}</li>`);
      i++; continue;
    }

    // ── Lista ordenada ───────────────────────────────────────────────────
    const olItem = line.match(/^\d+[.)]\s+(.+)$/);
    if (olItem) {
      if (listBuffer !== 'ol') { flushList(); out.push('<ol>'); listBuffer = 'ol'; }
      out.push(`<li>${_inlineMd(olItem[1])}</li>`);
      i++; continue;
    }

    // ── Parágrafo normal — agrupa linhas seguidas sem heading/lista/tabela ──
    flushList();
    const paraLines = [line];
    let j = i + 1;
    while (j < lines.length) {
      const nl = lines[j].trim();
      if (!nl) break;
      if (/^#{1,6}\s+/.test(nl)) break;
      if (/^[-*+]\s+/.test(nl)) break;
      if (/^\d+[.)]\s+/.test(nl)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(nl)) break;
      if (nl.includes('|') && _parseMarkdownTable(lines, j)) break;
      if (/^>\s?/.test(nl)) break;
      paraLines.push(nl);
      j++;
    }
    out.push(`<p>${paraLines.map(_inlineMd).join('<br>')}</p>`);
    i = j;
  }
  flushList();

  return out.join('\n');
}

// ── Divide o conteúdo bruto em páginas pelo marcador ---PAGE_BREAK--- ──────
// Normaliza também variantes textuais ("— Nova Página —", "**Nova Página**")
// que o LLM por vezes gera em vez do marcador canónico, alinhado com a
// normalização já feita no PDFExporter.js.
export function splitIntoPages(rawContent) {
  const content = (rawContent || '')
    .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
    .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---')
    .replace(/(---PAGE_BREAK---\s*){2,}/g, '---PAGE_BREAK---\n');

  const pages = content
    .split(/---PAGE_BREAK---/g)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return pages.length > 0 ? pages : [content.trim() || ' '];
}

// ── Monta o documento HTML completo de uma página (head + css + body) ──────
function _buildPageDoc(bodyHtml, extraCss) {
  return `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8">
<style>
${DEFAULT_PAGE_CSS}
${extraCss || ''}
</style>
</head><body>${bodyHtml}</body></html>`;
}

// ── Escala um iframe A4 para caber na largura do contentor ──────────────────
// containerEl: elemento cuja largura disponível define a escala.
// pageEl: a folha (.a4-page) que recebe altura/largura finais em px.
// iframe: o iframe com o conteúdo real a escalar via transform.
export function scalePage(containerEl, pageEl, iframe) {
  let containerW = containerEl?.clientWidth || pageEl.clientWidth || 0;

  // CORRIGIDO: clientWidth do contentor já INCLUI o seu próprio padding
  // horizontal (ex: .a4-pages-outer tem padding:16px 12px). Sem subtrair
  // esse padding, a folha era calculada para ocupar a largura total —
  // "comendo" visualmente o respiro lateral e ficando colada nas bordas
  // da tela (sem o fundo escuro visível dos lados, como reportado).
  if (containerEl) {
    try {
      const cs = (containerEl.ownerDocument?.defaultView || window).getComputedStyle(containerEl);
      const padLeft  = parseFloat(cs.paddingLeft)  || 0;
      const padRight = parseFloat(cs.paddingRight) || 0;
      containerW = Math.max(0, containerW - padLeft - padRight);
    } catch (_) { /* getComputedStyle indisponível — usar containerW tal qual */ }
  }

  // CRÍTICO: se o contentor ainda está oculto (display:none — ex: modal/overlay
  // que abre DEPOIS de renderResult() ter corrido), clientWidth é 0. Escalar
  // para 0 deixaria a folha invisível para sempre. Em vez disso, não escalamos
  // agora — o ResizeObserver em renderA4Pages() vai chamar isto de novo assim
  // que o contentor ganhar largura real (overlay a abrir).
  if (containerW <= 0) return false;

  const scale = Math.min(1, containerW / A4_WIDTH_PX);

  iframe.style.transform       = `scale(${scale})`;
  iframe.style.transformOrigin = 'top left';

  const applyHeight = () => {
    let contentH = 0;
    try {
      contentH = iframe.contentDocument?.documentElement?.scrollHeight
              || iframe.contentDocument?.body?.scrollHeight || 0;
    } catch (_) { /* cross-origin: ignora, usa fallback A4 */ }
    const realH = contentH > 0 ? Math.max(contentH, A4_HEIGHT_PX) : A4_HEIGHT_PX;
    pageEl.style.height = Math.ceil(realH * scale) + 'px';
    pageEl.style.width  = Math.ceil(A4_WIDTH_PX * scale) + 'px';
    iframe.style.width  = A4_WIDTH_PX + 'px';
    iframe.style.height = realH + 'px';
  };

  applyHeight();
  // Segunda passagem após fontes/imagens carregarem por completo
  setTimeout(applyHeight, 350);
  return true;
}

/**
 * Renderiza um array de páginas A4 separadas dentro de um contentor — o
 * MESMO sistema visual usado tanto no TemplatePicker como no preview do
 * resultado, garantindo paridade total preview ↔ ficheiro exportado.
 *
 * @param {HTMLElement} container        - elemento onde as folhas serão inseridas (será limpo)
 * @param {string[]|string} content      - markdown bruto (com ---PAGE_BREAK---) OU array de páginas já divididas
 * @param {object} opts
 *   opts.css            {string}  CSS extra (do template) a aplicar em cada folha
 *   opts.isRawHTML      {boolean} se true, o conteúdo já é HTML — não passa pelo conversor markdown
 *   opts.rawHtmlPages   {string[]} quando isRawHTML, array de blocos HTML já prontos (1 por página)
 *   opts.showPageLabel  {boolean} mostra "— Página N —" entre folhas (default true)
 *   opts.onPageRendered {function(pageIndex, pageEl, iframe)} callback opcional por página
 * @returns {{ pages: HTMLElement[], rescale: function }}
 */
export function renderA4Pages(container, content, opts = {}) {
  if (!container) return { pages: [], rescale: () => {} };

  const {
    css            = '',
    isRawHTML      = false,
    rawHtmlPages   = null,
    showPageLabel  = true,
    onPageRendered = null,
  } = opts;

  container.innerHTML = '';

  let pageMarkdowns;
  if (isRawHTML) {
    pageMarkdowns = rawHtmlPages && rawHtmlPages.length ? rawHtmlPages : [String(content || '')];
  } else if (Array.isArray(content)) {
    pageMarkdowns = content.length ? content : [' '];
  } else {
    pageMarkdowns = splitIntoPages(content);
  }

  const pageEls = [];
  const iframeEls = [];

  pageMarkdowns.forEach((pageContent, idx) => {
    if (idx > 0 && showPageLabel) {
      const sep = document.createElement('div');
      sep.className = 'a4-page-sep-label';
      sep.textContent = `— Página ${idx + 1} —`;
      container.appendChild(sep);
    }

    const pageEl = document.createElement('div');
    pageEl.className = 'a4-page';

    const iframe = document.createElement('iframe');
    iframe.title = `Página ${idx + 1}`;
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.className = 'a4-page-iframe';
    pageEl.appendChild(iframe);
    container.appendChild(pageEl);
    pageEls.push(pageEl);
    iframeEls.push(iframe);

    const bodyHtml = isRawHTML ? String(pageContent || '') : markdownToHtml(pageContent);
    const doc = _buildPageDoc(bodyHtml, css);

    iframe.srcdoc = doc;

    let scaled = false;
    const doScale = () => {
      // Não marcar como "scaled" se o contentor ainda estava oculto — o
      // ResizeObserver abaixo vai tentar de novo quando ganhar largura.
      const ok = scalePage(container, pageEl, iframe);
      if (ok) scaled = true;
      if (ok) onPageRendered?.(idx, pageEl, iframe);
    };
    iframe.addEventListener('load', doScale, { once: true });
    // Fallback: Android/Chrome por vezes não dispara 'load' em srcdoc
    // enquanto o contentor pai ainda está a animar (overlay a abrir).
    setTimeout(doScale, 400);
  });

  const rescale = () => {
    container.querySelectorAll('.a4-page').forEach(pageEl => {
      const iframe = pageEl.querySelector('iframe');
      if (iframe) scalePage(container, pageEl, iframe);
    });
  };

  // Primeira escala assim que possível (antes do load, para evitar "salto" visual)
  requestAnimationFrame(rescale);

  // ── CRÍTICO: ResizeObserver no contentor ──────────────────────────────────
  // Resolve o caso em que renderA4Pages() corre ANTES do modal/overlay abrir
  // (display:none → clientWidth 0 → folhas ficavam congeladas com escala 0
  // para sempre). Sempre que o contentor ganhar largura real (overlay a
  // abrir, rotação de ecrã, resize), reaplica a escala em todas as folhas.
  // Desliga-se a si próprio depois de confirmar uma largura válida estável,
  // para não gastar recursos desnecessariamente depois do render inicial.
  if (typeof ResizeObserver !== 'undefined') {
    let stableCount = 0;
    const ro = new ResizeObserver(() => {
      if (container.clientWidth > 0) {
        rescale();
        stableCount++;
        // Após 2 medições consecutivas com largura válida, já não precisamos
        // de continuar a observar — evita overhead em scrolls/animações longas.
        if (stableCount >= 2) ro.disconnect();
      }
    });
    ro.observe(container);
  }

  return { pages: pageEls, rescale };
}

// ── CSS partilhado das folhas A4 (sombra, espaçamento, separador) ──────────
// Deve ser injectado uma vez em cada ecrã que use renderA4Pages (TemplatePicker
// já tem o seu próprio bloco de CSS — Views.js precisa deste).
export const A4_PAGES_CONTAINER_CSS = `
.a4-pages-outer{
  display:flex;flex-direction:column;align-items:center;
  gap:14px;padding:16px 12px;background:#475569;
}
.a4-page{
  background:#fff;width:100%;max-width:560px;min-height:200px;
  border-radius:3px;overflow:hidden;flex-shrink:0;position:relative;
  box-shadow:0 4px 24px rgba(0,0,0,.35),0 1px 4px rgba(0,0,0,.15);
}
.a4-page-iframe{border:none;display:block;transform-origin:top left;}
.a4-page-sep-label{
  font-size:10px;font-weight:700;color:rgba(255,255,255,.6);
  letter-spacing:.5px;text-align:center;flex-shrink:0;
}
`;
