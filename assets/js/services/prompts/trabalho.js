// assets/js/services/prompts/trabalho.js
// Extraido de Services.js (OpenRouterService._buildPrompt / _buildDataBlock)
//
// CORRIGIDO: o prompt tratava TODOS os níveis de ensino da mesma forma —
// "Você é um docente universitário experiente" com estrutura de Índice,
// capítulos com 3 subsecções cada, parágrafos de 6-8 linhas e Referências
// Bibliográficas em APA 7, fosse o pedido para Ensino Primário (criança de
// 6-12 anos) ou para Mestrado/Doutoramento. Isso gerava textos academicamente
// densos e com vocabulário impróprio para um aluno do ensino básico.
//
// Agora existe um perfil por nível (NIVEL_PROFILES) que ajusta: a "persona"
// que a IA assume, o registo de linguagem/vocabulário, se o trabalho usa
// estrutura académica formal (índice, capítulos com subsecções, citações
// APA 7) ou uma estrutura simples (O que é / Desenvolvimento / O que
// aprendi), o tamanho dos parágrafos e a densidade de palavras por página.
//
// Os níveis universitários (Licenciatura, Mestrado/Doutoramento) mantêm
// EXACTAMENTE o comportamento e o texto de instruções que já existiam —
// nada foi removido nem anulado para esses dois níveis. Pré-Universitário
// usa a mesma estrutura académica, com exigências um pouco mais leves.
// Os 3 níveis abaixo (Primário e os dois ciclos do Secundário) passam a
// ter, por fim, um tratamento dedicado que nunca existiu antes.

// ── Perfis por nível de ensino ─────────────────────────────────────────
const NIVEL_PROFILES = {
  'Ensino Primário': {
    grupo: 'basico',
    persona: 'Você é uma professora do ensino primário moçambicano, muito paciente e didáctica, a ajudar um(a) aluno(a) pequeno(a) a preparar um trabalho escolar.',
    linguagem: 'Linguagem MUITO simples, frases curtas (máximo 12-15 palavras por frase), vocabulário do dia-a-dia de uma criança de 6 a 12 anos. NUNCA use palavras difíceis, técnicas ou académicas (proibido: "metodologia", "paradigma", "implicações", "revisão de literatura", "outrossim", "destarte"). Explique tudo como se estivesse a contar uma história ou a conversar com a criança. Pode usar perguntas simples para guiar a leitura (ex.: "Sabias que...?").',
    paragrafoLinhas: '2-4',
    palavrasPorPagina: 140,
    usaIndice: false,
    usaCapitulos: false,
    usaAPA: false,
    usaPageBreakEntreSeccoes: false,
    seccoes: ['O que é', 'Como é / Como funciona', 'Exemplos do dia-a-dia em Moçambique', 'Porque é importante saber isto', 'O que aprendi'],
  },
  'Ensino Secundário (1º Ciclo)': {
    grupo: 'basico',
    persona: 'Você é um(a) professor(a) do ensino secundário geral (1º ciclo, 7ª a 9ª classe) em Moçambique, a ajudar um(a) aluno(a) adolescente a preparar um trabalho escolar.',
    linguagem: 'Linguagem clara, directa e acessível a um(a) adolescente de 12 a 15 anos. Frases de tamanho moderado. Evite jargão académico universitário (nada de "epistemologia", "corpus teórico", "revisão crítica da literatura"). Pode usar termos da disciplina quando forem explicados na própria frase. Tom informativo e interessante, como um bom manual escolar.',
    paragrafoLinhas: '4-5',
    palavrasPorPagina: 280,
    usaIndice: true,
    usaCapitulos: false,
    usaAPA: false,
    usaPageBreakEntreSeccoes: true,
    seccoes: ['Introdução', 'Desenvolvimento do tema', 'Exemplos e casos em Moçambique', 'Conclusão', 'Fontes consultadas (livro escolar, manual ou sítio educativo — sem formato APA)'],
  },
  'Ensino Secundário (2º Ciclo)': {
    grupo: 'intermedio',
    persona: 'Você é um(a) professor(a) do ensino secundário geral (2º ciclo, 10ª a 12ª classe) em Moçambique, a ajudar um(a) aluno(a) a preparar um trabalho escolar mais formal.',
    linguagem: 'Linguagem formal e clara, adequada a um(a) jovem de 15 a 18 anos que já domina vocabulário escolar mais elaborado. Pode introduzir terminologia da disciplina, sempre explicada no contexto. Evite ainda o registo puramente universitário (sem "epistemologia", "paradigma metodológico" — use linguagem formal mas compreensível).',
    paragrafoLinhas: '5-6',
    palavrasPorPagina: 340,
    usaIndice: true,
    usaCapitulos: true,
    usaAPA: 'simples',
    usaPageBreakEntreSeccoes: true,
    seccoes: null,
  },
  'Pré-Universitário': {
    grupo: 'academico',
    persona: 'Você é um docente do ensino pré-universitário moçambicano experiente.',
    linguagem: 'Linguagem académica formal mas ainda acessível — o aluno está a preparar-se para o ensino superior. Estrutura organizada com introdução, desenvolvimento por secções e conclusão. Pode usar terminologia técnica da disciplina, sempre com clareza.',
    paragrafoLinhas: '6-7',
    palavrasPorPagina: 380,
    usaIndice: true,
    usaCapitulos: true,
    usaAPA: true,
    usaPageBreakEntreSeccoes: true,
    seccoes: null,
  },
  'Licenciatura': {
    grupo: 'academico',
    persona: 'Você é um docente universitário experiente.',
    linguagem: 'Nível universitário avançado. Use linguagem científica formal. Inclua revisão de literatura, metodologia e conclusões fundamentadas.',
    paragrafoLinhas: '6-8',
    palavrasPorPagina: 420,
    usaIndice: true,
    usaCapitulos: true,
    usaAPA: true,
    usaPageBreakEntreSeccoes: true,
    seccoes: null,
  },
  'Mestrado/Doutoramento': {
    grupo: 'academico',
    persona: 'Você é um docente universitário experiente, orientador de pós-graduação.',
    linguagem: 'Nível pós-graduado. Revisão crítica da literatura (não apenas descritiva — compare, questione e posicione diferentes autores), contribuição original do trabalho, metodologia rigorosa, limitações do estudo e sugestões de investigação futura.',
    paragrafoLinhas: '6-8',
    palavrasPorPagina: 420,
    usaIndice: true,
    usaCapitulos: true,
    usaAPA: true,
    usaPageBreakEntreSeccoes: true,
    seccoes: null,
  },
};

