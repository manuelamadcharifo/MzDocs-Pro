// assets/js/marketplace/templates/recomendacao.js
// Extraido de TemplateLibrary.js — secao "CARTA DE RECOMENDACAO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'rec-emprego',
      name: 'Recomendação Profissional',
      description: 'De superior para candidato a novo emprego',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <div style="text-align:right;margin-bottom:20pt"><p>{{LOCAL}}, {{DATA}}</p></div>
  <h1 style="font-size:14pt;font-weight:700;margin-bottom:16pt">CARTA DE RECOMENDAÇÃO</h1>
  <p>A quem possa interessar,</p>
  <div>{{CORPO}}</div>
  <div style="margin-top:36pt">
    <p>Com os melhores cumprimentos,</p>
    <div style="margin-top:28pt;border-top:1px solid #000;width:160pt"></div>
    <p><strong>{{RECOMENDADOR}}</strong></p>
    <p>{{CARGO_REC}} — {{ENTIDADE_REC}}</p>
  </div>
</div>`,
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
];
