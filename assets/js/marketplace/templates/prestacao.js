// assets/js/marketplace/templates/prestacao.js
// Extraido de TemplateLibrary.js — secao "CONTRATO DE PRESTACAO DE SERVICOS"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'prest-juridico',
      name: 'Jurídico Completo',
      description: 'Artigos, cláusulas penais, propriedade intelectual',
      preview: { accent: '#1e3a5f', bg: '#fff', font: 'serif', headerBg: '#1e3a5f', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <h1 style="text-align:center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <p style="text-align:center;font-size:10pt;margin-bottom:20pt">{{SERVICO}}</p>
  <p>Entre:</p>
  <p><strong>PRESTADOR:</strong> {{PRESTADOR}}, NUIT {{NUIT_PRESTADOR}}, com sede em {{MORADA_PRESTADOR}}.</p>
  <p><strong>CLIENTE:</strong> {{CLIENTE}}, BI/NUIT {{BI_CLIENTE}}.</p>
  <div>{{CLAUSULAS}}</div>
  <div style="display:flex;justify-content:space-between;margin-top:40pt">
    <div><p>O Prestador</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{PRESTADOR}}</p></div>
    <div><p>O Cliente</p><div style="margin-top:24pt;border-top:1px solid #000;width:150pt"></div><p>{{CLIENTE}}</p></div>
  </div>
</div>`,
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
];
