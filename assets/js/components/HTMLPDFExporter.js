// assets/js/components/HTMLPDFExporter.js
// v1.2 — exportWithPageWrap: envolve conteudo markdown em .doc-page para garantir
// que o PDF descarregado usa o mesmo layout do preview (corrige 1 pag vs 2 pags).
//
// Porquê existe: o PDFExporter usa jsPDF imperativo que ignora templateCss.
// Esta classe abre uma janela com HTML+CSS do template e dispara window.print().
// Em Android Chrome → "Guardar como PDF" no destino de impressão.

// CORRIGIDO (auditoria P2): este ficheiro tinha o seu próprio parser
// Markdown→HTML duplicado (mdToHtml, definido localmente), divergente do
// parser "golden master" de A4Renderer.js — sem suporte real a tabelas
// (linhas com "|" ficavam como texto simples) e com listas ordenadas a
// perder a numeração (1. 2. 3. eram todas convertidas para o MESMO <ul>
// com marcadores, não <ol>). Isso é um bug real e visível: um documento com
// tabela ou lista numerada, exportado a partir de um template com CSS mas
// SEM htmlTemplate (branch "else if (activeCss)" em
// DocumentController._exportPDF), perdia a tabela/numeração no PDF mesmo
// que o preview do editor as mostrasse correctamente. Reutiliza-se agora o
// mesmo markdownToHtml()/splitIntoPages() de A4Renderer.js (sem alterar
// A4Renderer.js) — mesma "verdade visual" em preview e PDF.
import { markdownToHtml as _sharedMarkdownToHtml, splitIntoPages as _sharedSplitIntoPages } from '../utils/A4Renderer.js';

// ── Markdown simples → HTML ──────────────────────────────────────────────
function mdToHtml(md) {
  if (!md) return '';

  // Limpar caracteres corrompidos (artefactos de encoding do jsPDF, emojis inválidos)
  // — mantido aqui porque é específico deste caminho de exportação, não da
  // conversão Markdown→HTML em si.
  let t = md.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uD7FF\uE000-\uFFFD]/g, c => {
    const cp = c.codePointAt(0);
    // Preservar emojis válidos do BMP e plano suplementar
    if ((cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF)) return c;
    return '';
  });

  // Divide pelo mesmo critério do preview (---PAGE_BREAK--- e variantes tipo
  // "Nova Página") e converte cada página com o parser partilhado — tabelas
  // GFM reais e listas ordenadas/não-ordenadas correctas, exactamente como
  // no preview do editor.
  const pages = _sharedSplitIntoPages(t);
  return pages.map(_sharedMarkdownToHtml).join('\n<div style="page-break-after:always"></div>\n');
}

// ── Controlo de paginação (widow/orphan) ─────────────────────────────────
// Equivalente, em CSS de impressão do browser, ao mesmo controlo já usado
// nos exportadores dos trabalhos académicos:
//  - PDFExporter.js (jsPDF): "não deixar parágrafo com 1 linha em nova página"
//  - WordExporter.js (docx-js): keepLines:true / keepNext:true
// Aqui não há posicionamento manual linha-a-linha (o browser é quem decide
// as quebras via window.print()), por isso usamos as propriedades CSS
// equivalentes: orphans/widows (nº mínimo de linhas de um parágrafo que
// devem ficar no fim/início de uma página, evitando 1 linha solta) e
// page-break-inside:avoid para blocos curtos que nunca devem partir-se
// (itens de lista, citações, linhas de tabela). Aplicado a TODOS os
// serviços com template visual (CV, carta, recibo, procuração, etc.),
// que antes não tinham nenhuma destas regras.
const PAGINATION_CSS = `
  p, li, blockquote { orphans: 3; widows: 3; }
  li, blockquote, tr { page-break-inside: avoid; break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { page-break-inside: avoid; break-inside: avoid; page-break-after: avoid; }
`;

