// api/_lib/visionAI.js — v2.1 (Set/2026 — cascata alargada + modelos actualizados)
// ──────────────────────────────────────────────────────────────────────────
// Helper reutilizável de IA visão (imagem → texto/JSON).
// Extraído de api/extract-template.js para ser partilhado com
// api/misc.js (verify-receipt) e qualquer futura function que
// precise de analisar imagens.
//
// NÃO é uma Serverless Function — é um módulo Node interno (_lib/).
// Não conta para o limite de 12 functions do Vercel Hobby.
//
// Providers suportados (em cascata, por esta ordem):
//   1. Gemini        — GEMINI_API_KEY
//   2. Mistral        — MISTRAL_API_KEY (mistral-small-latest tem visão nativa
//                       desde a v3.2 — é o MESMO modelo já usado no motor de
//                       texto, portanto zero risco de quota extra)
//   3. OpenRouter     — OPENROUTER_API_KEY ou OR_API_KEY (modelos :free)
//
// REMOVIDO (Set/2026, 3ª ronda): "GitHub Models" foi permanentemente
// desligado pela própria GitHub a 30/Jul/2026 (confirmado —
// github.blog/changelog/2026-07-30-github-models-is-now-retired) — todas
// as chamadas devolviam sempre HTTP 410 Gone, uma tentativa garantidamente
// falhada em cada pedido (confirmado nos logs de produção de 08/Set/2026).
//
// CORRIGIDO (Set/2026, 2ª ronda — "continua a dar o mesmo erro"):
// a 1ª versão desta cascata (v2.0) incluía Groq (llama-4-scout /
// llama-4-maverick) e Mistral (pixtral-12b-2409) como providers de visão —
// só que ENTRETANTO ambos os modelos da Groq foram descontinuados
// (llama-4-maverick a 09/Mar/2026, llama-4-scout a 17/Jul/2026 — a Groq
// não tem NENHUM modelo de visão grátis neste momento) e o pixtral-12b-2409
// da Mistral foi retirado a 31/Dez/2025. Ou seja, 2 dos 5 providers estavam
// GARANTIDOS a falhar com 404 "model_decommissioned", só a perder tempo
// sem nunca poder ajudar — o que ainda por cima piorava a latência total
// (mais tentativas condenadas antes de chegar a um provider que funciona).
// Corrigido: Groq removido (sem alternativa de visão grátis actual);
// Mistral trocado para "mistral-small-latest" (Mistral Small 3.2 — tem
// visão nativa e é o MESMO modelo grátis já usado no motor de texto,
// confirmado em docs.mistral.ai/capabilities/vision). Gemini também
// sincronizado com a correcção já feita em aiProviderRegistry.js
// (gemini-2.0-flash e gemini-1.5-flash estão desligados pela Google).
// OpenRouter actualizado para os modelos :free com visão confirmados
// activos em Set/2026 (a lista anterior tinha nomes já retirados do
// catálogo da OpenRouter).
//
// Timeout por tentativa: cada função de function/vercel.json tem
// maxDuration: 60s. Sem limite por pedido individual, UM provider lento a
// não responder (não é erro, é simplesmente devagar) podia gastar sozinho
// os 60s todos e nunca chegar a tentar os restantes. AbortController com
// 8s por tentativa garante que, no pior caso (todas as 6 tentativas desta
// cascata falham/demoram), o total fica em ~48s — dentro do limite, com
// margem.
//
// Todos os providers "kind: openai" (Mistral, OpenRouter)
// falam o mesmo formato de chat/completions com
// `image_url: { url: "data:<mime>;base64,<...>" }` — por isso partilham o
// mesmo helper genérico `callOpenAIVision()` em vez de código duplicado.
//
// Uso:
//   const { analyzeImage } = require('./_lib/visionAI');
//   const text = await analyzeImage(imageBase64, prompt, { mimeType: 'image/jpeg' });
// ──────────────────────────────────────────────────────────────────────────

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');

