// assets/js/marketplace/templates/requerimento.js
// Extraido de TemplateLibrary.js — secao "REQUERIMENTO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'req-formal',
      name: 'Formal Padrão',
      description: 'Formato padrão aceite em todas as repartições públicas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <p style="text-align:right;margin-bottom:20pt">{{LOCAL}}, {{DATA}}</p>
  <p><strong>Exmo.(a) Sr.(a) {{ENTIDADE}}</strong></p>
  <h1 style="font-size:12pt;font-weight:700;margin:16pt 0">REQUERIMENTO</h1>
  <p><strong>{{REQUERENTE}}</strong>, portador do BI n.º {{BI}}, residente em {{ENDERECO}}, vem respeitosamente requerer a V. Ex.ª o seguinte:</p>
  <p><strong>Assunto:</strong> {{ASSUNTO}}</p>
  <div>{{FUNDAMENTO}}</div>
  <p style="margin-top:14pt">Nestes termos, pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:160pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>`,
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
];
