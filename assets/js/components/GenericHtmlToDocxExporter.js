// assets/js/components/GenericHtmlToDocxExporter.js
// ──────────────────────────────────────────────────────────────────────────
// Gera um .docx REAL (OOXML verdadeiro, via docx-js) a partir de HTML rico
// arbitrário — em particular o HTML produzido pelo editor WYSIWYG
// (DocumentEditor.js → this._richHTMLPages), que pode conter:
//   cor de texto, tamanho de letra, alinhamento, negrito/itálico/sublinhado,
//   links (<a href>), imagens (<img>, ex: assinatura digital), tabelas,
//   listas e headings.
//
// PORQUÊ ESTE FICHEIRO EXISTE (P0 da auditoria de exportação):
// Antes desta correcção, ao fechar o editor, DocumentEditor._syncContentFromEditor()
// reconvertia sempre o HTML rico em Markdown (via _richHTMLToMd), um conversor
// regex simples que NÃO trata <img> nem <a href> — ou seja, imagens (incluindo
// a assinatura digital) e hiperligações eram apagadas silenciosamente sempre
// que o utilizador exportava Word a partir de um documento editado sem
// template. Cor, tamanho de letra e alinhamento definidos na toolbar também
// se perdiam, e <u> (sublinhado) era convertido para "_texto_", que nem é
// interpretado como sublinhado pelo parser Markdown da app.
//
// Este exportador faz HTML → OOXML directamente (sem passar por Markdown),
// preservando essas formatações. É usado apenas quando NÃO há template
// visual estruturado activo (nesse caso HTMLToDocxExporter.js, específico
// para templates de CV, continua a ser o caminho certo).
//
// Em caso de falha (ex: docx-js não carrega, HTML malformado), o chamador
// (DocumentEditor._downloadWord) deve capturar o erro e recorrer ao
// WordExporter.js (Markdown → OOXML) como rede de segurança — nunca deixar
// o utilizador sem nenhum ficheiro.
// ──────────────────────────────────────────────────────────────────────────

const MM_TO_TWIP = 1440 / 25.4; // 1 polegada = 1440 twip; 1 polegada = 25.4mm
const MAX_IMAGE_WIDTH_PX = 400;

// ── Carregador da biblioteca docx-js (mesma versão usada em WordExporter.js
// e HTMLToDocxExporter.js — reaproveita window.docx se já estiver carregada) ──
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
      s.onload = () => (window.docx ? resolve() : reject(new Error('docx não inicializado')));
      s.onerror = () => tryNext(idx + 1);
      document.head.appendChild(s);
    };
    tryNext(0);
  });
}

// ── Cor CSS → hex de 6 dígitos sem "#" (formato exigido pelo docx-js) ──────
function toHex(color) {
  if (!color) return null;
  color = color.trim().replace(/\s*!important\s*$/, '');
  if (!color || color === 'transparent' || color === 'inherit' || color === 'initial') return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/);
    return (r + r + g + g + b + b).toUpperCase();
  }
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('').toUpperCase();
  const named = {
    white: 'FFFFFF', black: '000000', red: 'FF0000', blue: '0000FF',
    green: '008000', navy: '000080', gray: '808080', grey: '808080',
    silver: 'C0C0C0', orange: 'FFA500', purple: '800080', yellow: 'FFFF00',
  };
  return named[color.toLowerCase()] || null;
}

// ── Lê um atributo style="..." e devolve flags de formatação relevantes ────
function parseInlineStyle(styleStr) {
  const out = {};
  if (!styleStr) return out;
  styleStr.split(';').forEach(decl => {
    const idx = decl.indexOf(':');
    if (idx === -1) return;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) return;
    if (prop === 'color') { const hex = toHex(val); if (hex) out.color = hex; }
    if (prop === 'font-size') {
      const m = val.match(/([\d.]+)\s*(pt|px)/);
      if (m) {
        const num = parseFloat(m[1]);
        const pt = m[2] === 'px' ? num * 0.75 : num;
        if (pt > 0) out.size = Math.round(pt * 2); // docx usa meios-pontos
      }
    }
    if (prop === 'font-weight' && (val === 'bold' || val === 'bolder' || parseInt(val, 10) >= 600)) out.bold = true;
    if (prop === 'font-style' && val === 'italic') out.italic = true;
    if (prop === 'text-decoration' && /underline/.test(val)) out.underline = true;
    if (prop === 'text-align' && /left|center|right|justify/.test(val)) out.align = val;
  });
  return out;
}

