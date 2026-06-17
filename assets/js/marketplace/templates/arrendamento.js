// assets/js/marketplace/templates/arrendamento.js
// Extraido de TemplateLibrary.js — secao "CONTRATO DE ARRENDAMENTO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'arrend-legal',
      name: 'Jurídico Formal',
      description: 'Formato notarial, artigos numerados, cláusulas legais completas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <h1 style="text-align:center">CONTRATO DE ARRENDAMENTO</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{TIPO_IMOVEL}} — {{IMOVEL_LOCAL}}</p>
  <p>Entre os abaixo assinados:</p>
  <p><strong>SENHORIO:</strong> {{SENHORIO_NOME}}, portador do BI n.º {{SENHORIO_BI}}, residente em {{IMOVEL_LOCAL}}.</p>
  <p><strong>INQUILINO:</strong> {{INQUILINO_NOME}}, portador do BI n.º {{INQUILINO_BI}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Senhorio,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{SENHORIO_NOME}}</p></div>
    <div><p>O Inquilino,</p><div style="margin-top:24pt;border-top:1px solid #000;width:160pt"></div><p>{{INQUILINO_NOME}}</p></div>
  </div>
</div>`,
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm 25mm 30mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;margin-bottom:6pt;border-top:2px solid #000;border-bottom:2px solid #000;padding:6pt 0}
        h2{font-size:12pt;font-weight:bold;margin-top:18pt;counter-increment:clause;text-transform:uppercase}
        p{text-align:justify;margin-bottom:8pt}
        li{margin-bottom:5pt;text-align:justify}`,
    },
    {
      id: 'arrend-moderno',
      name: 'Moderno Residencial',
      description: 'Layout limpo e acessível para senhorios particulares',
      preview: { accent: '#f59e0b', bg: '#fffbeb', font: 'sans-serif', headerBg: '#f59e0b', headerColor: '#000' },
      htmlTemplate: `
<div class="arr-page">
  <header class="arr-header">
    <h1 class="arr-titulo">Contrato de Arrendamento</h1>
    <p class="arr-subtitulo">{{TIPO_IMOVEL}} · {{IMOVEL_LOCAL}}</p>
  </header>
  <section class="arr-partes">
    <div class="arr-parte"><span class="arr-parte-label">Senhorio</span><p class="arr-parte-nome">{{SENHORIO_NOME}}</p><p class="arr-parte-bi">BI: {{SENHORIO_BI}}</p></div>
    <div class="arr-parte"><span class="arr-parte-label">Inquilino</span><p class="arr-parte-nome">{{INQUILINO_NOME}}</p><p class="arr-parte-bi">BI: {{INQUILINO_BI}}</p></div>
  </section>
  <section class="arr-clausulas">{{CLAUSULAS}}</section>
  <section class="arr-assinaturas">
    <div class="arr-assin"><p class="arr-assin-label">O Senhorio</p><div class="arr-assin-linha"></div><p>{{SENHORIO_NOME}}</p></div>
    <div class="arr-assin"><p class="arr-assin-label">O Inquilino</p><div class="arr-assin-linha"></div><p>{{INQUILINO_NOME}}</p></div>
  </section>
</div>`,
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1c1917;padding:25mm}
        h1{font-size:17pt;font-weight:800;color:#b45309;margin-bottom:4pt}
        h2{font-size:12pt;font-weight:700;color:#b45309;background:#fffbeb;border-left:4px solid #f59e0b;padding:4pt 10pt;margin-top:16pt}
        p{text-align:justify;margin-bottom:8pt}
        .partes{background:#fffbeb;border:1px solid #fde68a;padding:12pt;border-radius:4pt;margin:12pt 0}`,
    },
    {
      id: 'arrend-comercial',
      name: 'Comercial / Loja',
      description: 'Adaptado para arrendamento de espaços comerciais',
      preview: { accent: '#0f172a', bg: '#f8fafc', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#0f172a;padding:25mm}
        h1{font-size:16pt;font-weight:800;text-align:center;border:2px solid #0f172a;padding:10pt;margin-bottom:18pt}
        h2{font-size:11pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #0f172a;padding-bottom:3pt;margin-top:16pt;color:#0f172a}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'arrend-simplificado',
      name: 'Simplificado Popular',
      description: 'Linguagem clara para acordo entre particulares',
      preview: { accent: '#16a34a', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#16a34a', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11.5pt;line-height:1.7;color:#14532d;padding:22mm}
        h1{font-size:16pt;font-weight:800;color:#16a34a;border-bottom:3px solid #16a34a;padding-bottom:6pt;margin-bottom:14pt}
        h2{font-size:12pt;font-weight:700;color:#15803d;margin-top:14pt}
        .box{border:1px solid #86efac;background:#f0fdf4;padding:10pt;margin:10pt 0;border-radius:4pt}`,
    },
    {
      id: 'arrend-bilingual',
      name: 'Bilingue PT/EN',
      description: 'Para expatriados e contratos internacionais em Moçambique',
      preview: { accent: '#6366f1', bg: '#eef2ff', font: 'sans-serif', headerBg: '#6366f1', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.5;color:#1e1b4b;padding:22mm}
        h1{font-size:15pt;font-weight:800;color:#6366f1;text-align:center;border-bottom:2px solid #6366f1;padding-bottom:6pt;margin-bottom:16pt}
        h2{font-size:11pt;font-weight:700;color:#4f46e5;margin-top:14pt;background:#eef2ff;padding:3pt 8pt}
        p{margin-bottom:8pt;text-align:justify}
        em{color:#4f46e5}`,
    },
];
