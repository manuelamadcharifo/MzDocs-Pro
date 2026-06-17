// assets/js/marketplace/templates/recibo.js
// Extraido de TemplateLibrary.js — secao "RECIBO"
// Conteudo 100% preservado: apenas relocado para o seu proprio modulo.

export const TEMPLATES = [
    {
      id: 'recibo-simples',
      name: 'Recibo Simples',
      description: 'Compacto, directo, para pequenos negócios',
      preview: { accent: '#16a34a', bg: '#f0fdf4', font: 'sans-serif', headerBg: '#16a34a', headerColor: '#fff' },
      htmlTemplate: `
<div>
  <h1>RECIBO DE PAGAMENTO</h1>
  <p><strong>Emitido por:</strong> {{EMITENTE}} &nbsp; NUIT: {{NUIT_EMITENTE}}</p>
  <p><strong>Recebido de:</strong> {{CLIENTE}}</p>
  <p><strong>Descrição:</strong> {{DESCRICAO}}</p>
  <p class="valor">{{VALOR_TOTAL}} MZN</p>
  <table>
    <thead><tr><th>Descrição</th><th>Qtd.</th><th>Pr. Unit.</th><th>Total</th></tr></thead>
    <tbody>{{ITEMS_RECIBO}}</tbody>
    <tfoot>
      <tr><td colspan="3" style="text-align:right;font-weight:700">IVA ({{TAXA_IVA}}%)</td><td>{{VALOR_IVA}} MZN</td></tr>
      <tr><td colspan="3" style="text-align:right;font-weight:800">TOTAL</td><td style="font-weight:800">{{VALOR_TOTAL}} MZN</td></tr>
    </tfoot>
  </table>
  <p><strong>Forma de pagamento:</strong> {{FORMA_PAGAMENTO}}</p>
  <div style="margin-top:30pt;display:flex;justify-content:space-between">
    <p>Data: {{DATA}}</p>
    <div style="text-align:center"><div style="border-top:1px solid #000;width:120pt;margin-bottom:4pt"></div><p>{{EMITENTE}}</p></div>
  </div>
</div>`,
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#14532d;padding:18mm}
        h1{font-size:18pt;font-weight:800;color:#16a34a;border-bottom:3px solid #16a34a;padding-bottom:4pt;margin-bottom:12pt}
        .valor{font-size:22pt;font-weight:900;color:#15803d;text-align:right;margin:10pt 0}
        table{width:100%;border-collapse:collapse}
        th{background:#16a34a;color:#fff;padding:5pt 8pt}
        td{border-bottom:1px solid #bbf7d0;padding:5pt 8pt}`,
    },
    {
      id: 'recibo-factura',
      name: 'Factura Formal com IVA',
      description: 'NUIT, IVA 16%, referência fiscal para empresas',
      preview: { accent: '#1d4ed8', bg: '#eff6ff', font: 'sans-serif', headerBg: '#1d4ed8', headerColor: '#fff' },
      htmlTemplate: `
<div class="fac-page">
  <header class="fac-header">
    <div class="fac-empresa"><p class="fac-empresa-nome">{{EMITENTE}}</p><p class="fac-nuit">NUIT: {{NUIT_EMITENTE}}</p></div>
    <div class="fac-doc-info"><p class="fac-doc-tipo">FACTURA / RECIBO</p><p class="fac-doc-num">N.º {{NUM_DOC}}</p><p class="fac-doc-data">{{DATA}}</p></div>
  </header>
  <section class="fac-cliente"><p><strong>Cliente:</strong> {{CLIENTE}}</p><p><strong>BI/NUIT:</strong> {{BI_CLIENTE}}</p></section>
  <table class="fac-table">
    <thead><tr><th>Descrição</th><th>Qtd.</th><th>Unit.(MZN)</th><th>Total(MZN)</th></tr></thead>
    <tbody>{{ITEMS_RECIBO}}</tbody>
    <tfoot>
      <tr><td colspan="3">Subtotal</td><td>{{SUBTOTAL}}</td></tr>
      <tr><td colspan="3">IVA ({{TAXA_IVA}}%)</td><td>{{VALOR_IVA}}</td></tr>
      <tr class="fac-total-row"><td colspan="3"><strong>TOTAL (MZN)</strong></td><td><strong>{{VALOR_TOTAL}}</strong></td></tr>
    </tfoot>
  </table>
  <p class="fac-pagamento">Pagamento: {{FORMA_PAGAMENTO}}</p>
</div>`,
      css: `body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1e293b;padding:16mm}
        h1{font-size:20pt;font-weight:800;color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:4pt}
        .header-info{display:flex;justify-content:space-between;margin:10pt 0;font-size:9.5pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:10pt}
        th{background:#1d4ed8;color:#fff;padding:5pt 6pt}
        td{border:1px solid #bfdbfe;padding:4pt 6pt}
        .total-row td{background:#eff6ff;font-weight:800;font-size:11pt}
        .iva-row td{font-size:9.5pt;color:#6b7280}`,
    },
    {
      id: 'recibo-loja',
      name: 'Loja / Comércio',
      description: 'Para lojas, mercearias e comércio local',
      preview: { accent: '#f59e0b', bg: '#fffbeb', font: 'sans-serif', headerBg: '#f59e0b', headerColor: '#000' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1c1917;padding:16mm}
        h1{font-size:18pt;font-weight:900;color:#b45309;text-align:center;border-bottom:2px solid #f59e0b;padding-bottom:5pt;margin-bottom:10pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#f59e0b;color:#000;padding:5pt;font-weight:700}
        td{border-bottom:1px solid #fde68a;padding:5pt 7pt}
        .total{font-weight:900;font-size:14pt;text-align:right;color:#b45309;border-top:2px solid #f59e0b;padding-top:8pt}`,
    },
    {
      id: 'recibo-proforma',
      name: 'Proforma',
      description: 'Orçamento-fatura antes da confirmação',
      preview: { accent: '#6366f1', bg: '#eef2ff', font: 'sans-serif', headerBg: '#6366f1', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1e1b4b;padding:18mm}
        .proforma-badge{background:#fef9c3;color:#713f12;border:1px solid #fde047;padding:3pt 10pt;font-weight:700;font-size:10pt;display:inline-block;margin-bottom:8pt;border-radius:3pt}
        h1{font-size:18pt;font-weight:800;color:#6366f1;margin-bottom:4pt}
        table{width:100%;border-collapse:collapse;margin:8pt 0}
        th{background:#6366f1;color:#fff;padding:5pt}
        td{border:1px solid #c7d2fe;padding:4pt 7pt}`,
    },
    {
      id: 'recibo-servico',
      name: 'Recibo de Serviço',
      description: 'Para reparações, limpeza, transporte e serviços avulsos',
      preview: { accent: '#0891b2', bg: '#ecfeff', font: 'sans-serif', headerBg: '#0891b2', headerColor: '#fff' },
      css: `body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#164e63;padding:18mm}
        h1{font-size:17pt;font-weight:800;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:4pt;margin-bottom:12pt}
        .servico-desc{background:#ecfeff;border:1px solid #a5f3fc;padding:10pt;margin:10pt 0;border-radius:4pt}
        .valor-total{font-size:18pt;font-weight:900;color:#0e7490;text-align:right;margin-top:12pt}`,
    },
];
