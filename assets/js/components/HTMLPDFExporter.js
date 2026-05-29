// assets/js/components/HTMLPDFExporter.js
// Exportação de PDF com template CSS real via janela de impressão.
//
// Porquê existe: o PDFExporter usa jsPDF imperativo que ignora templateCss.
// Esta classe abre uma janela com HTML+CSS do template e dispara window.print().
// Em Android Chrome → "Guardar como PDF" no destino de impressão.

// ── Markdown simples → HTML ──────────────────────────────────────────────
function mdToHtml(md) {
  if (!md) return '';

  // Limpar caracteres corrompidos (artefactos de encoding do jsPDF, emojis inválidos)
  let t = md.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uD7FF\uE000-\uFFFD]/g, c => {
    const cp = c.codePointAt(0);
    // Preservar emojis válidos do BMP e plano suplementar
    if ((cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF)) return c;
    return '';
  });

  // Escaping HTML
  t = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Headers
  t = t.replace(/^#{6}\s+(.+)$/gm,'<h6>$1</h6>')
       .replace(/^#{5}\s+(.+)$/gm,'<h5>$1</h5>')
       .replace(/^#{4}\s+(.+)$/gm,'<h4>$1</h4>')
       .replace(/^#{3}\s+(.+)$/gm,'<h3>$1</h3>')
       .replace(/^#{2}\s+(.+)$/gm,'<h2>$1</h2>')
       .replace(/^#{1}\s+(.+)$/gm,'<h1>$1</h1>');

  // Bold + Italic
  t = t.replace(/\*{3}(.+?)\*{3}/g,'<strong><em>$1</em></strong>')
       .replace(/\*{2}(.+?)\*{2}/g,'<strong>$1</strong>')
       .replace(/\*(.+?)\*/g,'<em>$1</em>');

  // Code
  t = t.replace(/`(.+?)`/g,'<code>$1</code>');

  // Page break
  t = t.replace(/---PAGE_BREAK---/g,'<div style="page-break-after:always"></div>');

  // HR
  t = t.replace(/^---+$/gm,'<hr>');

  // Listas — agrupar li consecutivos em ul
  t = t.replace(/^[ \t]*[-*+]\s+(.+)$/gm,'<li>$1</li>');
  t = t.replace(/^[ \t]*\d+\.\s+(.+)$/gm,'<li>$1</li>');
  t = t.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');

  // Parágrafos — blocos separados por linha vazia
  const blockStart = /^<(h[1-6]|ul|ol|hr|div|blockquote|table)/;
  t = t.split(/\n{2,}/).map(chunk => {
    chunk = chunk.trim();
    if (!chunk) return '';
    if (blockStart.test(chunk)) return chunk;
    return '<p>' + chunk.replace(/\n/g,'<br>') + '</p>';
  }).join('\n');

  return t;
}

// ── CSS padrão (sem template escolhido) ──────────────────────────────────
const DEFAULT_CSS = `
  body {
    font-family: 'Times New Roman', serif;
    font-size: 12pt; line-height: 1.5; color: #000;
    padding: 20mm 25mm 20mm 30mm; margin: 0;
  }
  h1 { font-size: 17pt; text-align: center; font-weight: bold; margin-bottom: 14pt; }
  h2 { font-size: 13pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;
       border-bottom: 1px solid #bbb; padding-bottom: 2pt; }
  h3 { font-size: 12pt; font-weight: bold; margin-top: 8pt; }
  p  { margin-bottom: 8pt; text-align: justify; }
  ul, ol { margin: 6pt 0 6pt 18pt; }
  li { margin-bottom: 2pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  td, th { border: 1px solid #000; padding: 4pt 6pt; }
  th { background: #f0f0f0; font-weight: bold; }
  hr { border: none; border-top: 1px solid #888; margin: 10pt 0; }
`;

// ── Exportador ─────────────────────────────────────────────────────────
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
    const { templateCss = null, title = 'MzDocs Pro' } = options;
    const bodyHTML = mdToHtml(markdownContent);
    const css = templateCss || DEFAULT_CSS;

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${title.replace(/</g,'&lt;')}</title>
<style>
/* Reset básico */
*, *::before, *::after { box-sizing: border-box; }

/* Impressão A4 */
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }
  html, body {
    width: 210mm;
    /* Deixar o CSS do template controlar a altura */
  }
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

/* CSS do template (anula os defaults acima quando aplicável) */
${css}
</style>
</head>
<body>
${bodyHTML}

<!-- Botão apenas no ecrã — não imprime -->
<div class="no-print" style="
  position:fixed;bottom:20px;right:20px;
  background:#1e3a5f;color:#fff;
  padding:12px 20px;border-radius:24px;
  font-family:sans-serif;font-size:14px;font-weight:700;
  cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);
  z-index:9999;
" onclick="window.print()">🖨️ Guardar como PDF</div>

<script>
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
