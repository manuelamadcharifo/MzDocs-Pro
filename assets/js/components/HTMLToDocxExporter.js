// assets/js/components/HTMLToDocxExporter.js
// Gera um .docx REAL (OOXML verdadeiro) a partir do HTML/CSS do template,
// de forma 100% dinâmica: lê as cores, fontes e estilos directamente do CSS
// do template em vez de mapeamentos fixos — funciona com QUALQUER template
// gerado pelo MzDocs Pro (two-col sidebar, top-bar, custom extraído da IA).
//
// Estratégia:
//   1. Parsear o CSS do template → dicionário { seletor → { propriedade: valor } }
//   2. Detectar layout: two-col (sidebar+main) ou linear (top-bar / single-col)
//   3. Percorrer o DOM do HTML preenchido, resolver estilos por classe via CSS parseado
//   4. Converter cada elemento em Paragraph/TextRun docx-js com os valores reais
//   5. Gerar buffer .docx via Packer.toBuffer → download blob

// ── Carregador da biblioteca docx-js ────────────────────────────────────────

async function loadDocxLib() {
  if (window.docx) return;
  const URLS = [
    'https://unpkg.com/docx@9.0.2/build/index.umd.js',
    'https://cdn.jsdelivr.net/npm/docx@9.0.2/build/index.umd.js',
  ];
  await new Promise((resolve, reject) => {
    const tryNext = (idx) => {
      if (idx >= URLS.length) return reject(new Error('Falha ao carregar docx-js'));
      const s = document.createElement('script');
      s.src = URLS[idx];
      s.onload = () => window.docx ? resolve() : reject(new Error('docx não inicializado'));
      s.onerror = () => tryNext(idx + 1);
      document.head.appendChild(s);
    };
    tryNext(0);
  });
}

// ── Parser de CSS → dicionário de estilos ───────────────────────────────────
// Resultado: Map<selector_string, Map<prop, value>>
// Suporta: .classe, element.classe, element, #id, descendentes simples
// Ignora: @media, @keyframes, @font-face, comentários

function parseCss(cssText) {
  if (!cssText) return new Map();

  // Remover comentários
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  // Extrair blocos selector { regras }
  const result = new Map();
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(clean)) !== null) {
    const selectors = m[1].trim();
    const body      = m[2].trim();
    if (!selectors || selectors.startsWith('@')) continue;

    const props = new Map();
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 1) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const val  = decl.slice(colon + 1).trim();
      if (prop && val) props.set(prop, val);
    }
    if (props.size === 0) continue;

    // Cada seletor separado por vírgula é uma entrada independente
    for (const sel of selectors.split(',')) {
      const s = sel.trim();
      if (!s) continue;
      if (!result.has(s)) result.set(s, new Map());
      for (const [p, v] of props) result.get(s).set(p, v);
    }
  }
  return result;
}

// Resolve o valor de uma propriedade CSS para um elemento DOM,
// percorrendo do mais específico para o mais genérico.
function resolveStyle(cssMap, el, prop) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

  const tag     = el.tagName.toLowerCase();
  const classes = (el.className || '').split(/\s+/).filter(Boolean);
  const id      = el.id ? '#' + el.id : null;

  // Candidatos em ordem decrescente de especificidade
  const candidates = [];

  // id
  if (id) {
    candidates.push(id);
    classes.forEach(c => candidates.push(`${id}.${c}`));
  }

  // classe + tag combinados (mais específico primeiro)
  classes.forEach(c => {
    candidates.push(`${tag}.${c}`);
    candidates.push(`.${c}`);
  });

  // só tag
  candidates.push(tag);
  // wildcard
  candidates.push('*');

  for (const sel of candidates) {
    const props = cssMap.get(sel);
    if (props?.has(prop)) return props.get(prop);
  }

  // Tentar selectores descendentes simples (e.g. ".cv-sidebar .cv-section-title")
  // Verificar se o elemento é descendente de algum ancestor com a classe
  for (const [sel, props] of cssMap) {
    if (!props.has(prop)) continue;
    if (!sel.includes(' ')) continue; // só descendentes
    const parts = sel.trim().split(/\s+/);
    const leafSel = parts[parts.length - 1];

    // Verificar se o elemento coincide com a folha do selector
    if (!matchesSimple(el, leafSel)) continue;

    // Verificar se algum ancestor coincide com o resto
    const ancestorSel = parts.slice(0, -1).join(' ');
    if (hasAncestorMatching(el, ancestorSel)) return props.get(prop);
  }

  return null;
}