// NOVO (Set/2026, 4ª ronda): liga a cascata de visão ao MESMO disjuntor
// (circuit breaker) por modelo e ao MESMO alerta de operação já usados
// pelo motor principal de texto (ver api/_lib/aiRace.js) — até agora este
// ficheiro corria "às cegas": nada aqui memorizava que um modelo tinha
// acabado de falhar, por isso o mesmo modelo morto era tentado de novo em
// TODOS os pedidos seguintes, e ninguém era avisado sem ir ver os logs da
// Vercel manualmente (foi exactamente assim que o 410 do GitHub Models e o
// 404 do modelo errado da OpenRouter passaram despercebidos).
//
// Com isto:
//   - Um modelo que falhe com um erro "permanente" (ex: "model not
//     found", "decommissioned") fica automaticamente de fora por 7 dias —
//     sem esperar por outro pedido igual para "descobrir" de novo que
//     está morto.
//   - Falhas transitórias (rate limit, 5xx, timeout) só desactivam um
//     modelo depois de 3 falhas seguidas, com recuo crescente
//     (10min→30min→2h) — não desliga por um azar pontual.
//   - Se um provider INTEIRO (todos os seus modelos) esgotar 5 vezes
//     seguidas, dispara automaticamente um alerta por Telegram/WhatsApp
//     (mesmo canal já configurado para o motor de texto) — é essa a parte
//     que substitui teres de reparar num log da Vercel por acaso.
// Os IDs usados aqui (`gemini-vision`, `mistral-vision`,
// `openrouter-vision`) são DELIBERADAMENTE diferentes dos IDs do motor de
// texto (`gemini`, `mistral`, `openrouter`) mesmo quando o modelo por
// trás é o mesmo — uma falha a analisar uma imagem não deve desactivar
// esse modelo para gerar texto, e vice-versa; são cargas de trabalho
// diferentes com quotas que podem esgotar-se de forma independente.
const { isModelDisabled, recordModelResult, recordProviderSuccess, recordProviderExhaustion } = require('./modelHealth');
const { notifyProviderIssue } = require('./notifyOps');
// NOVO (Set/2026, 5ª ronda): descoberta ao vivo de catálogo — o MESMO
// mecanismo já usado pelo motor de texto (ver aiRace.js →
// tryProviderChain), agora também aplicado à cascata de visão. Antes desta
// ronda, o único jeito de a app "saber" que um ID de modelo já não existe
// (ex: o 404 de "minimax/minimax-m3:free") era um humano ver o erro nos
// logs e corrigir o código à mão. Com isto, antes de cada tentativa,
// pergunta-se ao PRÓPRIO provider (GET /models) que modelos ele tem AGORA;
// se um modelo da lista curada já não existir, é saltado sem gastar um
// pedido — e se a descoberta confirmar que um modelo existe apesar de um
// disjuntor permanente antigo o ter marcado como morto, esse disjuntor é
// ignorado (ver `discoveredLive` abaixo). getAvailableModels() é
// best-effort e NUNCA atrasa nem bloqueia — devolve `null` em qualquer
// problema (timeout, provider sem /models, etc.) e o código continua a
// usar a lista curada tal como já fazia antes.
//
// getProvider('gemini'/'mistral'/'openrouter') reaproveita os MESMOS
// providerCfg (modelsUrl, authHeader, kind) já definidos em
// aiProviderRegistry.js para o motor de texto — o catálogo de um provider
// é o mesmo independentemente de ser para texto ou visão, por isso a
// descoberta (e a respectiva cache de 3h) fica PARTILHADA entre os dois
// motores, evitando pedidos duplicados a /models. Já o disjuntor de saúde
// (isModelDisabled/recordModelResult acima) continua com IDs próprios
// ('gemini-vision', etc.) — esse sim tem de ficar isolado, porque uma
// falha a analisar uma imagem não deve desactivar um modelo para gerar
// texto, e vice-versa.
const { getAvailableModels } = require('./modelDiscovery');
const { getProvider } = require('./aiProviderRegistry');

// Metadados mínimos por provider de visão, só para a mensagem de alerta
// (mesmo formato que providerCfg em aiProviderRegistry.js, mas não precisa
// de tudo o resto — chatUrl, kind, etc. — porque a chamada em si já está
// implementada às boas em callGemini/callOpenAIVision).
const VISION_PROVIDER_META = {
  'gemini-vision':     { name: 'Gemini (visão)',     envVar: 'GEMINI_API_KEY',     signupUrl: 'https://aistudio.google.com/apikey' },
  'mistral-vision':    { name: 'Mistral (visão)',    envVar: 'MISTRAL_API_KEY',    signupUrl: 'https://console.mistral.ai/api-keys' },
  'openrouter-vision': { name: 'OpenRouter (visão)', envVar: 'OPENROUTER_API_KEY', signupUrl: 'https://openrouter.ai/keys' },
};
// CORRIGIDO (confirmado por logs reais da Vercel): 8000ms cortava o
// OpenRouter minimax-m3:free a meio de uma resposta que provavelmente
// terminaria com mais alguns segundos — modelos grátis de visão sob carga
// são lentos, não só falham. 12000ms dá mais margem sem estourar os 60s
// da função (pior caso actual: Gemini 2 modelos + OR 2 modelos = 4
// tentativas × 12s = 48s, com folga).
const PER_ATTEMPT_TIMEOUT_MS = 12000;

