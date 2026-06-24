// api/_lib/legalSearch.js
// ──────────────────────────────────────────────────────────────────────────
// FASE 2 — Motor Jurídico (RAG): helper de busca semântica.
//
// Usado pela acção "legal-search" em api/misc.js. Mantido num ficheiro
// próprio (em vez de inline em misc.js) porque a lógica de embedding é
// independente do roteamento HTTP e pode vir a ser reutilizada por outras
// rotas no futuro (ex: biblioteca jurídica pública — Fase 5 do plano
// original).
//
// Modelo de embedding: gemini-embedding-001, outputDimensionality=768 —
// tem de corresponder EXACTAMENTE ao que foi usado em scripts/legal-ingest.js
// para os vectores já armazenados (dimensões diferentes não são comparáveis).
// ──────────────────────────────────────────────────────────────────────────

const { rpc } = require('./supabaseAdmin');

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

// Limiar de similaridade (cosine) abaixo do qual NÃO consideramos o
// resultado confiável. Definido conservadoramente: é melhor dizer "não
// encontrado" do que citar um artigo pouco relacionado com confiança falsa.
// Ver docs/legal/VERIFICACAO-LEGAL.md — o objectivo desta Fase 2 é
// substituir citações estáticas por citações REAIS, não introduzir um
// novo tipo de alucinação (artigo certo, lei errada para o contexto).
const SIMILARITY_THRESHOLD = 0.55;

async function gerarEmbeddingQuery(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada — necessária para busca jurídica.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: texto }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
      // RETRIEVAL_QUERY (não RETRIEVAL_DOCUMENT) — o texto aqui é a
      // pergunta/contexto do utilizador, não um documento a indexar.
      // Os dois taskType produzem embeddings ligeiramente diferentes,
      // optimizados para o seu papel na busca.
      taskType: 'RETRIEVAL_QUERY',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini embedContent falhou (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('Resposta de embedding inesperada do Gemini.');
  }
  return values;
}

/**
 * Busca os artigos de lei mais relevantes para uma query em linguagem
 * natural (ex: "procuração para venda de imóvel", "falsas declarações em
 * declaração de residência").
 *
 * @param {string} query — descrição em português do que se procura
 * @param {object} [opts]
 * @param {string[]} [opts.diplomaSlugs] — restringir a certos diplomas (slugs de legal_diplomas)
 * @param {number} [opts.matchCount=4] — quantos artigos devolver no máximo
 * @returns {Promise<{ resultados: Array, avisoQualidade: boolean }>}
 *   resultados: artigos acima do limiar de confiança, já filtrados e ordenados
 *   avisoQualidade: true se algum resultado vem de diploma com estado_verificacao='parcial'
 *   (nesse caso, o texto não deve ser citado verbatim — ver legal_diplomas.observacoes)
 */
async function buscarArtigosRelevantes(query, opts = {}) {
  const { diplomaSlugs = null, matchCount = 4 } = opts;

  const queryEmbedding = await gerarEmbeddingQuery(query);

  const linhas = await rpc('match_legal_chunks', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_count: matchCount,
    diploma_slugs: diplomaSlugs,
  });

  if (!Array.isArray(linhas)) {
    throw new Error('match_legal_chunks devolveu um formato inesperado — confirmar se a migration_v19 já correu.');
  }

  const resultados = linhas
    .filter(r => r.similarity >= SIMILARITY_THRESHOLD)
    .map(r => ({
      diploma: r.diploma_nome,
      diplomaSlug: r.diploma_slug,
      artigo: r.artigo_numero,
      titulo: r.artigo_titulo,
      texto: r.texto,
      similaridade: Math.round(r.similarity * 100) / 100,
      qualidadeReduzida: r.estado_verificacao === 'parcial',
    }));

  const avisoQualidade = resultados.some(r => r.qualidadeReduzida);

  return { resultados, avisoQualidade };
}

module.exports = { buscarArtigosRelevantes, SIMILARITY_THRESHOLD };
