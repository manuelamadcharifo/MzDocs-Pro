// assets/js/services/prompts/recibo.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoDoc = data.tipoDoc || 'Recibo Simples';
        const isFactura   = tipoDoc === 'Factura';
        const isProforma  = tipoDoc === 'Factura Proforma';
        const isNDebito   = tipoDoc === 'Nota de Débito';
        const isRecibo    = tipoDoc === 'Recibo Simples';
        const valorBruto  = parseFloat(data.valor || 0);
        const comIVA      = data.iva === 'Sim';
        const valorIVA    = comIVA ? (valorBruto * 0.16).toFixed(2) : 0;
        const valorLiquido = comIVA ? (valorBruto * 1.16).toFixed(2) : valorBruto.toFixed(2);

        const nuitObrigatorio = isFactura || isProforma || isNDebito;
        const validadeProforma = isProforma ? (data.validadeProforma || 30) : null;

        return `Você é contabilista especializado no regime fiscal moçambicano. Elabore um(a) ${tipoDoc.toUpperCase()} completo(a) e conforme a legislação tributária vigente.

BASE LEGAL APLICÁVEL:
- Lei n.º 32/2007, de 28 de Dezembro (Lei do IVA em Moçambique) — IVA à taxa de 16%
- Decreto n.º 7/2008 (Regulamento do IVA)
- Decreto n.º 70/2022, de 31 de Dezembro (Faturação eletrónica — obrigatória para grandes contribuintes)
- Circular n.º 8/AT/2016 (Autoridade Tributária — requisitos de documentos fiscais)
- Lei n.º 15/2002, de 26 de Junho (Lei de Bases do Sistema Tributário de Moçambique)

DADOS:
- Tipo de documento: ${tipoDoc}
- Emitente: ${data.emitente} | NUIT: ${data.nuitEmitente || '[OBRIGATÓRIO para Factura]'}
- Endereço/contacto emitente: ${data.enderecoEmitente || '________________________________'}
- Cliente: ${data.cliente} | BI/NUIT: ${data.biCliente || 'N/A'}
- Descrição: ${data.descricao}
- Valor base: ${valorBruto.toLocaleString('pt-MZ')} MZN
- IVA: ${data.iva || 'Não (regime simplificado)'}
- Forma de pagamento: ${data.pagamento}
- Conta/M-Pesa: ${data.contaBancaria || 'não indicado'}
${isProforma ? '- Validade da proforma: ' + validadeProforma + ' dias' : ''}
- Local e data: ${data.local}${ocrBlock}

REGRAS FISCAIS CRÍTICAS:
1. ${isFactura ? 'FACTURA: NUIT do emitente é OBRIGATÓRIO. Numeração sequencial obrigatória. IVA separado do valor base se aplicável.' : ''}
2. ${isProforma ? 'FACTURA PROFORMA: é uma ESTIMATIVA, não uma cobrança. NÃO aplique IVA (o IVA só é exigível na factura definitiva). Inclua validade de ' + validadeProforma + ' dias e condições de entrega.' : ''}
3. ${isRecibo ? 'RECIBO SIMPLES: documento de quitação — confirma pagamento já recebido. Não inclui IVA separado.' : ''}
4. ${isNDebito ? 'NOTA DE DÉBITO: emitida para cobrar valores adicionais não incluídos na factura original. Deve referenciar a factura original.' : ''}
5. ${comIVA ? 'IVA calculado: base ' + valorBruto.toLocaleString('pt-MZ') + ' MZN × 16% = ' + parseFloat(valorIVA).toLocaleString('pt-MZ') + ' MZN | Total c/ IVA: ' + parseFloat(valorLiquido).toLocaleString('pt-MZ') + ' MZN' : 'Operação sem IVA — motivo: ' + (data.iva || 'regime simplificado')}
6. ${nuitObrigatorio && !data.nuitEmitente ? 'ATENÇÃO: NUIT do emitente não foi fornecido — assinale claramente no documento como [OBRIGATÓRIO — INSERIR NUIT]' : ''}

DOCUMENTO COMPLETO:

---

# ${tipoDoc.toUpperCase()}

**N.º:** ${tipoDoc === 'Recibo Simples' ? 'REC' : tipoDoc === 'Factura' ? 'FT' : tipoDoc === 'Factura Proforma' ? 'FP' : 'ND'}/____/${hoje.getFullYear()}
**Data:** ${data.local}
${isProforma ? '**Válida até:** [calcular: ' + validadeProforma + ' dias após data acima]\n**Esta Proforma NÃO constitui cobrança fiscal — sujeita a confirmação de encomenda**' : ''}

---

## EMITENTE

| | |
|---|---|
| **Nome / Empresa:** | ${data.emitente} |
| **NUIT:** | ${data.nuitEmitente || (nuitObrigatorio ? '**[INSERIR NUIT — OBRIGATÓRIO]**' : 'N/A (regime simplificado)')} |
| **Endereço / Contacto:** | ${data.enderecoEmitente || '________________________________'} |

## CLIENTE / ADQUIRENTE

| | |
|---|---|
| **Nome:** | ${data.cliente} |
| **BI / NUIT:** | ${data.biCliente || '________________________________'} |

---

## DESCRIÇÃO ${isNDebito ? '(VALOR ADICIONAL — referente à Factura n.º _________)' : ''}

| Descrição | ${comIVA ? 'Valor Base (MZN)' : 'Valor (MZN)'} |
|---|---|
${data.descricao.split('\n').filter(Boolean).map(linha => `| ${linha.trim()} | |`).join('\n')}
${comIVA ? `| | |
| **Subtotal (sem IVA):** | **${valorBruto.toLocaleString('pt-MZ')}** |
| **IVA (16%):** | **${parseFloat(valorIVA).toLocaleString('pt-MZ')}** |
| **TOTAL (com IVA):** | **${parseFloat(valorLiquido).toLocaleString('pt-MZ')} MZN** |` : `| **TOTAL:** | **${valorBruto.toLocaleString('pt-MZ')} MZN** |`}

---

## CONDIÇÕES DE PAGAMENTO

- **Forma:** ${data.pagamento}
${data.contaBancaria ? '- **Conta / M-Pesa:** ' + data.contaBancaria : ''}
${isProforma ? `- **Condições de entrega:** [definir: imediata / prazo / condições] \n- **Validade desta proforma:** ${validadeProforma} dias a contar da data acima` : ''}
${isNDebito ? '- **Prazo de pagamento:** ______ dias a contar da data deste documento' : ''}
${!isProforma && !isRecibo ? '- **Esta factura é exigível na data indicada acima**' : ''}

---

${isRecibo ? `## DECLARAÇÃO DE QUITAÇÃO