function alignToDocx(align, AlignmentType) {
  switch (align) {
    case 'center':  return AlignmentType.CENTER;
    case 'right':   return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFIED;
    case 'left':    return AlignmentType.LEFT;
    default:        return undefined;
  }
}

// ── Mede as dimensões naturais de uma imagem (para manter proporção) ───────
function measureImageDims(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth || 0, height: im.naturalHeight || 0 });
    im.onerror = () => reject(new Error('Imagem inválida'));
    im.src = src;
  });
}

// ── Converte um <img> em ImageRun real do docx-js (ou null se falhar) ──────
async function buildImageRun(docx, imgEl) {
  const { ImageRun } = docx;
  const src = imgEl.getAttribute('src') || '';
  let bytes = null;
  let type = 'png';

  try {
    if (src.startsWith('data:')) {
      const m = src.match(/^data:image\/(\w+);base64,(.+)$/i);
      if (!m) return null;
      type = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      const bin = atob(m[2]);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else if (/^https?:\/\//i.test(src)) {
      // Imagens remotas (ex: logotipo por URL) — melhor esforço; se a rede/CORS
      // bloquear, o chamador insere um texto de aviso em vez de perder a imagem
      // silenciosamente.
      const resp = await fetch(src);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      type = (blob.type.split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      return null;
    }
  } catch (_) {
    return null;
  }

  if (!bytes || !bytes.length) return null;
  if (!['png', 'jpg', 'gif', 'bmp'].includes(type)) type = 'png';

  let width = parseInt(imgEl.style?.width, 10) || parseInt(imgEl.getAttribute('width') || '', 10) || 0;
  let height = parseInt(imgEl.style?.height, 10) || parseInt(imgEl.getAttribute('height') || '', 10) || 0;
  if (!width || !height) {
    try {
      const dims = await measureImageDims(src);
      if (dims.width && dims.height) { width = dims.width; height = dims.height; }
    } catch (_) { /* usa fallback abaixo */ }
  }
  if (!width || !height) { width = 200; height = 80; }
  if (width > MAX_IMAGE_WIDTH_PX) {
    height = Math.round(height * (MAX_IMAGE_WIDTH_PX / width));
    width = MAX_IMAGE_WIDTH_PX;
  }

  try {
    return new ImageRun({ data: bytes, type, transformation: { width, height } });
  } catch (_) {
    return null;
  }
}

export class GenericHtmlToDocxExporter {

  /**
   * @param {string[]} richHtmlPages  HTML de cada página (ex: DocumentEditor._richHTMLPages)
   * @param {string} filename         nome sugerido (sem extensão)
   * @param {object} [metadata]       { title, disciplina, nivel, aluno, turma, docente, instituicao }
   */
  async export(richHtmlPages, filename, metadata = {}) {
    if (!Array.isArray(richHtmlPages) || !richHtmlPages.length) {
      throw new Error('Sem conteúdo HTML para exportar');
    }

    await loadDocxLib();
    const docx = window.docx;
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
      Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak,
      ExternalHyperlink, ShadingType, convertMillimetersToTwip,
    } = docx;

    const twip = (mm) => (typeof convertMillimetersToTwip === 'function'
      ? convertMillimetersToTwip(mm)
      : Math.round(mm * MM_TO_TWIP));

    const FONT = 'Times New Roman';
    const BASE_SIZE = 24; // 12pt em meios-pontos

    // ── Runs inline (texto + formatação), recursivo ────────────────────────
    const walkInline = (node, ctx, runs) => {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        const text = node.textContent;
        if (!text) return;
        runs.push(new TextRun({
          text,
          font: FONT,
          size: ctx.size || BASE_SIZE,
          bold: !!ctx.bold,
          italic: !!ctx.italic,
          underline: ctx.underline ? {} : undefined,
          color: ctx.color || undefined,
        }));
        return;
      }
      if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

      const tag = node.tagName.toLowerCase();
      if (tag === 'img') return; // imagens são tratadas ao nível de bloco
      if (tag === 'br') { runs.push(new TextRun({ text: '', break: 1 })); return; }
      if (tag === 'script' || tag === 'style') return;

      const next = { ...ctx };
      if (tag === 'strong' || tag === 'b') next.bold = true;
      if (tag === 'em' || tag === 'i') next.italic = true;
      if (tag === 'u') next.underline = true;

      const st = parseInlineStyle(node.getAttribute && node.getAttribute('style'));
      if (st.bold) next.bold = true;
      if (st.italic) next.italic = true;
      if (st.underline) next.underline = true;
      if (st.color) next.color = st.color;
      if (st.size) next.size = st.size;

      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        const innerRuns = [];
        const linkCtx = { ...next, color: next.color || '2563EB', underline: true };
        Array.from(node.childNodes).forEach(c => walkInline(c, linkCtx, innerRuns));
        if (href && ExternalHyperlink) {
          runs.push(new ExternalHyperlink({
            link: href,
            children: innerRuns.length ? innerRuns : [new TextRun({ text: href, color: '2563EB', underline: {} })],
          }));
        } else {
          runs.push(...innerRuns);
        }
        return;
      }

      Array.from(node.childNodes).forEach(c => walkInline(c, next, runs));
    };

    // ── Extrai texto simples (para decidir se um bloco está "vazio") ───────
    const isBlank = (node) => !node.textContent || !node.textContent.trim();

    // ── Converte um elemento de bloco em 1+ Paragraph/Table (assíncrono
    // por causa das imagens) ────────────────────────────────────────────────
    const blockCounters = { ol: 0 };

    const convertBlock = async (node, out, opts = {}) => {
      if (node.nodeType === 3) {
        if (!isBlank(node)) {
          out.push(new Paragraph({ children: [new TextRun({ text: node.textContent, font: FONT, size: BASE_SIZE })], alignment: AlignmentType.JUSTIFIED }));
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();

      // Headings
      const headingMap = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 };
      if (headingMap[tag]) {
        const runs = [];
        walkInline(node, { bold: true }, runs);
        const st = parseInlineStyle(node.getAttribute('style'));
        out.push(new Paragraph({
          heading: headingMap[tag],
          alignment: alignToDocx(st.align, AlignmentType) || (tag === 'h1' ? AlignmentType.CENTER : AlignmentType.LEFT),
          spacing: { before: 200, after: 120 },
          children: runs.length ? runs : [new TextRun({ text: '', font: FONT })],
        }));
        return;
      }

      if (tag === 'img') {
        const run = await buildImageRun(docx, node);
        out.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 100, after: 100 },
          children: [run || new TextRun({ text: '[Imagem não incorporada — ver versão PDF]', italics: true, color: '999999', font: FONT, size: 20 })],
        }));
        return;
      }

      if (tag === 'hr') {
        out.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: '' })],
        }));
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        let n = 0;
        for (const li of Array.from(node.children)) {
          if (li.tagName.toLowerCase() !== 'li') continue;
          n++;
          const imgs = li.querySelectorAll ? Array.from(li.querySelectorAll('img')) : [];
          const runs = [];
          const prefix = tag === 'ol' ? `${n}. ` : '• ';
          runs.push(new TextRun({ text: prefix, font: FONT, size: BASE_SIZE }));
          walkInline(li, {}, runs);
          out.push(new Paragraph({
            indent: { left: twip(8) },
            spacing: { after: 60 },
            children: runs,
          }));
          for (const im of imgs) {
            const run = await buildImageRun(docx, im);
            if (run) out.push(new Paragraph({ indent: { left: twip(8) }, children: [run] }));
          }
        }
        return;
      }

      if (tag === 'table') {
        const rows = [];
        const trList = node.querySelectorAll ? Array.from(node.querySelectorAll('tr')) : [];
        for (const tr of trList) {
          const cells = [];
          for (const cellEl of Array.from(tr.children)) {
            const isHeader = cellEl.tagName.toLowerCase() === 'th';
            const runs = [];
            walkInline(cellEl, { bold: isHeader }, runs);
            cells.push(new TableCell({
              width: { size: 100 / Math.max(tr.children.length, 1), type: WidthType.PERCENTAGE },
              shading: isHeader ? { fill: '28508C', type: ShadingType.CLEAR, color: 'auto' } : undefined,
              children: [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: '', font: FONT })] })],
            }));
          }
          if (cells.length) rows.push(new TableRow({ children: cells }));
        }
        if (rows.length) {
          out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
          out.push(new Paragraph({ text: '', spacing: { after: 120 } })); // respiro após a tabela
        }
        return;
      }

      if (tag === 'blockquote') {
        const runs = [];
        walkInline(node, { italic: true, color: '555555' }, runs);
        out.push(new Paragraph({
          indent: { left: twip(10) },
          spacing: { before: 100, after: 100 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC' } },
          children: runs,
        }));
        return;
      }

      if (tag === 'p' || tag === 'div' || tag === 'span' || tag === 'li') {
        // Se este bloco contém sub-blocos reais (outra tabela/lista/heading/div
        // com conteúdo próprio), processa-os individualmente em vez de os
        // achatar num único parágrafo — comum em HTML de contenteditable
        // (cada linha vira uma <div>).
        const blockChildTags = new Set(['p', 'div', 'table', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr']);
        const hasBlockChildren = Array.from(node.children || []).some(c => blockChildTags.has(c.tagName.toLowerCase()));

        if (hasBlockChildren) {
          for (const child of Array.from(node.childNodes)) {
            await convertBlock(child, out);
          }
          return;
        }

        const imgs = node.querySelectorAll ? Array.from(node.querySelectorAll('img')) : [];
        if (isBlank(node) && !imgs.length) return; // linha vazia de contenteditable

        const st = parseInlineStyle(node.getAttribute && node.getAttribute('style'));
        const runs = [];
        walkInline(node, {}, runs);
        if (runs.length) {
          out.push(new Paragraph({
            alignment: alignToDocx(st.align, AlignmentType) || AlignmentType.JUSTIFIED,
            spacing: { after: 100 },
            children: runs,
          }));
        }
        for (const im of imgs) {
          const run = await buildImageRun(docx, im);
          out.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [run || new TextRun({ text: '[Imagem não incorporada — ver versão PDF]', italics: true, color: '999999' })] }));
        }
        return;
      }

      // Tag desconhecida — processa os filhos em vez de descartar o conteúdo
      for (const child of Array.from(node.childNodes)) {
        await convertBlock(child, out);
      }
    };

    // ── Bloco de metadados (Disciplina/Nível/Estudante/etc.), opcional ─────
    const metaRows = [
      metadata?.disciplina && ['Disciplina', metadata.disciplina],
      metadata?.nivel && ['Nível', metadata.nivel],
      metadata?.aluno && ['Estudante', metadata.aluno],
      metadata?.turma && ['Turma/Classe', metadata.turma],
      metadata?.docente && ['Docente', metadata.docente],
      metadata?.instituicao && ['Instituição', metadata.instituicao],
    ].filter(Boolean);

    const docChildren = [];
    if (metaRows.length) {
      docChildren.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
        spacing: { after: 200 },
        children: metaRows.map(([label, val], i) => new TextRun({
          text: `${label}: ${val}${i < metaRows.length - 1 ? '    ' : ''}`,
          font: 'Arial', size: 18, color: '444444',
        })),
      }));
    }

    for (let pageIdx = 0; pageIdx < richHtmlPages.length; pageIdx++) {
      if (pageIdx > 0) {
        docChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }
      const parser = new DOMParser();
      const parsed = parser.parseFromString(`<div id="root">${richHtmlPages[pageIdx] || ''}</div>`, 'text/html');
      const root = parsed.getElementById('root');
      if (!root) continue;
      for (const child of Array.from(root.childNodes)) {
        // eslint-disable-next-line no-await-in-loop
        await convertBlock(child, docChildren);
      }
    }

    if (!docChildren.length) {
      docChildren.push(new Paragraph({ children: [new TextRun({ text: '', font: FONT })] }));
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: twip(30), right: twip(25), bottom: twip(25), left: twip(30) },
          },
        },
        children: docChildren,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filename || `mzdocs-${Date.now()}`).replace(/\.(docx?|md|txt|pdf)$/i, '') + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  }
}

export const genericHtmlToDocxExporter = new GenericHtmlToDocxExporter();
export default GenericHtmlToDocxExporter;