// ── Gemini ─────────────────────────────────────────────────────────────────
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Sincronizado com a correcção já feita em aiProviderRegistry.js:
// gemini-2.0-flash e gemini-1.5-flash foram desligados pela Google em 2026.
// "-latest" aponta sempre ao Flash mais recente (2 semanas de aviso antes
// de qualquer troca por parte da Google).
const GEMINI_VISION_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

async function callGemini(apiKey, imageBase64, mimeType, prompt) {
  let lastErr;
  let anyAttempted = false;

  const discovered = await getAvailableModels(getProvider('gemini'), apiKey);
  let candidates = discovered
    ? GEMINI_VISION_MODELS.filter(m => discovered.includes(m))
    : GEMINI_VISION_MODELS.slice();
  if (discovered && candidates.length === 0) {
    // Nenhum dos modelos curados existe mais no catálogo real — usa os
    // primeiros que a descoberta devolveu (mesma rede de segurança já
    // usada pelo motor de texto para sobreviver a uma troca de catálogo
    // sem deploy novo).
    candidates = discovered.slice(0, 3);
    console.warn('[visionAI] Gemini: catálogo curado indisponível — a usar descoberta ao vivo:', candidates);
  }

  for (const model of candidates) {
    const discoveredLive = !!(discovered && discovered.includes(model));
    if (await isModelDisabled('gemini-vision', model, { discoveredLive })) {
      console.warn(`[visionAI] gemini-vision/${model} desactivado pelo disjuntor — a saltar`);
      continue;
    }
    anyAttempted = true;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PER_ATTEMPT_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: prompt },
            ]}],
            // CORRIGIDO: 4096 tokens era insuficiente para o HTML+CSS completo
            // que o prompt pede (ex: CV com sidebar tem ~30 classes CSS) — a
            // resposta era cortada a meio, o JSON ficava inválido, parseJSON()
            // rebentava. 8192 dá margem confortável. responseMimeType força
            // JSON válido (sem crases nem texto extra à volta).
            generationConfig: { maxOutputTokens: 8192, temperature: 0.1, responseMimeType: 'application/json' },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          }),
        });
      } finally { clearTimeout(t); }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `Gemini HTTP ${res.status} (${model})`);
        recordModelResult('gemini-vision', model, false, lastErr); // fire-and-forget
        if (res.status === 429 || res.status === 503) { continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) throw new Error(`Gemini resposta vazia (${data.candidates?.[0]?.finishReason})`);
      console.log(`[visionAI] Gemini OK ${model} (${text.length} chars)`);
      recordModelResult('gemini-vision', model, true, null); // fire-and-forget
      recordProviderSuccess('gemini-vision'); // fire-and-forget
      return text;
    } catch (err) {
      const msg = err.name === 'AbortError' ? `Gemini timeout (${PER_ATTEMPT_TIMEOUT_MS}ms, ${model})` : err.message;
      console.warn(`[visionAI] Gemini ${model}:`, msg);
      lastErr = new Error(msg);
      recordModelResult('gemini-vision', model, false, lastErr); // fire-and-forget
    }
  }
  if (!anyAttempted) lastErr = new Error('Gemini: todos os modelos desactivados pelo disjuntor');
  throw lastErr || new Error('Gemini: todos os modelos falharam');
}

