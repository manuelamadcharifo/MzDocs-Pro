// assets/js/marketplace/templates/carta.js
// Extraido de TemplateLibrary.js — secao "CARTA"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'carta-formal-classica',
      name: 'Formal Clássica',
      description: 'Estrutura tradicional, tom oficial e respeitoso',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <p style="text-align:right">{{LOCAL}}, {{DATA}}</p>
  <p style="margin-top:24pt"><strong>Exmo.(a) Sr.(a)</strong><br>{{DESTINATARIO_NOME}}<br>{{DESTINATARIO_ENTI}}</p>
  <h1>Assunto: {{ASSUNTO}}</h1>
  <p>Exmo.(a) Sr.(a) {{DESTINATARIO_NOME}},</p>
  <div>{{CORPO}}</div>
  <div class="assinatura">
    <p>Com os melhores cumprimentos,</p>
    <p><strong>{{REMETENTE_NOME}}</strong></p>
  </div>
</div>`,
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
      htmlTemplate: `
<div class="carta-page">
  <header class="carta-header">
    <div class="carta-logo-area">
      <div class="carta-logo-placeholder">{{INICIAIS_EMPRESA}}</div>
      <div>
        <p class="carta-empresa-nome">{{REMETENTE_NOME}}</p>
        <p class="carta-empresa-sub">{{REMETENTE_CARGO}}</p>
      </div>
    </div>
    <div class="carta-ref-area">
      <p class="carta-data">{{LOCAL}}, {{DATA}}</p>
      <p class="carta-ref">Ref.: {{ASSUNTO}}</p>
    </div>
  </header>
  <section class="carta-destinatario">
    <p><strong>A/C: {{DESTINATARIO_NOME}}</strong></p>
    <p>{{DESTINATARIO_ENTI}}</p>
  </section>
  <section class="carta-corpo">
    <p class="carta-assunto"><strong>Assunto: {{ASSUNTO}}</strong></p>
    <p>Exmo.(a) Sr.(a) {{DESTINATARIO_NOME}},</p>
    <div class="carta-texto">{{CORPO}}</div>
  </section>
  <footer class="carta-footer">
    <div class="carta-assinatura">
      <p>Atenciosamente,</p>
      <div class="carta-linha-assinatura"></div>
      <p><strong>{{REMETENTE_NOME}}</strong></p>
      <p class="carta-cargo-assin">{{REMETENTE_CARGO}}</p>
    </div>
  </footer>
</div>`,
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
      htmlTemplate: `
<div>
  <div style="text-align:center;border-bottom:3px solid #1a237e;padding-bottom:10pt;margin-bottom:20pt">
    <p style="font-size:9pt;letter-spacing:2px;color:#1a237e;font-weight:700">REPÚBLICA DE MOÇAMBIQUE</p>
    <p style="font-size:11pt;font-weight:800;color:#1a237e">{{MINISTERIO}}</p>
    <p style="font-size:9pt;color:#1a237e">{{REPARTIÇÃO}}</p>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:20pt">
    <div><p>Ref.: {{REF}}</p></div>
    <div style="text-align:right"><p>{{LOCAL}}, {{DATA}}</p></div>
  </div>
  <p><strong>Exmo.(a) Sr.(a)</strong><br>{{DESTINATARIO_NOME}}<br>{{DESTINATARIO_ENTI}}</p>
  <h2 style="font-size:11pt;font-weight:700;margin:20pt 0 12pt">Assunto: {{ASSUNTO}}</h2>
  <div>{{CORPO}}</div>
  <div style="margin-top:40pt">
    <p>Com os elevados cumprimentos,</p>
    <p style="margin-top:30pt"><strong>{{REMETENTE_NOME}}</strong></p>
    <p>{{REMETENTE_CARGO}}</p>
  </div>
</div>`,
      css: `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:25mm 25mm 20mm 35mm}
        h1{font-size:13pt;text-align:center;font-weight:bold;border-top:2px solid #006633;border-bottom:2px solid #006633;padding:6pt 0;margin-bottom:18pt;color:#006633;text-transform:uppercase}
        p{margin-bottom:10pt;text-align:justify}`,
    },
    {
      id: 'carta-moderna',
      name: 'Moderna e Limpa',
      description: 'Design contemporâneo para candidaturas e comunicações profissionais',
      preview: { accent: '#0f172a', bg: '#f8fafc', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      htmlTemplate: `
<div class="carta-mod-page">
  <aside class="carta-mod-sidebar">
    <div class="carta-mod-logo">{{INICIAIS}}</div>
    <p class="carta-mod-remetente">{{REMETENTE_NOME}}</p>
    <p class="carta-mod-cargo">{{REMETENTE_CARGO}}</p>
    <div class="carta-mod-divider"></div>
    <p class="carta-mod-label">Data</p>
    <p class="carta-mod-val">{{DATA}}</p>
    <p class="carta-mod-label">Local</p>
    <p class="carta-mod-val">{{LOCAL}}</p>
    <p class="carta-mod-label">Referência</p>
    <p class="carta-mod-val">{{REF}}</p>
  </aside>
  <main class="carta-mod-main">
    <div class="carta-mod-destinatario">
      <p><strong>{{DESTINATARIO_NOME}}</strong></p>
      <p>{{DESTINATARIO_ENTI}}</p>
    </div>
    <p class="carta-mod-assunto"><strong>Assunto: {{ASSUNTO}}</strong></p>
    <p>Exmo.(a) Sr.(a) {{DESTINATARIO_NOME}},</p>
    <div class="carta-mod-corpo">{{CORPO}}</div>
    <div class="carta-mod-assinatura">
      <p>Com os melhores cumprimentos,</p>
      <div class="carta-mod-linha"></div>
      <p><strong>{{REMETENTE_NOME}}</strong></p>
    </div>
  </main>
</div>`,
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
      htmlTemplate: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20pt">
    <div>
      <p style="font-size:18pt;font-weight:800;color:#0f172a">{{REMETENTE_NOME}}</p>
      <p style="font-size:10pt;color:#64748b">{{REMETENTE_CARGO_PRETENDIDO}}</p>
    </div>
    <div style="text-align:right;font-size:9pt;color:#64748b">
      <p>{{LOCAL}}, {{DATA}}</p>
    </div>
  </div>
  <p><strong>Exmo.(a) Sr.(a)</strong><br>{{DESTINATARIO_NOME}}<br>{{DESTINATARIO_ENTI}}</p>
  <h1 style="font-size:12pt;font-weight:700;margin:16pt 0 10pt">Candidatura: {{ASSUNTO}}</h1>
  <div>{{CORPO}}</div>
  <div style="margin-top:36pt">
    <p>Atenciosamente,</p>
    <p style="margin-top:24pt;font-weight:700">{{REMETENTE_NOME}}</p>
  </div>
</div>`,
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#0c4a6e;padding:25mm}
        h1{font-size:15pt;font-weight:800;color:#0ea5e9;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:600;color:#0369a1;margin-bottom:16pt;font-style:italic}
        p{margin-bottom:10pt;text-align:justify;color:#0c4a6e}`,
    },
];
