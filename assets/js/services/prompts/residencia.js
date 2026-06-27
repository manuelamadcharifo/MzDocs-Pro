// assets/js/services/prompts/residencia.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
// Comportamento 100% preservado: apenas o texto do prompt foi movido para
// este modulo. Nenhuma string interna foi alterada.

// ── Normalização de dados ───────────────────────────────────────────────
// CORRIGIDO: o formulário real (ServiceDefinitions.js → residencia.fields)
// usa os ids requerente/bairro/rua/cidade/tempoCasas/chefeBairro, mas este
// builder ainda lia data.declarante/endereco/tempo/chefe (nomes antigos que
// nunca existiram no DOM). Isso causava:
//   1) data.declarante undefined → "Cannot read properties of undefined
//      (reading 'toUpperCase')" ao gerar/pré-visualizar o documento;
//   2) o auto-preenchimento por OCR/IA parecer "incompleto", pois os valores
//      ficavam à espera de chaves que o resto da aplicação nunca preenchia.
// Mantemos compatibilidade com os nomes antigos (caso algum chamador externo
// ainda os use) através do operador `||`, e adicionamos um fallback seguro
// para nunca deixar `undefined` chegar ao template.
function _normalize(data = {}) {
  const endereco = data.endereco
    || [data.rua, data.bairro, data.cidade].filter(Boolean).join(', ')
    || '';
  return {
    declarante:   data.declarante   || data.requerente   || '',
    bi:           data.bi           || '',
    nascimento:   data.nascimento   || '',
    naturalidade: data.naturalidade || '',
    endereco,
    tempo:        data.tempo        || data.tempoCasas   || '',
    finalidade:   data.finalidade   || '',
    chefe:        data.chefe        || data.chefeBairro  || '',
    local:        data.local        || '',
  };
}

export function buildPrompt(data, ocrBlock, legalContext = null) {
        const d = _normalize(data);
        const hoje = new Date();
        const dataFmt = hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const nascimentoLine = d.nascimento ? `, nascido(a) em **${d.nascimento}**` : '';
        const naturalidadeLine = d.naturalidade ? `, natural de **${d.naturalidade}**` : '';
        const localData = d.local || `${d.endereco.split(',').pop()?.trim() || 'Maputo'}, ${dataFmt}`;
        return `Você é jurista especialista em direito administrativo moçambicano. Redija uma DECLARAÇÃO DE RESIDÊNCIA formal e juridicamente válida.

${legalContext?.texto || `BASE LEGAL (verificada contra o texto oficial em Junho/2026 — ver /docs/legal/VERIFICACAO-LEGAL.md):
- Código Civil de Moçambique, artigo 82.º (Domicílio)
- Código Penal de Moçambique, artigo 271.º (Falso testemunho em inquirição não contenciosa; falsas declarações perante a autoridade)
- Lei n.º 12/2004, de 8 de Dezembro (Código do Registo Civil)`}

IMPORTANTE: independentemente da base legal acima, o corpo do documento abaixo já usa os artigos 82.º (Código Civil) e 271.º (Código Penal) — confirmados directamente contra o texto oficial. Mantenha esses números exactamente como estão no template; não os substitua por outros artigos eventualmente sugeridos acima.

DADOS:
- Declarante: ${d.declarante} | BI: ${d.bi}${d.nascimento ? ` | Nascimento: ${d.nascimento}` : ''}
${d.naturalidade ? `- Naturalidade: ${d.naturalidade}\n` : ''}- Endereço: ${d.endereco}
- Tempo de residência: ${d.tempo}
- Finalidade: ${d.finalidade}
- Chefe de quarteirão/Presidente de bairro: ${d.chefe || '[nome a preencher]'}${ocrBlock}

REGRA: O documento deve ser COMPLETO e CONCRETO — nunca em branco ou com marcadores de lugar.

DOCUMENTO COMPLETO:

---

# DECLARAÇÃO DE RESIDÊNCIA

**${(d.declarante || 'DECLARANTE NÃO IDENTIFICADO').toUpperCase()}**

---

Eu, **${d.declarante}**, portador(a) do Bilhete de Identidade n.º **${d.bi}**${nascimentoLine}${naturalidadeLine}, venho por este meio DECLARAR, sob compromisso de honra e nos termos do artigo 82.º do Código Civil de Moçambique, que:

**1. RESIDÊNCIA ACTUAL**

Resido de forma habitual, permanente e estável no endereço: **${d.endereco}**, onde me encontro domiciliado(a) há **${d.tempo}**, desde aproximadamente o ano ______.

**2. FINALIDADE DA DECLARAÇÃO**

A presente declaração é emitida para efeitos de **${d.finalidade}**, e destina-se exclusivamente à(s) entidade(s) a quem for apresentada.

**3. COMPROMISSO DE VERACIDADE**

O(A) declarante afirma, sob compromisso de honra, que todos os factos acima expostos são verdadeiros e correspondem à realidade. O(A) declarante está ciente de que a prestação de falsas declarações perante a autoridade constitui crime punível nos termos do artigo 271.º do Código Penal de Moçambique.

**4. VALIDADE**

A presente declaração é válida pelo período de **90 (noventa) dias** a contar da data de emissão, ou até alteração das condições de residência acima declaradas.

---

**${localData}**

**O(A) DECLARANTE:**

_________________________________________
**${d.declarante}**
BI n.º ${d.bi}

---

**CONFIRMAÇÃO DO CHEFE DE QUARTEIRÃO / PRESIDENTE DE BAIRRO:**

Eu, **${d.chefe || '____________________________________'}**, na qualidade de Chefe de Quarteirão / Presidente do Bairro ______________________, CONFIRMO que o(a) Sr(a). **${d.declarante}** reside efectivamente no endereço indicado, sendo do meu conhecimento pessoal.

_________________________________________
**${d.chefe || '____________________________________'}**
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
  const d = _normalize(data);
  return `- Declarante: ${d.declarante}  |  BI: ${d.bi}
- Nascimento: ${d.nascimento}  |  Naturalidade: ${d.naturalidade}
- Endereço: ${d.endereco}  |  Tempo de residência: ${d.tempo}
- Finalidade: ${d.finalidade}
- Chefe de quarteirão/Lider: ${d.chefe || '[nome do responsável]'}

MAPEAMENTO DE PLACEHOLDERS:
{{DECLARANTE}} = ${d.declarante}
{{BI}} = ${d.bi}
{{NASCIMENTO}} = ${d.nascimento}
{{NATURALIDADE}} = ${d.naturalidade}
{{ENDERECO}} = ${d.endereco}
{{TEMPO}} = ${d.tempo}
{{FINALIDADE}} = ${d.finalidade}
{{CHEFE}} = ${d.chefe || '[nome do responsável]'}
{{LOCAL}} = Maputo
{{DATA}} = data de hoje por extenso`;
}
