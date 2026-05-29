// assets/js/marketplace/TemplateLibrary.js
// Biblioteca de templates para todos os serviços — arquitectura extensível
// Cada template define: id, name, description, category, cssVars, previewCss
// Nenhuma function Vercel adicional — tudo client-side

export const TEMPLATE_LIBRARY = {

  // ═══════════════════════════════════════════════════════════════════════
  // TRABALHO ESCOLAR
  // ═══════════════════════════════════════════════════════════════════════
  trabalho: [
    {
      id: 'trabalho-academico',
      name: 'Académico Clássico',
      description: 'Times New Roman, margens APA, numeração de páginas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
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
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // CURRÍCULO (CV)
  // ═══════════════════════════════════════════════════════════════════════
  cv: [
    {
      id: 'cv-classico',
      name: 'Clássico Profissional',
      description: 'Layout tradicional, ideal para cargos formais e empresas estabelecidas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      // CSS linear-safe: funciona com h1/h2/p/ul gerados pelo markdown
      htmlTemplate: `
<div class="cv-page">
  <header class="cv-header">
    <h1 class="cv-name">{{NOME}}</h1>
    <p class="cv-subtitle">{{CARGO}} · {{CONTACTO}} · {{EMAIL}} · {{LOCALIZACAO}}</p>
  </header>
  <section class="cv-section">
    <h2 class="cv-section-title">Objectivo Profissional</h2>
    <p class="cv-text">{{OBJECTIVO}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Formação Académica</h2>
    <div class="cv-entries">{{FORMACAO}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Experiência Profissional</h2>
    <div class="cv-entries">{{EXPERIENCIA}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Realização de Destaque</h2>
    <p class="cv-text">{{REALIZACAO}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Competências Técnicas</h2>
    <p class="cv-text">{{HABILIDADES}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Línguas</h2>
    <div class="cv-entries">{{LINGUAS}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Referências</h2>
    <p class="cv-text">Disponíveis mediante solicitação.</p>
  </section>
</div>`,
      css: `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Times New Roman', serif;
          font-size: 11pt; line-height: 1.5; color: #111;
          padding: 18mm 22mm; background: #fff; width: 210mm;
        }
        h1 {
          font-size: 20pt; font-weight: bold; text-align: center;
          letter-spacing: 2px; color: #1e3a5f;
          border-bottom: 2.5px solid #1e3a5f;
          padding-bottom: 7pt; margin-bottom: 5pt;
        }
        /* Cargo / subtítulo — parágrafo logo abaixo do h1 */
        h1 + p {
          text-align: center; font-size: 10.5pt; color: #4b5563;
          margin-bottom: 10pt;
        }
        h2 {
          font-size: 11pt; font-weight: bold; text-transform: uppercase;
          letter-spacing: 1.2px; color: #1e3a5f;
          border-bottom: 1px solid #1e3a5f;
          margin-top: 14pt; margin-bottom: 5pt; padding-bottom: 2pt;
        }
        h3 { font-size: 10.5pt; font-weight: bold; margin-top: 7pt; margin-bottom: 1pt; }
        p { margin-bottom: 4pt; }
        ul { padding-left: 16pt; margin-bottom: 5pt; }
        li { margin-bottom: 2pt; }
        hr { border: none; border-top: 1px solid #d1d5db; margin: 8pt 0; }
        strong { color: #1e3a5f; }
      `,
    },
    {
      id: 'cv-moderno',
      name: 'Moderno Colorido',
      description: 'Cabeçalho azul, design contemporâneo para áreas criativas',
      preview: { accent: '#0ea5e9', bg: '#f0f9ff', font: 'sans-serif', headerBg: '#0ea5e9', headerColor: '#fff' },
      // Cabeçalho azul cobrindo nome + cargo via h1 e h1+p
      htmlTemplate: `
<div class="cv-page">
  <header class="cv-header">
    <h1 class="cv-name">{{NOME}}</h1>
    <p class="cv-subtitle">{{CARGO}} · {{CONTACTO}} · {{EMAIL}} · {{LOCALIZACAO}}</p>
  </header>
  <div class="cv-body">
    <section class="cv-section">
      <h2 class="cv-section-title">Objectivo Profissional</h2>
      <p class="cv-text">{{OBJECTIVO}}</p>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Experiência Profissional</h2>
      <div class="cv-entries">{{EXPERIENCIA}}</div>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Formação Académica</h2>
      <div class="cv-entries">{{FORMACAO}}</div>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Realização de Destaque</h2>
      <p class="cv-text">{{REALIZACAO}}</p>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Competências Técnicas</h2>
      <p class="cv-text">{{HABILIDADES}}</p>
    </section>
    <div class="cv-two-col-bottom">
      <section class="cv-section">
        <h2 class="cv-section-title">Línguas</h2>
        <div class="cv-entries">{{LINGUAS}}</div>
      </section>
    </div>
  </div>
</div>`,
      css: `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: Arial, sans-serif; font-size: 10.5pt;
          line-height: 1.5; color: #0f172a; background: #fff; width: 210mm;
        }
        h1 {
          font-size: 22pt; font-weight: 800; color: #fff;
          background: #0284c7; padding: 20pt 22pt 4pt; letter-spacing: -0.5px;
        }
        h1 + p {
          background: #0284c7; color: rgba(255,255,255,.88);
          padding: 2pt 22pt 16pt; font-size: 10.5pt;
          border-bottom: 4px solid #38bdf8;
        }
        h2 {
          font-size: 10pt; font-weight: 700; color: #0284c7;
          text-transform: uppercase; letter-spacing: 1px;
          border-bottom: 2px solid #bae6fd;
          margin: 14pt 22pt 5pt; padding-bottom: 3pt;
        }
        h3 { font-size: 10pt; font-weight: 700; margin: 8pt 22pt 1pt; color: #0f172a; }
        p { margin: 0 22pt 5pt; font-size: 9.5pt; }
        ul, ol { margin: 2pt 22pt 6pt; padding-left: 16pt; }
        li { margin-bottom: 2pt; font-size: 9.5pt; }
        hr { border: none; border-top: 1px solid #e0f2fe; margin: 6pt 22pt; }
        strong { color: #0c4a6e; }
      `,
    },
    {
      id: 'cv-executivo',
      name: 'Executivo Premium',
      description: 'Design sofisticado com barra lateral escura, para liderança e gestão',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'sans-serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      // Barra lateral azul-escura simulada com border-left largo no body
      // Sem flexbox/grid — funciona com HTML linear puro
      htmlTemplate: `
<div class="cv-page cv-two-col">
  <aside class="cv-sidebar">
    <div class="cv-sidebar-photo">
      <div class="cv-photo-placeholder">{{INICIAIS}}</div>
    </div>
    <div class="cv-sidebar-block">
      <h3 class="cv-sidebar-title">Resumo Profissional</h3>
      <p class="cv-sidebar-text">{{OBJECTIVO}}</p>
    </div>
    <div class="cv-sidebar-block">
      <h3 class="cv-sidebar-title">Competências</h3>
      <ul class="cv-sidebar-list">{{HABILIDADES_LIST}}</ul>
    </div>
    <div class="cv-sidebar-block">
      <h3 class="cv-sidebar-title">Línguas</h3>
      <div class="cv-lang-entries">{{LINGUAS}}</div>
    </div>
    <div class="cv-sidebar-block">
      <h3 class="cv-sidebar-title">Contacto</h3>
      <p class="cv-sidebar-text">📞 {{CONTACTO}}</p>
      <p class="cv-sidebar-text">✉️ {{EMAIL}}</p>
      <p class="cv-sidebar-text">📍 {{LOCALIZACAO}}</p>
    </div>
  </aside>
  <main class="cv-main">
    <header class="cv-main-header">
      <h1 class="cv-name">{{NOME}}</h1>
      <p class="cv-cargo">{{CARGO}}</p>
    </header>
    <section class="cv-section">
      <h2 class="cv-section-title">Experiência Profissional</h2>
      <div class="cv-entries">{{EXPERIENCIA}}</div>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Formação Académica</h2>
      <div class="cv-entries">{{FORMACAO}}</div>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Realização de Destaque</h2>
      <p class="cv-text">{{REALIZACAO}}</p>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Informação Adicional</h2>
      <div class="cv-entries">{{EXTRA}}</div>
    </section>
  </main>
</div>`,
      css: `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cv-page.cv-two-col {
          display: flex; flex-direction: row;
          width: 210mm; min-height: 297mm;
          font-family: Calibri, Arial, sans-serif;
          font-size: 10.5pt; line-height: 1.5; color: #1f2937;
          background: #fff;
        }
        .cv-sidebar {
          width: 58mm; min-height: 297mm;
          background: #1e3a5f; color: #fff;
          padding: 24pt 14pt 24pt 14pt;
          flex-shrink: 0;
        }
        .cv-sidebar-photo { text-align: center; margin-bottom: 16pt; }
        .cv-photo-placeholder {
          width: 60pt; height: 60pt; border-radius: 50%;
          background: rgba(255,255,255,.18); border: 2px solid rgba(255,255,255,.4);
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 22pt; font-weight: 800; color: #fff;
        }
        .cv-sidebar-block { margin-bottom: 16pt; }
        .cv-sidebar-title {
          font-size: 9pt; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.5px; color: #93c5fd;
          border-bottom: 1px solid rgba(255,255,255,.2);
          padding-bottom: 4pt; margin-bottom: 7pt;
        }
        .cv-sidebar-text { font-size: 9pt; color: rgba(255,255,255,.88); margin-bottom: 4pt; line-height: 1.5; }
        .cv-sidebar-list { padding-left: 12pt; list-style: disc; }
        .cv-sidebar-list li { font-size: 9pt; color: rgba(255,255,255,.85); margin-bottom: 3pt; }
        .cv-main {
          flex: 1; padding: 24pt 18pt 24pt 18pt;
        }
        .cv-main-header { margin-bottom: 14pt; padding-bottom: 10pt; border-bottom: 2px solid #1e3a5f; }
        .cv-name { font-size: 22pt; font-weight: 800; color: #1e3a5f; letter-spacing: 0.5px; margin-bottom: 3pt; }
        .cv-cargo { font-size: 11pt; color: #4b5563; }
        .cv-section { margin-bottom: 14pt; }
        .cv-section-title {
          font-size: 10pt; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.5px; color: #1e3a5f;
          border-bottom: 1.5px solid #1e3a5f;
          padding-bottom: 2pt; margin-bottom: 7pt;
        }
        .cv-text { font-size: 9.5pt; color: #374151; margin-bottom: 4pt; line-height: 1.5; }
        .cv-header { display: none; }
        .cv-entries { display: flex; flex-direction: column; gap: 6pt; }
        .cv-entry { margin-bottom: 6pt; }
        .cv-entry-date { font-size: 8.5pt; color: #6b7280; }
        .cv-entry-title { font-size: 10pt; font-weight: 700; color: #1e3a5f; }
        .cv-entry-company { font-size: 9.5pt; font-weight: 700; }
        .cv-entry-sub { font-size: 9.5pt; color: #6b7280; margin-bottom: 2pt; }
        ul.cv-entry-bullets { padding-left: 12pt; margin-top: 3pt; list-style: disc; }
        ul.cv-entry-bullets li { font-size: 9pt; color: #374151; margin-bottom: 2pt; }
        .cv-lang-bar { height: 4pt; background: rgba(255,255,255,.2); border-radius: 2pt; margin-top: 2pt; }
        .cv-lang-fill { height: 100%; background: #93c5fd; border-radius: 2pt; }
      `,
    },
    {
      id: 'cv-jovem',
      name: 'Jovem Dinâmico',
      description: 'Design fresco e enérgico para primeiro emprego e jovens profissionais',
      preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#10b981', headerColor: '#fff' },
      htmlTemplate: `
<div class="cv-page">
  <header class="cv-header">
    <h1 class="cv-name">{{NOME}}</h1>
    <p class="cv-subtitle">{{CARGO}} · {{CONTACTO}} · {{EMAIL}} · {{LOCALIZACAO}}</p>
  </header>
  <section class="cv-section">
    <h2 class="cv-section-title">Objectivo Profissional</h2>
    <p class="cv-text">{{OBJECTIVO}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Formação Académica</h2>
    <div class="cv-entries">{{FORMACAO}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Experiências / Estágios / Voluntariado</h2>
    <div class="cv-entries">{{EXPERIENCIA}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Competências Técnicas</h2>
    <p class="cv-text">{{HABILIDADES}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Línguas</h2>
    <div class="cv-entries">{{LINGUAS}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Referências</h2>
    <p class="cv-text">Disponíveis mediante solicitação.</p>
  </section>
</div>`,
      css: `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 10.5pt; line-height: 1.5; color: #064e3b;
          padding: 18mm; background: #fff; width: 210mm;
        }
        h1 {
          font-size: 22pt; font-weight: 900; color: #10b981;
          text-align: center; letter-spacing: -0.5px; margin-bottom: 4pt;
        }
        h1 + p {
          text-align: center; color: #065f46; font-size: 10.5pt;
          margin-bottom: 12pt; padding-bottom: 10pt;
          border-bottom: 2px solid #a7f3d0;
        }
        h2 {
          font-size: 10.5pt; font-weight: 700; color: #fff;
          background: #10b981; padding: 3pt 10pt;
          margin-top: 14pt; margin-bottom: 5pt; border-radius: 3pt;
          display: block; width: fit-content;
        }
        h3 { font-size: 10pt; font-weight: 700; color: #047857; margin-top: 7pt; }
        p { color: #065f46; margin-bottom: 4pt; }
        ul { padding-left: 15pt; margin-bottom: 5pt; }
        li { color: #047857; margin-bottom: 2pt; }
        hr { border: none; border-top: 1px solid #a7f3d0; margin: 8pt 0; }
        strong { color: #064e3b; font-weight: 700; }
      `,
    },
    {
      id: 'cv-academia',
      name: 'Académico / Docente',
      description: 'Para professores, investigadores, candidaturas a bolsas',
      preview: { accent: '#7c3aed', bg: '#fff', font: 'serif', headerBg: '#4c1d95', headerColor: '#fff' },
      htmlTemplate: `
<div class="cv-page">
  <header class="cv-header">
    <h1 class="cv-name">{{NOME}}</h1>
    <p class="cv-subtitle">{{CARGO}} · {{CONTACTO}} · {{EMAIL}} · {{LOCALIZACAO}}</p>
  </header>
  <section class="cv-section">
    <h2 class="cv-section-title">Sumário Académico</h2>
    <p class="cv-text">{{OBJECTIVO}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Formação Académica</h2>
    <div class="cv-entries">{{FORMACAO}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Experiência Docente / Investigação</h2>
    <div class="cv-entries">{{EXPERIENCIA}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Publicações e Realizações</h2>
    <p class="cv-text">{{REALIZACAO}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Competências</h2>
    <p class="cv-text">{{HABILIDADES}}</p>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Línguas</h2>
    <div class="cv-entries">{{LINGUAS}}</div>
  </section>
  <section class="cv-section">
    <h2 class="cv-section-title">Referências</h2>
    <p class="cv-text">Disponíveis mediante solicitação.</p>
  </section>
</div>`,
      css: `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Times New Roman', serif;
          font-size: 11pt; line-height: 1.6; color: #000;
          padding: 22mm 28mm; background: #fff; width: 210mm;
        }
        h1 {
          font-size: 17pt; text-align: center; font-weight: bold;
          font-variant: small-caps; letter-spacing: 2px;
          margin-bottom: 4pt; color: #000;
        }
        h1 + p {
          text-align: center; font-size: 10pt; color: #4c1d95;
          margin-bottom: 14pt;
        }
        h2 {
          font-size: 11.5pt; font-weight: bold; font-variant: small-caps;
          letter-spacing: 1px; border-bottom: 1px solid #000;
          margin-top: 16pt; margin-bottom: 5pt; padding-bottom: 2pt;
          color: #000;
        }
        h3 { font-size: 10.5pt; font-style: italic; margin-top: 8pt; }
        p { text-align: justify; margin-bottom: 5pt; }
        ul { padding-left: 18pt; margin-bottom: 6pt; }
        li { margin-bottom: 3pt; }
        hr { border: none; border-top: 0.5px solid #888; margin: 8pt 0; }
      `,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // CARTA FORMAL
  // ═══════════════════════════════════════════════════════════════════════
  carta: [
    {
      id: 'carta-formal-classica',
      name: 'Formal Clássica',
      description: 'Estrutura tradicional, tom oficial e respeitoso',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm}
        h1{font-size:13pt;text-align:center;font-weight:bold;margin-bottom:20pt;text-transform:uppercase}
        p{margin-bottom:10pt;text-align:justify}
        .assinatura{margin-top:40pt}`,
    },
    {
      id: 'carta-corporativa',
      name: 'Corporativa com Timbrado',
      description: 'Faixa de cabeçalho colorida, ideal para empresas',
      preview: { accent: '#1d4ed8', bg: '#fff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:0}
        h1{background:#1d4ed8;color:#fff;padding:18pt 25pt;font-size:14pt;margin:0 0 20pt}
        p{padding:0 25pt;margin-bottom:10pt;text-align:justify}
        h2{padding:0 25pt;font-size:11pt;color:#1d4ed8}`,
    },
    {
      id: 'carta-ministerial',
      name: 'Ministerial / Governo',
      description: 'Formato para comunicações com entidades públicas e ministérios',
      preview: { accent: '#006633', bg: '#fff', font: 'serif', headerBg: '#006633', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:25mm 25mm 20mm 35mm}
        h1{font-size:13pt;text-align:center;font-weight:bold;border-top:2px solid #006633;border-bottom:2px solid #006633;padding:6pt 0;margin-bottom:18pt;color:#006633;text-transform:uppercase}
        p{margin-bottom:10pt;text-align:justify}`,
    },
    {
      id: 'carta-moderna',
      name: 'Moderna e Limpa',
      description: 'Design contemporâneo para candidaturas e comunicações profissionais',
      preview: { accent: '#0f172a', bg: '#f8fafc', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.7;color:#334155;padding:28mm}
        h1{font-size:13pt;font-weight:700;color:#0f172a;border-left:4px solid #0f172a;padding-left:12pt;margin-bottom:20pt}
        p{margin-bottom:12pt;text-align:justify}
        strong{color:#0f172a}`,
    },
    {
      id: 'carta-candidatura',
      name: 'Carta de Candidatura',
      description: 'Optimizada para candidaturas a emprego, com espaço para realização pessoal',
      preview: { accent: '#0ea5e9', bg: '#f0f9ff', font: 'sans-serif', headerBg: '#0ea5e9', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#0c4a6e;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#0ea5e9;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:600;color:#0369a1;margin-bottom:16pt;font-style:italic}
        p{margin-bottom:10pt;text-align:justify;color:#0c4a6e}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // ORÇAMENTO DE OBRA
  // ═══════════════════════════════════════════════════════════════════════
  orcamento: [
    {
      id: 'orcamento-profissional',
      name: 'Profissional Detalhado',
      description: 'Tabelas de itens, subtotais e condições de pagamento',
      preview: { accent: '#f59e0b', bg: '#fffbeb', font: 'sans-serif', headerBg: '#f59e0b', headerColor: '#000' },
      css: `body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1c1917;padding:20mm}
        h1{font-size:18pt;font-weight:800;color:#b45309;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;background:#fef3c7;padding:4pt 8pt;margin-top:14pt;border-left:4px solid #f59e0b}
        table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:10pt}
        th{background:#f59e0b;color:#000;padding:5pt 7pt;text-align:left;font-weight:700}
        td{border:1px solid #d97706;padding:4pt 7pt}
        tr:nth-child(even) td{background:#fffbeb}
        .total{font-weight:800;background:#fef3c7!important;font-size:11pt}`,
    },
    {
      id: 'orcamento-simples',
      name: 'Simples e Directo',
      description: 'Para pequenas obras, remodelações e reparações',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:22mm}
        h1{font-size:16pt;font-weight:800;padding:12pt;background:#0f172a;color:#fff;margin:-22mm -22mm 18pt;padding:14pt 22mm}
        h2{font-size:11pt;font-weight:700;color:#0f172a;margin-top:14pt;text-transform:uppercase;letter-spacing:.5px}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#1e293b;color:#fff;padding:5pt 8pt;font-size:10pt}
        td{border-bottom:1px solid #e2e8f0;padding:5pt 8pt}`,
    },
    {
      id: 'orcamento-construtora',
      name: 'Construtora Formal',
      description: 'Logo e identidade visual para empresas de construção',
      preview: { accent: '#dc2626', bg: '#fff', font: 'sans-serif', headerBg: '#dc2626', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1c1917;padding:20mm}
        h1{color:#dc2626;font-size:20pt;font-weight:800;border-bottom:3px solid #dc2626;padding-bottom:6pt;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.5px;margin-top:14pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#dc2626;color:#fff;padding:5pt 7pt}
        td{border:1px solid #fca5a5;padding:4pt 7pt}
        tr:last-child td{font-weight:800;border-top:2px solid #dc2626}`,
    },
    {
      id: 'orcamento-engenharia',
      name: 'Engenharia Técnica',
      description: 'Colunas de quantidade, unidade, preço unitário e total',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:#0f172a;padding:20mm}
        h1{font-size:14pt;font-weight:800;text-align:center;color:#1d4ed8;border:2px solid #1d4ed8;padding:8pt;margin-bottom:16pt}
        h2{font-size:10.5pt;font-weight:700;color:#1e40af;background:#eff6ff;padding:4pt 8pt;border-left:4px solid #1d4ed8;margin-top:12pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:9.5pt}
        th{background:#1d4ed8;color:#fff;padding:4pt 6pt;font-size:9pt}
        td{border:1px solid #bfdbfe;padding:3pt 6pt}`,
    },
    {
      id: 'orcamento-mpesa',
      name: 'Pequeno Negócio M-Pesa',
      description: 'Directo ao ponto com QR M-Pesa e referência de pagamento',
      preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#10b981', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#064e3b;padding:20mm}
        h1{font-size:16pt;font-weight:800;color:#10b981;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;color:#065f46;border-bottom:2px solid #10b981;padding-bottom:3pt;margin-top:14pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#10b981;color:#fff;padding:5pt 8pt}
        td{border:1px solid #6ee7b7;padding:4pt 8pt}
        .total-row td{background:#d1fae5;font-weight:800;font-size:12pt}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // CONTRATO DE ARRENDAMENTO
  // ═══════════════════════════════════════════════════════════════════════
  arrendamento: [
    {
      id: 'arrend-legal',
      name: 'Jurídico Formal',
      description: 'Formato notarial, artigos numerados, cláusulas legais completas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
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
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // CONTRATO PRESTAÇÃO DE SERVIÇOS
  // ═══════════════════════════════════════════════════════════════════════
  prestacao: [
    {
      id: 'prest-juridico',
      name: 'Jurídico Completo',
      description: 'Artigos, cláusulas penais, propriedade intelectual',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:28mm 25mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;border-top:2px solid #1e3a5f;border-bottom:2px solid #1e3a5f;padding:6pt 0;margin-bottom:16pt;color:#1e3a5f}
        h2{font-size:12pt;font-weight:bold;text-transform:uppercase;margin-top:16pt}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'prest-freelancer',
      name: 'Freelancer Simples',
      description: 'Para prestadores individuais, designers, consultores',
      preview: { accent: '#8b5cf6', bg: '#f5f3ff', font: 'sans-serif', headerBg: '#8b5cf6', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1e1b4b;padding:24mm}
        h1{font-size:18pt;font-weight:800;color:#8b5cf6;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;color:#6d28d9;background:#f5f3ff;border-left:4px solid #8b5cf6;padding:4pt 10pt;margin-top:14pt}
        p{text-align:justify;margin-bottom:8pt}
        .destaque{border:1px solid #c4b5fd;background:#faf5ff;padding:10pt;margin:10pt 0}`,
    },
    {
      id: 'prest-empresa',
      name: 'Empresa para Empresa',
      description: 'B2B formal com NUIT, cláusulas de confidencialidade',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:25mm}
        h1{font-size:15pt;font-weight:800;text-align:center;border:2px solid #0f172a;padding:8pt;margin-bottom:16pt}
        h2{font-size:11pt;font-weight:700;background:#f1f5f9;padding:4pt 8pt;border-left:4px solid #0f172a;margin-top:14pt}
        p{text-align:justify;margin-bottom:7pt}`,
    },
    {
      id: 'prest-construcao',
      name: 'Construção e Obra',
      description: 'Para empreiteiros, técnicos e obras de construção civil',
      preview: { accent: '#ea580c', bg: '#fff7ed', font: 'sans-serif', headerBg: '#ea580c', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#431407;padding:22mm}
        h1{font-size:16pt;font-weight:800;color:#ea580c;border-bottom:3px solid #ea580c;padding-bottom:6pt;margin-bottom:14pt}
        h2{font-size:11pt;font-weight:700;color:#c2410c;margin-top:14pt;text-transform:uppercase;letter-spacing:.3px}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#ea580c;color:#fff;padding:5pt}
        td{border:1px solid #fed7aa;padding:4pt 7pt}`,
    },
    {
      id: 'prest-ti',
      name: 'Tecnologia e TI',
      description: 'Para desenvolvimento de software, consultoria e suporte técnico',
      preview: { accent: '#0ea5e9', bg: '#f0f9ff', font: 'sans-serif', headerBg: '#0ea5e9', headerColor: '#fff' },
      css: `body{font-family:Consolas,'Courier New',monospace;font-size:10.5pt;line-height:1.6;color:#0c4a6e;padding:24mm}
        h1{font-family:Arial,sans-serif;font-size:16pt;font-weight:800;color:#0ea5e9;border-bottom:2px solid #0ea5e9;padding-bottom:5pt;margin-bottom:14pt}
        h2{font-family:Arial,sans-serif;font-size:11pt;font-weight:700;color:#0369a1;background:#f0f9ff;padding:4pt 8pt;margin-top:14pt}
        p{font-family:Arial,sans-serif;text-align:justify;margin-bottom:8pt}
        code{background:#f0f9ff;padding:1pt 4pt;border-radius:2pt;font-size:10pt}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // PROCURAÇÃO / MANDATO
  // ═══════════════════════════════════════════════════════════════════════
  procuracao: [
    {
      id: 'proc-notarial',
      name: 'Notarial Formal',
      description: 'Formato reconhecido para Conservatória, bancos e tribunais',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm 25mm 30mm}
        h1{font-size:15pt;text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:2px;margin-bottom:20pt;border-bottom:2px solid #000;padding-bottom:6pt}
        p{text-align:justify;margin-bottom:10pt}
        .assinatura{margin-top:50pt;border-top:1px solid #000;padding-top:6pt}`,
    },
    {
      id: 'proc-bancaria',
      name: 'Bancária',
      description: 'Para levantamento, transferências e operações bancárias',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e3a8a;padding:25mm}
        h1{font-size:16pt;font-weight:800;color:#1d4ed8;border-bottom:3px solid #1d4ed8;padding-bottom:6pt;margin-bottom:16pt}
        .ref-box{background:#eff6ff;border:1px solid #bfdbfe;padding:10pt;margin:12pt 0;font-family:monospace}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'proc-geral',
      name: 'Geral Simples',
      description: 'Para actos do quotidiano, repartições e escolas',
      preview: { accent: '#0f172a', bg: '#f8fafc', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11.5pt;line-height:1.6;color:#0f172a;padding:25mm}
        h1{font-size:16pt;font-weight:800;text-align:center;margin-bottom:18pt;padding:8pt;border:2px solid #0f172a}
        p{text-align:justify;margin-bottom:10pt}
        .partes{background:#f8fafc;border-left:4px solid #0f172a;padding:10pt;margin:12pt 0}`,
    },
    {
      id: 'proc-imovel',
      name: 'Venda de Imóvel / DUAT',
      description: 'Para transacções imobiliárias e transferência de DUAT',
      preview: { accent: '#b45309', bg: '#fffbeb', font: 'serif', headerBg: '#b45309', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#1c1917;padding:28mm 25mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;color:#b45309;border-bottom:2px solid #b45309;padding-bottom:6pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}
        .imovel-box{background:#fffbeb;border:1px solid #fde68a;padding:12pt;margin:10pt 0}`,
    },
    {
      id: 'proc-judicial',
      name: 'Judicial',
      description: 'Para representação em tribunais e processos judiciais',
      preview: { accent: '#7f1d1d', bg: '#fff', font: 'serif', headerBg: '#7f1d1d', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#000;padding:30mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:1px;border:2px double #7f1d1d;padding:8pt;margin-bottom:18pt;color:#7f1d1d}
        p{text-align:justify;margin-bottom:10pt}
        .poderes{border-left:4px solid #7f1d1d;padding-left:14pt;margin:12pt 0;font-style:italic}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // REQUERIMENTO OFICIAL
  // ═══════════════════════════════════════════════════════════════════════
  requerimento: [
    {
      id: 'req-formal',
      name: 'Formal Padrão',
      description: 'Formato padrão aceite em todas as repartições públicas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm 25mm 35mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;margin-bottom:20pt}
        p{text-align:justify;margin-bottom:10pt;text-indent:1.25cm}
        .assunto{font-weight:bold;text-transform:uppercase;text-indent:0}`,
    },
    {
      id: 'req-escola',
      name: 'Escolar / Académico',
      description: 'Para matrículas, certidões e pedidos a escolas e universidades',
      preview: { accent: '#2563eb', bg: '#eff6ff', font: 'sans-serif', headerBg: '#2563eb', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1e3a8a;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:5pt;margin-bottom:16pt}
        p{margin-bottom:10pt;text-align:justify}
        .info-box{background:#eff6ff;border:1px solid #bfdbfe;padding:10pt;border-radius:4pt;margin:12pt 0}`,
    },
    {
      id: 'req-saude',
      name: 'Saúde / Hospital',
      description: 'Para hospitais, centros de saúde e MISAU',
      preview: { accent: '#0891b2', bg: '#ecfeff', font: 'sans-serif', headerBg: '#0891b2', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#164e63;padding:24mm}
        h1{font-size:15pt;font-weight:800;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:5pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}`,
    },
    {
      id: 'req-migracao',
      name: 'Migração / Passaporte',
      description: 'Para DIRE, passaporte, visto e serviços de migração',
      preview: { accent: '#006633', bg: '#fff', font: 'sans-serif', headerBg: '#006633', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#064e3b;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#006633;border-bottom:2px solid #006633;padding-bottom:6pt;margin-bottom:16pt;text-transform:uppercase}
        p{text-align:justify;margin-bottom:10pt}
        .ref{font-size:10pt;color:#6b7280;font-style:italic;margin-bottom:14pt}`,
    },
    {
      id: 'req-finanças',
      name: 'Finanças / AT',
      description: 'Para repartições fiscais, NUIT e questões tributárias',
      preview: { accent: '#0f172a', bg: '#fff', font: 'serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:28mm 25mm}
        h1{font-size:13pt;font-weight:bold;text-align:center;text-transform:uppercase;margin-bottom:18pt;border:1px solid #000;padding:6pt}
        p{text-align:justify;margin-bottom:10pt}
        .fundamento{border-left:4px solid #0f172a;padding-left:12pt;margin:12pt 0}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // DECLARAÇÃO DE RESIDÊNCIA
  // ═══════════════════════════════════════════════════════════════════════
  residencia: [
    {
      id: 'resid-junta',
      name: 'Junta de Bairro',
      description: 'Emitido pelo presidente de bairro ou quarteirão',
      preview: { accent: '#166534', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#166534', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11.5pt;line-height:1.6;color:#14532d;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#166534;border-bottom:3px solid #16a34a;padding-bottom:5pt;margin-bottom:16pt;text-align:center;text-transform:uppercase}
        p{text-align:justify;margin-bottom:10pt}
        .stamp-area{border:2px dashed #86efac;padding:16pt;margin:16pt 0;text-align:center;color:#6b7280;font-style:italic}`,
    },
    {
      id: 'resid-formal',
      name: 'Declaração Formal',
      description: 'Para bancos, candidaturas e organismos oficiais',
      preview: { accent: '#1d4ed8', bg: '#fff', font: 'serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:28mm}
        h1{font-size:15pt;text-align:center;font-weight:bold;text-transform:uppercase;border-top:2px solid #000;border-bottom:2px solid #000;padding:5pt 0;margin-bottom:18pt;color:#1d4ed8}
        p{text-align:justify;margin-bottom:10pt;text-indent:1.25cm}`,
    },
    {
      id: 'resid-auto',
      name: 'Auto-Declaração',
      description: 'Declaração pessoal sob compromisso de honra',
      preview: { accent: '#7c3aed', bg: '#f5f3ff', font: 'sans-serif', headerBg: '#7c3aed', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.7;color:#1e1b4b;padding:24mm}
        h1{font-size:15pt;font-weight:800;color:#7c3aed;text-align:center;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}
        .compromisso{background:#f5f3ff;border:1px solid #c4b5fd;padding:12pt;margin:14pt 0;font-style:italic}`,
    },
    {
      id: 'resid-empresa',
      name: 'Confirmação Empresarial',
      description: 'Empresa confirma residência de colaborador',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:25mm}
        h1{font-size:15pt;font-weight:800;text-align:center;border-bottom:2px solid #0f172a;padding-bottom:6pt;margin-bottom:16pt;text-transform:uppercase}
        p{text-align:justify;margin-bottom:10pt}`,
    },
    {
      id: 'resid-bilhetão',
      name: 'Cópia Simplificada',
      description: 'Versão curta e directa para juntar a processos',
      preview: { accent: '#64748b', bg: '#f8fafc', font: 'sans-serif', headerBg: '#64748b', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#334155;padding:20mm}
        h1{font-size:14pt;font-weight:700;color:#0f172a;border-bottom:2px solid #94a3b8;padding-bottom:5pt;margin-bottom:14pt}
        p{margin-bottom:8pt}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // PLANO DE NEGÓCIOS
  // ═══════════════════════════════════════════════════════════════════════
  planonegocio: [
    {
      id: 'pln-banco',
      name: 'Banco / Financiamento',
      description: 'Estrutura exigida por BCI, Millennium e bancos moçambicanos',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e3a8a;padding:25mm}
        h1{font-size:20pt;font-weight:800;color:#1d4ed8;border-bottom:3px solid #1d4ed8;padding-bottom:6pt;margin-bottom:6pt}
        h2{font-size:12pt;font-weight:700;color:#1e40af;background:#eff6ff;padding:4pt 10pt;border-left:4px solid #1d4ed8;margin-top:16pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#1d4ed8;color:#fff;padding:5pt 7pt}
        td{border:1px solid #bfdbfe;padding:4pt 7pt}`,
    },
    {
      id: 'pln-startup',
      name: 'Startup / Incubadora',
      description: 'Modelo Lean Canvas adaptado para incubadoras moçambicanas',
      preview: { accent: '#f43f5e', bg: '#fff1f2', font: 'sans-serif', headerBg: '#f43f5e', headerColor: '#fff' },
      css: `body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1c0a0f;padding:22mm}
        h1{font-size:22pt;font-weight:900;color:#f43f5e;letter-spacing:-1px;margin-bottom:4pt}
        h2{font-size:12pt;font-weight:700;color:#e11d48;background:#fff1f2;border-left:4px solid #f43f5e;padding:4pt 10pt;margin-top:16pt}
        p{margin-bottom:8pt;text-align:justify}`,
    },
    {
      id: 'pln-ong',
      name: 'ONG / Projecto Social',
      description: 'Para proposta a doadores, INE e Governo',
      preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#10b981', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#064e3b;padding:24mm}
        h1{font-size:18pt;font-weight:800;color:#10b981;margin-bottom:4pt}
        h2{font-size:12pt;font-weight:700;color:#065f46;border-bottom:2px solid #10b981;padding-bottom:3pt;margin-top:14pt}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'pln-agricultura',
      name: 'Agronegócio',
      description: 'Para projectos agrícolas, FNDS, GAPI e cooperativas',
      preview: { accent: '#65a30d', bg: '#f7fee7', font: 'sans-serif', headerBg: '#65a30d', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1a2e05;padding:24mm}
        h1{font-size:17pt;font-weight:800;color:#4d7c0f;border-bottom:3px solid #65a30d;padding-bottom:6pt;margin-bottom:14pt}
        h2{font-size:11pt;font-weight:700;color:#3f6212;background:#f7fee7;padding:4pt 8pt;margin-top:14pt;border-left:4px solid #65a30d}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#65a30d;color:#fff;padding:5pt}
        td{border:1px solid #d9f99d;padding:4pt 7pt}`,
    },
    {
      id: 'pln-executivo',
      name: 'Sumário Executivo',
      description: 'Versão compacta para apresentação a investidores',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:24mm}
        h1{font-size:22pt;font-weight:800;letter-spacing:-1px;border-left:6px solid #f59e0b;padding-left:14pt;margin-bottom:6pt}
        h2{font-size:11pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-top:16pt;border-bottom:1px solid #e2e8f0;padding-bottom:3pt}
        p{text-align:justify;margin-bottom:7pt}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // RECIBO / FACTURA
  // ═══════════════════════════════════════════════════════════════════════
  recibo: [
    {
      id: 'recibo-simples',
      name: 'Recibo Simples',
      description: 'Compacto, directo, para pequenos negócios',
      preview: { accent: '#16a34a', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#16a34a', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#14532d;padding:18mm}
        h1{font-size:18pt;font-weight:800;color:#16a34a;border-bottom:3px solid #16a34a;padding-bottom:4pt;margin-bottom:12pt}
        .valor{font-size:22pt;font-weight:900;color:#15803d;text-align:right;margin:10pt 0}
        table{width:100%;border-collapse:collapse}
        th{background:#16a34a;color:#fff;padding:5pt 8pt}
        td{border-bottom:1px solid #bbf7d0;padding:5pt 8pt}`,
    },
    {
      id: 'recibo-factura',
      name: 'Factura Formal com IVA',
      description: 'NUIT, IVA 16%, referência fiscal para empresas',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1e293b;padding:16mm}
        h1{font-size:20pt;font-weight:800;color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:4pt}
        .header-info{display:flex;justify-content:space-between;margin:10pt 0;font-size:9.5pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:10pt}
        th{background:#1d4ed8;color:#fff;padding:5pt 6pt}
        td{border:1px solid #bfdbfe;padding:4pt 6pt}
        .total-row td{background:#eff6ff;font-weight:800;font-size:11pt}
        .iva-row td{font-size:9.5pt;color:#6b7280}`,
    },
    {
      id: 'recibo-loja',
      name: 'Loja / Comércio',
      description: 'Para lojas, mercearias e comércio local',
      preview: { accent: '#f59e0b', bg: '#fffbeb', font: 'sans-serif', headerBg: '#f59e0b', headerColor: '#000' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1c1917;padding:16mm}
        h1{font-size:18pt;font-weight:900;color:#b45309;text-align:center;border-bottom:2px solid #f59e0b;padding-bottom:5pt;margin-bottom:10pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#f59e0b;color:#000;padding:5pt;font-weight:700}
        td{border-bottom:1px solid #fde68a;padding:5pt 7pt}
        .total{font-weight:900;font-size:14pt;text-align:right;color:#b45309;border-top:2px solid #f59e0b;padding-top:8pt}`,
    },
    {
      id: 'recibo-proforma',
      name: 'Proforma',
      description: 'Orçamento-fatura antes da confirmação',
      preview: { accent: '#6366f1', bg: '#eef2ff', font: 'sans-serif', headerBg: '#6366f1', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e1b4b;padding:18mm}
        .proforma-badge{background:#fef9c3;color:#713f12;border:1px solid #fde047;padding:3pt 10pt;font-weight:700;font-size:10pt;display:inline-block;margin-bottom:8pt;border-radius:3pt}
        h1{font-size:18pt;font-weight:800;color:#6366f1;margin-bottom:4pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#6366f1;color:#fff;padding:5pt}
        td{border:1px solid #c7d2fe;padding:4pt 7pt}`,
    },
    {
      id: 'recibo-servico',
      name: 'Recibo de Serviço',
      description: 'Para reparações, limpeza, transporte e serviços avulsos',
      preview: { accent: '#0891b2', bg: '#ecfeff', font: 'sans-serif', headerBg: '#0891b2', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#164e63;padding:18mm}
        h1{font-size:17pt;font-weight:800;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:4pt;margin-bottom:12pt}
        .servico-desc{background:#ecfeff;border:1px solid #a5f3fc;padding:10pt;margin:10pt 0;border-radius:4pt}
        .valor-total{font-size:18pt;font-weight:900;color:#0e7490;text-align:right;margin-top:12pt}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // CARTA DE RECOMENDAÇÃO
  // ═══════════════════════════════════════════════════════════════════════
  recomendacao: [
    {
      id: 'rec-emprego',
      name: 'Recomendação Profissional',
      description: 'De superior para candidato a novo emprego',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm}
        h1{display:none}
        .remetente{margin-bottom:20pt;font-size:11pt}
        .destinatario{margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}
        .assinatura{margin-top:40pt}`,
    },
    {
      id: 'rec-academica',
      name: 'Recomendação Académica',
      description: 'Professor recomenda aluno para bolsa ou pós-graduação',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1e3a8a;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:5pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}
        .destaque{background:#eff6ff;border-left:4px solid #1d4ed8;padding:8pt 12pt;margin:10pt 0;font-style:italic}`,
    },
    {
      id: 'rec-institucional',
      name: 'Institucional',
      description: 'Empresa recomenda parceiro ou fornecedor',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:25mm}
        h1{font-size:15pt;font-weight:800;text-align:center;border-bottom:2px solid #0f172a;padding-bottom:6pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}`,
    },
    {
      id: 'rec-pessoal',
      name: 'Pessoal / Carácter',
      description: 'Recomendação de carácter por amigo ou mentor',
      preview: { accent: '#8b5cf6', bg: '#f5f3ff', font: 'sans-serif', headerBg: '#8b5cf6', headerColor: '#fff' },
      css: `body{font-family:Georgia,serif;font-size:12pt;line-height:1.7;color:#1e1b4b;padding:28mm}
        h1{font-size:15pt;font-weight:600;font-style:italic;color:#8b5cf6;text-align:center;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:12pt}
        blockquote{border-left:3px solid #8b5cf6;padding-left:14pt;font-style:italic;color:#4c1d95;margin:12pt 0}`,
    },
    {
      id: 'rec-bolsa',
      name: 'Bolsa / Intercâmbio',
      description: 'Para candidatura a bolsas internacionais',
      preview: { accent: '#0369a1', bg: '#f0f9ff', font: 'sans-serif', headerBg: '#0369a1', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#0c4a6e;padding:25mm}
        h1{font-size:16pt;font-weight:800;color:#0369a1;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:600;color:#0369a1;font-style:italic;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}
        .qualidades{background:#f0f9ff;border:1px solid #bae6fd;padding:10pt;margin:10pt 0}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // PEDIDO DE LICENÇA
  // ═══════════════════════════════════════════════════════════════════════
  licenca: [
    {
      id: 'lic-comercial',
      name: 'Licença Comercial',
      description: 'Pedido de alvará comercial para câmara municipal',
      preview: { accent: '#b45309', bg: '#fffbeb', font: 'sans-serif', headerBg: '#b45309', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1c1917;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#b45309;border-bottom:2px solid #b45309;padding-bottom:5pt;margin-bottom:16pt;text-transform:uppercase}
        p{text-align:justify;margin-bottom:10pt}
        .docs-list{background:#fffbeb;border:1px solid #fde68a;padding:10pt;border-radius:4pt}`,
    },
    {
      id: 'lic-construcao',
      name: 'Licença de Construção',
      description: 'Para DPOPH, câmara e direcção de obras',
      preview: { accent: '#dc2626', bg: '#fff7ed', font: 'sans-serif', headerBg: '#dc2626', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#431407;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#dc2626;border-bottom:2px solid #dc2626;padding-bottom:5pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}`,
    },
    {
      id: 'lic-evento',
      name: 'Autorização de Evento',
      description: 'Para concertos, festivais, conferências e eventos públicos',
      preview: { accent: '#7c3aed', bg: '#f5f3ff', font: 'sans-serif', headerBg: '#7c3aed', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e1b4b;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#7c3aed;border-bottom:2px solid #7c3aed;padding-bottom:5pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}
        .evento-info{background:#f5f3ff;border:1px solid #c4b5fd;padding:10pt;margin:10pt 0;border-radius:4pt}`,
    },
    {
      id: 'lic-transporte',
      name: 'Licença de Transporte',
      description: 'Para chapas, táxis e operadores de transporte',
      preview: { accent: '#0369a1', bg: '#f0f9ff', font: 'sans-serif', headerBg: '#0369a1', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#0c4a6e;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#0369a1;margin-bottom:16pt;border-bottom:2px solid #0369a1;padding-bottom:5pt}
        p{text-align:justify;margin-bottom:10pt}`,
    },
    {
      id: 'lic-ambiental',
      name: 'Licença Ambiental',
      description: 'Para MITADER, EIA e actividades sujeitas a licença ambiental',
      preview: { accent: '#16a34a', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#16a34a', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#14532d;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#16a34a;border-bottom:2px solid #16a34a;padding-bottom:5pt;margin-bottom:16pt}
        p{text-align:justify;margin-bottom:10pt}`,
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // ACTA DE REUNIÃO
  // ═══════════════════════════════════════════════════════════════════════
  acta: [
    {
      id: 'acta-formal',
      name: 'Acta Formal',
      description: 'Numerada, com ponto de ordem, deliberações e assinaturas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:28mm 25mm}
        h1{font-size:14pt;text-align:center;font-weight:bold;text-transform:uppercase;border-top:2px solid #1e3a5f;border-bottom:2px solid #1e3a5f;padding:5pt 0;margin-bottom:16pt;color:#1e3a5f}
        h2{font-size:12pt;font-weight:bold;text-transform:uppercase;margin-top:14pt}
        p{text-align:justify;margin-bottom:8pt}
        li{margin-bottom:4pt;text-align:justify}`,
    },
    {
      id: 'acta-associacao',
      name: 'Associação / ONG',
      description: 'Para assembleias gerais e reuniões de associações',
      preview: { accent: '#16a34a', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#16a34a', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#14532d;padding:25mm}
        h1{font-size:16pt;font-weight:800;color:#16a34a;border-bottom:3px solid #16a34a;padding-bottom:5pt;margin-bottom:14pt}
        h2{font-size:11pt;font-weight:700;color:#166534;background:#f0fdf4;padding:4pt 8pt;margin-top:14pt;border-left:4px solid #16a34a}
        p{text-align:justify;margin-bottom:8pt}
        .presentes{background:#f0fdf4;border:1px solid #86efac;padding:10pt;margin:10pt 0}`,
    },
    {
      id: 'acta-empresarial',
      name: 'Conselho de Administração',
      description: 'Para sociedades, conselhos e órgãos directivos',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:25mm}
        h1{font-size:16pt;font-weight:800;text-align:center;border-bottom:2px solid #0f172a;padding-bottom:6pt;margin-bottom:16pt}
        h2{font-size:11pt;font-weight:700;text-transform:uppercase;background:#f1f5f9;padding:4pt 8pt;margin-top:14pt;letter-spacing:.5px}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'acta-condominio',
      name: 'Condomínio / Moradores',
      description: 'Para condomínios, blocos e associações de moradores',
      preview: { accent: '#0891b2', bg: '#ecfeff', font: 'sans-serif', headerBg: '#0891b2', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#164e63;padding:22mm}
        h1{font-size:15pt;font-weight:800;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:5pt;margin-bottom:14pt}
        h2{font-size:11pt;font-weight:700;color:#0e7490;margin-top:12pt}
        p{text-align:justify;margin-bottom:8pt}`,
    },
    {
      id: 'acta-escolar',
      name: 'Conselho Pedagógico',
      description: 'Para reuniões escolares, conselhos de turma e pedagogia',
      preview: { accent: '#7c3aed', bg: '#f5f3ff', font: 'sans-serif', headerBg: '#7c3aed', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e1b4b;padding:24mm}
        h1{font-size:15pt;font-weight:800;color:#7c3aed;border-bottom:2px solid #7c3aed;padding-bottom:5pt;margin-bottom:14pt}
        h2{font-size:11pt;font-weight:700;color:#6d28d9;background:#f5f3ff;padding:4pt 8pt;margin-top:14pt;border-left:4px solid #7c3aed}
        p{text-align:justify;margin-bottom:8pt}`,
    },
  ],
};

// ── Serviços sem IA — sem templates visuais (usam WhatsApp) ───────────────
// impressao, foto, conversao não têm templates porque não geram documento

// ── Helpers públicos ──────────────────────────────────────────────────────

/** Devolve a lista de templates para um serviço */
export function getTemplates(serviceKey) {
  return TEMPLATE_LIBRARY[serviceKey] || [];
}

/** Devolve um template por id */
export function getTemplateById(serviceKey, templateId) {
  return (TEMPLATE_LIBRARY[serviceKey] || []).find(t => t.id === templateId) || null;
}

/** Devolve o template por defeito de um serviço (primeiro da lista) */
export function getDefaultTemplate(serviceKey) {
  const list = TEMPLATE_LIBRARY[serviceKey] || [];
  return list[0] || null;
}

/** Lista de todos os serviços que têm templates */
export const SERVICES_WITH_TEMPLATES = Object.keys(TEMPLATE_LIBRARY);
