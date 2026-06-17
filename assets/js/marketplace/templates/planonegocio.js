// assets/js/marketplace/templates/planonegocio.js
// Extraido de TemplateLibrary.js — secao "PLANO DE NEGOCIO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'pln-banco',
      name: 'Banco / Financiamento',
      description: 'Estrutura exigida por BCI, Millennium e bancos moçambicanos',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      htmlTemplate: `
<div class="pln-page">
  <header class="pln-header">
    <h1 class="pln-titulo">{{NOME_NEGOCIO}}</h1>
    <p class="pln-subtitulo">Plano de Negócios — {{SECTOR}}</p>
    <p class="pln-meta">{{PROPRIETARIO}} | {{LOCAL}} | {{ANO}}</p>
  </header>
  <section class="pln-section"><h2 class="pln-section-title">1. Sumário Executivo</h2><div class="pln-content">{{SUMARIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">2. Descrição do Negócio</h2><div class="pln-content">{{DESCRICAO_NEGOCIO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">3. Análise de Mercado</h2><div class="pln-content">{{ANALISE_MERCADO}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">4. Plano Financeiro</h2>
    <table class="pln-table">
      <thead><tr><th>Componente</th><th>Valor (MZN)</th></tr></thead>
      <tbody>{{ITEMS_FINANCEIROS}}</tbody>
      <tfoot><tr><td><strong>Investimento Total</strong></td><td><strong>{{INVESTIMENTO_TOTAL}}</strong></td></tr></tfoot>
    </table>
  </section>
  <section class="pln-section"><h2 class="pln-section-title">5. Equipa e Recursos Humanos</h2><div class="pln-content">{{EQUIPA}}</div></section>
  <section class="pln-section"><h2 class="pln-section-title">6. Projecção de Retorno</h2><div class="pln-content">{{RETORNO}}</div></section>
</div>`,
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
];
