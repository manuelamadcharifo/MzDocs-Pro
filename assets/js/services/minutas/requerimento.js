// assets/js/services/minutas/requerimento.js
// MINUTA FIXA — Requerimento Oficial. Campos reais do formulário
// (ServiceDefinitions.js → requerimento.fields): tipo, requerente, bi,
// entidade, assunto, justificacao, contacto, local.
//
// Diferença deliberada face ao modo IA (services/prompts/requerimento.js):
// aquele expandia a "justificacao" do utilizador em 3 parágrafos formais
// redigidos pela IA. Aqui a justificação escrita pelo próprio utilizador é
// inserida tal como foi escrita — é exactamente assim que um requerimento
// em papel funciona em Moçambique (o cidadão escreve o seu próprio pedido),
// e elimina qualquer risco de a IA "inventar" factos não fornecidos.
import { dataHojeExtenso } from './_shared.js';

const LEGAL_MAP = {
  'Conservatória dos Registos':      { lei: 'Lei n.º 12/2004, de 8 de Dezembro (Código do Registo Civil)', cargo: 'Conservador dos Registos Civis' },
  'Direcção Provincial de Educação': { lei: 'Lei n.º 6/92, de 6 de Maio (Lei do Sistema Nacional de Educação)', cargo: 'Director(a) Provincial de Educação' },
  'Hospital Provincial':             { lei: 'Lei n.º 14/2014, de 11 de Setembro (Lei de Saúde)', cargo: 'Director(a) Clínico(a) / Director(a) de Administração' },
  'INSS':                            { lei: 'Lei n.º 4/2007, de 7 de Fevereiro (Lei da Protecção Social)', cargo: 'Director(a) do Instituto Nacional de Segurança Social' },
  'Direcção de Migração':            { lei: 'Lei n.º 5/1993, de 28 de Dezembro (Lei dos Estrangeiros)', cargo: 'Director(a) Nacional de Migração' },
  'Câmara Municipal':                { lei: 'Lei n.º 2/97, de 18 de Fevereiro (Lei dos Órgãos Locais do Estado)', cargo: 'Presidente do Conselho Municipal' },
  'Repartição de Finanças':          { lei: 'Lei n.º 15/2002, de 26 de Junho (Lei de Bases do Sistema Tributário)', cargo: 'Chefe da Repartição de Finanças' },
  'Escola':                          { lei: 'Lei n.º 6/92, de 6 de Maio (Lei do Sistema Nacional de Educação)', cargo: 'Director(a) da Escola' },
  'Outra':                           { lei: 'legislação moçambicana aplicável à matéria em causa', cargo: 'Responsável / Director(a) do Serviço' },
};

function _entidadeInfo(entidade) {
  const key = Object.keys(LEGAL_MAP).find(k =>
    k !== 'Outra' && entidade.toLowerCase().includes(k.toLowerCase())
  ) || (/escola|instituto|colégio/i.test(entidade) ? 'Escola' : 'Outra');
  return LEGAL_MAP[key];
}

export function render(data = {}) {
  const entidade = data.entidade || 'Outra';
  const info = _entidadeInfo(entidade);
  const requerente = data.requerente || '';
  const bi = data.bi || '';
  const contacto = data.contacto || '';
  const assunto = data.assunto || '';
  const justificacao = data.justificacao || '';
  const local = data.local || `Maputo, ${dataHojeExtenso()}`;

  return `---

Exmo(a). Sr(a). ${info.cargo}
**${entidade}**

**ASSUNTO: ${assunto.toUpperCase()}**

**N.º de Processo:** ___/____/____ *(a preencher pela repartição)*

Eu, **${requerente}**, portador(a) do Bilhete de Identidade n.º **${bi}**, contacto **${contacto}**, nos termos do disposto na ${info.lei.split(',')[0]}, venho, respeitosamente, expor e requerer o seguinte:

**I. EXPOSIÇÃO DOS FACTOS**

${justificacao}

**II. DO PEDIDO**

Face ao exposto, e nos termos da ${info.lei.split(',')[0]}, vem o(a) requerente REQUERER a V.ª Ex.ª se digne deferir o pedido de **${assunto}**, e ser notificado(a) do resultado através do contacto **${contacto}**, no prazo previsto na lei.

**III. ANEXOS**

Junta-se ao presente requerimento os seguintes documentos:

${data.anexos ? data.anexos.split(/[,;]/).map((a, i) => (i + 1) + '. ' + a.trim()).join('\n') : '1. Cópia do Bilhete de Identidade'}

**IV. COMPROMISSO**

O(A) requerente declara, sob compromisso de honra, que todos os factos expostos são verdadeiros e que os documentos juntos são autênticos, ficando ciente das responsabilidades legais decorrentes de falsas declarações, nos termos do Código Penal de Moçambique.

Pede deferimento.

${local}

_________________________________________
**${requerente}**
*(Assinatura)*

---

*Para uso da repartição:*
Data de entrada: ____/____/______ | N.º de Processo: _______ | Recebido por: _____________`;
}
