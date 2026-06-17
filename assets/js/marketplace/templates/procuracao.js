// assets/js/marketplace/templates/procuracao.js
// Extraido de TemplateLibrary.js — secao "PROCURACAO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
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
];
