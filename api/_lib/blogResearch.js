// api/_lib/blogResearch.js
// ──────────────────────────────────────────────────────────────────────────
// P1.9 (Master Hardening & Release Gate v2, Set/2026, Fase 6) — EXTENSÃO
// pedida pelo cliente: "eles têm que investigar sozinho primeiro em sites
// oficiais e informações mais recentes só depois gerar o conteúdo de forma
// 100% correcta apois verificar e ter certeza das suas afirmações com base
// na investigação de vários sites os principais sites do governo ou
// oficiais apois comparar tudo só depois gerar os posts".
//
// O que a migration_v71 já fazia: detectar tópicos legal/fiscal/
// administrativos (SENSITIVE_TOPIC_PATTERN em blog.js) e nunca publicar
// esses automaticamente (needs_review=TRUE), mais um aviso no prompt para a
// IA não inventar números. Isso reduz o risco, mas não confirma factos —
// o artigo continuava a ser escrito só com o conhecimento interno do
// modelo, sem pesquisa real.
//
// O que este ficheiro acrescenta: ANTES de escrever o artigo (só para
// tópicos sensíveis — não vale a pena o custo/latência extra para "como
// fazer um CV"), pede à API Gemini para pesquisar o tema com o grounding
// nativo do Google Search (tools: [{google_search:{}}]), com instrução
// explícita para priorizar sites oficiais moçambicanos (AT, INSS, INTIC,
// Portal do Governo, Boletim da República, etc.). Os "factos" devolvidos
// só são aceites se o URL da fonte bater com um URL REALMENTE devolvido
// pelo grounding (groundingChunks) OU pertencer a um domínio oficial
// conhecido — nunca confiamos cegamente no texto que o próprio modelo diz
// ser a fonte, porque isso seria só trocar uma alucinação por outra.
//
// FAIL-CLOSED SEMPRE: se a GEMINI_API_KEY não estiver configurada, se o
// pedido falhar, ou se nenhum facto sobreviver à verificação acima, esta
// função devolve `null` — nunca lança excepção (não pode impedir a geração
// do artigo) e blog.js trata `null` como "sem fontes confirmadas", reforça
// ainda mais a instrução para não inventar números, e o artigo continua a
// exigir revisão humana de qualquer forma (needsReview já é sempre TRUE
// para tópicos sensíveis, com ou sem pesquisa — ver SENSITIVE_TOPIC_PATTERN
// em blog.js). Esta pesquisa serve para tornar o rascunho mais correcto E
// para dar ao admin, no ecrã de revisão, as fontes já verificadas em vez de
// ele ter de procurar do zero.
// ──────────────────────────────────────────────────────────────────────────

// Mesmo modelo (e mesma env var GEMINI_API_KEY) já usados pelo RAG jurídico
// (api/_lib/legalSearch.js) e pela geração de documentos (aiProviderRegistry.js)
// — "-latest" sobrevive a descontinuações da Google sem deploy manual.
const GEMINI_MODEL = 'gemini-flash-latest';

// Lista de referência de domínios oficiais/fiáveis moçambicanos — usada só
// como critério adicional de aceitação de uma fonte (ver `isOfficialDomain`
// abaixo), nunca como restrição de pesquisa em si (o grounding do Google
// decide o que existe na web; nós só filtramos o que aceitamos citar).
const OFFICIAL_DOMAIN_HINTS = [
  'at.gov.mz',              // Autoridade Tributária
  'portaldogoverno.gov.mz', // Portal do Governo de Moçambique
  'mef.gov.mz',             // Ministério da Economia e Finanças
  'inss.gov.mz',            // Instituto Nacional de Segurança Social
  'justica.gov.mz',
  'mjacl.gov.mz',           // Ministério da Justiça, Assuntos Constitucionais e Religiosos
  'intic.gov.mz',
  'cnp.org.mz',
  'impostos.gov.mz',
  'gov.mz',
];

const RESEARCH_TIMEOUT_MS = 20000;
const MAX_FACTOS = 8;

