// assets/js/services/prompts/procuracao.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoProc = data.tipoProc || 'Especial (acto específico)';
        const isGeral = tipoProc === 'Geral (todos os actos)';
        const isImóvel = tipoProc === 'Venda de Imóvel';
        const isBancaria = tipoProc === 'Bancária';
        const isJudicial = tipoProc === 'Judicial';
        const tipoDocIdent = data.tipoDocIdent || 'Bilhete de Identidade (BI)';
        const subMandato = data.subMandato || 'Não (poderes intransmissíveis)';

        const poderesPorTipo = isGeral
          ? `**PODERES GERAIS:**
Para em meu nome e representação praticar todos os actos de administração ordinária e extraordinária, incluindo, mas não se limitando a:

1. Representar-me perante quaisquer entidades públicas e privadas, incluindo ministérios, repartições, tribunais, bancos, seguradoras e serviços notariais;
2. Assinar contratos, acordos e documentos de qualquer natureza;
3. Receber e dar quitação de quaisquer quantias que me sejam devidas;
4. Gerir contas bancárias, efectuar depósitos, levantamentos e transferências;
5. Representar-me em processos administrativos e judiciais;
6. Praticar quaisquer actos necessários à prossecução dos meus interesses.

**PODERES EXPRESSAMENTE EXCLUÍDOS (o procurador NÃO pode, sem nova procuração específica):**
- Alienar, hipotecar ou onerar bens imóveis;
- Contrair empréstimos em meu nome acima de 100.000 MZN;
- Fazer doações em meu nome;
- Nomear sub-procuradores${subMandato.includes('Não') ? '.' : ' (salvo autorização abaixo).'}`
          : isImóvel
          ? `**PODERES ESPECIAIS PARA VENDA DE IMÓVEL:**
O mandatário fica expressamente autorizado a:

1. Representar-me na negociação e celebração da escritura pública de compra e venda do imóvel sito em ________________________________, com a descrição predial n.º _______ da Conservatória do Registo Predial de _______;
2. Assinar a escritura pública de compra e venda, declarações e demais documentos necessários à formalização da venda;
3. Fixar o preço de venda e respectivas condições de pagamento;
4. Receber o preço de venda e dar quitação;
5. Praticar todos os demais actos necessários ao registo da transmissão junto da Conservatória do Registo Predial.

**PODERES EXCLUÍDOS:** O mandatário NÃO está autorizado a praticar quaisquer actos que extravasem o objecto específico da venda acima identificada.`
          : isBancaria
          ? `**PODERES ESPECIAIS BANCÁRIOS:**
O mandatário fica expressamente autorizado a, junto das instituições bancárias onde o outorgante seja titular de contas:

1. Movimentar, a débito e a crédito, as contas bancárias do outorgante;
2. Efectuar depósitos, levantamentos e transferências bancárias;
3. Requerer extratos, comprovativos e outros documentos bancários;
4. Assinar contratos de crédito ou outros instrumentos bancários (valor máximo: _________________ MZN);
5. Representar o outorgante perante o Banco de Moçambique e demais entidades de supervisão financeira.

*Conforme o Aviso n.º 01/GBM/2017 do Banco de Moçambique, esta procuração deve ser apresentada no banco para registo.*`
          : isJudicial
          ? `**PODERES ESPECIAIS JUDICIAIS:**
O mandatário (advogado/procurador judicial) fica expressamente autorizado a:

1. Representar-me em todos os actos e termos do processo n.º _______ (ou a identificar) perante o Tribunal _______;
2. Praticar todos os actos processuais, incluindo apresentação de petições, respostas, recursos e incidentes;
3. Transigir, desistir, confessar, reconvir e praticar quaisquer actos que a lei permita;
4. Receber notificações e citações em meu nome;
5. Substabelecer os poderes aqui conferidos a outros advogados (mandatário judicial).`
          : `**PODERES ESPECIAIS PARA:**
${data.acto}

O mandatário fica expressamente autorizado a:
1. Praticar todos os actos necessários à concretização do objectivo acima descrito;
2. Assinar todos os documentos necessários, incluindo declarações, requerimentos, contratos e recibos;
3. Representar-me perante as entidades competentes para o efeito;
4. Receber e dar quitação de valores directamente relacionados com o mandato.

**O mandatário NÃO está autorizado a:**
- Praticar actos que extravasem o objecto específico deste mandato;
- Efectuar actos a título gratuito em meu nome.`;

        const clausulaSubMandato = subMandato.includes('Não')
          ? 'O mandatário NÃO pode substabelecer os poderes aqui conferidos, sendo os mesmos intransmissíveis.'
          : subMandato.includes('todo')
          ? 'O mandatário PODE substabelecer os poderes aqui conferidos no todo, mediante comunicação escrita ao outorgante.'
          : 'O mandatário PODE substabelecer os poderes aqui conferidos em parte, mediante comunicação escrita ao outorgante.';

        const reconhecimentoObrigatorio = isImóvel || isGeral || isBancaria || isJudicial;

        return `Você é advogado especialista em direito civil e notariado moçambicano. Redija uma PROCURAÇÃO / MANDATO juridicamente válida, completa e lista para uso em ${tipoProc}.

BASE LEGAL OBRIGATÓRIA:
- Código Civil de Moçambique, artigos 262.º a 294.º (Representação e Procuração)
- Código do Notariado de Moçambique (Decreto n.º 47619, de 31 de Março de 1967, com alterações)
- Lei n.º 4/2013, de 22 de Fevereiro (Lei do Notariado — reconhecimento de assinaturas)
${isBancaria ? '- Aviso n.º 01/GBM/2017 do Banco de Moçambique (procurações bancárias)' : ''}
${isImóvel ? '- Lei n.º 19/2013, de 23 de Setembro (negócios imobiliários); Lei de Terras n.º 19/1997' : ''}
${isJudicial ? '- Código de Processo Civil de Moçambique; Estatuto da Ordem dos Advogados (Lei n.º 7/1994)' : ''}

DADOS:
- Tipo: ${tipoProc}
- Tipo de documento de identidade: ${tipoDocIdent}
- Outorgante: ${data.outorgante} | ${tipoDocIdent}: ${data.biOutorgante}
- Morada do Outorgante: ${data.moradaOutorgante}
- Procurador/Mandatário: ${data.procurador} | ${tipoDocIdent}: ${data.biProcurador}
- Morada do Procurador: ${data.moradaProcurador}
- Poderes/Acto: ${data.acto}
- Sub-mandato: ${subMandato}
- Validade: ${data.validade}
- Local: ${data.local}${ocrBlock}

REGRAS CRÍTICAS:
1. Use os dados fornecidos — NUNCA deixe campos obrigatórios em branco
2. Para procuração sobre imóveis: reconhecimento notarial é SEMPRE obrigatório (art. 80.º do Código do Notariado)
3. Para procuração geral: liste EXPLICITAMENTE os actos excluídos
4. Inclua SEMPRE a cláusula de sub-mandato conforme instrução: "${subMandato}"

DOCUMENTO COMPLETO:

---

# PROCURAÇÃO ${tipoProc.toUpperCase()}

**OUTORGANTE (quem dá o poder):**
Eu, **${data.outorgante}**, portador(a) de ${tipoDocIdent} n.º **${data.biOutorgante}**, [nacionalidade moçambicana / outra: ______], residente em **${data.moradaOutorgante}**, no pleno uso das minhas faculdades civis e jurídicas,

**NOMEIO E CONSTITUO MEU PROCURADOR/MANDATÁRIO:**

**${data.procurador}**, portador(a) de ${tipoDocIdent} n.º **${data.biProcurador}**, residente em **${data.moradaProcurador}**,

**CONFERINDO-LHE OS SEGUINTES PODERES:**

${poderesPorTipo}

**CLÁUSULA DE SUB-MANDATO:**
${clausulaSubMandato}

**VALIDADE:** A presente procuração é válida por **${data.validade}** a contar da data de assinatura${data.validade === 'Até revogação' || data.validade === 'Indeterminada' ? ', podendo ser revogada a qualquer momento mediante comunicação escrita ao mandatário e a terceiros' : ''}.

Esta procuração é outorgada nos termos dos artigos 262.º e seguintes do Código Civil de Moçambique.

---

**${data.local}, ${dataFmt}**

| | |
|---|---|
| **O OUTORGANTE** | **O PROCURADOR** |
| ${data.outorgante} | ${data.procurador} |
| ${tipoDocIdent}: ${data.biOutorgante} | ${tipoDocIdent}: ${data.biProcurador} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Aceite e assinatura)* |

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |

---

**RECONHECIMENTO NOTARIAL** *(${reconhecimentoObrigatorio ? 'OBRIGATÓRIO para este tipo de procuração' : 'recomendado para maior segurança jurídica'})*

Reconheço a assinatura aposta neste documento como sendo do próprio punho de **${data.outorgante}**, nos termos da Lei n.º 4/2013, de 22 de Fevereiro.

**Notário/Conservador:** ___________________________ | **Data:** ___/___/______
**Livro n.º:** _______ | **Folha:** _______ | **Verba n.º:** _______
**Emolumentos pagos:** _______ MZN | **Selo:** [espaço para selo notarial]`;
}

export function buildDataBlock(data) {
  return `- Tipo: ${data.tipoProc || 'Especial'}
- Outorgante: ${data.outorgante || ''}  |  BI: ${data.biOutorgante || ''}  |  Morada: ${data.moradaOutorgante || ''}
- Procurador: ${data.procurador || ''}  |  BI: ${data.biProcurador || ''}  |  Morada: ${data.moradaProcurador || ''}
- Poderes: ${data.acto || ''}
- Sub-mandato: ${data.subMandato || 'Não'}
- Validade: ${data.validade || ''}  |  Local: ${data.local || ''}`;
}