function _getProfile(nivel) {
  return NIVEL_PROFILES[nivel] || NIVEL_PROFILES['Licenciatura'];
}

// CORRIGIDO: o formulário agora coleta nome do aluno, turma/classe, docente
// e instituição (ServiceDefinitions.js → trabalho.fields) — dados que a
// capa do documento (PDFExporter.js "Estudante:"/"Docente:" e o template
// "Académico Clássico" do marketplace, com {{AUTORES}}/{{INSTITUICAO}})
// já esperava mas nunca recebia. Esta função monta, a partir dos campos
// realmente preenchidos, o bloco de identificação a incluir no prompt —
// tanto no contexto (para a IA saber quem é o autor) como na própria
// estrutura do documento gerado, logo após o título. Campos vazios são
// simplesmente omitidos, em vez de aparecerem como "undefined" ou
// "[PREENCHER]".
function _capaLinhas(data) {
  const linhas = [];
  if (data.aluno)       linhas.push(['Estudante', data.aluno]);
  if (data.turma)       linhas.push(['Turma/Classe', data.turma]);
  if (data.docente)     linhas.push(['Docente', data.docente]);
  if (data.instituicao) linhas.push(['Instituição', data.instituicao]);
  return linhas;
}

function _capaContextoPrompt(data) {
  const linhas = _capaLinhas(data);
  if (!linhas.length) return '';
  return '\n' + linhas.map(([label, val]) => `- ${label}: ${val}`).join('\n');
}

function _capaDocumento(data) {
  const linhas = _capaLinhas(data);
  if (!linhas.length) return '';
  return '\n' + linhas.map(([label, val]) => `**${label}:** ${val}  `).join('\n') + '\n';
}