// ── CSS padrão (sem template escolhido) ──────────────────────────────────
const DEFAULT_CSS = `
  body {
    font-family: 'Times New Roman', serif;
    font-size: 12pt; line-height: 1.5; color: #000;
    padding: 20mm 25mm 20mm 30mm; margin: 0;
  }
  h1 { font-size: 17pt; text-align: center; font-weight: bold; margin-bottom: 14pt; }
  h2 { font-size: 13pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
  h3 { font-size: 12pt; font-weight: bold; margin-top: 8pt; }
  p  { margin-bottom: 8pt; text-align: justify; }
  ul, ol { margin: 6pt 0 6pt 18pt; }
  li { margin-bottom: 2pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  td, th { border: 1px solid #000; padding: 4pt 6pt; }
  th { background: #f0f0f0; font-weight: bold; }
  hr { border: none; border-top: 1px solid #888; margin: 10pt 0; }
`;

// ── Margem física da página impressa ─────────────────────────────────────
// CORRIGIDO (bug: texto a começar colado ao topo da folha a partir da 2ª
// página no PDF descarregado, apesar do preview mostrar margem certa em
// TODAS as páginas): o preview usa 1 <iframe> por página (ver
// A4Renderer.js/renderA4Pages), cada um com o seu próprio <body> — por
// isso "body{padding:30mm ...}" do CSS aplica-se correctamente a CADA
// folha. Mas esta janela de impressão renderiza o documento inteiro num
// único <body> corrido, com quebras "page-break-after:always" a meio — e a
// especificação CSS de paginação só aplica o padding-top de um elemento ao
// PRIMEIRO fragmento (a 1ª folha impressa) e o padding-bottom ao ÚLTIMO;
// todas as folhas do meio ficam sem qualquer margem (@page também estava
// fixo em "margin:0", por isso não compensava). Resultado: só a 1ª página
// tinha margem no topo, as seguintes começavam mesmo na ponta da folha.
// Correcção: usar antes "@page { margin: ... }" — essa é a única
// propriedade CSS pensada para se repetir em CADA folha física impressa,
// exactamente o comportamento que faltava. O valor é extraído do próprio
// "body{padding:...}" do CSS do template (para não mudar visualmente as
// margens de nenhum documento já existente) e, no CSS de impressão, o
// padding do body passa a 0 (a margem física já vem do @page — manter os
// dois ao mesmo tempo duplicava o espaço em branco no topo).
function _extractPageMargin(css) {
  const m = css && css.match(/body\s*{[^}]*padding\s*:\s*([^;}]+)[;}]/i);
  return (m && m[1].trim()) || '20mm 25mm 20mm 25mm';
}

// ── Exportador ─────────────────────────────────────────────────────────
// CORRIGIDO (auditoria): bloco de identificação (Disciplina/Nível/Estudante/
// Turma/Docente) reutilizável entre HTMLPDFExporter e HTMLToDocxExporter —
// mesmos campos que PDFExporter.js e WordExporter.js já mostram quando NÃO
// há template visual activo. Estilo inline neutro (não depende de classes
// CSS do template, que poderiam não as definir) e discreto, para não
// conflituar visualmente com o design do template escolhido.
function _buildMetaBlockHTML(meta) {
  if (!meta) return '';
  // CORRIGIDO: para "Trabalho Escolar" (docType 'trabalho'), a capa de
  // identificação já vem embutida no próprio markdown do documento — ver
  // CoverNormalizer.js/LongDocumentEngine.js._buildCoverPage, que agora
  // constroem sempre esse bloco com os dados reais. Esta barra fina extra
  // (pensada para documentos SEM capa própria, tipo CV/carta) ficava
  // duplicada por cima da capa real — a mesma informação a aparecer duas
  // vezes na 1ª página. Suprimida apenas para 'trabalho'; os restantes
  // tipos continuam a mostrá-la como antes.
  if (meta.docType === 'trabalho') return '';
  const rows = [
    meta.disciplina  && ['Disciplina', meta.disciplina],
    meta.nivel        && ['Nível', meta.nivel],
    meta.aluno        && ['Estudante', meta.aluno],
    meta.turma        && ['Turma/Classe', meta.turma],
    meta.docente      && ['Docente', meta.docente],
    meta.instituicao  && ['Instituição', meta.instituicao],
  ].filter(Boolean);
  if (!rows.length) return '';
  const items = rows.map(([label, val]) =>
    `<span style="margin-right:18px;display:inline-block"><strong>${label}:</strong> ${String(val).replace(/</g,'&lt;')}</span>`
  ).join('');
  return `<div class="no-print-meta" style="font-family:Arial,sans-serif;font-size:11px;color:#444;border-bottom:1px solid #ccc;padding:0 0 8px 0;margin:0 0 14px 0;">${items}</div>`;
}

