// assets/js/utils/Paginator.js
// ──────────────────────────────────────────────────────────────────────────
// MOTOR DE PAGINAÇÃO REAL — resolve a inconsistência "1 página na app,
// 3 páginas no download". Até agora existiam TRÊS sistemas independentes
// a decidir onde as páginas terminam:
//   1. O preview (A4Renderer.js)  — não paginava por overflow, só crescia
//      a altura da folha até caber tudo (por isso mostrava sempre "1 página").
//   2. O PDF (PDFExporter.js)     — jsPDF a desenhar texto linha-a-linha em
//      mm, com as suas próprias métricas de fonte (diferentes do browser).
//   3. O Word (WordExporter.js)   — docx.js, cuja paginação final é decidida
//      pelo próprio Word/LibreOffice ao abrir o ficheiro.
//
// Em vez de tentar fazer os três motores "adivinharem" o mesmo resultado
// (impossível de garantir a 100%, porque usam motores de tipografia
// diferentes), este módulo faz a MEDIÇÃO REAL uma única vez, no browser,
// usando o mesmo CSS/margens partilhados (DEFAULT_PAGE_CSS) — e depois
// insere marcadores ---PAGE_BREAK--- explícitos no markdown, exactamente
// nos pontos onde uma folha A4 real termina.
//
// Esses marcadores são OBRIGATÓRIOS para os três sistemas — tanto o
// PDFExporter.js como o WordExporter.js já forçam incondicionalmente uma
// nova página sempre que encontram "---PAGE_BREAK---" (não é uma sugestão,
// é uma ordem). E o preview (A4Renderer.js) já divide as folhas exactamente
// por esse marcador. Ou seja: ao decidir a paginação UMA VEZ aqui e usar o
// MESMO conteúdo (já com os marcadores) em todo o lado — preview, PDF e
// Word — os três deixam de poder divergir no NÚMERO DE PÁGINAS, porque
// deixam de fazer essa decisão sozinhos; limitam-se a obedecer aos
// marcadores que já vêm prontos.
// ──────────────────────────────────────────────────────────────────────────

import { markdownToHtml, DEFAULT_PAGE_CSS, A4_WIDTH_PX, A4_HEIGHT_PX } from './A4Renderer.js';

const MM_TO_PX = 96 / 25.4;

// Margens reais usadas em toda a app: PDFExporter.js (ML30/MR25/MT30/MB25mm)
// e DEFAULT_PAGE_CSS (padding:30mm 25mm 25mm 30mm).
const PAD_TOP_PX    = 30 * MM_TO_PX;
const PAD_BOTTOM_PX = 25 * MM_TO_PX;
const PAD_LEFT_PX   = 30 * MM_TO_PX;
const PAD_RIGHT_PX  = 25 * MM_TO_PX;

const CONTENT_WIDTH_PX  = Math.round(A4_WIDTH_PX - PAD_LEFT_PX - PAD_RIGHT_PX);
// 2% de folga para absorver pequenas diferenças de métricas de fonte entre
// o browser (preview) e o motor final (jsPDF/Word) — evita que um bloco
// que mal cabe no preview transborde no PDF por meio milímetro.
const USABLE_HEIGHT_PX = (A4_HEIGHT_PX - PAD_TOP_PX - PAD_BOTTOM_PX) * 0.98;

// ── Normalização de "Nova Página" → marcador canónico (igual em toda a app) ──
function normalizeBreaks(raw) {
  return (raw || '')
    .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
    .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---')
    .replace(/(---PAGE_BREAK---\s*){2,}/g, '---PAGE_BREAK---\n');
}

// ── Agrupa markdown em blocos "atómicos" ────────────────────────────────
// Mesma granularidade que os exportadores reais já tratam como indivisível
// (um título nunca se separa do seu sublinhado, uma tabela nunca se parte
// a meio, uma lista mantém-se agrupada) — por isso é seguro decidir quebras
// de página apenas ENTRE blocos, nunca dentro de um.
function splitIntoBlocks(segment) {
  const lines = segment.split('\n');
  const blocks = [];
  let i = 0;

  const isTableRow   = (l) => l.trim().startsWith('|');
  const isTableSep   = (l) => /^\|?[\s:|-]+\|?\s*$/.test(l.trim()) && l.includes('-');
  const isListItem   = (l) => /^[ \t]*[-*+]\s+/.test(l) || /^[ \t]*\d+[.)]\s+/.test(l);
  const isHeading    = (l) => /^#{1,6}\s+/.test(l.trim());
  const isHr         = (l) => /^(-{3,}|\*{3,}|_{3,})\s*$/.test(l.trim());
  const isBlockquote = (l) => /^>\s?/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (isHeading(line)) { blocks.push(line); i++; continue; }
    if (isHr(line))      { blocks.push(line); i++; continue; }

    if (isTableRow(line) && lines[i + 1] && isTableSep(lines[i + 1])) {
      const start = i;
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) i++;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    if (isListItem(line)) {
      const start = i;
      i++;
      while (i < lines.length && lines[i].trim() && !isHeading(lines[i]) && !isHr(lines[i])) i++;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    if (isBlockquote(line)) {
      const start = i;
      while (i < lines.length && isBlockquote(lines[i])) i++;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    // Parágrafo normal — linhas seguidas até: vazio / heading / hr / lista / tabela
    const start = i;
    while (
      i < lines.length && lines[i].trim() &&
      !isHeading(lines[i]) && !isHr(lines[i]) && !isListItem(lines[i]) &&
      !(isTableRow(lines[i]) && lines[i + 1] && isTableSep(lines[i + 1]))
    ) i++;
    blocks.push(lines.slice(start, i).join('\n'));
  }
  return blocks;
}

