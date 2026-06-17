// assets/js/marketplace/templates/orcamento.js
// Extraido de TemplateLibrary.js — secao "ORCAMENTO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'orcamento-profissional',
      name: 'Profissional Detalhado',
      description: 'Tabelas de itens, subtotais e condições de pagamento',
      preview: { accent: '#f59e0b', bg: '#fffbeb', font: 'sans-serif', headerBg: '#f59e0b', headerColor: '#000' },
      htmlTemplate: `
<div>
  <h1>{{TITULO_OBRA}}</h1>
  <p><strong>Local:</strong> {{LOCAL_DATA}} &nbsp;&nbsp; <strong>Área/Pisos:</strong> {{AREA_PISOS}} &nbsp;&nbsp; <strong>Válido:</strong> {{VALIDADE}}</p>
  <h2>Materiais de Construção</h2>
  <table>
    <thead><tr><th>Descrição</th><th>Unid.</th><th>Qtd.</th><th>Pr. Unit. (MZN)</th><th>Total (MZN)</th></tr></thead>
    <tbody>{{ITEMS_MATERIAIS}}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700">Subtotal Materiais</td><td style="font-weight:700">{{TOTAL_MATERIAIS}}</td></tr></tfoot>
  </table>
  <h2>Mão-de-Obra</h2>
  <table>
    <thead><tr><th>Profissional</th><th>Dias</th><th>Diária (MZN)</th><th>Total (MZN)</th></tr></thead>
    <tbody>{{ITEMS_MAO_OBRA}}</tbody>
    <tfoot><tr><td colspan="3" style="text-align:right;font-weight:700">Subtotal Mão-de-Obra</td><td style="font-weight:700">{{TOTAL_MAO_OBRA}}</td></tr></tfoot>
  </table>
  <table>
    <tfoot>
      <tr><td colspan="4" style="text-align:right;font-weight:800;font-size:12pt">TOTAL GERAL</td><td style="font-weight:800;font-size:12pt">{{TOTAL_GERAL}}</td></tr>
    </tfoot>
  </table>
  <p style="margin-top:16pt;font-size:9pt;color:#78716c">Nota: Valores em Meticais (MZN). Imprevistos de 10% incluídos. {{VALIDADE}}</p>
</div>`,
      css: `body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1c1917;padding:20mm}
        h1{font-size:18pt;font-weight:800;color:#b45309;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;background:#fef3c7;padding:4pt 8pt;margin-top:14pt;border-left:4px solid #f59e0b}
        table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:10pt}
        th{background:#f59e0b;color:#000;padding:5pt 7pt;text-align:left;font-weight:700}
        td{border:1px solid #d97706;padding:4pt 7pt}
        tr:nth-child(even) td{background:#fffbeb}
        .total{font-weight:800;background:#fef3c7!important;font-size:11pt}`,
    },
    {
      id: 'orcamento-simples',
      name: 'Simples e Directo',
      description: 'Para pequenas obras, remodelações e reparações',
      preview: { accent: '#0f172a', bg: '#fff', font: 'sans-serif', headerBg: '#0f172a', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <h1>Orçamento — {{TITULO_OBRA}}</h1>
  <p>Local: {{LOCAL_DATA}} | {{AREA_PISOS}}</p>
  <table>
    <thead><tr><th>#</th><th>Descrição</th><th>Qtd.</th><th>Unit. (MZN)</th><th>Total (MZN)</th></tr></thead>
    <tbody>{{ITEMS_TODOS}}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700">TOTAL</td><td>{{TOTAL_GERAL}}</td></tr></tfoot>
  </table>
  <p style="margin-top:12pt;font-size:9pt">Válido: {{VALIDADE}} | Prazo de execução: {{PRAZO}} dias</p>
</div>`,
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e293b;padding:22mm}
        h1{font-size:16pt;font-weight:800;padding:12pt;background:#0f172a;color:#fff;margin:-22mm -22mm 18pt;padding:14pt 22mm}
        h2{font-size:11pt;font-weight:700;color:#0f172a;margin-top:14pt;text-transform:uppercase;letter-spacing:.5px}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#1e293b;color:#fff;padding:5pt 8pt;font-size:10pt}
        td{border-bottom:1px solid #e2e8f0;padding:5pt 8pt}`,
    },
    {
      id: 'orcamento-construtora',
      name: 'Construtora Formal',
      description: 'Logo e identidade visual para empresas de construção',
      preview: { accent: '#dc2626', bg: '#fff', font: 'sans-serif', headerBg: '#dc2626', headerColor: '#fff' },
      htmlTemplate: `
<div class="orc-page">
  <header class="orc-header">
    <div class="orc-empresa">
      <p class="orc-empresa-nome">{{EMPRESA}}</p>
      <p class="orc-empresa-sub">Construção Civil &amp; Obras</p>
    </div>
    <div class="orc-ref-block">
      <p class="orc-ref">Orç. N.º {{NUM_ORC}}</p>
      <p class="orc-data">{{LOCAL_DATA}}</p>
    </div>
  </header>
  <section class="orc-info">
    <p><strong>Obra:</strong> {{TITULO_OBRA}} &nbsp;&nbsp; <strong>Área:</strong> {{AREA_PISOS}}</p>
    <p><strong>Cliente:</strong> {{CLIENTE}} &nbsp;&nbsp; <strong>Prazo:</strong> {{PRAZO}} dias</p>
  </section>
  <section class="orc-section">
    <h2 class="orc-section-title">Materiais</h2>
    <table class="orc-table">
      <thead><tr><th>Descrição</th><th>Unid.</th><th>Qtd.</th><th>Unit.(MZN)</th><th>Total(MZN)</th></tr></thead>
      <tbody>{{ITEMS_MATERIAIS}}</tbody>
    </table>
  </section>
  <section class="orc-section">
    <h2 class="orc-section-title">Mão-de-Obra</h2>
    <table class="orc-table">
      <thead><tr><th>Profissional</th><th>Dias</th><th>Diária(MZN)</th><th>Total(MZN)</th></tr></thead>
      <tbody>{{ITEMS_MAO_OBRA}}</tbody>
    </table>
  </section>
  <div class="orc-total-block">
    <p class="orc-total-label">TOTAL GERAL (incl. 10% imprevistos)</p>
    <p class="orc-total-valor">{{TOTAL_GERAL}} MZN</p>
  </div>
</div>`,
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1c1917;padding:20mm}
        h1{color:#dc2626;font-size:20pt;font-weight:800;border-bottom:3px solid #dc2626;padding-bottom:6pt;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.5px;margin-top:14pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#dc2626;color:#fff;padding:5pt 7pt}
        td{border:1px solid #fca5a5;padding:4pt 7pt}
        tr:last-child td{font-weight:800;border-top:2px solid #dc2626}`,
    },
    {
      id: 'orcamento-engenharia',
      name: 'Engenharia Técnica',
      description: 'Colunas de quantidade, unidade, preço unitário e total',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <div style="border-bottom:3px double #0e3a68;padding-bottom:10pt;margin-bottom:16pt">
    <h1 style="font-size:16pt;font-weight:800;color:#0e3a68">ORÇAMENTO DE ENGENHARIA</h1>
    <p style="font-size:10pt;color:#334155">{{TITULO_OBRA}} | {{LOCAL_DATA}} | Área: {{AREA_PISOS}}</p>
  </div>
  <h2 style="font-size:11pt;font-weight:700;color:#0e3a68;border-left:4px solid #0e3a68;padding-left:8pt;margin:14pt 0 8pt">01. MATERIAIS</h2>
  <table><thead><tr><th>Cód.</th><th>Descrição</th><th>Unid.</th><th>Qtd.</th><th>Pr.Unit.</th><th>Total (MZN)</th></tr></thead>
  <tbody>{{ITEMS_MATERIAIS}}</tbody></table>
  <h2 style="font-size:11pt;font-weight:700;color:#0e3a68;border-left:4px solid #0e3a68;padding-left:8pt;margin:14pt 0 8pt">02. MÃO-DE-OBRA</h2>
  <table><thead><tr><th>Cód.</th><th>Profissional</th><th>Dias</th><th>Diária</th><th>Total (MZN)</th></tr></thead>
  <tbody>{{ITEMS_MAO_OBRA}}</tbody></table>
  <table style="margin-top:12pt"><tfoot>
    <tr style="background:#e8f0fe"><td colspan="5" style="text-align:right;font-weight:700">Subtotal</td><td>{{SUBTOTAL}}</td></tr>
    <tr style="background:#e8f0fe"><td colspan="5" style="text-align:right;font-weight:700">Imprevistos (10%)</td><td>{{IMPREVISTOS}}</td></tr>
    <tr style="background:#0e3a68;color:#fff"><td colspan="5" style="text-align:right;font-weight:900">TOTAL GERAL (MZN)</td><td style="font-weight:900">{{TOTAL_GERAL}}</td></tr>
  </tfoot></table>
</div>`,
      css: `body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:#0f172a;padding:20mm}
        h1{font-size:14pt;font-weight:800;text-align:center;color:#1d4ed8;border:2px solid #1d4ed8;padding:8pt;margin-bottom:16pt}
        h2{font-size:10.5pt;font-weight:700;color:#1e40af;background:#eff6ff;padding:4pt 8pt;border-left:4px solid #1d4ed8;margin-top:12pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:9.5pt}
        th{background:#1d4ed8;color:#fff;padding:4pt 6pt;font-size:9pt}
        td{border:1px solid #bfdbfe;padding:3pt 6pt}`,
    },
    {
      id: 'orcamento-mpesa',
      name: 'Pequeno Negócio M-Pesa',
      description: 'Directo ao ponto com QR M-Pesa e referência de pagamento',
      preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#10b981', headerColor: '#fff' },
      htmlTemplate: `
<div style="max-width:360pt;margin:auto">
  <div style="background:#e91e8c;color:#fff;padding:16pt;border-radius:8pt 8pt 0 0;text-align:center">
    <p style="font-size:9pt;letter-spacing:2px;opacity:.85">M-PESA BUSINESS</p>
    <p style="font-size:14pt;font-weight:800">{{TITULO_OBRA}}</p>
    <p style="font-size:9pt;opacity:.8">{{LOCAL_DATA}}</p>
  </div>
  <div style="border:1.5px solid #e91e8c;border-top:none;padding:16pt;border-radius:0 0 8pt 8pt">
    <table style="width:100%;font-size:10pt">
      <tbody>{{ITEMS_TODOS}}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #e91e8c"><td style="font-weight:700;padding-top:8pt">TOTAL</td><td style="text-align:right;font-weight:800;font-size:14pt;color:#e91e8c">{{TOTAL_GERAL}} MZN</td></tr>
      </tfoot>
    </table>
    <p style="text-align:center;margin-top:12pt;font-size:8pt;color:#94a3b8">Válido: {{VALIDADE}}</p>
  </div>
</div>`,
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#064e3b;padding:20mm}
        h1{font-size:16pt;font-weight:800;color:#10b981;margin-bottom:4pt}
        h2{font-size:11pt;font-weight:700;color:#065f46;border-bottom:2px solid #10b981;padding-bottom:3pt;margin-top:14pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#10b981;color:#fff;padding:5pt 8pt}
        td{border:1px solid #6ee7b7;padding:4pt 8pt}
        .total-row td{background:#d1fae5;font-weight:800;font-size:12pt}`,
    },
];