export class HTMLPDFExporter {

  /**
   * Abre janela de impressão com o documento formatado com o CSS do template.
   * @param {string} markdownContent
   * @param {string} filename         - nome sugerido (sem extensão)
   * @param {object} options
   * @param {string} [options.templateCss]
   * @param {string} [options.title]
   */
  export(markdownContent, filename, options = {}) {
    const { templateCss = null, title = 'MzDocs Pro', meta = null } = options;

    // ── Detecção automática de HTML vs Markdown ────────────────────────────
    // Quando o documento foi gerado como HTML estruturado (templates com htmlTemplate),
    // o conteúdo começa com '<' — usá-lo directamente sem conversão md→html.
    // Isto preserva layouts de duas colunas, sidebars e estruturas CSS reais.
    const isRawHTML = markdownContent && markdownContent.trimStart().startsWith('<');
    const bodyHTML = isRawHTML ? markdownContent : mdToHtml(markdownContent);
    const css = templateCss || DEFAULT_CSS;
    // CORRIGIDO (auditoria): quando um template visual está activo (este
    // exportador é usado em vez de PDFExporter.js), a capa de identificação
    // (Estudante/Docente/Turma/Instituição — ver _buildExportMetadata em
    // DocumentController.js) nunca aparecia, porque este exportador nunca
    // recebia nem usava esses dados. Mesma lógica de _buildMetaBlock usada
    // também em HTMLToDocxExporter.js, para os dois caminhos coincidirem.
    const metaBlockHTML = _buildMetaBlockHTML(meta);
    const pageMargin = _extractPageMargin(css);

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${title.replace(/</g,'&lt;')}</title>
<style>
/* Reset básico */
*, *::before, *::after { box-sizing: border-box; }

/* CRÍTICO: forçar impressão de cores de fundo (sidebar, headers, etc.) */
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}

/* Impressão A4 */
@media print {
  @page {
    size: A4 portrait;
    margin: ${pageMargin};
  }
  html, body {
    width: 210mm;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* A margem física agora vem do @page acima (repete-se em TODAS as
     páginas impressas); o padding do body — necessário no ecrã para
     simular a folha antes de imprimir — duplicaria esse espaço em
     branco no topo/lados se continuasse activo também na impressão. */
  body { padding: 0 !important; }
  .no-print { display: none !important; }
}

/* Ecrã: simular página A4 */
@media screen {
  html { background: #e5e7eb; padding: 20px; }
  body {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 4px 24px rgba(0,0,0,.2);
  }
}

/* Controlo de paginação — aplicado sempre, mesmo com template visual activo */
${PAGINATION_CSS}

/* CSS do template (anula os defaults acima quando aplicável) */
${css}
</style>
</head>
<body>
${metaBlockHTML}${bodyHTML}

<!-- Botão apenas no ecrã — não imprime -->
<div class="no-print" id="btnSavePdf1" style="
  position:fixed;bottom:20px;right:20px;
  background:#1e3a5f;color:#fff;
  padding:12px 20px;border-radius:24px;
  font-family:sans-serif;font-size:14px;font-weight:700;
  cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);
  z-index:9999;
">🖨️ Guardar como PDF</div>

<script>
// CSP: botão movido de onclick inline para listener via id (consistente
// com o resto do projecto), embora esta janela de impressão (gerada por
// document.write, sem resposta HTTP própria) não esteja sujeita ao CSP
// do site principal.
document.getElementById('btnSavePdf1').addEventListener('click', () => window.print());
// Auto-print após render completo (com delay para estilos aplicarem)
window.addEventListener('load', function() {
  // Em mobile, não forçar auto-print — o utilizador toca no botão
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (!isMobile) {
    setTimeout(function() { window.print(); }, 400);
  }
});
</script>
</body>
</html>`;

    // Tentar abrir nova janela
    const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes,resizable=yes');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      return;
    }

    // Fallback: blob URL (quando window.open é bloqueado)
    this._blobFallback(html, filename);
  }

  /**
   * Exporta markdown para PDF usando o motor de impressao do browser.
   * Usa CSS identico ao preview do editor (mesmas fontes, tamanhos, margens).
   * Garante que preview e PDF mostram o mesmo numero de paginas.
   * Usado para documentos sem template activo (CV, carta, recibo, etc.)
   */
  exportWithPageWrap(markdownContent, filename, options = {}) {
    const { title = 'MzDocs Pro' } = options;
    const isRawHTML = markdownContent && markdownContent.trimStart().startsWith('<');
    const bodyContent = isRawHTML ? markdownContent : mdToHtml(markdownContent);

    // CSS de impressao optimizado para CVs e documentos de 1 pagina.
    // PROBLEMA ANTERIOR: padding 25+20mm = apenas 252mm de area util → "Referências"
    // transbordava para pagina 2 mesmo o preview mostrando "~1 pag".
    // SOLUCAO: margens profissionais de CV (15mm topo/base, 18mm lados) = 267mm area util.
    // Espacamentos reduzidos para coincidir com o que a IA gera para "1 pagina".
    const printCss = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      @page { size: A4 portrait; margin: 15mm 18mm; }
      html, body {
        width: 100%;
        font-family: 'Times New Roman', Georgia, serif;
        font-size: 11.5pt;
        line-height: 1.45;
        color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      h1{font-size:16pt;font-weight:bold;text-align:center;margin-bottom:10pt;}
      h2{font-size:12.5pt;font-weight:bold;margin-top:10pt;margin-bottom:5pt;}
      h3{font-size:11.5pt;font-weight:bold;margin-top:7pt;margin-bottom:4pt;}
      h4{font-size:11pt;font-weight:bold;margin-top:6pt;margin-bottom:3pt;}
      p{margin-bottom:5pt;text-align:justify;}
      ul,ol{margin:4pt 0 4pt 16pt;}li{margin-bottom:2pt;}
      table{width:100%;border-collapse:collapse;margin:7pt 0;font-size:11pt;page-break-inside:avoid;}
      td,th{border:1px solid #000;padding:4pt 6pt;}th{background:#f0f0f0;font-weight:bold;}
      strong{font-weight:bold;}em{font-style:italic;}
      hr{border:none;border-top:1px solid #bbb;margin:7pt 0;}
      h1,h2,h3,h4{page-break-after:avoid;}
      @media screen {
        html { background: #e5e7eb; padding: 20px; }
        body {
          width: 174mm;
          margin: 0 auto;
          padding: 15mm;
          box-shadow: 0 4px 24px rgba(0,0,0,.2);
          background: #fff;
        }
      }
    `;
    this._openPrintWindow(bodyContent, printCss, title, filename);
  }

