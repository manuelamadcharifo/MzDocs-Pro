// assets/js/components/DocumentEditorStyles.js
// Extraido de DocumentEditor.js (_getFormatCSS) — CSS do preview por formato.
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export function getFormatCSS(format) {
    // NOTA: min-height removido de .doc-page — o preview agora simula paginas reais.
    // O script _pageSimJS() injeta separadores visuais em multiplos de 297mm,
    // exactamente como o PDF impresso. O utilizador ve o mesmo numero de paginas que vai descarregar.
    const base = `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{background:#e5e7eb;padding:20px 0;}
      .doc-page{
        width:174mm;padding:15mm 0;background:#fff;
        font-family:'Times New Roman',Georgia,serif;
        font-size:11.5pt;line-height:1.45;color:#000;
        margin:0 auto;
        box-shadow:0 2px 12px rgba(0,0,0,.15);
      }
      .page-break-ruler{
        width:210mm;margin:0 auto;
        border:none;border-top:2px dashed #94a3b8;
        position:relative;
        display:flex;align-items:center;justify-content:center;
      }
      .page-break-ruler::after{
        content:'— Quebra de página —';
        position:absolute;
        background:#e5e7eb;
        padding:0 10px;
        font-size:10px;color:#94a3b8;
        font-family:sans-serif;letter-spacing:.5px;
      }
      h1{font-size:16pt;font-weight:bold;text-align:center;margin-bottom:10pt;}
      h2{font-size:12.5pt;font-weight:bold;margin-top:10pt;margin-bottom:5pt;border-bottom:1px solid #ccc;padding-bottom:2pt;}
      h3{font-size:11.5pt;font-weight:bold;margin-top:7pt;margin-bottom:4pt;}
      h4{font-size:11pt;font-weight:bold;margin-top:6pt;margin-bottom:3pt;}
      p{margin-bottom:5pt;text-align:justify;}
      ul,ol{margin:4pt 0 4pt 16pt;}li{margin-bottom:2pt;}
      table{width:100%;border-collapse:collapse;margin:7pt 0;font-size:11pt;page-break-inside:avoid;}
      td,th{border:1px solid #000;padding:4pt 6pt;}th{background:#f0f0f0;font-weight:bold;}
      strong{font-weight:bold;}em{font-style:italic;}
      hr{border:none;border-top:1px solid #bbb;margin:7pt 0;}
      h1,h2,h3,h4{page-break-after:avoid;}
      p,li,blockquote{orphans:3;widows:3;}
      li,blockquote,tr{page-break-inside:avoid;break-inside:avoid;}
      h1,h2,h3,h4,h5,h6{page-break-inside:avoid;break-inside:avoid;}
    `;
    if (format === 'word') return base + `
      body,.doc-page{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:11pt;}
      h1{color:#2E74B5;font-size:16pt;}h2{color:#2E74B5;font-size:13pt;border-bottom-color:#2E74B5;}
      td,th{border-color:#BFBFBF;}th{background:#D9E2F3;color:#1F3864;}
    `;
    if (format === 'excel') return `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Calibri',Arial,sans-serif;font-size:11pt;background:#fff;}
      .doc-page{padding:0;width:100%;min-height:100vh;}
      table{width:100%;border-collapse:collapse;}
      th{background:#4472C4;color:#fff;font-weight:bold;padding:6pt 8pt;border:1px solid #2F5597;}
      td{padding:5pt 8pt;border:1px solid #B4B4B4;}
      tr:nth-child(even) td{background:#F2F2F2;}
      h1,h2,h3{padding:8pt;font-size:13pt;}p{padding:4pt 8pt;}ul,ol{padding:4pt 8pt 4pt 24pt;}
    `;
    return base + `body,.doc-page{font-family:'Times New Roman',Georgia,serif;}`;
}