// ── Helper genérico para providers "OpenAI-compatible" com visão ───────────
async function callOpenAIVision({ providerId, registryId, apiKey, label, url, headers, models, imageBase64, mimeType, prompt, maxTokens }) {
  let lastErr;
  let anyAttempted = false;

  const discovered = await getAvailableModels(getProvider(registryId), apiKey);
  let candidates = discovered ? models.filter(m => discovered.includes(m)) : models.slice();
  if (discovered && candidates.length === 0) {
    candidates = discovered.slice(0, 3);
    console.warn(`[visionAI] ${label}: catálogo curado indisponível — a usar descoberta ao vivo:`, candidates);
  }

  for (const model of candidates) {
    const discoveredLive = !!(discovered && discovered.includes(model));
    if (await isModelDisabled(providerId, model, { discoveredLive })) {
      console.warn(`[visionAI] ${providerId}/${model} desactivado pelo disjuntor — a saltar`);
      continue;
    }
    anyAttempted = true;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.1,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ]}],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `${label} HTTP ${res.status} (${model})`);
        recordModelResult(providerId, model, false, lastErr); // fire-and-forget
        if (res.status === 429) { continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error(`${label} resposta vazia`);
      console.log(`[visionAI] ${label} OK ${model} (${text.length} chars)`);
      recordModelResult(providerId, model, true, null); // fire-and-forget
      recordProviderSuccess(providerId); // fire-and-forget
      return text;
    } catch (err) {
      const msg = err.name === 'AbortError' ? `${label} timeout (${PER_ATTEMPT_TIMEOUT_MS}ms, ${model})` : err.message;
      console.warn(`[visionAI] ${label} ${model}:`, msg);
      lastErr = new Error(msg);
      recordModelResult(providerId, model, false, lastErr); // fire-and-forget
    } finally {
      clearTimeout(t);
    }
  }
  if (!anyAttempted) lastErr = new Error(`${label}: todos os modelos desactivados pelo disjuntor`);
  throw lastErr || new Error(`${label}: todos os modelos falharam`);
}

// ── Mistral — CORRIGIDO: pixtral-12b-2409 foi retirado pela Mistral a
//    31/Dez/2025 (404 garantido). mistral-small-latest (Mistral Small 3.2)
//    tem visão nativa desde Jun/2025 e é o MESMO modelo grátis já usado no
//    motor de texto (aiProviderRegistry.js) — sem quota extra, sem conta
//    nova, e confirmado activo em docs.mistral.ai/capabilities/vision. ──────
const MISTRAL_VISION_MODELS = ['mistral-small-latest'];
function callMistral(apiKey, imageBase64, mimeType, prompt) {
  return callOpenAIVision({
    providerId: 'mistral-vision',
    registryId: 'mistral',
    apiKey,
    label:   'Mistral',
    url:     'https://api.mistral.ai/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}` },
    models:  MISTRAL_VISION_MODELS,
    imageBase64, mimeType, prompt,
    maxTokens: 8192,
  });
}

// REMOVIDO (Set/2026): "GitHub Models" (callGithub) foi permanentemente
// desligado pela GitHub a 30/Jul/2026 — ver
// https://github.blog/changelog/2026-07-30-github-models-is-now-retired/
// Toda a chamada a models.github.ai devolvia sempre HTTP 410 Gone
// (confirmado nos logs de produção de 08/Set/2026), uma tentativa
// garantidamente falhada em cada pedido de extracção de template. Mesma
// remoção aplicada ao motor principal de texto em
// api/_lib/aiProviderRegistry.js.

// ── OpenRouter — CORRIGIDO (Set/2026, 3ª ronda): "minimax/minimax-m3:free"
//    não existe no catálogo actual da OpenRouter — devolvia sempre 404
//    (confirmado nos logs de produção de 08/Set/2026). Substituído por dois
//    modelos grátis com visão CONFIRMADOS activos em Set/2026 (fontes
//    diferentes da Gemma, para não esgotar a mesma quota subjacente em
//    caso de falha): NVIDIA Nemotron (multimodal texto+imagem+vídeo+áudio)
//    e uma segunda variante Gemma (MoE, mais leve). ─────────────────────────
const OR_VISION_MODELS = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-26b-a4b-it:free',
];
function callOpenRouter(apiKey, imageBase64, mimeType, prompt) {
  return callOpenAIVision({
    providerId: 'openrouter-vision',
    registryId: 'openrouter',
    apiKey,
    label:   'OpenRouter',
    url:     'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      Authorization:   `Bearer ${apiKey}`,
      'HTTP-Referer':  SITE_URL,
      'X-Title':       'MzDocs Pro',
    },
    models:  OR_VISION_MODELS,
    imageBase64, mimeType, prompt,
    // CORRIGIDO: 1024 tokens tornava quase impossível devolver um HTML+CSS
    // completo (mesma causa da falha silenciosa descrita em callGemini).
    maxTokens: 8192,
  });
}

