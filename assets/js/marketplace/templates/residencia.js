// assets/js/marketplace/templates/residencia.js
// Extraido de TemplateLibrary.js — secao "DECLARACAO DE RESIDENCIA"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'resid-junta',
      name: 'Junta de Bairro',
      description: 'Emitido pelo presidente de bairro ou quarteirão',
      preview: { accent: '#166534', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#166534', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <div style="text-align:center;margin-bottom:20pt">
    <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px">Junta de Freguesia / Bairro</p>
    <h1 style="font-size:14pt;font-weight:800">DECLARAÇÃO DE RESIDÊNCIA</h1>
    <div style="width:40pt;height:3pt;background:#1a237e;margin:8pt auto"></div>
  </div>
  <p>O(a) abaixo assinado(a), declara para os devidos efeitos que:</p>
  <p><strong>{{DECLARANTE}}</strong>, portador(a) do BI n.º <strong>{{BI}}</strong>, nascido(a) a {{NASCIMENTO}} em {{NATURALIDADE}}, reside em <strong>{{ENDERECO}}</strong>, há <strong>{{TEMPO}}</strong>.</p>
  <p>A presente declaração é emitida para fins de <strong>{{FINALIDADE}}</strong>.</p>
  <div style="margin-top:36pt;display:flex;justify-content:space-between">
    <p>{{LOCAL}}, {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:140pt;margin-bottom:4pt"></div><p>O Responsável</p><p>{{CHEFE}}</p></div>
  </div>
</div>`,
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
];