function matchesSimple(el, sel) {
  try { return el.matches(sel); } catch (_) { return false; }
}

function hasAncestorMatching(el, sel) {
  let node = el.parentElement;
  while (node) {
    try { if (node.matches(sel)) return true; } catch (_) {}
    node = node.parentElement;
  }
  return false;
}

// ── Conversores de valores CSS → docx ───────────────────────────────────────

function toHex(color) {
  if (!color) return null;
  color = color.trim().replace(/\s*!important\s*$/, '');
  if (color === 'transparent' || color === 'inherit') return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/);
    return (r + r + g + g + b + b).toUpperCase();
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  const named = {
    white: 'FFFFFF', black: '000000', red: 'FF0000', blue: '0000FF',
    green: '008000', navy: '000080', teal: '008080', gray: '808080',
    grey: '808080', silver: 'C0C0C0', transparent: null,
  };
  return named[color.toLowerCase()] || null;
}

// Converte valores de font-size CSS → half-points docx-js
function toHalfPt(val) {
  if (!val) return 20; // 10pt padrão
  val = val.trim().replace(/\s*!important\s*$/, '');
  const n = parseFloat(val);
  if (isNaN(n)) return 20;
  if (val.endsWith('pt'))  return Math.round(n * 2);
  if (val.endsWith('px'))  return Math.round((n * 0.75) * 2); // px → pt → half-pt
  if (val.endsWith('em'))  return Math.round(n * 10 * 2);     // 1em ≈ 10pt (heurística)
  if (val.endsWith('rem')) return Math.round(n * 10 * 2);
  return 20;
}

// DXA: 1 inch = 1440 DXA, A4 = 11906 DXA de largura
const A4_W   = 11906;
const A4_H   = 16838;

// ── Classe principal ─────────────────────────────────────────────────────────

export class HTMLToDocxExporter {

