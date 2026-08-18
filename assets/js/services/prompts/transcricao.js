// assets/js/services/prompts/transcricao.js
// ─────────────────────────────────────────────────────────────────────────
// NOVO: serviço "Digitalizar Documento" — pensado para digitadores que hoje
// perdem tempo a escrever à mão um trabalho já feito (manuscrito, ou
// espalhado por vários ficheiros/fotos). Em vez disso, fotografam todas as
// páginas e recebem o documento já digitado.
//
// DIFERENÇA CRÍTICA em relação a trabalho.js (Trabalho Escolar): aquele
// serviço DESENVOLVE e AMPLIA o conteúdo do rascunho recebido, com
// estrutura académica formal. Este serviço faz o OPOSTO — TRANSCREVE
// fielmente o que já está escrito, sem acrescentar, resumir, reescrever
// ou reorganizar o CONTEÚDO. A única coisa que pode mudar é:
//   1. Correcção de erros de leitura do OCR (palavras cortadas, confusão
//      de letras semelhantes);
//   2. Acentuação e pontuação em português correcto;
//   3. Formatação visual (títulos, parágrafos, espaçamento);
//   4. ORDEM das secções — só se o utilizador pedir explicitamente em
//      "Como organizar o documento" (campo `organizacao`). Sem essa
//      instrução, a ordem original das páginas é sempre respeitada.
//
// Isto existe precisamente para não confundir "digitalizar/transcrever o
// que já foi escrito por alguém" com "gerar/desenvolver um trabalho novo"
// — são pedidos diferentes, com expectativas diferentes do utilizador.

export function buildPrompt(data, ocrBlock) {
  const titulo = (data.titulo || '').trim();
  const tipo   = (data.tipo || '').trim();
  const organizacao = (data.organizacao || '').trim();

  const semMaterial = !ocrBlock || !ocrBlock.trim();

  if (semMaterial) {
    // Sem nenhuma página/ficheiro enviado — não há nada para transcrever.
    // Em vez de inventar um documento do zero (o que seria o oposto do
    // que este serviço promete), devolve-se uma instrução que resulta
    // num aviso claro dentro do próprio documento, para o utilizador
    // perceber que precisa de enviar o material antes de gerar.
    return `Devolva APENAS o seguinte texto, sem adicionar mais nada:

# ${titulo || 'Documento'}

**Nenhum material foi enviado para digitalizar.** Volte atrás e use "Tirar Fotos" ou "Escolher Ficheiros" para fotografar todas as páginas do documento que pretende digitalizar, depois gere novamente.`;
  }

  const tipoInstrucao = tipo
    ? `O material enviado é do tipo "${tipo}" — respeite as convenções de formatação habituais desse tipo de documento (ex.: acta tem cabeçalho de reunião e lista de presenças se existirem no original; carta tem saudação e despedida; relatório tem secções).`
    : 'Detecte pelo próprio conteúdo que tipo de documento é (carta, relatório, acta, trabalho, manuscrito literário, etc.) e formate de acordo com as convenções habituais desse tipo.';

  const organizacaoInstrucao = organizacao
    ? `\n\nINSTRUÇÃO DE ORGANIZAÇÃO DADA PELO UTILIZADOR (siga exactamente): ${organizacao}`
    : '\n\nSem instrução de organização — mantenha rigorosamente a ordem em que o conteúdo aparece nas páginas fornecidas, sem reordenar nada.';

  return `Você é um digitador profissional moçambicano, extremamente cuidadoso e fiel ao original. A sua tarefa é TRANSCREVER o documento fornecido abaixo, exactamente como um digitador humano competente o faria — nunca reescrever, resumir, ampliar, ou mudar o significado do que está escrito.

${titulo ? `TÍTULO DO DOCUMENTO: "${titulo}"` : ''}
${tipoInstrucao}${organizacaoInstrucao}

REGRAS ABSOLUTAS (violar qualquer uma torna o resultado inaceitável):
1. TRANSCREVA O CONTEÚDO FIELMENTE — não invente, não resuma, não desenvolva ideias que não estejam no material, não corte partes por parecerem repetitivas. Se o autor original repetiu uma ideia, mantenha a repetição.
2. CORRIJA APENAS: erros óbvios de leitura do OCR (ex.: letras trocadas por semelhança visual, palavras cortadas a meio), acentuação e pontuação em português correcto (europeu/moçambicano), e maiúsculas/minúsculas onde for claramente um erro de digitação.
3. NÃO CORRIJA o estilo, o vocabulário ou os argumentos do autor original — mesmo que uma frase pareça informal, mal construída ou repetitiva, mantenha-a assim, apenas com ortografia e acentuação correctas. Este não é um serviço de revisão de estilo, é um serviço de digitação fiel.
4. Organize visualmente em parágrafos e, se aplicável, títulos/subtítulos — mas os títulos só devem aparecer se já existirem implicitamente no material original (ex.: uma secção claramente separada no manuscrito), nunca inventados do zero para "melhorar a estrutura".
5. Se uma palavra ou trecho for absolutamente ilegível no material fornecido, marque no texto como [ILEGÍVEL] em vez de adivinhar ou inventar conteúdo — nunca finja ter lido algo que não estava claro.
6. Mantenha números, datas, nomes próprios e valores EXACTAMENTE como aparecem no original — nunca "corrija" um valor ou uma data por parecer estranho, mesmo que pareça um erro do autor.
7. Se o material tiver várias páginas, uma-as num documento contínuo e coerente, respeitando a ordem (salvo instrução de organização em contrário acima).
8. NOVO — se alguma parte do material vier marcada exactamente como "[PÁGINA NÃO LEGÍVEL]" (a câmara não conseguiu ler essa página de todo, geralmente por desfoque, inclinação ou pouca luz): NÃO a omita silenciosamente do documento final e NÃO invente conteúdo para preencher esse espaço. Em vez disso, escreva no lugar exacto dessa página, em destaque: "> ⚠️ **Não foi possível ler esta página.** Tire a foto novamente com boa luz, bem enquadrada e sem inclinação, e gere de novo." Isto avisa claramente o utilizador de qual página específica precisa de ser refotografada, em vez de o documento parecer incompleto sem explicação.

${ocrBlock}

Devolva o documento transcrito, começando directamente pelo título (se houver) ou pelo conteúdo, sem comentários seus antes ou depois, sem frases como "aqui está a transcrição" — apenas o documento em si, pronto a imprimir.`;
}

export function buildDataBlock(data) {
  const linhas = [];
  if (data.titulo)      linhas.push(`- Título: ${data.titulo}`);
  if (data.tipo)        linhas.push(`- Tipo de conteúdo: ${data.tipo}`);
  if (data.organizacao) linhas.push(`- Organização pedida: ${data.organizacao}`);
  return linhas.length ? linhas.join('\n') : '- Documento a digitalizar/transcrever a partir de material fotografado';
}
