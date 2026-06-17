// assets/js/marketplace/templates/trabalho.js
// Extraido de TemplateLibrary.js — secao "TRABALHO ESCOLAR"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'trabalho-academico',
      name: 'Académico Clássico',
      description: 'Times New Roman, margens APA, numeração de páginas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div class="ta-page">
  <div class="ta-capa">
    <p class="ta-instituicao">{{INSTITUICAO}}</p>
    <p class="ta-curso">{{CURSO}}</p>
    <h1 class="ta-titulo">{{TEMA}}</h1>
    <p class="ta-autor">{{AUTORES}}</p>
    <p class="ta-local-ano">{{LOCAL_ANO}}</p>
  </div>
  <div class="ta-body">
    <section class="ta-section">
      <h2 class="ta-section-title">Introdução</h2>
      <p class="ta-text">{{INTRODUCAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Desenvolvimento</h2>
      <div class="ta-content">{{DESENVOLVIMENTO}}</div>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Conclusão</h2>
      <p class="ta-text">{{CONCLUSAO}}</p>
    </section>
    <section class="ta-section">
      <h2 class="ta-section-title">Referências Bibliográficas</h2>
      <div class="ta-referencias">{{REFERENCIAS}}</div>
    </section>
  </div>
</div>`,
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:2;color:#000;padding:30mm 25mm 25mm 30mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;margin-bottom:24pt}
        h2{font-size:13pt;font-weight:bold;text-transform:uppercase;margin-top:18pt;margin-bottom:6pt}
        h3{font-size:12pt;font-weight:bold;font-style:italic;margin-top:12pt}
        p{text-indent:1.27cm;text-align:justify;margin-bottom:0}
        .cover{text-align:center;padding-top:60pt}
        .cover h1{font-size:14pt;margin-top:40pt}`,
    },
    {
      id: 'trabalho-moderno',
      name: 'Moderno Minimalista',
      description: 'Design limpo com linha de destaque azul, ideal para ensino secundário',
      preview: { accent: '#2563eb', bg: '#f8faff', font: 'sans-serif', headerBg: '#2563eb', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1e293b;padding:25mm}
        h1{font-size:18pt;color:#2563eb;font-weight:800;border-bottom:3px solid #2563eb;padding-bottom:8pt;margin-bottom:18pt}
        h2{font-size:13pt;color:#1e40af;font-weight:700;margin-top:16pt;border-left:4px solid #2563eb;padding-left:10pt}
        h3{font-size:11pt;color:#374151;font-weight:700;margin-top:10pt}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'trabalho-uem',
      name: 'Padrão UEM',
      description: 'Formato exigido pela Universidade Eduardo Mondlane',
      preview: { accent: '#006633', bg: '#fff', font: 'serif', headerBg: '#006633', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm 25mm 35mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;margin-bottom:12pt;text-transform:uppercase}
        h2{font-size:13pt;font-weight:bold;margin-top:24pt;margin-bottom:6pt;color:#006633}
        h3{font-size:12pt;font-weight:bold;margin-top:14pt}
        p{text-align:justify;text-indent:1.25cm;margin-bottom:6pt}
        hr{border:1px solid #006633;margin:16pt 0}`,
    },
    {
      id: 'trabalho-tecnico',
      name: 'Relatório Técnico',
      description: 'Estrutura formal para engenharia, ciências e tecnologia',
      preview: { accent: '#0f172a', bg: '#f1f5f9', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.5;color:#0f172a;padding:25mm 20mm}
        h1{font-size:16pt;font-weight:800;color:#0f172a;text-align:center;padding:14pt 0;border-top:3px solid #0f172a;border-bottom:3px solid #0f172a;margin-bottom:20pt}
        h2{font-size:12pt;font-weight:700;background:#f1f5f9;padding:4pt 8pt;margin-top:16pt;border-left:5px solid #0f172a}
        h3{font-size:10pt;font-weight:700;margin-top:10pt;text-decoration:underline}
        table{width:100%;border-collapse:collapse;margin:10pt 0}
        td,th{border:1px solid #94a3b8;padding:4pt 6pt;font-size:9pt}
        th{background:#0f172a;color:#fff}`,
    },
    {
      id: 'trabalho-criativo',
      name: 'Ensaio Criativo',
      description: 'Layout elegante para artes, humanidades e ciências sociais',
      preview: { accent: '#7c3aed', bg: '#faf5ff', font: 'serif', headerBg: '#7c3aed', headerColor: '#fff' },
      css: `body{font-family:Georgia,serif;font-size:12pt;line-height:1.8;color:#1e1b4b;padding:28mm}
        h1{font-size:22pt;color:#7c3aed;font-weight:400;font-style:italic;text-align:center;margin-bottom:20pt;letter-spacing:1px}
        h2{font-size:13pt;color:#4c1d95;font-weight:600;margin-top:18pt;margin-bottom:8pt}
        h3{font-size:11pt;font-style:italic;color:#6d28d9;margin-top:10pt}
        p{text-align:justify;margin-bottom:10pt;hyphens:auto}
        blockquote{border-left:3px solid #7c3aed;padding-left:14pt;color:#4c1d95;font-style:italic;margin:12pt 0 12pt 16pt}`,
    },
];
