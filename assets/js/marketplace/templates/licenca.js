// assets/js/marketplace/templates/licenca.js
// Extraido de TemplateLibrary.js — secao "LICENCA"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'lic-comercial',
      name: 'Licença Comercial',
      description: 'Pedido de alvará comercial para câmara municipal',
      preview: { accent: '#b45309', bg: '#fffbeb', font: 'sans-serif', headerBg: '#b45309', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">República de Moçambique</p>
    <h1 style="font-size:14pt;font-weight:800">REQUERIMENTO DE LICENÇA COMERCIAL</h1>
  </div>
  <p>Ao(À) {{ENTIDADE}},</p>
  <p><strong>{{REQUERENTE}}</strong>, NUIT <strong>{{NUIT}}</strong>, contacto <strong>{{CONTACTO}}</strong>, vem requerer a V. Ex.ª a emissão de licença para exercício de actividade comercial:</p>
  <p><strong>Actividade:</strong> {{OBJECTO}}</p>
  <p><strong>Área:</strong> {{AREA_M2}} m² | <strong>Horário:</strong> {{HORARIO}}</p>
  <p><strong>Local do estabelecimento:</strong> {{LOCAL}}</p>
  <div>{{FUNDAMENTACAO}}</div>
  <p style="margin-top:14pt">Pede deferimento.</p>
  <div style="margin-top:36pt;text-align:right">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="margin-top:24pt;border-top:1px solid #000;width:150pt;margin-left:auto"></div>
    <p>{{REQUERENTE}}</p>
  </div>
</div>`,
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
];