// ── Builder para níveis académicos (Pré-Universitário, Licenciatura, Mestrado/Doutoramento) ──
// Estrutura idêntica à que já existia antes desta alteração — apenas a
// persona/linguagem/exigência de criticidade passam a vir do perfil em vez
// de estarem fixas para todos os níveis.
function _buildAcademicPrompt(data, ocrBlock, profile) {
  const pags    = parseInt(data.paginas) || 5;
  const devPags = Math.max(2, pags - 3);
  const numCaps = Math.max(2, Math.round(devPags / 1.5));
  const palavras = pags * profile.palavrasPorPagina;

  const capsEstrutura = Array.from({ length: numCaps }, (_, i) => {
    const capNum = i + 2;
    return [
      '',
      '---PAGE_BREAK---',
      `## ${capNum}. [Título do Capítulo ${i + 1} — específico ao tema "${data.tema}"]`,
      '',
      `### ${capNum}.1 [Subtítulo A — aspecto principal]`,
      `[ESCREVA AGORA: mínimo 4 parágrafos completos de ${profile.paragrafoLinhas} linhas cada. Conteúdo académico real com dados, datas, nomes, exemplos concretos do contexto moçambicano/africano. PROIBIDO usar marcadores de lugar.]`,
      '',
      `### ${capNum}.2 [Subtítulo B — aspecto complementar]`,
      `[ESCREVA AGORA: mínimo 3 parágrafos completos de ${profile.paragrafoLinhas} linhas cada. Análise crítica, comparações, implicações práticas para Moçambique.]`,
      '',
      `### ${capNum}.3 [Subtítulo C — síntese do capítulo]`,
      `[ESCREVA AGORA: mínimo 2 parágrafos de 5-6 linhas resumindo os pontos-chave do capítulo e ligando ao próximo.]`,
    ].join('\n');
  }).join('\n');

  const indice = Array.from({ length: numCaps }, (_, i) =>
    `   ${i + 2}. [Capítulo ${i + 1}] .................................................. ${i + 4}`
  ).join('\n');

  const refSection = profile.usaAPA === true
    ? `\n\n---PAGE_BREAK---\n## ${numCaps + 3}. Referências Bibliográficas\n\nINSTRUÇÃO CRÍTICA PARA AS REFERÊNCIAS:\n- Lista apenas referências que EXISTEM REALMENTE e são verificáveis\n- Formato APA 7ª edição obrigatório\n- Se não tens certeza de uma referência, NÃO a incluas\n- No mínimo: 1 livro académico real + 1 relatório de organismo oficial (ONU, Banco Mundial, INE Moçambique, SADC)\n- Após a lista de referências reais, adiciona SEMPRE esta nota: "[O autor deve completar com referências específicas consultadas durante a pesquisa]"\n- NUNCA adiciona aviso de que as referências são fictícias — em vez disso, só lista referências reais ou deixa a nota acima`
    : `\n\n---PAGE_BREAK---\n## ${numCaps + 3}. Referências Bibliográficas\n\nINSTRUÇÃO PARA AS REFERÊNCIAS (nível ${data.nivel}, formato simplificado — sem exigência de APA 7 completo):\n- Lista 2 a 3 fontes simples e plausíveis para este nível (manual escolar da disciplina, livro de apoio, ou sítio educativo oficial)\n- Formato simples: Nome do livro/manual, autor ou editora se conhecido, ano\n- Se não tiver certeza de uma fonte real, escreve apenas o nome do manual/disciplina sem inventar autor ou ano`;

  return `${profile.persona} Redija um TRABALHO ACADÉMICO COMPLETO, EXTENSO E DETALHADO seguindo exactamente a estrutura abaixo.

DADOS DO TRABALHO:
- Tema: "${data.tema}"
- Disciplina: ${data.disciplina}
- Nível: ${data.nivel}
- Extensão: ${pags} folhas A4 = MÍNIMO ${palavras} palavras de conteúdo real
- Requisitos do docente: ${data.requisitos || 'seguir normas académicas padrão APA'}${_capaContextoPrompt(data)}${ocrBlock || ''}

REGISTO DE LINGUAGEM OBRIGATÓRIO PARA ESTE NÍVEL:
${profile.linguagem}

REGRAS ABSOLUTAS DE CONTEÚDO:
1. O marcador ---PAGE_BREAK--- separa cada folha A4 — use-o exactamente como indicado. NUNCA escreva "Nova Página" ou "— Nova Página —" — use SEMPRE ---PAGE_BREAK---
2. Cada parágrafo deve ter ${profile.paragrafoLinhas} linhas de texto académico denso e contínuo, sempre respeitando o registo de linguagem indicado acima
3. NUNCA escreva "[PREENCHER]", "[escrever aqui]" ou qualquer marcador de lugar no conteúdo narrativo — escreva o texto real
4. Use exemplos reais, dados históricos verificáveis, contexto moçambicano e africano sempre que possível
5. Corrija ortografia e acentuação em português europeu/moçambicano
6. Títulos e subtítulos em **negrito** e bem hierarquizados
7. ORDEM OBRIGATÓRIA em cada secção: ---PAGE_BREAK--- → título (## ou ###) → parágrafos. NUNCA coloque um parágrafo antes do título após uma quebra de página

REGRAS DE QUALIDADE (violações tornam o documento inaceitável):
- NUNCA repita o mesmo parágrafo ou ideia em secções diferentes — cada secção deve trazer conteúdo NOVO
- NUNCA use linguagem genérica: "crescimento sustentável", "uma das principais", "de extrema importância" são proibidas
- NUNCA inclua referências bibliográficas fictícias — se não tens referências reais, usa a fórmula indicada no fim
- SEMPRE escreve texto académico denso, com dados, datas, nomes e exemplos concretos (respeitando o registo de linguagem do nível)
- Cada parágrafo tem EXACTAMENTE 1 ideia principal desenvolvida em ${profile.paragrafoLinhas} linhas

ESTRUTURA OBRIGATÓRIA (copie exactamente incluindo ---PAGE_BREAK---):

---PAGE_BREAK---
# ${data.tema}
${_capaDocumento(data)}
---PAGE_BREAK---
## Índice

   1. Introdução .................................................. 3
${indice}
   ${numCaps + 2}. Conclusão .................................................. ${numCaps + 4}
   ${numCaps + 3}. Referências Bibliográficas ................................ ${numCaps + 5}

---PAGE_BREAK---
## 1. Introdução

[ESCREVA AGORA um texto introdutório com MÍNIMO 5 parágrafos de ${profile.paragrafoLinhas} linhas cada:
Parágrafo 1 — Contextualização: apresente o tema com dados históricos, geográficos ou sociais reais que enquadrem o leitor. Cite datas, locais e factos verificáveis.
Parágrafo 2 — Relevância: explique por que este tema é importante para Moçambique, para África e para o mundo actual. Use argumentos sólidos.
Parágrafo 3 — Objectivos: defina claramente o objectivo geral e pelo menos 3 objectivos específicos do trabalho usando verbos de acção (analisar, descrever, comparar, avaliar...).
Parágrafo 4 — Metodologia: descreva o tipo de pesquisa (bibliográfica, qualitativa, descritiva), as fontes consultadas e os critérios de selecção.
Parágrafo 5 — Estrutura do trabalho: apresente brevemente o que o leitor encontrará em cada capítulo.]
${capsEstrutura}
---PAGE_BREAK---
## ${numCaps + 2}. Conclusão

[ESCREVA AGORA uma conclusão com MÍNIMO 4 parágrafos de ${profile.paragrafoLinhas} linhas cada:
Parágrafo 1 — Síntese geral: retome os principais achados de cada capítulo de forma integrada, mostrando como se relacionam.
Parágrafo 2 — Resposta aos objectivos: avalie explicitamente se os objectivos propostos na introdução foram atingidos e como.
Parágrafo 3 — Contribuições e limitações: indique o contributo deste trabalho para o conhecimento na área e reconheça as limitações encontradas.
Parágrafo 4 — Recomendações: proponha acções concretas para gestores, políticos, educadores ou investigadores, e indique linhas futuras de pesquisa.]${refSection}
`;
}

