// assets/js/services/prompts/licenca.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoLicenca = data.tipoLicenca || 'Licença Comercial (Alvará)';
        const tipoEstabelec = data.tipoEstabelec || 'Permanente (estrutura fixa)';

        const leiMap = {
          'Licença Comercial (Alvará)': {
            lei: 'Lei n.º 3/1993, de 24 de Junho (Lei das Actividades Comerciais); Decreto n.º 43/2004, de 1 de Setembro (Regulamento de Licenciamento das Actividades Comerciais); Regulamento Municipal correspondente',
            entidade: 'Câmara Municipal / Conselho Municipal',
            prazo: '30 a 60 dias úteis',
            docs: 'Certidão comercial, planta de localização, alvará de construção (se aplicável), comprovativo de NUIT, documento de identidade do requerente, parecer de conformidade técnica',
          },
          'Licença de Construção': {
            lei: 'Regulamento Geral de Construção e Habitação Urbana (Decreto n.º 28/1994); Lei do Ordenamento do Território (Lei n.º 19/2007, de 18 de Julho); Decreto n.º 23/2008 (Regulamento de Licenciamento de Construção)',
            entidade: 'Direcção Municipal de Infra-estruturas / DINOTER',
            prazo: '45 a 90 dias úteis',
            docs: 'Projecto de construção aprovado, levantamento topográfico, título de uso e aproveitamento da terra (DUAT), certidão de não dívida fiscal',
          },
          'Autorização de Evento': {
            lei: 'Regulamento Municipal de Eventos; Decreto n.º 66/2010 (Segurança em Eventos Públicos); Lei n.º 7/2017 (Prevenção e Combate ao Branqueamento de Capitais — para eventos de grande dimensão)',
            entidade: 'Câmara Municipal; Polícia da República de Moçambique (para eventos públicos)',
            prazo: '15 a 30 dias úteis — submeter com mínimo 30 dias de antecedência',
            docs: 'Plano do evento, local, capacidade, medidas de segurança, seguro de responsabilidade civil (recomendado), carta do proprietário do espaço',
          },
          'Licença de Transporte': {
            lei: 'Lei n.º 21/2008, de 31 de Dezembro (Lei de Transportes Rodoviários); Decreto n.º 26/2011 (Regulamento de Transportes Rodoviários); Diploma Ministerial n.º 64/2007',
            entidade: 'Instituto Nacional de Transportes Terrestres (INATTER)',
            prazo: '30 a 45 dias úteis',
            docs: 'Registo do(s) veículo(s), carta de condução válida, seguro obrigatório, certificado de inspecção técnica, certidão comercial',
          },
          'Licença Ambiental': {
            lei: 'Lei n.º 20/97, de 1 de Outubro (Lei do Ambiente); Decreto n.º 54/2015, de 31 de Dezembro (Regulamento de Avaliação de Impacto Ambiental); Lei n.º 5/2017 (Gestão de Resíduos)',
            entidade: 'Ministério da Terra e Ambiente (MITADER) / Direcção Provincial do Ambiente',
            prazo: '60 a 180 dias úteis (dependendo da categoria ambiental: A, B ou C)',
            docs: 'Relatório de Avaliação de Impacto Ambiental (EIA ou EPDA), plano de gestão ambiental, certidão de não dívida, termos de referência aprovados',
          },
          'Outra': {
            lei: 'legislação específica aplicável ao tipo de licença/autorização requerida',
            entidade: data.entidade || 'Entidade competente',
            prazo: 'a confirmar junto da entidade',
            docs: 'conforme exigência específica da entidade',
          },
        };

        const lic = leiMap[tipoLicenca] || leiMap['Outra'];

        return `Você é especialista em direito administrativo e licenciamento em Moçambique. Redija um PEDIDO DE LICENÇA / REQUERIMENTO DE AUTORIZAÇÃO formal, juridicamente fundamentado e completo.

BASE LEGAL APLICÁVEL A "${tipoLicenca}":
${lic.lei}

DADOS:
- Tipo de licença: ${tipoLicenca}
- Requerente: ${data.requerente} | NUIT: ${data.nuit} | Tel: ${data.contacto}
- Entidade destinatária: ${data.entidade}
- Objecto do pedido: ${data.objecto}
- Tipo de estabelecimento: ${tipoEstabelec}
- Área: ${data.areaM2 ? data.areaM2 + ' m²' : 'não indicada'}
- Horário de funcionamento: ${data.horario || 'a definir'}
- N.º de postos de trabalho previstos: ${data.nPostosTrabalho || 'a indicar'}
- Local exacto: ${data.local}
- Documentos a anexar: ${data.documentos || lic.docs}${ocrBlock}

REGRAS:
1. Mencionar a base legal específica para "${tipoLicenca}" — não usar linguagem genérica
2. Tipo de estabelecimento "${tipoEstabelec}": reflectir nas condições do pedido (permanente vs temporário vs ambulante)
3. Prazo esperado de resposta para este tipo: ${lic.prazo}
4. Lista de documentos obrigatórios específicos a este tipo de licença
5. Frase de abertura: NUNCA "Venho por este meio" — comece directamente

REQUERIMENTO COMPLETO:

---

# PEDIDO DE ${tipoLicenca.toUpperCase()}

Exmo(a). Sr(a). Presidente / Director(a)
**${data.entidade}**
[Localidade]

**Assunto: Pedido de ${tipoLicenca} — ${data.objecto.substring(0, 60)}...**

Eu/A empresa **${data.requerente}**, com NUIT n.º **${data.nuit}**, contacto **${data.contacto}**, ao abrigo do disposto na ${lic.lei.split(';')[0]}, requer a V.ª Ex.ª a concessão de **${tipoLicenca}** para os fins abaixo descritos:

---

## I. IDENTIFICAÇÃO DO REQUERENTE

| | |
|---|---|
| **Nome / Razão Social:** | ${data.requerente} |
| **NUIT:** | ${data.nuit} |
| **Telefone:** | ${data.contacto} |
| **Endereço:** | ${data.local} |

---

## II. OBJECTO DO PEDIDO

**Tipo de ${tipoLicenca.toLowerCase().includes('licença') ? 'estabelecimento' : 'actividade'}:** ${data.objecto}

**Tipo:** ${tipoEstabelec}

**Local exacto:** ${data.local}

${data.areaM2 ? '**Área:** ' + data.areaM2 + ' m²' : ''}
${data.horario ? '**Horário de funcionamento pretendido:** ' + data.horario : ''}
${data.nPostosTrabalho ? '**Postos de trabalho a criar:** ' + data.nPostosTrabalho : ''}

---

## III. FUNDAMENTAÇÃO LEGAL

O presente pedido fundamenta-se no disposto na seguinte legislação:

${lic.lei.split(';').map((l, i) => (i+1) + '. ' + l.trim()).join('\n')}

O requerente declara cumprir todos os requisitos legais e regulamentares exigidos para a actividade pretendida, comprometendo-se a observar todas as normas aplicáveis durante o exercício da mesma.

---

## IV. DOCUMENTOS ANEXOS

O requerente junta ao presente pedido os seguintes documentos:

${(data.documentos || lic.docs).split(/[,;]/).map((d, i) => (i+1) + '. ' + d.trim()).join('\n')}

---

## V. COMPROMISSO E DECLARAÇÃO

O requerente declara, sob compromisso de honra:

a) Que todos os dados constantes do presente pedido são verdadeiros e correspondem à realidade;
b) Que não existem dívidas fiscais ou contributivas em seu nome junto da Autoridade Tributária de Moçambique;
c) Que cumprirá todas as condições e obrigações decorrentes da licença, caso concedida;
d) Que aceita a realização de vistorias e inspecções por parte das entidades competentes.

---

Nestes termos, pede deferimento no prazo previsto na lei (${lic.prazo}).

**${data.local}, ${dataFmt}**

_________________________________________
**${data.requerente}**
*(Assinatura e carimbo, se aplicável)*

---

*Para uso da entidade destinatária:*
Data de entrada: ____/____/______ | N.º de processo: _______ | Recebido por: _______________`;
}

export function buildDataBlock(data) {
  return `- Tipo: ${data.tipoLicenca || 'Licença Comercial'}
- Requerente: ${data.requerente || ''}  |  NUIT: ${data.nuit || ''}  |  Contacto: ${data.contacto || ''}
- Entidade destinatária: ${data.entidade || ''}
- Objecto da licença: ${data.objecto || ''}
- Área: ${data.areaM2 || ''} m²  |  Horário: ${data.horario || ''}  |  Local: ${data.local || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{REQUERENTE}} = ${data.requerente || ''}
{{NUIT}} = ${data.nuit || ''}
{{CONTACTO}} = ${data.contacto || ''}
{{ENTIDADE}} = ${data.entidade || ''}
{{OBJECTO}} = ${data.objecto || ''}
{{AREA_M2}} = ${data.areaM2 || ''}
{{HORARIO}} = ${data.horario || ''}
{{LOCAL}} = ${data.local || ''}
{{DATA}} = data de hoje por extenso
{{FUNDAMENTACAO}} = fundamentação jurídica do pedido (2 parágrafos referenciando legislação moçambicana aplicável)`;
}
