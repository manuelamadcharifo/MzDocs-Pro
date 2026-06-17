// assets/js/components/pageSimulationScript.js
// Extraido de DocumentEditor.js (_pageSimJS) — script injectado no iframe
// de preview para simular quebras de pagina visuais.
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export function getPageSimScript() {
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
