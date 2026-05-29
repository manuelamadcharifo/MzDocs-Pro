// assets/js/components/HTMLPDFExporter.js
// Exportação de PDF com template CSS real.
//
// Porquê este ficheiro existe:
//   O PDFExporter original usa jsPDF com código imperativo (desenha linha por linha).
//   Isso ignora completamente o templateCss dos templates — o PDF gerado fica sempre
//   com o layout padrão independentemente do modelo escolhido.
//
//   Esta classe abre uma janela de impressão com o HTML do documento e o CSS do
//   template aplicado directamente, produzindo um PDF fiel ao modelo seleccionado.
//   Funciona em todos os browsers mobile (Chrome Android, Safari iOS) e desktop.

// ── Conversor Markdown → HTML ─────────────────────────────────────────────
function markdownToHTML(md) {
  if (!md) return '';
  const PB = '___PAGEBREAK___';
  let html = md
    .replace(/---PAGE_BREAK---/g, PB)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(new RegExp(PB, 'g'), '<div style="page-break-after:always"></div>')
    // Emojis/placeholders que corrompem — limpar antes de renderizar
    .replace(/Ø=ÛÞ|Ø=Ûí|[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20CF]/g, c => {
      // Manter emojis comuns úteis, remover caracteres corrompidos
      const cp = c.codePointAt(0);
      if (cp >= 0x1F300 && cp <= 0x1FAFF) return c; // emojis válidos
      if (cp >= 0x2600 && cp <= 0x27BF) return c;   // símbolos misc
      return ''; // remover caracteres corrompidos (artefactos de encoding)
    })
    // Headers
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm,  '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm,   '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm,    '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm,     '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm,      '<h1>$1</h1>')
    // Bold + Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    // Code inline
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // HR
    .replace(/^---+$/gm, '<hr>')
    // Listas
    .replace(/^(\s*)[-*]\s+(.+)$/gm, '<li>$2</li>')
    .replace(/^(\s*)\d+\.\s+(.+)$/gm, '<li>$2</li>');

  // Agrupar <li> consecutivos em <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Parágrafos — blocos separados por linha vazia
  const blockRe = /^<(h[1-6]|ul|ol|li|hr|div|blockquote|table|thead|tbody|tr|td|th|p)/;
  html = html.split('\n\n').map(chunk => {
    chunk = chunk.trim();
    if (!chunk) return '';
    if (blockRe.test(chunk)) return chunk;
    return '<p>' + chunk.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  return html;
}

// ── CSS padrão (quando não há template seleccionado) ──────────────────────
const DEFAULT_PDF_CSS = `
body {
  font-family: 'Times New Roman', serif;
  font-size: 12pt;
  line-height: 1.5;
  color: #000;
  padding: 20mm 25mm 20mm 30mm;
  margin: 0;
}
h1 { font-size: 17pt; text-align: center; margin-bottom: 14pt; font-weight: bold; }
h2 { font-size: 13pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;
     border-bottom: 1px solid #bbb; padding-bottom: 2pt; }
h3 { font-size: 12pt; font-weight: bold; margin-top: 8pt; }
p  { margin-bottom: 8pt; text-align: justify; }
ul, ol { margin: 6pt 0 6pt 18pt; }
li { margin-bottom: 2pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
td, th { border: 1px solid #000; padding: 4pt 6pt; font-size: 11pt; }
th { background: #f0f0f0; font-weight: bold; }
strong { font-weight: bold; }
em { font-style: italic; }
hr { border: none; border-top: 1px solid #888; margin: 10pt 0; }
`;

// ── CSS de impressão (aplicado a qualquer template) ────────────────────────
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
}
* { box-sizing: border-box; }
`;

// ── Exportador principal ───────────────────────────────────────────────────
export class HTMLPDFExporter {

  /**
   * Abre a janela de impressão do browser com o documento formatado.
   * Em mobile Android/iOS, o browser converte para PDF ao seleccionar
   * "Guardar como PDF" no destino de impressão.
   *
   * @param {string} markdownContent  - Conteúdo do documento em Markdown
   * @param {string} filename         - Nome sugerido para o ficheiro (sem extensão)
   * @param {object} options
   * @param {string} [options.templateCss]   - CSS do template escolhido (anula o padrão)
   * @param {string} [options.title]         - Título para a janela de impressão
   */
  export(markdownContent, filename, options = {}) {
    const { templateCss = null, title = 'MzDocs Pro — Documento' } = options;

    const bodyHTML = markdownToHTML(markdownContent);
    const css      = templateCss || DEFAULT_PDF_CSS;

    const fullHTML = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    ${PRINT_CSS}
    ${css}
  </style>
</head>
<body>
  ${bodyHTML}
  <script>
    // Auto-print quando a janela carregar (só em desktop)
    // Em mobile, o utilizador toca em "Imprimir" / "Guardar PDF"
    window.addEventListener('load', function() {
      // Pequeno delay para garantir que os estilos estão aplicados
      setTimeout(function() { window.print(); }, 250);
    });
  </script>
</body>
</html>`;

    // Abrir numa nova janela para impressão
    const printWin = window.open('', '_blank', 'width=800,height=1000,scrollbars=yes');
    if (!printWin) {
      // Fallback: alguns browsers bloqueiam window.open — usar blob URL
      this._fallbackBlobDownload(fullHTML, filename);
      return;
    }

    printWin.document.open();
    printWin.document.write(fullHTML);
    printWin.document.close();
  }

  // Fallback para quando window.open é bloqueado pelo browser
  _fallbackBlobDownload(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${filename}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    // Notificar o utilizador
    const n = document.createElement('div');
    Object.assign(n.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: '#0f172a', color: '#fff', padding: '12px 20px',
      borderRadius: '24px', fontSize: '13px', fontWeight: '700',
      zIndex: '99999', textAlign: 'center', maxWidth: '320px',
      boxShadow: '0 4px 16px rgba(0,0,0,.4)',
    });
    n.textContent = '📄 Ficheiro HTML descarregado — abra-o e use "Imprimir → Guardar como PDF"';
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 6000);
  }
}

export const htmlPdfExporter = new HTMLPDFExporter();
