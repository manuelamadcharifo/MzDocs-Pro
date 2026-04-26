// assets/js/utils/ExportService.js
// Exportação para PDF, Word e TXT

export class ExportService {
  constructor() {
    this.WA_NUMBER = '258858695506'; // WhatsApp do projeto (mesmo que DocumentController)
  }

  // ============================================
  // EXPORTAR PDF
  // ============================================
  async toPdf(htmlContent, filename = 'documento.pdf') {
    // Carrega html2pdf dinamicamente se necessário
    if (!window.html2pdf) {
      await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    }

    const element = document.createElement('div');
    element.innerHTML = `
      <div style="
        font-family: 'Georgia', serif;
        line-height: 1.8;
        color: #1a1a1a;
        max-width: 210mm;
        margin: 0 auto;
        padding: 20mm;
      ">
        ${htmlContent}
      </div>
    `;
    document.body.appendChild(element);

    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await window.html2pdf().set(opt).from(element).save();
    document.body.removeChild(element);
  }

  // ============================================
  // EXPORTAR WORD (.doc)
  // ============================================
  toWord(htmlContent, filename = 'documento.doc') {
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Export</title></head>
      <body>
    `;
    const footer = '</body></html>';
    const sourceHTML = header + htmlContent + footer;

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const a = document.createElement('a');
    a.href = source;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ============================================
  // EXPORTAR TXT
  // ============================================
  toTxt(content, filename = 'documento.txt') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================
  // ENVIAR WHATSAPP
  // ============================================
  toWhatsApp(content, serviceType) {
    const message = encodeURIComponent(
      `*${serviceType.toUpperCase()} — MzDocs Pro*\n\n` +
      `${content.substring(0, 3500)}`
    );
    window.open(`https://wa.me/${this.WA_NUMBER}?text=${message}`, '_blank');
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
}

export const exportService = new ExportService();