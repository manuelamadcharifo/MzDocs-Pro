// assets/js/services/prompts/recibo.js
// CORRIGIDO (2.4): os ids dos campos do formulário (ServiceDefinitions.js →
// recibo.fields) foram renomeados para bater com as variáveis que este
// ficheiro já esperava (nuitEmitente, enderecoEmitente, biCliente, valor,
// iva, contaBancaria, validadeProforma, numDoc) — antes o formulário
// enviava 'nuit' e 'total', que nunca existiam aqui, pelo que o NUIT, o
// endereço, o BI do cliente e o IVA nunca chegavam à IA. Também foi
// adicionado suporte completo aos 6 tipos de documento (antes só 4 tinham
// tratamento explícito) e a comparação do campo IVA deixou de exigir o
// texto exacto "Sim" (agora aceita qualquer opção que comece por "Sim").

function _tipoInfo(tipoDoc) {
  const prefixos = {
    'Recibo Simples':    'REC',
    'Factura':            'FT',
    'Factura Proforma':   'FP',
    'Factura-Recibo':     'FR',
    'Nota de Encomenda':  'NE',
    'Nota de Débito':     'ND',
  };
  return prefixos[tipoDoc] || 'DOC';
}

export function buildPrompt(data, ocrBlock) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoDoc = data.tipoDoc || 'Recibo Simples';

        const isFactura       = tipoDoc === 'Factura';
        const isProforma      = tipoDoc === 'Factura Proforma';
        const isFacturaRecibo = tipoDoc === 'Factura-Recibo';
        const isNEncomenda    = tipoDoc === 'Nota de Encomenda';
        const isNDebito       = tipoDoc === 'Nota de Débito';
        const isRecibo        = tipoDoc === 'Recibo Simples';

        // NUIT do emitente é legalmente exigido em qualquer documento com
        // valor fiscal (factura, proforma, factura-recibo, nota de débito).
        const nuitObrigatorio = isFactura || isProforma || isFacturaRecibo || isNDebito;
        // Declaração de quitação só faz sentido quando o documento confirma
        // um pagamento já recebido (recibo simples ou factura-recibo).
        const temQuitacao = isRecibo || isFacturaRecibo;

        const valorBruto = parseFloat(data.valor || 0);
        // CORRIGIDO: antes exigia o texto exacto "Sim"; agora aceita
        // qualquer opção do select que comece por "Sim" (ex.: "Sim (regime
        // normal — 16%)"), evitando que a escolha do IVA seja ignorada por
        // não bater caracter-a-caracter com o texto da opção.
        const comIVA = /^sim/i.test((data.iva || '').trim());
        const valorIVA = comIVA ? (valorBruto * 0.16) : 0;
        const valorLiquido = comIVA ? (valorBruto * 1.16) : valorBruto;

        const validadeProforma = isProforma ? (data.validadeProforma || 30) : null;
        const prefixo = _tipoInfo(tipoDoc);
        const numDoc = (data.numDoc || '').trim() || `${prefixo}/____/${hoje.getFullYear()}`;

        return `Você é contabilista especializado no regime fiscal moçambicano. Elabore um(a) ${tipoDoc.toUpperCase()} completo(a) e conforme a legislação tributária vigente.

BASE LEGAL APLICÁVEL:
- Lei n.º 32/2007, de 28 de Dezembro (Lei do IVA em Moçambique) — IVA à taxa de 16%
- Decreto n.º 7/2008 (Regulamento do IVA)
- Decreto n.º 70/2022, de 31 de Dezembro (Faturação eletrónica — obrigatória para grandes contribuintes)
- Circular n.º 8/AT/2016 (Autoridade Tributária — requisitos de documentos fiscais)
- Lei n.º 15/2002, de 26 de Junho (Lei de Bases do Sistema Tributário de Moçambique)
- Lei n.º 5/2009, de 12 de Janeiro (Regime Especial para Pequenos Contribuintes — ISPC)

DADOS:
- Tipo de documento: ${tipoDoc}
- N.º do documento: ${numDoc}
- Emitente: ${data.emitente} | NUIT: ${data.nuitEmitente || (nuitObrigatorio ? '[OBRIGATÓRIO — não fornecido]' : 'N/A')}
- Endereço/contacto emitente: ${data.enderecoEmitente || '________________________________'}
- Cliente: ${data.cliente} | BI/NUIT: ${data.biCliente || 'N/A'}
- Descrição: ${data.descricao}
- Valor base: ${valorBruto.toLocaleString('pt-MZ')} MZN
- IVA: ${comIVA ? 'Sim (16%)' : 'Não (regime simplificado / isento)'}
- Forma de pagamento: ${data.pagamento || (isNEncomenda ? 'a combinar (encomenda ainda não paga)' : 'não indicado')}
- Conta/M-Pesa: ${data.contaBancaria || 'não indicado'}
${isProforma ? '- Validade da proforma: ' + validadeProforma + ' dias' : ''}
- Local e data: ${data.local}${ocrBlock}

REGRAS FISCAIS CRÍTICAS:
1. ${isFactura ? 'FACTURA: NUIT do emitente é OBRIGATÓRIO. Numeração sequencial obrigatória. IVA separado do valor base se aplicável.' : ''}
2. ${isProforma ? 'FACTURA PROFORMA: é uma ESTIMATIVA, não uma cobrança. NÃO aplique IVA (o IVA só é exigível na factura definitiva), mesmo que "Aplicar IVA" tenha sido assinalado. Inclua validade de ' + validadeProforma + ' dias e condições de entrega.' : ''}
3. ${isRecibo ? 'RECIBO SIMPLES: documento de quitação — confirma pagamento já recebido. NUIT do emitente é opcional (comum em pequenos negócios no regime simplificado).' : ''}
4. ${isFacturaRecibo ? 'FACTURA-RECIBO: documento híbrido — funciona simultaneamente como factura fiscal E como comprovativo de pagamento já recebido. NUIT do emitente é OBRIGATÓRIO. Inclua a declaração de quitação no final.' : ''}
5. ${isNEncomenda ? 'NOTA DE ENCOMENDA: é um PEDIDO/ENCOMENDA de bens ou serviços, ainda NÃO é um documento de cobrança nem de quitação. Não aplique IVA nem inclua declaração de pagamento recebido — apenas confirme os artigos/serviços encomendados e as condições combinadas.' : ''}
6. ${isNDebito ? 'NOTA DE DÉBITO: emitida para cobrar valores adicionais não incluídos na factura original. Deve referenciar a factura original (indique "Factura n.º _________" caso não tenha sido fornecido). NUIT do emitente é OBRIGATÓRIO.' : ''}
7. ${comIVA && !isProforma && !isNEncomenda ? 'IVA calculado: base ' + valorBruto.toLocaleString('pt-MZ') + ' MZN × 16% = ' + valorIVA.toLocaleString('pt-MZ') + ' MZN | Total c/ IVA: ' + valorLiquido.toLocaleString('pt-MZ') + ' MZN' : 'Operação sem IVA — motivo: ' + (comIVA ? 'não aplicável a este tipo de documento' : 'regime simplificado / isento')}
8. ${nuitObrigatorio && !data.nuitEmitente ? 'ATENÇÃO: NUIT do emitente não foi fornecido — assinale claramente no documento como [OBRIGATÓRIO — INSERIR NUIT]' : ''}

DOCUMENTO COMPLETO:

---

# ${tipoDoc.toUpperCase()}

**N.º:** ${numDoc}
**Data:** ${dataFmt}
${isProforma ? '**Válida até:** [calcular: ' + validadeProforma + ' dias após data acima]\n**Esta Proforma NÃO constitui cobrança fiscal — sujeita a confirmação de encomenda**' : ''}
${isNEncomenda ? '**Este documento é um pedido de encomenda — não constitui factura nem recibo de pagamento**' : ''}

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

| Descrição | ${comIVA && !isProforma && !isNEncomenda ? 'Valor Base (MZN)' : 'Valor (MZN)'} |
|---|---|
${data.descricao.split('\n').filter(Boolean).map(linha => `| ${linha.trim()} | |`).join('\n')}
${comIVA && !isProforma && !isNEncomenda ? `| | |
| **Subtotal (sem IVA):** | **${valorBruto.toLocaleString('pt-MZ')}** |
| **IVA (16%):** | **${valorIVA.toLocaleString('pt-MZ')}** |
| **TOTAL (com IVA):** | **${valorLiquido.toLocaleString('pt-MZ')} MZN** |` : `| **TOTAL:** | **${valorBruto.toLocaleString('pt-MZ')} MZN** |`}

---

## CONDIÇÕES DE PAGAMENTO

- **Forma:** ${data.pagamento || (isNEncomenda ? 'a combinar (encomenda ainda não paga)' : 'não indicado')}
${data.contaBancaria ? '- **Conta / M-Pesa:** ' + data.contaBancaria : ''}
${isProforma ? `- **Condições de entrega:** [definir: imediata / prazo / condições] \n- **Validade desta proforma:** ${validadeProforma} dias a contar da data acima` : ''}
${isNDebito ? '- **Prazo de pagamento:** ______ dias a contar da data deste documento' : ''}
${isNEncomenda ? '- **Prazo de entrega/execução previsto:** [a combinar com o cliente]' : ''}
${!isProforma && !isRecibo && !isNEncomenda && !isFacturaRecibo ? '- **Esta factura é exigível na data indicada acima**' : ''}

---

${temQuitacao ? `## DECLARAÇÃO DE QUITAÇÃO

