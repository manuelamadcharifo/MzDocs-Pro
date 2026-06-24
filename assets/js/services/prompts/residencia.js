// assets/js/services/prompts/residencia.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

export function buildPrompt(data, ocrBlock) {
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        return `Você é jurista especialista em direito administrativo moçambicano. Redija uma DECLARAÇÃO DE RESIDÊNCIA formal e juridicamente válida.

BASE LEGAL (verificada contra o texto oficial em Junho/2026 — ver /docs/legal/VERIFICACAO-LEGAL.md):
- Código Civil de Moçambique, artigo 82.º (Domicílio)
- Código Penal de Moçambique, artigo 271.º (Falso testemunho em inquirição não contenciosa; falsas declarações perante a autoridade)
- Lei n.º 8/2004, de 21 de Julho (Lei dos Registos e Identificação Civil)

DADOS:
- Declarante: ${data.declarante} | BI: ${data.bi} | Nascimento: ${data.nascimento}
- Naturalidade: ${data.naturalidade}
- Endereço: ${data.endereco}
- Tempo de residência: ${data.tempo}
- Finalidade: ${data.finalidade}
- Chefe de quarteirão/Presidente de bairro: ${data.chefe || '[nome a preencher]'}${ocrBlock}

REGRA: O documento deve ser COMPLETO e CONCRETO — nunca em branco ou com marcadores de lugar.

DOCUMENTO COMPLETO:

---

# DECLARAÇÃO DE RESIDÊNCIA

**${data.declarante.toUpperCase()}**

---

Eu, **${data.declarante}**, portador(a) do Bilhete de Identidade n.º **${data.bi}**, nascido(a) em **${data.nascimento}**, natural de **${data.naturalidade}**, venho por este meio DECLARAR, sob compromisso de honra e nos termos do artigo 82.º do Código Civil de Moçambique, que:

**1. RESIDÊNCIA ACTUAL**

Resido de forma habitual, permanente e estável no endereço: **${data.endereco}**, onde me encontro domiciliado(a) há **${data.tempo}**, desde aproximadamente o ano ______.

**2. FINALIDADE DA DECLARAÇÃO**

A presente declaração é emitida para efeitos de **${data.finalidade}**, e destina-se exclusivamente à(s) entidade(s) a quem for apresentada.

**3. COMPROMISSO DE VERACIDADE**

O(A) declarante afirma, sob compromisso de honra, que todos os factos acima expostos são verdadeiros e correspondem à realidade. O(A) declarante está ciente de que a prestação de falsas declarações perante a autoridade constitui crime punível nos termos do artigo 271.º do Código Penal de Moçambique.

**4. VALIDADE**

A presente declaração é válida pelo período de **90 (noventa) dias** a contar da data de emissão, ou até alteração das condições de residência acima declaradas.

---

**${data.endereco?.split(',').pop()?.trim() || 'Maputo'}, ${dataFmt}**

**O(A) DECLARANTE:**

_________________________________________
**${data.declarante}**
BI n.º ${data.bi}

---

**CONFIRMAÇÃO DO CHEFE DE QUARTEIRÃO / PRESIDENTE DE BAIRRO:**

Eu, **${data.chefe || '____________________________________'}**, na qualidade de Chefe de Quarteirão / Presidente do Bairro ______________________, CONFIRMO que o(a) Sr(a). **${data.declarante}** reside efectivamente no endereço indicado, sendo do meu conhecimento pessoal.

_________________________________________
**${data.chefe || '____________________________________'}**
Cargo: ___________________________________
Contacto: ________________________________

---

**TESTEMUNHAS:**

| Testemunha 1 | Testemunha 2 |
|---|---|
| Nome: _____________________ | Nome: _____________________ |
| BI: _______________________ | BI: _______________________ |
| ___________________________ | ___________________________ |
| *(Assinatura)* | *(Assinatura)* |

---
*Documento emitido pela plataforma MzDocs Pro. A autenticidade das informações é da responsabilidade exclusiva do declarante.*`;
}

export function buildDataBlock(data) {
  return `- Declarante: ${data.declarante || ''}  |  BI: ${data.bi || ''}
- Nascimento: ${data.nascimento || ''}  |  Naturalidade: ${data.naturalidade || ''}
- Endereço: ${data.endereco || ''}  |  Tempo de residência: ${data.tempo || ''}
- Finalidade: ${data.finalidade || ''}
- Chefe de quarteirão/Lider: ${data.chefe || '[nome do responsável]'}

MAPEAMENTO DE PLACEHOLDERS:
{{DECLARANTE}} = ${data.declarante || ''}
{{BI}} = ${data.bi || ''}
{{NASCIMENTO}} = ${data.nascimento || ''}
{{NATURALIDADE}} = ${data.naturalidade || ''}
{{ENDERECO}} = ${data.endereco || ''}
{{TEMPO}} = ${data.tempo || ''}
{{FINALIDADE}} = ${data.finalidade || ''}
{{CHEFE}} = ${data.chefe || '[nome do responsável]'}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso`;
}