  _openPrintWindow(bodyHTML, css, title, filename) {
    const safeCss = css || DEFAULT_CSS;
    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${title.replace(/</g,'&lt;')}</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { width: 210mm; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
}
@media screen {
  html { background: #e5e7eb; padding: 20px; }
  body { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,.2); }
}
${PAGINATION_CSS}
${safeCss}
</style>
</head>
<body>
${bodyHTML}
<div class="no-print" id="btnSavePdf2" style="position:fixed;bottom:20px;right:20px;background:#1e3a5f;color:#fff;padding:12px 20px;border-radius:24px;font-family:sans-serif;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:9999;">🖨️ Guardar como PDF</div>
<script>
document.getElementById('btnSavePdf2').addEventListener('click', () => window.print());
window.addEventListener('load', function() {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (!isMobile) { setTimeout(function() { window.print(); }, 400); }
});
</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes,resizable=yes');
    if (win) { win.document.open(); win.document.write(html); win.document.close(); return; }
    this._blobFallback(html, filename);
  }

  _blobFallback(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename + '.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 8000);

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position:'fixed', bottom:'80px', left:'50%',
      transform:'translateX(-50%)',
      background:'#0f172a', color:'#fff',
      padding:'14px 22px', borderRadius:'24px',
      fontSize:'13px', fontWeight:'700',
      zIndex:'99999', textAlign:'center',
      maxWidth:'320px', lineHeight:'1.5',
      boxShadow:'0 4px 20px rgba(0,0,0,.5)',
    });
    toast.textContent = '📄 Ficheiro descarregado — abra-o e toque em "Guardar como PDF"';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 7000);
  }
}

export const htmlPdfExporter = new HTMLPDFExporter();