Eu, **${data.emitente}**, declaro ter recebido de **${data.cliente}** a quantia de **${valorLiquido.toLocaleString('pt-MZ')} MZN** (por extenso: ________________________________), a título de pagamento pelo(s) bem(ns)/serviço(s) acima descritos, dando-lhe a plena e total quitação.` : ''}

**${data.emitente}**
${data.local}

_________________________________________
*(Assinatura${data.nuitEmitente ? ' e carimbo' : ''})*

---

*${comIVA && !isProforma && !isNEncomenda ? 'Documento sujeito a IVA à taxa de 16%, conforme Lei n.º 32/2007, de 28 de Dezembro.' : 'Operação isenta ou não sujeita a IVA — regime simplificado / não aplicável a este tipo de documento.'}*
${isProforma ? '*Factura Proforma: documento sem valor fiscal. O IVA será aplicado na factura definitiva após confirmação da encomenda.*' : ''}
${isNEncomenda ? '*Nota de Encomenda: documento informativo sem valor fiscal. A factura ou recibo correspondente deve ser emitido(a) após confirmação/entrega.*' : ''}`;
}

export function buildDataBlock(data) {
        const tipoDoc = data.tipoDoc || 'Recibo Simples';
        const isProforma   = tipoDoc === 'Factura Proforma';
        const isNEncomenda = tipoDoc === 'Nota de Encomenda';
        const valorBase = parseFloat(data.valor || 0);
        const comIVA    = /^sim/i.test((data.iva || '').trim()) && !isProforma && !isNEncomenda;
        const taxaIva   = comIVA ? 16 : 0;
        const valorIva  = valorBase * taxaIva / 100;
        const valorTotal = valorBase + valorIva;
        const numDoc = (data.numDoc || '').trim() || `${_tipoInfo(tipoDoc)}/001/${new Date().getFullYear()}`;
        return `- Tipo: ${tipoDoc}
- N.º: ${numDoc}
- Emitente: ${data.emitente || ''}  |  NUIT: ${data.nuitEmitente || 'N/A'}  |  Endereço: ${data.enderecoEmitente || 'N/A'}
- Cliente: ${data.cliente || ''}  |  BI/NUIT: ${data.biCliente || ''}
- Descrição: ${data.descricao || ''}
- Valor base: ${valorBase.toLocaleString('pt-MZ')} MZN | IVA: ${taxaIva}% | Total: ${valorTotal.toLocaleString('pt-MZ')} MZN
- Pagamento: ${data.pagamento || ''}${data.contaBancaria ? ' | Conta/M-Pesa: ' + data.contaBancaria : ''}

MAPEAMENTO DE PLACEHOLDERS:
{{EMITENTE}} = ${data.emitente || ''}
{{NUIT_EMITENTE}} = ${data.nuitEmitente || 'N/A'}
{{ENDERECO_EMITENTE}} = ${data.enderecoEmitente || ''}
{{CLIENTE}} = ${data.cliente || ''}
{{BI_CLIENTE}} = ${data.biCliente || ''}
{{DESCRICAO}} = ${data.descricao || ''}
{{NUM_DOC}} = ${numDoc}
{{DATA}} = data de hoje por extenso
{{FORMA_PAGAMENTO}} = ${data.pagamento || 'Numerário'}
{{ITEMS_RECIBO}} = gere 1-3 linhas <tr><td>descrição</td><td>qtd</td><td>preço unit</td><td>total</td></tr> para: "${data.descricao || ''}"
{{TAXA_IVA}} = ${taxaIva}
{{VALOR_IVA}} = ${valorIva.toLocaleString('pt-MZ')} MZN
{{SUBTOTAL}} = ${valorBase.toLocaleString('pt-MZ')} MZN
{{VALOR_TOTAL}} = ${valorTotal.toLocaleString('pt-MZ')} MZN`;
}