// ── Builder para níveis básicos (Ensino Primário e Secundário 1º Ciclo) ──
// Estrutura simples, sem academicismo: sem índice formal com numeração de
// página, sem capítulos com 3 subsecções cada, sem exigência de APA 7.
// O Secundário 1º Ciclo usa quebras de página entre secções e um índice
// simples; o Primário é tudo numa estrutura corrida, mais parecida com um
// texto ilustrativo do que com um "trabalho académico".
function _buildBasicoPrompt(data, ocrBlock, profile) {
  const pags = parseInt(data.paginas) || 3;
  const palavras = pags * profile.palavrasPorPagina;
  const seccoes = profile.seccoes;

  const corpoSeccoes = seccoes.map((titulo, i) => {
    const isUltima = i === seccoes.length - 1;
    const isFontesSection = isUltima && /fontes|onde aprendi/i.test(titulo);
    const pageBreak = (i === 0 || profile.usaPageBreakEntreSeccoes) ? '---PAGE_BREAK---\n' : '';
    const instrucao = isFontesSection
      ? (profile.usaAPA === 'simples'
          ? `[ESCREVA AGORA: uma lista simples de 2-3 fontes plausíveis para este tema e nível (manual escolar da disciplina "${data.disciplina}", livro de apoio, ou sítio educativo oficial). Apenas nome do manual/disciplina, autor ou editora se souber, e ano. NÃO use formato APA 7 completo.]`
          : `[ESCREVA AGORA: 1 frase simples, no registo de linguagem indicado acima, dizendo onde um(a) aluno(a) deste nível normalmente aprende sobre "${data.tema}" (ex.: manual escolar da disciplina, explicação do(a) professor(a) na aula). Não invente nomes de livros ou autores específicos.]`)
      : `[ESCREVA AGORA: ${isUltima ? '1-2' : '2-3'} parágrafos de ${profile.paragrafoLinhas} linhas cada, no registo de linguagem indicado acima, sobre "${titulo}" relacionado com o tema "${data.tema}". Use exemplos simples e próximos da realidade do(a) aluno(a) em Moçambique. PROIBIDO usar marcadores de lugar como [PREENCHER].]`;
    return `${pageBreak}## ${i + 1}. ${titulo}\n\n${instrucao}`;
  }).join('\n\n');

  const indiceBlock = profile.usaIndice
    ? `---PAGE_BREAK---\n## Índice\n\n${seccoes.map((s, i) => `   ${i + 1}. ${s}`).join('\n')}\n\n`
    : '';

  return `${profile.persona} Redija um TRABALHO ESCOLAR completo e bem organizado, adequado a este nível de ensino — NÃO é um trabalho académico universitário.

DADOS DO TRABALHO:
- Tema: "${data.tema}"
- Disciplina: ${data.disciplina}
- Nível: ${data.nivel}
- Extensão: aproximadamente ${pags} folhas A4 = cerca de ${palavras} palavras no total
- Indicações do(a) professor(a): ${data.requisitos || 'nenhuma indicação adicional — siga a estrutura sugerida'}${_capaContextoPrompt(data)}${ocrBlock || ''}

REGISTO DE LINGUAGEM OBRIGATÓRIO PARA ESTE NÍVEL (a regra mais importante deste pedido):
${profile.linguagem}

REGRAS DE ESTRUTURA:
1. ${profile.usaPageBreakEntreSeccoes ? 'Use o marcador ---PAGE_BREAK--- exactamente como indicado para separar secções — NUNCA escreva "Nova Página".' : 'Não é necessário separar em páginas — escreva o texto de forma corrida, com os títulos das secções bem destacados em negrito.'}
2. Siga exactamente os títulos de secção fornecidos abaixo, nesta ordem, sem adicionar "Índice" detalhado, capítulos numerados em estilo universitário, ou linguagem de tese
3. NUNCA escreva "[PREENCHER]" ou qualquer marcador de lugar no texto final — escreva sempre conteúdo real
4. Use exemplos concretos, próximos do dia-a-dia do(a) aluno(a) em Moçambique (família, escola, bairro, comunidade)
5. Corrija ortografia e acentuação em português europeu/moçambicano
${profile.usaAPA === 'simples' ? '6. Na secção final, liste 2-3 fontes simples (livro/manual escolar) sem necessidade de formato APA 7 — apenas nome do manual/disciplina e, se souber, autor e ano.' : '6. NÃO inclua referências bibliográficas em formato académico (APA ou outro) — este nível não exige isso. Pode terminar com uma secção simples "Onde aprendi isto" mencionando o manual escolar ou a explicação do(a) professor(a), se fizer sentido.'}

REGRAS DE QUALIDADE:
- NUNCA use linguagem académica complexa, jargão técnico ou frases longas e rebuscadas — revise sempre se uma criança/adolescente deste nível entenderia a frase
- NUNCA repita a mesma ideia em secções diferentes
- Cada secção deve ensinar algo novo e concreto sobre o tema
- O tom deve ser simpático, claro e encorajador, como um bom manual escolar

ESTRUTURA OBRIGATÓRIA (siga exactamente esta ordem de secções):

---PAGE_BREAK---
# ${data.tema}
${_capaDocumento(data)}
${indiceBlock}${corpoSeccoes}
`;
}

export function buildPrompt(data, ocrBlock) {
  const profile = _getProfile(data.nivel);
  if (profile.grupo === 'basico') {
    return _buildBasicoPrompt(data, ocrBlock, profile);
  }
  return _buildAcademicPrompt(data, ocrBlock, profile);
}

export function buildDataBlock(data) {
  const capa = _capaLinhas(data);
  const capaTxt = capa.length ? '\n' + capa.map(([l, v]) => `- ${l}: ${v}`).join('\n') : '';
  return `- Tema: ${data.tema || ''}
- Disciplina: ${data.disciplina || ''}  |  Nível: ${data.nivel || ''}
- Páginas: ${data.paginas || 5}  |  Requisitos: ${data.requisitos || 'APA'}${capaTxt}`;
}
