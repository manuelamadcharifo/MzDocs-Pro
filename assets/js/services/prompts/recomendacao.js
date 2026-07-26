// assets/js/services/prompts/recomendacao.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)

// ── Normalização de dados ───────────────────────────────────────────────
// CORRIGIDO (bug real reportado: carta gerada com "[undefined]" no
// cabeçalho e a assinatura, e vários campos do formulário — período de
// convivência, finalidade da carta, qualidades, local/data, contacto —
// a aparecerem como "[PREENCHER ...]" mesmo depois de o utilizador os ter
// preenchido). Causa: assets/js/services/ServiceDefinitions.js define os
// campos do formulário "recomendacao" com os ids candidato/recomendador/
// cargoRec/relacao/periodo/pontos/finalidade/contactoRec/local — mas este
// ficheiro lia data.entidadeRec (nunca existiu no formulário — a "Entidade"
// é digitada pelo utilizador dentro do próprio campo cargoRec, ex: "Director
// de RH, BCI"), data.recomendado (o formulário usa "candidato"),
// data.cargoRecm (o formulário usa "finalidade") e data.qualidades (o
// formulário usa "pontos") — SEM nenhum fallback `|| ''`. Como
// data.entidadeRec nunca existe, `${data.entidadeRec}` interpolava a
// palavra "undefined" directamente no prompt (numa linha própria do
// cabeçalho e da assinatura), e a IA reproduziu-a tal e qual, entre
// parêntesis rectos. Os outros três (candidato/finalidade/pontos) eram
// simplesmente ignorados — os dados reais do utilizador nunca chegavam à
// IA, que corretamente assinalava "[PREENCHER ...]" para dados que, do seu
// ponto de vista, não tinha recebido. period /local/contactoRec também
// nunca eram lidos, mesmo sendo campos do formulário.
// Mesmo padrão de correcção já aplicado em residencia.js: normalizar os
// nomes reais do formulário para os nomes usados no prompt, com fallback
// seguro para nunca deixar `undefined` chegar ao texto enviado à IA.
function _normalize(data = {}) {
  return {
    tipoRec:         data.tipoRec         || 'Recomendação Profissional',
    recomendador:    data.recomendador    || '',
    cargoRec:        data.cargoRec        || '', // já inclui "Cargo, Entidade" (ex: "Director de RH, BCI"), tal como o próprio placeholder do formulário indica
    recomendado:     data.recomendado     || data.candidato      || '',
    cargoRecm:       data.cargoRecm       || data.finalidade     || '',
    relacao:         data.relacao         || '',
    periodo:         data.periodo         || '',
    qualidades:      data.qualidades      || data.pontos         || '',
    exemploConcreto: data.exemploConcreto || '',
    destinatario:    data.destinatario    || '',
    contactoRec:     data.contactoRec     || '',
    local:           data.local           || '',
  };
}