  async export(templateHtml, templateCss, filename) {
    await loadDocxLib();

    const {
      Document, Packer, Paragraph, TextRun,
      Table, TableRow, TableCell,
      AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
    } = window.docx;

    // 1. Parsear CSS do template
    this._cssMap = parseCss(templateCss);

    // 2. Parsear HTML preenchido
    const doc    = new DOMParser().parseFromString(templateHtml, 'text/html');
    const root   = doc.body.firstElementChild || doc.body;

    // 3. Detectar layout
    const sidebar = root.querySelector('.cv-sidebar, aside[class*="sidebar"]');
    const main    = root.querySelector('.cv-main, main, .cv-body, [class*="-main"]');
    const isTwoCol = !!(sidebar && main);

    // 4. Construir secções docx
    let children;
    if (isTwoCol) {
      children = [this._buildTwoColTable(sidebar, main, window.docx)];
    } else {
      children = this._domToDocx(root.childNodes, root, window.docx);
      if (!children.length) children = [new Paragraph({ children: [new TextRun('')] })];
    }

    // 5. Criar documento
    const wordDoc = new Document({
      sections: [{
        properties: {
          page: {
            size:   { width: A4_W, height: A4_H },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
        children,
      }],
    });

    // 6. Descarregar
    const buffer = await Packer.toBuffer(wordDoc);
    const blob   = new Blob(
      [buffer],
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    );
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href:     url,
      download: (filename || `mzdocs-${Date.now()}`).replace(/\.(doc|docx|pdf|md)$/, '') + '.docx',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  // ── Tabela de 2 colunas (sidebar + main) ─────────────────────────────────

  _buildTwoColTable(sidebarEl, mainEl, docxLib) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, BorderStyle, WidthType, ShadingType, VerticalAlign, AlignmentType } = docxLib;

    // Largura da sidebar: tentar ler do CSS, senão usar 27%
    const sbWidthRaw = resolveStyle(this._cssMap, sidebarEl, 'width')
                    || resolveStyle(this._cssMap, sidebarEl, 'min-width');
    let sbW = this._cssWidthToDxa(sbWidthRaw, A4_W) || Math.round(A4_W * 0.274);
    const mainW = A4_W - sbW;

    // Cores de fundo
    const sbBg   = toHex(resolveStyle(this._cssMap, sidebarEl, 'background-color')
                || resolveStyle(this._cssMap, sidebarEl, 'background')) || '1E3A5F';
    const mainBg = toHex(resolveStyle(this._cssMap, mainEl, 'background-color')
                || resolveStyle(this._cssMap, mainEl, 'background')) || 'FFFFFF';

    // Padding das colunas: tentar ler do CSS → converter para DXA
    const sbPad   = this._cssPaddingToDxa(resolveStyle(this._cssMap, sidebarEl, 'padding')) || { top: 397, bottom: 397, left: 227, right: 170 };
    const mainPad = this._cssPaddingToDxa(resolveStyle(this._cssMap, mainEl, 'padding'))   || { top: 397, bottom: 397, left: 397, right: 397 };

    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' };
    const borders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder };

    const sbItems   = this._domToDocx(sidebarEl.childNodes, sidebarEl, docxLib);
    const mainItems = this._domToDocx(mainEl.childNodes,    mainEl,    docxLib);

    const ensure = (arr) => arr.length ? arr : [new Paragraph({ children: [new TextRun('')] })];

    return new Table({
      width: { size: A4_W, type: WidthType.DXA },
      columnWidths: [sbW, mainW],
      borders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width:         { size: sbW,   type: WidthType.DXA },
              borders,
              shading:       { fill: sbBg,   type: ShadingType.CLEAR, color: 'auto' },
              margins:       sbPad,
              verticalAlign: VerticalAlign.TOP,
              children:      ensure(sbItems),
            }),
            new TableCell({
              width:         { size: mainW, type: WidthType.DXA },
              borders,
              shading:       { fill: mainBg, type: ShadingType.CLEAR, color: 'auto' },
              margins:       mainPad,
              verticalAlign: VerticalAlign.TOP,
              children:      ensure(mainItems),
            }),
          ],
        }),
      ],
    });
  }

  // ── Converter lista de nós DOM → array de elementos docx ─────────────────

  _domToDocx(nodes, contextEl, docxLib) {
    const result = [];
    for (const node of nodes) {
      const items = this._nodeToDocx(node, contextEl, docxLib);
      if (!items) continue;
      if (Array.isArray(items)) result.push(...items);
      else result.push(items);
    }
    return result;
  }

  _nodeToDocx(node, contextEl, docxLib) {
    const {
      Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
    } = docxLib;

    if (node.nodeType === Node.TEXT_NODE) return null; // tratado pelo pai
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'meta', 'link', 'noscript'].includes(tag)) return null;

    // Resolver estilos a partir do CSS do template para este elemento
    const st = (prop) => resolveStyle(this._cssMap, node, prop);

    const bgHex   = toHex(st('background-color') || st('background'));
    const color   = toHex(st('color')) || this._inheritColor(node);
    const fontSize = toHalfPt(st('font-size')) || this._inheritFontSize(node);
    const bold    = this._isBold(tag, st('font-weight'));
    const upper   = (st('text-transform') || '').includes('uppercase');
    const alignRaw = st('text-align') || '';
    const align   = alignRaw === 'center' ? AlignmentType.CENTER
                  : alignRaw === 'right'  ? AlignmentType.RIGHT
                  : AlignmentType.LEFT;

    // Helper: construir Paragraph com TextRuns inline do elemento
    const makePara = (opts = {}) => {
      const runs = this._inlineRuns(node, contextEl, docxLib, {
        color:    opts.color    || color,
        size:     opts.size     || fontSize,
        bold:     opts.bold     !== undefined ? opts.bold : bold,
        italic:   opts.italic   || false,
        upper:    opts.upper    !== undefined ? opts.upper : upper,
      });
      if (!runs.length) return null;

      const paraOpts = {
        children:  runs,
        alignment: opts.align !== undefined ? opts.align : align,
        spacing: {
          before: opts.spaceBefore || 0,
          after:  opts.spaceAfter  || 57,
        },
      };
      if (bgHex) {
        paraOpts.shading = { fill: bgHex, type: ShadingType.CLEAR, color: 'auto' };
      }
      if (opts.borderBottom) {
        const borderColor = toHex(st('border-bottom-color') || st('border-color')) || 'C7D2DC';
        paraOpts.border = {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: borderColor, space: 2 },
        };
        paraOpts.spacing.after = 85;
      }
      return new Paragraph(paraOpts);
    };

    // Detectar se elemento tem borda inferior (separador de secção)
    const hasBorderBottom = !!(st('border-bottom') || st('border-bottom-style'));
    const hasBoxShadow = !!(st('box-shadow'));

    // Processar filhos recursivamente
    const childItems = () => this._domToDocx(node.childNodes, node, docxLib);

    switch (tag) {

      // ── Avatar / iniciais ──────────────────────────────────────────────
      case 'div': {
        const cls = node.className || '';
        if (cls.includes('avatar') || cls.includes('photo') || cls.includes('iniciais')) {
          const text = node.textContent.trim().slice(0, 2).toUpperCase() || 'CE';
          const avatarBg = toHex(st('background-color') || st('background')) || '2D4D78';
          const avatarColor = toHex(st('color')) || 'FFFFFF';
          const avatarSize  = toHalfPt(st('font-size')) || 38;
          const noBd = { style: BorderStyle.SINGLE, size: 4, color: '4A6FA8' };
          const borders = { top: noBd, bottom: noBd, left: noBd, right: noBd };
          const cellW = 851; // ~60pt
          return new Table({
            width:        { size: cellW, type: WidthType.DXA },
            columnWidths: [cellW],
            alignment:    AlignmentType.CENTER,
            borders,
            rows: [new TableRow({
              children: [new TableCell({
                width:         { size: cellW, type: WidthType.DXA },
                borders,
                shading:       { fill: avatarBg, type: ShadingType.CLEAR, color: 'auto' },
                margins:       { top: 142, bottom: 142, left: 142, right: 142 },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children:  [new TextRun({ text, font: 'Calibri', size: avatarSize, bold: true, color: avatarColor })],
                })],
              })],
            })],
          });
        }
        return childItems();
      }

      // ── Elementos semânticos → recursivo ──────────────────────────────
      case 'aside': case 'main': case 'section': case 'article':
      case 'nav':   case 'footer': case 'header':
        return childItems();

      // ── Cabeçalho colorido (top-bar layout) ───────────────────────────
      // header com background → bloco colorido como parágrafo sombreado
      // Os filhos são processados individualmente (recursão normal)
      // mas envolvemos numa célula de tabela de largura total para o fundo
      case 'header': {
        if (bgHex) {
          // Criar célula de tabela de largura total com o fundo do header
          const noBd = { style: BorderStyle.NONE, size: 0, color: 'auto' };
          const borders = { top: noBd, bottom: noBd, left: noBd, right: noBd };
          const innerItems = this._domToDocx(node.childNodes, node, docxLib);
          const ensure = (arr) => arr.length ? arr : [new Paragraph({ children: [new TextRun('')] })];
          return new Table({
            width:        { size: A4_W, type: WidthType.DXA },
            columnWidths: [A4_W],
            borders,
            rows: [new TableRow({
              children: [new TableCell({
                width:    { size: A4_W, type: WidthType.DXA },
                borders,
                shading:  { fill: bgHex, type: ShadingType.CLEAR, color: 'auto' },
                margins:  this._cssPaddingToDxa(st('padding')) || { top: 397, bottom: 397, left: 454, right: 454 },
                children: ensure(innerItems),
              })],
            })],
          });
        }
        return childItems();
      }

      // ── Headings ──────────────────────────────────────────────────────
      case 'h1': {
        const defSize = toHalfPt(st('font-size')) || 44;
        const c = toHex(st('color')) || this._inheritColor(node) || '1E3A5F';
        return makePara({ size: defSize, color: c, bold: true, spaceBefore: 0, spaceAfter: 85 });
      }
      case 'h2': {
        const defSize = toHalfPt(st('font-size')) || 22;
        const c = toHex(st('color')) || this._inheritColor(node) || '1E3A5F';
        return makePara({ size: defSize, color: c, bold: true, spaceBefore: 142, spaceAfter: 71, borderBottom: hasBorderBottom, upper });
      }
      case 'h3': {
        const defSize = toHalfPt(st('font-size')) || 19;
        const c = toHex(st('color')) || this._inheritColor(node);
        return makePara({ size: defSize, color: c || '1E3A5F', bold: true, spaceBefore: 99, spaceAfter: 57, borderBottom: hasBorderBottom, upper });
      }
      case 'h4': case 'h5': case 'h6':
        return makePara({ bold: true, spaceBefore: 71, spaceAfter: 43 });

      // ── Parágrafo ─────────────────────────────────────────────────────
      case 'p': {
        const t = node.textContent.trim();
        if (!t || /^-{2,}$/.test(t)) return null;
        return makePara({});
      }

      // ── Listas ────────────────────────────────────────────────────────
      case 'ul': case 'ol': {
        const items = [];
        for (const child of node.childNodes) {
          if (child.nodeType !== Node.ELEMENT_NODE) continue;
          const liTag = child.tagName.toLowerCase();
          if (liTag !== 'li') continue;
          const liColor = toHex(resolveStyle(this._cssMap, child, 'color')) || color;
          const liSize  = toHalfPt(resolveStyle(this._cssMap, child, 'font-size')) || fontSize;
          const liRuns = this._inlineRuns(child, child, docxLib, { color: liColor, size: liSize, bold: false });
          if (!liRuns.length) continue;
          items.push(new Paragraph({
            children: [new TextRun({ text: '•  ', font: 'Calibri', size: liSize, color: liColor }), ...liRuns],
            indent:   { left: 227, hanging: 227 },
            spacing:  { before: 0, after: 28 },
          }));
        }
        return items.length ? items : null;
      }

      // ── Separador HR ──────────────────────────────────────────────────
      case 'hr': {
        const hrColor = toHex(st('border-color') || st('border-top-color')) || 'D1D5DB';
        return new Paragraph({
          children: [],
          border:  { bottom: { style: BorderStyle.SINGLE, size: 4, color: hrColor, space: 1 } },
          spacing: { before: 71, after: 71 },
        });
      }

      // ── Span ──────────────────────────────────────────────────────────
      case 'span': {
        const t = node.textContent.trim();
        if (!t) return null;
        return makePara({ spaceAfter: 28 });
      }

      // ── Tabela ────────────────────────────────────────────────────────
      case 'table': {
        const rows = [];
        for (const tr of node.querySelectorAll(':scope > * > tr, :scope > tr')) {
          const cells = [];
          for (const td of tr.querySelectorAll(':scope > td, :scope > th')) {
            const isHdr = td.tagName.toLowerCase() === 'th';
            const cellBg = toHex(resolveStyle(this._cssMap, td, 'background-color')) || (isHdr ? '1E3A5F' : null);
            const bdColor = toHex(resolveStyle(this._cssMap, td, 'border-color')) || 'D1D5DB';
            const bd = { style: BorderStyle.SINGLE, size: 4, color: bdColor };
            const cellItems = this._domToDocx(td.childNodes, td, docxLib);
            cells.push(new TableCell({
              width:    { size: 0, type: WidthType.AUTO },
              borders:  { top: bd, bottom: bd, left: bd, right: bd },
              shading:  cellBg ? { fill: cellBg, type: ShadingType.CLEAR, color: 'auto' } : undefined,
              margins:  { top: 57, bottom: 57, left: 85, right: 85 },
              children: cellItems.length ? cellItems : [new Paragraph({ children: [new TextRun('')] })],
            }));
          }
          if (cells.length) rows.push(new TableRow({ children: cells }));
        }
        return rows.length ? new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }) : null;
      }

      default:
        return childItems();
    }
  }

  // ── Converter conteúdo inline de um elemento em TextRun[] ────────────────
  // Percorre todos os nós filhos preservando bold/italic/cor inline

  _inlineRuns(el, contextEl, docxLib, defaults = {}) {
    const { TextRun } = docxLib;
    const runs = [];

    const defColor  = defaults.color  || '1A1A1A';
    const defSize   = defaults.size   || 20;
    const defBold   = defaults.bold   || false;
    const defItalic = defaults.italic || false;
    const defUpper  = defaults.upper  || false;

    const walk = (node, inh) => {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent
          .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/^---+$/gm, '')
          .replace(/---$/, '');

        // Limpar artefactos de placeholder
        text = text.replace(/\s*---\s*$/g, '').trim();
        if (!text) return;

        if (inh.upper) text = text.toUpperCase();
        runs.push(new TextRun({
          text,
          font:   'Calibri',
          size:   inh.size,
          color:  inh.color,
          bold:   inh.bold,
          italic: inh.italic,
        }));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();
      if (['script', 'style'].includes(tag)) return;

      if (tag === 'br') {
        runs.push(new TextRun({ text: '', break: 1 }));
        return;
      }

      // Resolver estilos do filho
      const childColor  = toHex(resolveStyle(this._cssMap, node, 'color'))     || inh.color;
      const childSize   = toHalfPt(resolveStyle(this._cssMap, node, 'font-size')) || inh.size;
      const childFwRaw  = resolveStyle(this._cssMap, node, 'font-weight') || '';
      const childBold   = this._isBold(tag, childFwRaw) || inh.bold;
      const childItalic = ['em', 'i'].includes(tag) || inh.italic;
      const childUpper  = (resolveStyle(this._cssMap, node, 'text-transform') || '').includes('uppercase') || inh.upper;

      for (const child of node.childNodes) {
        walk(child, {
          color:  childColor,
          size:   childSize,
          bold:   childBold,
          italic: childItalic,
          upper:  childUpper,
        });
      }
    };

    for (const child of el.childNodes) {
      walk(child, { color: defColor, size: defSize, bold: defBold, italic: defItalic, upper: defUpper });
    }
    return runs;
  }

  // ── Helpers de herança de estilo ─────────────────────────────────────────

  _inheritColor(el) {
    let node = el.parentElement;
    while (node) {
      const c = toHex(resolveStyle(this._cssMap, node, 'color'));
      if (c) return c;
      node = node.parentElement;
    }
    return '1A1A1A';
  }

  _inheritFontSize(el) {
    let node = el.parentElement;
    while (node) {
      const s = toHalfPt(resolveStyle(this._cssMap, node, 'font-size'));
      if (s) return s;
      node = node.parentElement;
    }
    return 20; // 10pt
  }

  _isBold(tag, fontWeight) {
    if (['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return true;
    if (!fontWeight) return false;
    const fw = fontWeight.trim().toLowerCase().replace(/\s*!important\s*$/, '');
    if (fw === 'bold' || fw === 'bolder') return true;
    const n = parseInt(fw);
    return !isNaN(n) && n >= 600;
  }

  // ── Converter largura CSS → DXA ──────────────────────────────────────────

  _cssWidthToDxa(val, containerDxa) {
    if (!val) return null;
    val = val.trim().replace(/\s*!important\s*$/, '');
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    if (val.endsWith('mm'))  return Math.round(n * 56.69); // 1mm ≈ 56.69 DXA
    if (val.endsWith('cm'))  return Math.round(n * 566.93);
    if (val.endsWith('px'))  return Math.round(n * 14.4);  // 1px ≈ 14.4 DXA @96dpi
    if (val.endsWith('pt'))  return Math.round(n * 20);
    if (val.endsWith('%'))   return Math.round(containerDxa * n / 100);
    if (val.endsWith('in'))  return Math.round(n * 1440);
    return null;
  }

  // ── Converter padding CSS → margens DXA para TableCell ───────────────────
  // Suporta: "14mm 8mm", "10px", "14mm 8mm 14mm 8mm", etc.

  _cssPaddingToDxa(val) {
    if (!val) return null;
    val = val.trim().replace(/\s*!important\s*$/, '');
    const parts = val.split(/\s+/);
    const toDxa = (v) => {
      const n = parseFloat(v);
      if (isNaN(n)) return 0;
      if (v.endsWith('mm'))  return Math.round(n * 56.69);
      if (v.endsWith('cm'))  return Math.round(n * 566.93);
      if (v.endsWith('px'))  return Math.round(n * 14.4);
      if (v.endsWith('pt'))  return Math.round(n * 20);
      if (v.endsWith('in'))  return Math.round(n * 1440);
      return Math.round(n * 14.4); // assumir px
    };
    if (parts.length === 1) {
      const v = toDxa(parts[0]);
      return { top: v, bottom: v, left: v, right: v };
    }
    if (parts.length === 2) {
      const tb = toDxa(parts[0]), lr = toDxa(parts[1]);
      return { top: tb, bottom: tb, left: lr, right: lr };
    }
    if (parts.length === 3) {
      const t = toDxa(parts[0]), lr = toDxa(parts[1]), b = toDxa(parts[2]);
      return { top: t, bottom: b, left: lr, right: lr };
    }
    if (parts.length >= 4) {
      return {
        top:    toDxa(parts[0]),
        right:  toDxa(parts[1]),
        bottom: toDxa(parts[2]),
        left:   toDxa(parts[3]),
      };
    }
    return null;
  }
}

export const htmlToDocxExporter = new HTMLToDocxExporter();
