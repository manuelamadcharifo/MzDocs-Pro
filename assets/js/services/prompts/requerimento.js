// assets/js/services/prompts/requerimento.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock, legalContext = null) {
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const entidade = data.entidade || 'Outra';

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
          'Outra': {
            lei: 'legislação moçambicana aplicável à matéria em causa',
            cargo: 'Responsável / Director(a) do Serviço',
          },
        };

        const entInfo = legalMapEntidade[entidade] || legalMapEntidade['Outra'];

        return `Redija um REQUERIMENTO OFICIAL completo, juridicamente fundamentado e estruturado, destinado à ${entidade} em Moçambique.

${legalContext?.texto || `BASE LEGAL APLICÁVEL À ${entidade.toUpperCase()}:\n${entInfo.lei}`}

DADOS:
- Entidade destinatária: ${entidade}
- Cargo do responsável: ${entInfo.cargo}
- Assunto: ${data.assunto}
- Requerente: ${data.remetente} | BI n.º: ${data.bi} | Tel: ${data.contacto}
- Endereço do requerente: ${data.endereco}
- Fundamento do pedido: ${data.fundamento}
- Documentos anexos: ${data.anexos || 'Ver lista abaixo'}${ocrBlock}

ESTRUTURA LEGAL MOÇAMBICANA OBRIGATÓRIA:

Exmo(a). Sr(a). ${entInfo.cargo}
${entidade}
[Cidade/Localidade]

**ASSUNTO: ${data.assunto.toUpperCase()}**

**N.º de Processo:** ___/____/____ *(a preencher pela repartição)*

Eu, **${data.remetente}**, portador(a) do Bilhete de Identidade n.º **${data.bi}**, residente em **${data.endereco}**, contacto **${data.contacto}**, nos termos do disposto na ${entInfo.lei.split(',')[0]}, venho, respeitosamente, expor e requerer o seguinte:

**I. EXPOSIÇÃO DOS FACTOS**

[Parágrafo 1 — Contextualização (4-5 linhas): apresenta quem é o requerente, a sua situação actual e o contexto que motiva o pedido. Seja específico e factual, baseando-se em: "${data.fundamento}"]

[Parágrafo 2 — Necessidade e justificação (4-5 linhas): explica com precisão por que é necessário o que está a pedir, quais as consequências de não obter o pedido, e como isso afecta os direitos ou obrigações legais do requerente.]

[Parágrafo 3 — Fundamento legal (3-4 linhas): ao abrigo do disposto na ${entInfo.lei.split(',')[0]}, o(a) requerente tem direito a _____________________, sendo este requerimento o meio adequado para o exercício desse direito.]

**II. DO PEDIDO**

Face ao exposto, e nos termos da ${entInfo.lei.split(',')[0]}, vem o(a) requerente REQUERER a V.ª Ex.ª que se digne:

1. [Pedido principal específico e concreto — use linguagem formal: "...determinar", "...autorizar", "...emitir", "...deferir" — baseado no assunto: "${data.assunto}"]
2. [Pedido secundário, se aplicável]
3. Que seja notificado(a) do resultado do presente requerimento através do contacto ${data.contacto} ou por escrito no endereço acima indicado, no prazo máximo de [30/60] dias.

**III. ANEXOS**

Junta-se ao presente requerimento os seguintes documentos:

${data.anexos ? data.anexos.split(/[,;]/).map((a, i) => (i+1) + '. ' + a.trim()).join('\n') : '1. Cópia do Bilhete de Identidade\n2. [Outros documentos relevantes conforme exigência da entidade]'}

**IV. COMPROMISSO**

O(A) requerente declara, sob compromisso de honra, que todos os factos expostos são verdadeiros e que os documentos juntos são autênticos, ficando ciente das responsabilidades legais decorrentes de falsas declarações, nos termos do Código Penal de Moçambique.

Pede deferimento.

${data.endereco || 'Maputo'}, ${dataFormatada}

_________________________________________
**${data.remetente}**
*(Assinatura)*

---

*Para uso da repartição:*
Data de entrada: ____/____/______ | N.º de Processo: _______ | Recebido por: _____________`;
}

export function buildDataBlock(data) {
  return `- Entidade: ${data.entidade || ''}
- Requerente: ${data.remetente || ''}  |  BI: ${data.bi || ''}  |  Contacto: ${data.contacto || ''}
- Endereço: ${data.endereco || ''}
- Assunto: ${data.assunto || ''}
- Fundamento: ${data.fundamento || ''}
- Anexos: ${data.anexos || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{ENTIDADE}} = ${data.entidade || ''}
{{REQUERENTE}} = ${data.remetente || ''}
{{BI}} = ${data.bi || ''}
{{ENDERECO}} = ${data.endereco || ''}
{{ASSUNTO}} = ${data.assunto || ''}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso
{{FUNDAMENTO}} = texto formal desenvolvendo: "${data.fundamento || ''}" (2-3 parágrafos com base legal quando aplicável)
{{CONTACTO}} = ${data.contacto || ''}`;
}
