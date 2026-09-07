// assets/js/services/minutas/licenca.js
// MINUTA FIXA — Pedido de Licença. Adaptado de services/prompts/licenca.js
// (já 100% determinístico — a IA só formatava dados prontos + a tabela
// legal por tipo de licença, que já existia em JS puro).
import { dataHojeExtenso } from './_shared.js';

const LEI_MAP = {
  'Licença Comercial (Alvará)': {
    lei: 'Lei n.º 3/1993, de 24 de Junho (Lei das Actividades Comerciais); demais regulamentação municipal aplicável',
    prazo: '30 a 60 dias úteis',
    docs: 'Certidão comercial, planta de localização, alvará de construção (se aplicável), comprovativo de NUIT, documento de identidade do requerente, parecer de conformidade técnica',
  },
  'Licença de Construção': {
    lei: 'Lei do Ordenamento do Território (Lei n.º 19/2007, de 18 de Julho); demais regulamentação de construção e habitação urbana aplicável',
    prazo: '45 a 90 dias úteis',
    docs: 'Projecto de construção aprovado, levantamento topográfico, título de uso e aproveitamento da terra (DUAT), certidão de não dívida fiscal',
  },
  'Autorização de Evento': {
    lei: 'Regulamentação municipal de eventos e segurança pública aplicável',
    prazo: '15 a 30 dias úteis — submeter com mínimo 30 dias de antecedência',
    docs: 'Plano do evento, local, capacidade, medidas de segurança, seguro de responsabilidade civil (recomendado), carta do proprietário do espaço',
  },
  'Licença de Transporte': {
    lei: 'Regulamentação de transportes rodoviários aplicável',
    prazo: '30 a 45 dias úteis',
    docs: 'Registo do(s) veículo(s), carta de condução válida, seguro obrigatório, certificado de inspecção técnica, certidão comercial',
  },
  'Licença Ambiental': {
    lei: 'Lei n.º 20/97, de 1 de Outubro (Lei do Ambiente); demais regulamentação de avaliação de impacto ambiental aplicável',
    prazo: '60 a 180 dias úteis (dependendo da categoria ambiental: A, B ou C)',
    docs: 'Relatório de Avaliação de Impacto Ambiental (EIA ou EPDA), plano de gestão ambiental, certidão de não dívida, termos de referência aprovados',
  },
  'Outra': {
    lei: 'legislação específica aplicável ao tipo de licença/autorização requerida',
    prazo: 'a confirmar junto da entidade',
    docs: 'conforme exigência específica da entidade',
  },
};

export function render(data = {}) {
  const tipoLicenca = data.tipoLicenca || 'Licença Comercial (Alvará)';
  const tipoEstabelec = data.tipoEstabelec || 'Permanente (estrutura fixa)';
  const lic = LEI_MAP[tipoLicenca] || LEI_MAP['Outra'];
  const requerente = data.requerente || '';
  const nuit = data.nuit || '';
  const contacto = data.contacto || '';
  const entidade = data.entidade || '';
  const objecto = data.objecto || '';
  const local = data.local || '';
  const documentos = data.documentos || lic.docs;

  return `---

# PEDIDO DE ${tipoLicenca.toUpperCase()}

Exmo(a). Sr(a). Presidente / Director(a)
**${entidade}**

**Assunto: Pedido de ${tipoLicenca} — ${objecto.substring(0, 60)}${objecto.length > 60 ? '...' : ''}**

Eu/A empresa **${requerente}**, com NUIT n.º **${nuit}**, contacto **${contacto}**, ao abrigo do disposto na ${lic.lei.split(';')[0]}, requer a V.ª Ex.ª a concessão de **${tipoLicenca}** para os fins abaixo descritos:

---

## I. IDENTIFICAÇÃO DO REQUERENTE

| | |
|---|---|
| **Nome / Razão Social:** | ${requerente} |
| **NUIT:** | ${nuit} |
| **Telefone:** | ${contacto} |
| **Endereço:** | ${local} |

---

## II. OBJECTO DO PEDIDO

**Tipo de ${tipoLicenca.toLowerCase().includes('licença') ? 'estabelecimento' : 'actividade'}:** ${objecto}

**Tipo:** ${tipoEstabelec}

**Local exacto:** ${local}

${data.areaM2 ? '**Área:** ' + data.areaM2 + ' m²' : ''}
${data.horario ? '**Horário de funcionamento pretendido:** ' + data.horario : ''}
${data.nPostosTrabalho ? '**Postos de trabalho a criar:** ' + data.nPostosTrabalho : ''}

---

## III. FUNDAMENTAÇÃO LEGAL

O presente pedido fundamenta-se no disposto na seguinte legislação:

${lic.lei.split(';').map((l, i) => (i + 1) + '. ' + l.trim()).join('\n')}

O requerente declara cumprir todos os requisitos legais e regulamentares exigidos para a actividade pretendida, comprometendo-se a observar todas as normas aplicáveis durante o exercício da mesma.

---

## IV. DOCUMENTOS ANEXOS

O requerente junta ao presente pedido os seguintes documentos:

${documentos.split(/[,;]/).map((d, i) => (i + 1) + '. ' + d.trim()).join('\n')}

---

## V. COMPROMISSO E DECLARAÇÃO

O requerente declara, sob compromisso de honra:

a) Que todos os dados constantes do presente pedido são verdadeiros e correspondem à realidade;
b) Que não existem dívidas fiscais ou contributivas em seu nome junto da Autoridade Tributária de Moçambique;
c) Que cumprirá todas as condições e obrigações decorrentes da licença, caso concedida;
d) Que aceita a realização de vistorias e inspecções por parte das entidades competentes.

---

Nestes termos, pede deferimento no prazo previsto na lei (${lic.prazo}).

**${local}, ${dataHojeExtenso()}**

_________________________________________
**${requerente}**
*(Assinatura e carimbo, se aplicável)*

---

*Para uso da entidade destinatária:*
Data de entrada: ____/____/______ | N.º de processo: _______ | Recebido por: _______________`;
}
