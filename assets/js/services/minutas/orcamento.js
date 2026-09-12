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
//
// NOTA (bug encontrado e corrigido — compatibilidade com o "Re-Skin"/
// Galeria de Templates, assets/js/marketplace/TemplatePicker.js, bloco
// `key === 'orcamento'`): esse código extrai CLIENTE e TOTAL_GERAL por
// regex sobre o texto bruto gerado. Isso quebrava de duas formas com a
// estrutura acima: 1) a própria secção "## CLIENTE / REQUISITANTE" contém
// a palavra "Cliente" seguida de espaço, e como o regex
// /(?:Cliente|Para)[:\s]+(.+)/i apanha a PRIMEIRA ocorrência da palavra no
// texto (antes de chegar à linha real "Nome: ..."), extraía "/
// REQUISITANTE" em vez do nome do cliente; 2) o "**" colado ao valor em
// "**VALOR TOTAL:** **10.000 MZN**" nunca casa com
// /(?:Total\s*Geral|TOTAL)[:\s]*([\d\s.,]+)\s*MZN/i, porque a classe
// [:\s]* não inclui asterisco — resultado: TOTAL_GERAL ficava sempre
// vazio. Confirmado com um teste manual reproduzindo o texto gerado real
// (CLIENTE saía "/ REQUISITANTE"; TOTAL_GERAL saía ""). Corrigido sem tocar
// em TemplatePicker.js: as duas linhas simples "Cliente: ..." / "Total
// Geral: ... MZN" logo no topo do documento (sem negrito à volta do valor)
// alimentam essa extracção de forma fiável, sem afectar a tabela bonita
// que continua a ser a fonte "oficial" do documento para o utilizador.
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
  const validade = data.validade || '30 dias';

  // UX (Set/2026 — "o orçamento está com cara de recibo"): o motor de
  // renderização (A4Renderer.js) é genérico para TODOS os documentos — não
  // há folha de estilo por tipo, então a única forma de diferenciar
  // orçamento de recibo é pela ESTRUTURA/CONTEÚDO do próprio texto. Um
  // Nota: chegámos a tentar usar '> texto' (blockquote) para este aviso —
  // a CSS existe (DEFAULT_PAGE_CSS tem regra para <blockquote>), mas
  // markdownToHtml() escapa a string INTEIRA para HTML antes de analisar
  // linha a linha, por isso o '>' já chega como '&gt;' ao detector de
  // blockquote e nunca casa — bug pré-existente no motor partilhado, não
  // específico deste ficheiro (confirmado: nenhum outro minuta usa '>' na
  // prática). Não corrigido aqui de propósito — mexer em A4Renderer.js
  // afecta a renderização de TODOS os documentos da app, risco a avaliar
  // à parte. Em vez disso, o aviso usa só **negrito**, que já funciona. O
  // bloco de aceitação no fim (duas assinaturas, não uma, numa tabela real
  // — texto com espaços manuais NÃO funciona: o navegador colapsa espaços
  // consecutivos, testado e confirmado) e o
  // "ESTIMADO" no total reforçam a mesma ideia. Ver também: existe já uma
  // Galeria de Modelos com 5 designs próprios para orçamento (botão "🎨
  // Modelo" no resultado — assets/js/marketplace/TemplatePicker.js) para
  // quem quiser um visual totalmente diferente, não só o texto.
  return `---

# PROPOSTA DE ORÇAMENTO

## ${tipo.toUpperCase()}

**N.º:** ${numOrc}
**Data:** ${dataFmt}

**📋 Nota:** este documento é uma proposta de valores — só se torna definitivo depois de aceite pelo cliente. Válido por **${validade}** a contar da data acima.

Cliente: ${data.cliente || ''}
Total Geral: ${formatMZN(valorTotal)} MZN

---

## RESUMO

| | |
|---|---|
| **Descrição:** | ${data.titulo || ''} |
| **Cliente:** | ${data.cliente || ''} |
${data.local ? `| **Local:** | ${data.local} |\n` : ''}| **Validade da proposta:** | ${validade} |

---

## ITENS / SERVIÇOS ORÇAMENTADOS

| Descrição | Qtd | Preço Unit. estimado (MZN) | Subtotal (MZN) |
|---|---|---|---|
${itens.length
  ? itens.map(it => `| ${it.desc} | ${it.qtd} | ${formatMZN(it.preco)} | ${formatMZN(it.subtotal)} |`).join('\n')
  : `| ${(data.obs || 'Item a definir').trim()} | 1 | ${formatMZN(valorTotal)} | ${formatMZN(valorTotal)} |`}
| | | **VALOR TOTAL ESTIMADO:** | **${formatMZN(valorTotal)} MZN** |

---

## CONDIÇÕES

- **Forma de pagamento:** ${data.condicoes || 'a combinar'}
${data.prazo ? `- **Prazo de execução/entrega:** ${data.prazo}` : ''}
- **Validade desta proposta:** ${validade} a contar da data acima
${data.obs ? `\n**Observações:** ${data.obs}` : ''}

---

## ACEITAÇÃO

*Após aceitação, deve ser emitido o recibo/factura correspondente — este documento, por si só, não tem valor fiscal nem comprovativo de pagamento.*

| Elaborado por: | Aceito pelo cliente: |
|---|---|
| _________________________________ | _________________________________ |
| ${(data.emitente || '(nome de quem elabora)')} | ${data.cliente || '(nome do cliente)'} |
| Data: ___/___/______ | Data: ___/___/______ |`;
}
