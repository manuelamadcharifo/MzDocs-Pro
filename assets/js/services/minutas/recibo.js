// assets/js/services/minutas/recibo.js
// MINUTA FIXA — Recibo / Factura / Factura Proforma / Factura-Recibo /
// Nota de Encomenda / Nota de Débito. Zero chamadas a IA: todo o conteúdo já
// era 100% calculado em JS (itens, IVA, total) em services/prompts/recibo.js
// — a IA só reescrevia/formatava dados que já estavam prontos. Esta minuta
// reproduz EXACTAMENTE a mesma estrutura final ("DOCUMENTO COMPLETO:" em
// diante) desse ficheiro, sem o preâmbulo de instruções dirigido à IA.
import { formatMZN, dataHojeExtenso } from './_shared.js';

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

function _parseItens(data) {
  let itens = [];
  try { itens = JSON.parse(data.itens || '[]'); } catch (e) { itens = []; }
  if (!Array.isArray(itens)) itens = [];
  return itens
    .filter(it => it && (it.desc || it.qtd || it.preco))
    .map(it => ({
      desc: (it.desc || 'Item').trim(),
      qtd: parseFloat(it.qtd) || 1,
      preco: parseFloat(it.preco) || 0,
      subtotal: typeof it.subtotal === 'number' ? it.subtotal : (parseFloat(it.qtd) || 1) * (parseFloat(it.preco) || 0),
    }));
}

export function render(data = {}) {
  const hoje = new Date();
  const dataFmt = dataHojeExtenso();
  const tipoDoc = data.tipoDoc || 'Recibo Simples';

  const isFactura       = tipoDoc === 'Factura';
  const isProforma      = tipoDoc === 'Factura Proforma';
  const isFacturaRecibo = tipoDoc === 'Factura-Recibo';
  const isNEncomenda    = tipoDoc === 'Nota de Encomenda';
  const isNDebito       = tipoDoc === 'Nota de Débito';
  const isRecibo        = tipoDoc === 'Recibo Simples';

  const nuitObrigatorio = isFactura || isProforma || isFacturaRecibo || isNDebito;
  const temQuitacao = isRecibo || isFacturaRecibo;

  const valorBruto = parseFloat(data.valor || 0);
  const comIVA = /^sim/i.test((data.iva || '').trim()) && !isProforma && !isNEncomenda;
  const valorIVA = comIVA ? (valorBruto * 0.16) : 0;
  const valorLiquido = comIVA ? (valorBruto * 1.16) : valorBruto;

  const validadeProforma = isProforma ? (data.validadeProforma || 30) : null;
  const prefixo = _tipoInfo(tipoDoc);
  const numDoc = (data.numDoc || '').trim() || `${prefixo}/____/${hoje.getFullYear()}`;
  const itens = _parseItens(data);

  return `---

# ${tipoDoc.toUpperCase()}

**N.º:** ${numDoc}
**Data:** ${dataFmt}
${isProforma ? `**Válida até:** ${validadeProforma} dias após a data acima\n**Esta Proforma NÃO constitui cobrança fiscal — sujeita a confirmação de encomenda**` : ''}
${isNEncomenda ? '**Este documento é um pedido de encomenda — não constitui factura nem recibo de pagamento**' : ''}

---

## EMITENTE

| | |
|---|---|
| **Nome / Empresa:** | ${data.emitente || ''} |
| **NUIT:** | ${data.nuitEmitente || (nuitObrigatorio ? '**[INSERIR NUIT — OBRIGATÓRIO]**' : 'N/A (regime simplificado)')} |
| **Endereço / Contacto:** | ${data.enderecoEmitente || '________________________________'} |

## CLIENTE / ADQUIRENTE

| | |
|---|---|
| **Nome:** | ${data.cliente || ''} |
| **BI / NUIT:** | ${data.biCliente || '________________________________'} |

---

## DESCRIÇÃO ${isNDebito ? '(VALOR ADICIONAL — referente à Factura n.º _________)' : ''}

| Descrição | Qtd | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|
${itens.length
  ? itens.map(it => `| ${it.desc} | ${it.qtd} | ${formatMZN(it.preco)} | ${formatMZN(it.subtotal)} |`).join('\n')
  : `| ${(data.obs || 'Serviço/produto prestado').trim()} | 1 | ${formatMZN(valorBruto)} | ${formatMZN(valorBruto)} |`}
${comIVA ? `| | | **IVA (16%):** | **${formatMZN(valorIVA)}** |
| | | **TOTAL (com IVA):** | **${formatMZN(valorLiquido)} MZN** |` : `| | | **TOTAL:** | **${formatMZN(valorBruto)} MZN** |`}

---

## CONDIÇÕES DE PAGAMENTO

- **Forma:** ${data.pagamento || (isNEncomenda ? 'a combinar (encomenda ainda não paga)' : 'não indicado')}
${data.contaBancaria ? '- **Conta / M-Pesa:** ' + data.contaBancaria : ''}
${isProforma ? `- **Condições de entrega:** [PREENCHER: condições de entrega]\n- **Validade desta proforma:** ${validadeProforma} dias a contar da data acima` : ''}
${isNDebito ? '- **Prazo de pagamento:** ______ dias a contar da data deste documento' : ''}
${isNEncomenda ? '- **Prazo de entrega/execução previsto:** [PREENCHER: prazo combinado com o cliente]' : ''}
${!isProforma && !isRecibo && !isNEncomenda && !isFacturaRecibo ? '- **Esta factura é exigível na data indicada acima**' : ''}

---

${temQuitacao ? `## DECLARAÇÃO DE QUITAÇÃO

Eu, **${data.emitente || ''}**, declaro ter recebido de **${data.cliente || ''}** a quantia de **${formatMZN(valorLiquido)} MZN** (por extenso: ________________________________), a título de pagamento pelo(s) bem(ns)/serviço(s) acima descritos, dando-lhe a plena e total quitação.

` : ''}**${data.emitente || ''}**
${data.local || ''}

_________________________________________
*(Assinatura${data.nuitEmitente ? ' e carimbo' : ''})*

---

*${comIVA ? 'Documento sujeito a IVA à taxa de 16%, conforme Lei n.º 32/2007, de 28 de Dezembro.' : 'Operação isenta ou não sujeita a IVA — regime simplificado / não aplicável a este tipo de documento.'}*
${isProforma ? '*Factura Proforma: documento sem valor fiscal. O IVA será aplicado na factura definitiva após confirmação da encomenda.*' : ''}
${isNEncomenda ? '*Nota de Encomenda: documento informativo sem valor fiscal. A factura ou recibo correspondente deve ser emitido(a) após confirmação/entrega.*' : ''}`;
}