export function buildPrompt(data, ocrBlock) {
        const d = _normalize(data);
        const hoje = new Date();
        // CORRIGIDO: o formulário tem um campo "Local e Data" (data.local,
        // ex: "Maputo, 6 de Maio de 2026") que nunca era lido — usava-se
        // sempre a data do sistema, sem local nenhum. Usa-se agora o que o
        // utilizador escreveu, com a data de hoje como fallback apenas.
        const dataFmt = d.local || hoje.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
        const tipoRec = d.tipoRec;
        const temExemplo = !!(d.exemploConcreto && d.exemploConcreto.trim());
        // Relação e período combinados numa só linha (o formulário tem os
        // dois campos separados: relacao + periodo).
        const relacaoPeriodo = [d.relacao, d.periodo].filter(Boolean).join(', ');
        // CORRIGIDO: data.contactoRec (campo opcional do formulário) nunca
        // era incluído — a carta terminava sempre com o texto fixo
        // "[Contacto directo]", mesmo quando o utilizador o preenchera.
        const contactoLine = d.contactoRec ? `Contacto: ${d.contactoRec}` : '[Contacto directo]';
        return `Você é especialista em comunicação profissional e académica. Redija uma ${tipoRec.toUpperCase()} completa, persuasiva e genuinamente útil para o destinatário.

DADOS:
- Tipo: ${tipoRec}
- Recomendador: ${d.recomendador} | Cargo/Entidade: ${d.cargoRec}
- Recomendado: ${d.recomendado} | Cargo/função pretendida: ${d.cargoRecm}
- Relação e período: ${relacaoPeriodo}
- Qualidades a destacar: ${d.qualidades}
- Exemplo concreto fornecido: ${d.exemploConcreto || '[NÃO FORNECIDO — ver regra 3]'}
- Destinatário: ${d.destinatario || 'A quem possa interessar'}${ocrBlock}

REGRAS CRÍTICAS:
1. USE os dados fornecidos pelo utilizador como base — não invente factos, nomes de projectos ou situações não descritas
2. Qualidades SEMPRE com contexto específico: nunca "é pontual" sem um exemplo; nunca "é líder" sem uma situação concreta
3. ${temExemplo ? 'EXEMPLO FORNECIDO: use o exemplo concreto literalmente como base da secção central: "' + d.exemploConcreto + '"' : 'EXEMPLO NÃO FORNECIDO: assinale claramente no parágrafo central com [INSERIR EXEMPLO CONCRETO — o recomendador deve adicionar uma situação real aqui], não invente'}
4. Tom caloroso mas factual — evite superlativos vazios ("excepcional", "extraordinário") sem base concreta
5. Máximo 1 página A4 — carta de recomendação longa não é lida
6. Frase de abertura: NUNCA use "Venho por este meio" — comece directamente com quem é o recomendador e a sua autoridade

ESTRUTURA OBRIGATÓRIA:

**${d.recomendador}**
${d.cargoRec}

${dataFmt}

${d.destinatario || 'A Quem Possa Interessar'}

---

**Assunto: ${tipoRec} — ${d.recomendado}**

[Parágrafo 1 — ABERTURA E CREDENCIAL DO RECOMENDADOR (3-4 linhas):
Comece com uma afirmação directa: "Conheço [nome] desde [período], tendo trabalhado directamente com ele/ela como [relação]."
Estabeleça a credencial do recomendador para esta recomendação específica.
Baseie-se em: "${relacaoPeriodo}"]

[Parágrafo 2 — CAPACIDADES E QUALIDADES COM CONTEXTO ESPECÍFICO (4-5 linhas):
Para cada qualidade em "${d.qualidades}", adicione contexto específico da relação de trabalho.
Exemplo de formato correcto: "A sua [qualidade] ficou demonstrada quando [situação/contexto específico do dia-a-dia de trabalho]."
NÃO use qualidades soltas sem contexto.]

[Parágrafo 3 — EXEMPLO CONCRETO DE REALIZAÇÃO (4-5 linhas — NÚCLEO DA CARTA):
${temExemplo ? 'Expanda e estruture o seguinte exemplo real fornecido pelo recomendador: "' + d.exemploConcreto + '". Descreva o contexto, o que o recomendado fez especificamente, e o resultado/impacto.' : '[INSERIR EXEMPLO CONCRETO — o recomendador deve descrever aqui uma situação real que tenha observado, com contexto, acção e resultado. Esta secção é obrigatória para credibilidade.]'}]

[Parágrafo 4 — ADEQUAÇÃO PARA A FUNÇÃO E RECOMENDAÇÃO (3-4 linhas):
Ligue explicitamente as qualidades demonstradas ao cargo/função pretendida: "${d.cargoRecm}".
Termine com uma recomendação clara e sem reservas: "Recomendo sem reservas..." ou "Não hesito em recomendar..."]

Com os melhores cumprimentos,

_________________________________________
**${d.recomendador}**
${d.cargoRec}
${contactoLine}`;
}

export function buildDataBlock(data) {
  const d = _normalize(data);
  return `- Tipo: ${d.tipoRec}
- Recomendador: ${d.recomendador}  |  Cargo/Entidade: ${d.cargoRec}
- Recomendado: ${d.recomendado}  |  Cargo/Bolsa pretendido: ${d.cargoRecm}
- Relação de trabalho: ${d.relacao}${d.periodo ? ', ' + d.periodo : ''}
- Qualidades evidenciadas: ${d.qualidades}
- Exemplo concreto: ${d.exemploConcreto || '[a completar]'}

MAPEAMENTO DE PLACEHOLDERS:
{{RECOMENDADOR}} = ${d.recomendador}
{{CARGO_REC}} = ${d.cargoRec}
{{RECOMENDADO}} = ${d.recomendado}
{{LOCAL}} = ${d.local || 'Maputo'}
{{DATA}} = data de hoje por extenso
{{CORPO}} = carta completa de recomendação (3-4 parágrafos):
  1. Apresentação do recomendador e relação com o recomendado
  2. Competências e qualidades: "${d.qualidades}"
  3. Exemplo concreto: "${d.exemploConcreto}"
  4. Recomendação explícita para "${d.cargoRecm}"`;
}
