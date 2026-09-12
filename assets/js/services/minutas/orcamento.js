// assets/js/services/minutas/orcamento.js
// MINUTA FIXA — Orçamento (genérico, qualquer tipo de trabalho/negócio).
//
// NOVO (Set/2026 — generalização pedida explicitamente): substitui o antigo
// "Orçamento de Obra" (só construção civil, gerado por IA a partir de texto
// livre, sem tabela de itens nem soma automática) por um orçamento GENÉRICO,
// no mesmo padrão de minuta fixa já usado por 'recibo' — zero chamadas a
// IA, montagem local instantânea, com tabela de itens real cujo subtotal
// por linha e total geral se calculam sozinhos (ver ServiceDefinitions.js,
// entrada 'orcamento', para o detalhe completo do porquê).
//
// _parseItens() é uma cópia deliberada da mesma função em recibo.js (em vez
// de a importar de lá) — os dois ficheiros são independentes por desenho
// (ver comentário em minutas/index.js: "basta criar um ficheiro novo,
// nenhuma outra alteração é necessária"); duplicar uma função pequena e
// estável é preferível a criar um acoplamento entre duas minutas que não
// têm mais nada em comum.
import { formatMZN, dataHojeExtenso } from './_shared.js';

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
  const dataFmt = dataHojeExtenso();
  const hoje = new Date();

  // "Outro (personalizado)" deixa o próprio utilizador escrever o tipo —
  // ver ServiceDefinitions.js (tipoOrcamentoCustom, requiredIf/conditional
  // ligados a este select, mesmo mecanismo já usado em 'recibo').
  const tipo = (data.tipoOrcamento === 'Outro (personalizado)'
    ? (data.tipoOrcamentoCustom || 'Personalizado')
    : (data.tipoOrcamento || 'Geral')).trim();

  const itens = _parseItens(data);
  const valorTotal = parseFloat(data.valorTotal || 0) || itens.reduce((s, it) => s + it.subtotal, 0);
  const numOrc = `ORC/____/${hoje.getFullYear()}`;

  return `---

# ORÇAMENTO — ${tipo.toUpperCase()}

**N.º:** ${numOrc}
**Data:** ${dataFmt}
**Válido por:** ${data.validade || '30 dias'} a contar da data acima

---

## DESCRIÇÃO GERAL

**${data.titulo || ''}**
${data.local ? `\n**Local:** ${data.local}` : ''}

## CLIENTE / REQUISITANTE

| | |
|---|---|
| **Nome:** | ${data.cliente || ''} |

---

## ITENS / SERVIÇOS ORÇAMENTADOS

| Descrição | Qtd | Preço Unit. (MZN) | Subtotal (MZN) |
|---|---|---|---|
${itens.length
  ? itens.map(it => `| ${it.desc} | ${it.qtd} | ${formatMZN(it.preco)} | ${formatMZN(it.subtotal)} |`).join('\n')
  : `| ${(data.obs || 'Item a definir').trim()} | 1 | ${formatMZN(valorTotal)} | ${formatMZN(valorTotal)} |`}
| | | **VALOR TOTAL:** | **${formatMZN(valorTotal)} MZN** |

---

## CONDIÇÕES

- **Forma de pagamento:** ${data.condicoes || 'a combinar'}
${data.prazo ? `- **Prazo de execução/entrega:** ${data.prazo}` : ''}
- **Validade desta proposta:** ${data.validade || '30 dias'} a contar da data acima
${data.obs ? `\n**Observações:** ${data.obs}` : ''}

---

*Este orçamento é uma proposta de valores sujeita a confirmação — não constitui factura nem comprovativo de pagamento. Após aprovação do cliente, deve ser emitido o recibo/factura correspondente.*

_________________________________________
*(Assinatura de quem elabora o orçamento)*`;
}