/**
 * analyzeImage — percorre a cascata de providers de visão configurados
 * (Gemini → Mistral → OpenRouter) até um responder com
 * sucesso, e devolve o texto bruto da resposta (normalmente JSON,
 * dependendo do prompt). Providers sem env var configurada são saltados
 * sem erro — só falha (lança excepção) se NENHUM provider disponível
 * conseguir responder.
 *
 * @param {string} imageBase64 — imagem em base64 (sem prefixo data:...)
 * @param {string} prompt      — instrução completa para a IA
 * @param {object} [opts]
 * @param {string} [opts.mimeType]   — ex: 'image/jpeg', 'image/png' (default: 'image/jpeg')
 * @param {string} [opts.logPrefix]  — prefixo para logs (default: 'visionAI')
 * @returns {Promise<string>} — texto bruto da resposta
 */
async function analyzeImage(imageBase64, prompt, opts = {}) {
  const mimeType  = opts.mimeType  || 'image/jpeg';
  const logPrefix = opts.logPrefix || 'visionAI';

  const GEMINI_KEY    = process.env.GEMINI_API_KEY;
  const MISTRAL_KEY   = process.env.MISTRAL_API_KEY;
  const OR_KEY         = process.env.OPENROUTER_API_KEY || process.env.OR_API_KEY;

  // Cascata declarativa: cada entrada só entra se tiver a env var definida.
  const attempts = [
    GEMINI_KEY   && { id: 'gemini-vision',     label: 'Gemini',     fn: () => callGemini(GEMINI_KEY, imageBase64, mimeType, prompt) },
    MISTRAL_KEY  && { id: 'mistral-vision',    label: 'Mistral',    fn: () => callMistral(MISTRAL_KEY, imageBase64, mimeType, prompt) },
    OR_KEY       && { id: 'openrouter-vision', label: 'OpenRouter', fn: () => callOpenRouter(OR_KEY, imageBase64, mimeType, prompt) },
  ].filter(Boolean);

  if (attempts.length === 0) {
    throw new Error('Nenhuma API key de IA de visão configurada (GEMINI_API_KEY, MISTRAL_API_KEY ou OPENROUTER_API_KEY)');
  }
  // NOVO (Set/2026): se só houver 1 provider activo, uma falha/timeout
  // dele é sempre falha total — sem isto, essa situação só aparecia nos
  // logs como "Gemini timeout" seguido do 500 final, sem nada a indicar
  // que não havia mais nenhum provider para tentar a seguir (foi
  // exactamente o que aconteceu em produção em 07/Set — ver
  // requestId whwd9... nos logs). Este aviso torna isso óbvio de imediato.
  if (attempts.length === 1) {
    console.warn(`[${logPrefix}] Só 1 provider de visão configurado (${attempts[0].label}) — sem fallback se este falhar/atrasar. Configure MISTRAL_API_KEY/OPENROUTER_API_KEY para redundância.`);
  }

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt.fn();
    } catch (err) {
      console.warn(`[${logPrefix}] ${attempt.label} falhou, a tentar o próximo provider:`, err.message);
      lastErr = err;
      // NOVO (Set/2026, 4ª ronda): este provider acabou de esgotar TODOS
      // os seus modelos de visão numa única tentativa (mesmo mecanismo já
      // usado pelo motor de texto — ver aiRace.js). Fire-and-forget: nunca
      // atrasa nem faz falhar a resposta ao utilizador. Só dispara um
      // alerta por Telegram/WhatsApp ao fim de 5 esgotamentos SEGUIDOS
      // (protecção contra spam, ver recordProviderExhaustion em
      // modelHealth.js) — é isto que substitui teres de notar um problema
      // de configuração só porque um cliente se queixou ou foste ver os
      // logs da Vercel por acaso.
      recordProviderExhaustion(attempt.id)
        .then(shouldAlert => {
          if (shouldAlert) {
            const meta = VISION_PROVIDER_META[attempt.id] || { name: attempt.label };
            notifyProviderIssue(meta, err.message).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }
  throw lastErr || new Error('Todos os providers de visão falharam');
}

/**
 * parseJSON — tenta extrair JSON da resposta bruta da IA.
 * Remove blocos markdown, tenta parse directo e fallback via regex.
 *
 * @param {string} text
 * @returns {object}
 * @throws {Error} se não conseguir fazer parse
 */
function parseJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim()); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  throw new Error('JSON inválido na resposta da IA');
}

module.exports = { analyzeImage, parseJSON };