// ── Mede a altura real (px) de cada bloco, já convertido para HTML, usando
// EXACTAMENTE o mesmo CSS/tipografia do preview (DEFAULT_PAGE_CSS) ─────────
function measureBlockHeights(blocksHtml) {
  return new Promise((resolve) => {
    if (!blocksHtml.length) { resolve([]); return; }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const cleanup = (result) => {
      try { document.body.removeChild(iframe); } catch (_) {}
      resolve(result);
    };

    // Timeout de segurança — nunca deixar a paginação pendurada indefinidamente
    // (ex: iframe que por alguma razão não dispara 'load' em certos WebViews).
    const safety = setTimeout(() => cleanup(blocksHtml.map(() => 0)), 2500);

    const wrapped = blocksHtml
      .map((html, idx) => `<div class="pg-blk" data-i="${idx}">${html}</div>`)
      .join('\n');

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEFAULT_PAGE_CSS}
html,body{width:${CONTENT_WIDTH_PX}px;margin:0;padding:0;}
body{padding:0 !important;}
.pg-blk{overflow:hidden;}
</style></head><body>${wrapped}</body></html>`;

    iframe.addEventListener('load', () => {
      // Segunda leitura após layout/fontes assentarem definitivamente.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clearTimeout(safety);
          try {
            const nodes = iframe.contentDocument.querySelectorAll('.pg-blk');
            const heights = Array.from(nodes).map(n => n.getBoundingClientRect().height);
            cleanup(heights);
          } catch (err) {
            cleanup(blocksHtml.map(() => 0));
          }
        });
      });
    }, { once: true });

    iframe.srcdoc = doc;
  });
}

/**
 * Insere marcadores ---PAGE_BREAK--- reais no markdown, medindo a altura
 * efectiva de cada bloco e simulando o preenchimento de folhas A4 reais
 * (mesma largura/margens usadas no preview e nos exportadores).
 *
 * Respeita quaisquer ---PAGE_BREAK--- já existentes no conteúdo original
 * (ex: quebras de página intencionais escritas pela IA) — só acrescenta
 * NOVAS quebras dentro de um segmento que continue demasiado alto para
 * caber numa única folha.
 *
 * @param {string} rawContent  markdown bruto (1 ou mais páginas)
 * @returns {Promise<string>}  markdown com ---PAGE_BREAK--- nos pontos reais
 */
export async function paginateMarkdown(rawContent) {
  const normalized = normalizeBreaks(rawContent || '');
  if (!normalized.trim()) return normalized;

  // Conteúdo HTML estruturado (templates) não passa por aqui — a paginação
  // desses é responsabilidade do layout do próprio template/HTMLPDFExporter.
  if (normalized.trimStart().startsWith('<')) return normalized;

  const segments = normalized.split(/---PAGE_BREAK---/g).map(s => s.trim()).filter(s => s.length);
  if (!segments.length) return normalized;

  const outputSegments = [];

  for (const segment of segments) {
    const blocks = splitIntoBlocks(segment);
    if (blocks.length <= 1) { outputSegments.push(segment); continue; }

    const htmls   = blocks.map(b => markdownToHtml(b));
    const heights = await measureBlockHeights(htmls);

    // Se a medição falhou (todas as alturas 0 — ex: iframe bloqueado pelo
    // ambiente), não arriscar uma paginação errada: devolve o segmento tal
    // como estava, em vez de inserir quebras às cegas.
    if (!heights.some(h => h > 0)) { outputSegments.push(segment); continue; }

    const pages = [];
    let current  = [];
    let currentH = 0;

    blocks.forEach((raw, idx) => {
      const h = heights[idx] || 0;
      const isHeadingBlock = /^#{1,6}\s+/.test(raw.trim());
      // Nunca deixar um título sozinho no fim de uma folha — se for heading,
      // conta também a altura do bloco seguinte para decidir a quebra.
      const nextH = isHeadingBlock ? (heights[idx + 1] || 0) : 0;
      const neededNow = h + nextH;

      if (current.length && (currentH + neededNow) > USABLE_HEIGHT_PX) {
        pages.push(current.join('\n\n'));
        current = [];
        currentH = 0;
      }
      current.push(raw);
      currentH += h;
    });
    if (current.length) pages.push(current.join('\n\n'));

    outputSegments.push(pages.join('\n\n---PAGE_BREAK---\n\n'));
  }

  return outputSegments.join('\n\n---PAGE_BREAK---\n\n');
}

// ── Cache simples por conteúdo — evita remedir o mesmo documento repetidamente
// (ex: o utilizador troca de aba PDF/Word/Texto no preview várias vezes) ────
const _cache = new Map();
const CACHE_LIMIT = 8;

export async function getPaginatedContent(rawContent) {
  const key = rawContent || '';
  if (_cache.has(key)) return _cache.get(key);

  const result = await paginateMarkdown(key);
  if (_cache.size >= CACHE_LIMIT) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(key, result);
  return result;
}