/**
 * Pesquisa factos verificáveis e actualizados sobre `title`/`keywords` em
 * fontes oficiais, usando o grounding do Google Search da API Gemini.
 *
 * @returns {Promise<{factos: Array<{facto:string, fonte_nome:string, fonte_url:string}>, fontesUnicas: string[]} | null>}
 */
async function researchOfficialSources(title, keywords) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[blogResearch] GEMINI_API_KEY não configurada — a seguir sem pesquisa (fail-closed).');
    return null;
  }

  const prompt = `Pesquisa factos verificados e actualizados (2026) sobre este tema, para Moçambique: "${title}" (palavras-chave: ${keywords || 'nenhuma'}).

Prioriza SEMPRE sites oficiais do governo moçambicano ou fontes jurídicas fiáveis — por exemplo: ${OFFICIAL_DOMAIN_HINTS.join(', ')}, o Boletim da República, ou órgãos de imprensa moçambicanos credíveis. Ignora blogs pessoais, fóruns e redes sociais.

Depois de pesquisares, devolve APENAS um JSON válido (sem markdown, sem \`\`\`, sem comentários) neste formato exacto:
{"factos":[{"facto":"...","fonte_nome":"...","fonte_url":"..."}],"fontes_fiaveis_encontradas":true|false}

Regras obrigatórias:
- Cada "facto" é uma frase curta e verificável, com o número/prazo/percentagem/requisito EXACTO tal como aparece na fonte — nunca arredondes nem estimes.
- "fonte_url" tem de ser um URL real que tenhas efectivamente encontrado na pesquisa — nunca inventes ou adivinhes um URL.
- Máximo ${MAX_FACTOS} factos.
- Se não encontrares nenhuma fonte fiável e actual sobre este tema, devolve {"factos":[],"fontes_fiaveis_encontradas":false} — isso é uma resposta válida e preferível a inventar algo.`;

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          // Grounding nativo — a própria Google faz as pesquisas na web e
          // devolve, em groundingMetadata, os URLs REAIS que consultou.
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1536 },
        }),
      }
    );
  } catch (e) {
    console.warn('[blogResearch] pedido a Gemini falhou (rede/timeout):', e.message);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[blogResearch] Gemini grounding devolveu erro:', res.status, errText.slice(0, 300));
    return null;
  }

  let data;
  try { data = await res.json(); } catch (e) {
    console.warn('[blogResearch] resposta da Gemini não é JSON válido:', e.message);
    return null;
  }

  const candidate = data?.candidates?.[0];
  const rawText = (candidate?.content?.parts || []).map(p => p.text || '').join('');
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
    console.warn('[blogResearch] JSON de factos malformado:', e.message);
    return null;
  }
  if (!parsed || !Array.isArray(parsed.factos) || parsed.factos.length === 0) return null;

  // URLs REALMENTE devolvidos pelo grounding do Google — a única fonte de
  // verdade fiável aqui. groundingChunks é a estrutura documentada da API
  // Gemini para citações de grounding; se a forma exacta mudar no futuro
  // (campo renomeado, etc.), groundedUrls fica vazio e caímos no critério
  // de domínio oficial abaixo — nunca em erro.
  const groundedUrls = new Set(
    (candidate?.groundingMetadata?.groundingChunks || [])
      .map(c => c?.web?.uri)
      .filter(Boolean)
  );

  const isOfficialDomain = (url) =>
    typeof url === 'string' && OFFICIAL_DOMAIN_HINTS.some(d => url.includes(d));

  // Só aceita um "facto" se a fonte que a IA alega bater com um URL que o
  // grounding realmente visitou, OU pertencer a um domínio oficial
  // conhecido — descarta tudo o resto em vez de confiar às cegas no texto.
  const factosVerificados = parsed.factos
    .filter(f => f && typeof f.facto === 'string' && f.facto.trim() && f.fonte_url)
    .filter(f => groundedUrls.has(f.fonte_url) || isOfficialDomain(f.fonte_url))
    .slice(0, MAX_FACTOS);

  if (factosVerificados.length === 0) return null;

  return {
    factos: factosVerificados,
    fontesUnicas: [...new Set(factosVerificados.map(f => f.fonte_nome || f.fonte_url))],
  };
}

module.exports = { researchOfficialSources, OFFICIAL_DOMAIN_HINTS };
