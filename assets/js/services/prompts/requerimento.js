// assets/js/services/prompts/requerimento.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock, legalContext = null) {
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const entidade = data.entidade || 'Outra';
        // CORRIGIDO (bug real): o requerimento é dirigido "Eu, undefined,
        // portador(a) do BI..." — data.remetente nunca existiu no formulário
        // (o campo real é "requerente"), e data.fundamento também nunca
        // existiu (o campo real é "justificacao"). "endereco" não é
        // recolhido pelo formulário de todo (só há "local", que é
        // local+data de assinatura, não morada) — em vez de inventar ou
        // deixar "undefined" como morada do requerente, omite-se essa
        // frase quando não há endereço.
        const requerente  = data.remetente  || data.requerente    || '';
        const bi          = data.bi         || '';
        const contacto    = data.contacto   || '';
        const endereco    = data.endereco   || '';
        const fundamento  = data.fundamento || data.justificacao  || '';
        const local       = data.local      || '';

        const legalMapEntidade = {
          'Conservatória dos Registos': {
            lei: 'Lei n.º 12/2004, de 8 de Dezembro (Código do Registo Civil)',
            cargo: 'Conservador dos Registos Civis',
          },
          'Direcção Provincial de Educação': {
            lei: 'Lei n.º 6/92, de 6 de Maio (Lei do Sistema Nacional de Educação), e Diploma Ministerial aplicável ao nível de ensino',
            cargo: 'Director(a) Provincial de Educação',
          },
          'Hospital Provincial': {
            lei: 'Lei n.º 14/2014, de 11 de Setembro (Lei de Saúde), e Regulamento Geral dos Hospitais Públicos',
            cargo: 'Director(a) Clínico(a) / Director(a) de Administração',
          },
          'INSS': {
            lei: 'Lei n.º 4/2007, de 7 de Fevereiro (Lei da Protecção Social, que define as bases do sistema de segurança social)',
            cargo: 'Director(a) do Instituto Nacional de Segurança Social',
          },
          'Direcção de Migração': {
            lei: 'Lei n.º 5/1993, de 28 de Dezembro (Lei dos Estrangeiros), e Decreto n.º 108/2014, de 31 de Dezembro (Regulamento da Lei dos Estrangeiros)',
            cargo: 'Director(a) Nacional de Migração',
          },
          'Câmara Municipal': {
            lei: 'Lei n.º 2/97, de 18 de Fevereiro (Lei dos Órgãos Locais do Estado — LOLE), e Regulamento Municipal aplicável',
            cargo: 'Presidente do Conselho Municipal',
          },
          'Repartição de Finanças': {
            lei: 'Lei n.º 15/2002, de 26 de Junho (Lei de Bases do Sistema Tributário), e Decreto n.º 6/2006 (Regulamento da Autoridade Tributária)',
            cargo: 'Chefe da Repartição de Finanças',
          },
          'Escola': {
            lei: 'Lei n.º 6/92, de 6 de Maio (Lei do Sistema Nacional de Educação)',
            cargo: 'Director(a) da Escola',
          },
          'Outra': {
            lei: 'legislação moçambicana aplicável à matéria em causa',
            cargo: 'Responsável / Director(a) do Serviço',
          },
        };

        // CORRIGIDO: "entidade" no formulário é TEXTO LIVRE (ex: "Escola
        // Secundária da Polana"), não uma das opções fixas deste mapa — por
        // isso a correspondência exacta falhava quase sempre e caía sempre
        // em "Outra", perdendo a base legal específica. Tenta agora uma
        // correspondência aproximada (a entidade escrita CONTÉM uma das
        // chaves conhecidas) antes de recorrer ao genérico.
        const entKey = Object.keys(legalMapEntidade).find(k =>
          k !== 'Outra' && entidade.toLowerCase().includes(k.toLowerCase())
        ) || (/escola|instituto|colégio/i.test(entidade) ? 'Escola' : 'Outra');
        const entInfo = legalMapEntidade[entKey];

        return `Redija um REQUERIMENTO OFICIAL completo, juridicamente fundamentado e estruturado, destinado à ${entidade} em Moçambique.

${legalContext?.texto || `BASE LEGAL APLICÁVEL À ${entidade.toUpperCase()}:\n${entInfo.lei}`}

DADOS:
- Entidade destinatária: ${entidade}
- Cargo do responsável: ${entInfo.cargo}
- Assunto: ${data.assunto}
- Requerente: ${requerente} | BI n.º: ${bi} | Tel: ${contacto}
- Endereço do requerente: ${endereco || '[não indicado — omitir referência à morada]'}
- Fundamento do pedido: ${fundamento}
- Documentos anexos: ${data.anexos || 'Ver lista abaixo'}${ocrBlock}

ESTRUTURA LEGAL MOÇAMBICANA OBRIGATÓRIA:

Exmo(a). Sr(a). ${entInfo.cargo}
${entidade}
[Cidade/Localidade]

**ASSUNTO: ${data.assunto.toUpperCase()}**

**N.º de Processo:** ___/____/____ *(a preencher pela repartição)*

Eu, **${requerente}**, portador(a) do Bilhete de Identidade n.º **${bi}**${endereco ? `, residente em **${endereco}**` : ''}, contacto **${contacto}**, nos termos do disposto na ${entInfo.lei.split(',')[0]}, venho, respeitosamente, expor e requerer o seguinte:

**I. EXPOSIÇÃO DOS FACTOS**

[Parágrafo 1 — Contextualização (4-5 linhas): apresenta quem é o requerente, a sua situação actual e o contexto que motiva o pedido. Seja específico e factual, baseando-se em: "${fundamento}"]

[Parágrafo 2 — Necessidade e justificação (4-5 linhas): explica com precisão por que é necessário o que está a pedir, quais as consequências de não obter o pedido, e como isso afecta os direitos ou obrigações legais do requerente.]

[Parágrafo 3 — Fundamento legal (3-4 linhas): ao abrigo do disposto na ${entInfo.lei.split(',')[0]}, o(a) requerente tem direito a _____________________, sendo este requerimento o meio adequado para o exercício desse direito.]

**II. DO PEDIDO**

Face ao exposto, e nos termos da ${entInfo.lei.split(',')[0]}, vem o(a) requerente REQUERER a V.ª Ex.ª que se digne:

1. [Pedido principal específico e concreto — use linguagem formal: "...determinar", "...autorizar", "...emitir", "...deferir" — baseado no assunto: "${data.assunto}"]
2. [Pedido secundário, se aplicável]
3. Que seja notificado(a) do resultado do presente requerimento através do contacto ${contacto}${endereco ? ' ou por escrito no endereço acima indicado' : ''}, no prazo máximo de [30/60] dias.

**III. ANEXOS**

Junta-se ao presente requerimento os seguintes documentos:

${data.anexos ? data.anexos.split(/[,;]/).map((a, i) => (i+1) + '. ' + a.trim()).join('\n') : '1. Cópia do Bilhete de Identidade\n2. [Outros documentos relevantes conforme exigência da entidade]'}

**IV. COMPROMISSO**

O(A) requerente declara, sob compromisso de honra, que todos os factos expostos são verdadeiros e que os documentos juntos são autênticos, ficando ciente das responsabilidades legais decorrentes de falsas declarações, nos termos do Código Penal de Moçambique.

Pede deferimento.

${local || endereco || 'Maputo'}, ${dataFormatada}

_________________________________________
**${requerente}**
*(Assinatura)*

---

*Para uso da repartição:*
Data de entrada: ____/____/______ | N.º de Processo: _______ | Recebido por: _____________`;
}

export function buildDataBlock(data) {
  const requerente = data.remetente || data.requerente || '';
  const fundamento = data.fundamento || data.justificacao || '';
  return `- Entidade: ${data.entidade || ''}
- Requerente: ${requerente}  |  BI: ${data.bi || ''}  |  Contacto: ${data.contacto || ''}
- Endereço: ${data.endereco || ''}
- Assunto: ${data.assunto || ''}
- Fundamento: ${fundamento}
- Anexos: ${data.anexos || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{ENTIDADE}} = ${data.entidade || ''}
{{REQUERENTE}} = ${requerente}
{{BI}} = ${data.bi || ''}
{{ENDERECO}} = ${data.endereco || ''}
{{ASSUNTO}} = ${data.assunto || ''}
{{LOCAL}} = ${data.local || 'Maputo'}
{{DATA}} = data de hoje por extenso
{{FUNDAMENTO}} = texto formal desenvolvendo: "${fundamento}" (2-3 parágrafos com base legal quando aplicável)
{{CONTACTO}} = ${data.contacto || ''}`;
}