Eu, **${data.emitente}**, declaro ter recebido de **${data.cliente}** a quantia de **${valorBruto.toLocaleString('pt-MZ')} MZN** (por extenso: ________________________________), a título de pagamento pelo(s) bem(ns)/serviço(s) acima descritos, dando-lhe a plena e total quitação.` : ''}

**${data.emitente}**
${data.local}

_________________________________________
*(Assinatura${data.nuitEmitente ? ' e carimbo' : ''})*

---

*${comIVA ? 'Documento sujeito a IVA à taxa de 16%, conforme Lei n.º 32/2007, de 28 de Dezembro.' : 'Operação isenta ou não sujeita a IVA — ' + (data.iva || 'regime simplificado') + '.'}*
${isProforma ? '*Factura Proforma: documento sem valor fiscal. O IVA será aplicado na factura definitiva após confirmação da encomenda.*' : ''}`;
}

export function buildDataBlock(data) {
        const valorBase = parseFloat(data.valor || 0);
        const taxaIva   = data.iva === 'Sim' ? 16 : (parseFloat(data.taxaIva) || 0);
        const valorIva  = valorBase * taxaIva / 100;
        const valorTotal = valorBase + valorIva;
        return `- Tipo: ${data.tipoDoc || 'Recibo Simples'}
- Emitente: ${data.emitente || ''}  |  NUIT: ${data.nuitEmitente || 'N/A'}
- Cliente: ${data.cliente || ''}  |  BI/NUIT: ${data.biCliente || ''}
- Descrição: ${data.descricao || ''}
- Valor base: ${valorBase.toLocaleString('pt-MZ')} MZN | IVA: ${taxaIva}% | Total: ${valorTotal.toLocaleString('pt-MZ')} MZN
- Pagamento: ${data.pagamento || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{EMITENTE}} = ${data.emitente || ''}
{{NUIT_EMITENTE}} = ${data.nuitEmitente || 'N/A'}
{{CLIENTE}} = ${data.cliente || ''}
{{BI_CLIENTE}} = ${data.biCliente || ''}
{{DESCRICAO}} = ${data.descricao || ''}
{{NUM_DOC}} = ${data.numDoc || '001/' + new Date().getFullYear()}
{{DATA}} = data de hoje por extenso
{{FORMA_PAGAMENTO}} = ${data.pagamento || 'Numerário'}
{{ITEMS_RECIBO}} = gere 1-3 linhas <tr><td>descrição</td><td>qtd</td><td>preço unit</td><td>total</td></tr> para: "${data.descricao || ''}"
{{TAXA_IVA}} = ${taxaIva}
{{VALOR_IVA}} = ${valorIva.toLocaleString('pt-MZ')} MZN
{{SUBTOTAL}} = ${valorBase.toLocaleString('pt-MZ')} MZN
{{VALOR_TOTAL}} = ${valorTotal.toLocaleString('pt-MZ')} MZN`;
}
