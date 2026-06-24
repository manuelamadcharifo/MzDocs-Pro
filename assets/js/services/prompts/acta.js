// assets/js/services/prompts/acta.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock, legalContext = null) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const pautaItems = data.pauta ? data.pauta.split(/\n|;/).map(p => p.trim()).filter(Boolean) : ['Ponto único'];
        const deliberacaoItems = data.deliberacoes ? data.deliberacoes.split(/\n|;/).map(d => d.trim()).filter(Boolean) : [];
        return `Você é secretário jurídico experiente em organizações moçambicanas. Redija uma ACTA DE REUNIÃO formal, completa e juridicamente válida.

${legalContext?.texto || `BASE LEGAL (verificada contra fontes oficiais em Junho/2026 — ver /docs/legal/VERIFICACAO-LEGAL.md):
- Lei n.º 8/91, de 18 de Julho (Lei das Associações)
- Lei n.º 23/2009, de 8 de Setembro (Lei Geral sobre as Cooperativas)
- Código Civil de Moçambique, artigos 157.º e ss. (Associações e Pessoas Colectivas)
- Estatutos da ${data.organizacao} (quando aplicável)`}

DADOS:
- Organização: ${data.organizacao} | Tipo: ${data.tipoReuniao}
- Data: ${data.data} às ${data.hora} | Local: ${data.local}
- Presidente de mesa: ${data.presidente} | Secretário: ${data.secretario}
- Presentes: ${data.presentes}
- Pauta: ${data.pauta}
- Deliberações: ${data.deliberacoes}${ocrBlock}

DOCUMENTO COMPLETO:

---

# ACTA N.º ___/______

## ${data.tipoReuniao.toUpperCase()} DA ${data.organizacao.toUpperCase()}

---

**Data:** ${data.data}
**Hora de início:** ${data.hora}
**Local:** ${data.local}
**Tipo de reunião:** ${data.tipoReuniao}

---

### MESA

| Cargo | Nome |
|---|---|
| **Presidente da Mesa** | ${data.presidente} |
| **Secretário(a)** | ${data.secretario} |

---

### MEMBROS PRESENTES

${data.presentes}

**Total de membros presentes:** [N]
**Quórum:** [Verificado / Não verificado] — [N] de [N total] membros, representando [%] do total, nos termos do artigo [X] dos Estatutos.

---

### ABERTURA

Pelas **${data.hora}** do dia **${data.data}**, no local acima indicado, o(a) Sr(a). **${data.presidente}**, na qualidade de Presidente da Mesa, declarou aberta a ${data.tipoReuniao}, verificado o quórum estatutário.

O(A) Sr(a). **${data.secretario}** assumiu as funções de Secretário(a) e procedeu à leitura e aprovação da acta da reunião anterior *(se aplicável)*.

---

### ORDEM DO DIA

${pautaItems.map((p, i) => `**Ponto ${i+1}:** ${p}`).join('\n\n')}

---

### DISCUSSÃO E DELIBERAÇÕES

${pautaItems.map((p, i) => {
  const del = deliberacaoItems[i] || '[Descreva a discussão e deliberação deste ponto]';
  return `#### Ponto ${i+1}: ${p}

O(A) Presidente deu a palavra aos membros para discussão do referido ponto.

[Resuma a discussão: quem falou, principais argumentos apresentados, propostas apresentadas]

**Deliberação:** ${del}

**Votação:** Aprovado por [unanimidade / maioria de X votos a favor, Y contra, Z abstenções], nos termos do artigo [X] dos Estatutos da ${data.organizacao}.

**Responsável pela execução:** ________________________________
**Prazo:** ____/____/______`;
}).join('\n\n---\n\n')}

---

### ASSUNTOS GERAIS E INFORMAÇÕES

[Registar aqui informações diversas, comunicações, avisos e outros assuntos não incluídos na ordem do dia, apresentados pelos membros.]

---

### ENCERRAMENTO

Nada mais havendo a tratar, o(a) Presidente declarou encerrada a reunião pelas **______** horas, sendo a presente acta lavrada e aprovada pelos membros da mesa.

---

**${data.local}, ${dataFmt}**

| | |
|---|---|
| **O Presidente da Mesa** | **O(A) Secretário(a)** |
| ${data.presidente} | ${data.secretario} |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

**VOGAIS DA MESA (se aplicável):**

| Vogal 1 | Vogal 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| ___________________________ | ___________________________ |

---

*Acta aprovada em reunião de ____/____/______ / Aprovada por circulação em ____/____/______*
*Arquivada no Livro de Actas n.º _____, folha _____, da ${data.organizacao}.*`;
}

export function buildDataBlock(data) {
  return `- Organização: ${data.organizacao || ''}  |  Tipo: ${data.tipoReuniao || ''}
- Data: ${data.data || ''}  |  Hora: ${data.hora || ''}  |  Local: ${data.local || ''}
- Presidente: ${data.presidente || ''}  |  Secretário: ${data.secretario || ''}
- Presentes: ${data.presentes || ''}
- Pauta: ${data.pauta || ''}
- Deliberações: ${data.deliberacoes || ''}

MAPEAMENTO DE PLACEHOLDERS:
{{ORGANIZACAO}} = ${data.organizacao || ''}
{{TIPO_REUNIAO}} = ${data.tipoReuniao || ''}
{{NUM_ACTA}} = ${data.numActa || '001/' + new Date().getFullYear()}
{{DATA}} = ${data.data || 'data de hoje por extenso'}
{{HORA}} = ${data.hora || ''}
{{LOCAL}} = ${data.local || ''}
{{PRESIDENTE}} = ${data.presidente || ''}
{{SECRETARIO}} = ${data.secretario || ''}
{{PRESENTES}} = ${data.presentes || ''}
{{PAUTA}} = lista formatada dos pontos da ordem do dia: "${data.pauta || ''}"
           Formato: <p>1. Ponto um</p><p>2. Ponto dois</p>...
{{DELIBERACOES}} = deliberações formais detalhadas sobre: "${data.deliberacoes || ''}"
                  Formato: <p><strong>Ponto 1:</strong> texto da deliberação aprovada por unanimidade/maioria.</p>`;
}
