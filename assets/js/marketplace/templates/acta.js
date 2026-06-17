// assets/js/marketplace/templates/acta.js
// Extraido de TemplateLibrary.js — secao "ACTA DE REUNIAO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'acta-formal',
      name: 'Acta Formal',
      description: 'Numerada, com ponto de ordem, deliberações e assinaturas',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <h1 style="text-align:center">ACTA N.º {{NUM_ACTA}}</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:16pt">{{ORGANIZACAO}} — {{TIPO_REUNIAO}}</p>
  <p><strong>Data:</strong> {{DATA}} | <strong>Hora:</strong> {{HORA}} | <strong>Local:</strong> {{LOCAL}}</p>
  <p><strong>Presidente:</strong> {{PRESIDENTE}} | <strong>Secretário:</strong> {{SECRETARIO}}</p>
  <p><strong>Presentes:</strong> {{PRESENTES}}</p>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Ordem do Dia</h2>
  <div>{{PAUTA}}</div>
  <h2 style="font-size:11pt;font-weight:700;margin:14pt 0 8pt">Deliberações</h2>
  <div>{{DELIBERACOES}}</div>
  <p style="margin-top:14pt">Nada mais havendo a tratar, foi encerrada a reunião.</p>
  <div style="display:flex;justify-content:space-between;margin-top:36pt">
    <div><p>O Presidente</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{PRESIDENTE}}</p></div>
    <div><p>O Secretário</p><div style="margin-top:24pt;border-top:1px solid #000;width:140pt"></div><p>{{SECRETARIO}}</p></div>
  </div>
</div>`,
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
];
