// assets/js/marketplace/templates/cv.js
// Extraido de TemplateLibrary.js — secao "CV / CURRICULO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
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
];
