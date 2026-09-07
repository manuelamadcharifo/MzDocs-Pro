// assets/js/services/minutas/procuracao.js
// MINUTA FIXA — Procuração / Mandato.
//
// ACHADO CRÍTICO (Set/2026): o gerador por IA actualmente activo para este
// serviço (services/prompts/procuracao.js) NÃO contém texto de procuração
// nenhum — o seu conteúdo é uma cópia de um contrato de prestação de
// serviços (lê data.prestador/data.cliente/data.servico/data.valorTotal),
// campos que não existem no formulário real de "Procuração / Mandato"
// (ServiceDefinitions.js → procuracao.fields usa outorgante/procurador/
// acto/tipoProc/subMandato/validade/tipoDocIdent/local). Ou seja, hoje,
// gerar uma "Procuração / Mandato" (3 créditos) produz um documento errado
// e sem sentido, cheio de dados em falta. Esta minuta é escrita de raiz,
// com os campos REAIS do formulário, e substitui esse caminho por completo.
import { dataHojeExtenso } from './_shared.js';

const ARTIGO_POR_TIPO = {
  'Geral (todos os actos)':     'mandato geral, para a prática de todos os actos de administração ordinária',
  'Especial (acto específico)': 'mandato especial, para a prática do(s) acto(s) especificamente indicado(s) abaixo',
  'Judicial':                   'mandato forense, para representação em processo(s) judicial(is)',
  'Bancária':                   'mandato especial para operações bancárias',
  'Venda de Imóvel':            'mandato especial para venda/transmissão de bem imóvel',
  'Herança':                    'mandato especial para actos relativos a processo de herança/partilha',
  'Matrícula Escolar':          'mandato especial para actos de matrícula escolar',
};

export function render(data = {}) {
  const tipoProc = data.tipoProc || 'Geral (todos os actos)';
  const outorgante = data.outorgante || '';
  const biOutorgante = data.biOutorgante || '';
  const moradaOutorgante = data.moradaOutorgante || '';
  const procurador = data.procurador || '';
  const biProcurador = data.biProcurador || '';
  const moradaProcurador = data.moradaProcurador || '';
  const tipoDocIdent = data.tipoDocIdent || 'Bilhete de Identidade (BI)';
  const acto = data.acto || '';
  const subMandato = data.subMandato || 'Não (poderes intransmissíveis)';
  const validade = data.validade || 'Indeterminada';
  const local = data.local || `Maputo, ${dataHojeExtenso()}`;
  const foro = local.split(',')[0]?.trim() || 'Maputo';
  const finalidadeTexto = ARTIGO_POR_TIPO[tipoProc] || ARTIGO_POR_TIPO['Geral (todos os actos)'];

  const validadeFrase = validade === 'Até revogação' || validade === 'Indeterminada'
    ? 'por prazo indeterminado, mantendo-se válida até expressa revogação pelo Outorgante'
    : `pelo prazo de **${validade}**, a contar da data da presente procuração`;

  const subMandatoFrase = subMandato === 'Não (poderes intransmissíveis)'
    ? 'O Procurador NÃO PODE substabelecer, no todo ou em parte, os poderes conferidos por este instrumento, sendo os mesmos pessoais e intransmissíveis.'
    : subMandato === 'Sim, no todo'
      ? 'O Procurador PODE substabelecer, no todo, os poderes conferidos por este instrumento a terceiro(s) da sua confiança, sem necessidade de nova autorização do Outorgante.'
      : 'O Procurador PODE substabelecer PARCIALMENTE os poderes conferidos por este instrumento a terceiro(s) da sua confiança, mantendo para si os restantes poderes.';

  return `---

# PROCURAÇÃO

**(${tipoProc.toUpperCase()})**

---

**OUTORGANTE:** ${outorgante}, portador(a) do ${tipoDocIdent} n.º **${biOutorgante}**, com morada em **${moradaOutorgante}**, doravante designado(a) **"Outorgante"**;

Pelo presente instrumento de mandato, nos termos dos artigos 1157.º e seguintes do Código Civil de Moçambique (Mandato), constitui seu bastante procurador:

**PROCURADOR:** ${procurador}, portador(a) do ${tipoDocIdent} n.º **${biProcurador}**, com morada em **${moradaProcurador}**, doravante designado(a) **"Procurador"**;

a quem confere os poderes constantes do presente ${finalidadeTexto}.

---

## **CLÁUSULA 1.ª — OBJECTO E PODERES**

1.1 O Outorgante confere ao Procurador os poderes necessários para, em seu nome e representação, praticar o(s) seguinte(s) acto(s):

**${acto}**

1.2 Para o efeito, o Procurador fica autorizado a assinar requerimentos, receber e entregar documentos, prestar declarações e praticar todos os demais actos necessários e directamente relacionados com o objecto acima indicado, perante quaisquer entidades públicas ou privadas.

---

## **CLÁUSULA 2.ª — SUBSTABELECIMENTO**

2.1 ${subMandatoFrase}

---

## **CLÁUSULA 3.ª — VALIDADE**

3.1 A presente procuração é válida ${validadeFrase}.

3.2 A presente procuração pode ser revogada a todo o tempo pelo Outorgante, mediante comunicação escrita ao Procurador e, sendo caso disso, às entidades perante as quais a procuração produza efeitos.

---

## **CLÁUSULA 4.ª — RESPONSABILIDADE**

4.1 O Procurador obriga-se a exercer o mandato com zelo e diligência, no estrito interesse do Outorgante, prestando contas de tudo quanto praticar em execução deste mandato.

4.2 O Procurador responde perante o Outorgante pelos actos que pratique fora dos limites dos poderes aqui conferidos.

---

## **CLÁUSULA 5.ª — FORO**

5.1 Para dirimir qualquer questão emergente da presente procuração, fica eleito o **Tribunal Judicial de Distrito de ${foro}**, com renúncia expressa a qualquer outro.

---

**${local}**

**O(A) OUTORGANTE:**

_________________________________________
**${outorgante}**
${tipoDocIdent} n.º ${biOutorgante}

---

*Reconhecimento notarial da assinatura do Outorgante recomendado para procurações bancárias, judiciais, de venda de imóvel ou herança.*
*Documento emitido pela plataforma MzDocs Pro. A autenticidade dos dados é da responsabilidade exclusiva do Outorgante.*`;
}
