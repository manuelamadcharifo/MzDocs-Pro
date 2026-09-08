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
//   3. GitHub Models  — GITHUB_MODELS_TOKEN (gpt-4o-mini com visão)
//   4. OpenRouter     — OPENROUTER_API_KEY ou OR_API_KEY (modelos :free)
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
// Todos os providers "kind: openai" (Mistral, GitHub Models, OpenRouter)
// falam o mesmo formato de chat/completions com
// `image_url: { url: "data:<mime>;base64,<...>" }` — por isso partilham o
// mesmo helper genérico `callOpenAIVision()` em vez de código duplicado.
//
// Uso:
//   const { analyzeImage } = require('./_lib/visionAI');
//   const text = await analyzeImage(imageBase64, prompt, { mimeType: 'image/jpeg' });
// ──────────────────────────────────────────────────────────────────────────

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');
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
  for (const model of GEMINI_VISION_MODELS) {
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
        if (res.status === 429 || res.status === 503) { continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) throw new Error(`Gemini resposta vazia (${data.candidates?.[0]?.finishReason})`);
      console.log(`[visionAI] Gemini OK ${model} (${text.length} chars)`);
      return text;
    } catch (err) {
      const msg = err.name === 'AbortError' ? `Gemini timeout (${PER_ATTEMPT_TIMEOUT_MS}ms, ${model})` : err.message;
      console.warn(`[visionAI] Gemini ${model}:`, msg);
      lastErr = new Error(msg);
    }
  }
  throw lastErr || new Error('Gemini: todos os modelos falharam');
}

// ── Helper genérico para providers "OpenAI-compatible" com visão ───────────
async function callOpenAIVision({ label, url, headers, models, imageBase64, mimeType, prompt, maxTokens }) {
  let lastErr;
  for (const model of models) {
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
        if (res.status === 429) { continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error(`${label} resposta vazia`);
      console.log(`[visionAI] ${label} OK ${model} (${text.length} chars)`);
      return text;
    } catch (err) {
      const msg = err.name === 'AbortError' ? `${label} timeout (${PER_ATTEMPT_TIMEOUT_MS}ms, ${model})` : err.message;
      console.warn(`[visionAI] ${label} ${model}:`, msg);
      lastErr = new Error(msg);
    } finally {
      clearTimeout(t);
    }
  }
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
    label:   'Mistral',
    url:     'https://api.mistral.ai/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}` },
    models:  MISTRAL_VISION_MODELS,
    imageBase64, mimeType, prompt,
    maxTokens: 8192,
  });
}

// ── GitHub Models (gpt-4o-mini tem visão; mesma GITHUB_MODELS_TOKEN) ───────
// Tier grátis limita a saída a 4K tokens (ver aiProviderRegistry.js,
// maxTokensCap: 4096 para este provider) — respeitado aqui também.
const GITHUB_VISION_MODELS = ['openai/gpt-4o-mini'];
function callGithub(token, imageBase64, mimeType, prompt) {
  return callOpenAIVision({
    label:   'GitHub Models',
    url:     'https://models.github.ai/inference/chat/completions',
    headers: { Authorization: `Bearer ${token}` },
    models:  GITHUB_VISION_MODELS,
    imageBase64, mimeType, prompt,
    maxTokens: 4096,
  });
}

// ── OpenRouter — CORRIGIDO: lista anterior (gemini-2.0-flash-exp:free,
//    llama-4-scout:free, phi-4-multimodal:free) já não consta do catálogo
//    :free actual da OpenRouter. Modelos abaixo confirmados com "Vision" nas
//    capacidades e activos no tier :free em Set/2026. ───────────────────────
const OR_VISION_MODELS = [
  'google/gemma-4-31b-it:free',
  'minimax/minimax-m3:free',
];
function callOpenRouter(apiKey, imageBase64, mimeType, prompt) {
  return callOpenAIVision({
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
 * (Gemini → Mistral → GitHub Models → OpenRouter) até um responder com
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
  const GITHUB_TOKEN  = process.env.GITHUB_MODELS_TOKEN;
  const OR_KEY        = process.env.OPENROUTER_API_KEY || process.env.OR_API_KEY;

  // Cascata declarativa: cada entrada só entra se tiver a env var definida.
  const attempts = [
    GEMINI_KEY   && { label: 'Gemini',        fn: () => callGemini(GEMINI_KEY, imageBase64, mimeType, prompt) },
    MISTRAL_KEY  && { label: 'Mistral',       fn: () => callMistral(MISTRAL_KEY, imageBase64, mimeType, prompt) },
    GITHUB_TOKEN && { label: 'GitHub Models', fn: () => callGithub(GITHUB_TOKEN, imageBase64, mimeType, prompt) },
    OR_KEY       && { label: 'OpenRouter',    fn: () => callOpenRouter(OR_KEY, imageBase64, mimeType, prompt) },
  ].filter(Boolean);

  if (attempts.length === 0) {
    throw new Error('Nenhuma API key de IA de visão configurada (GEMINI_API_KEY, MISTRAL_API_KEY, GITHUB_MODELS_TOKEN ou OPENROUTER_API_KEY)');
  }
  // NOVO (Set/2026): se só houver 1 provider activo, uma falha/timeout
  // dele é sempre falha total — sem isto, essa situação só aparecia nos
  // logs como "Gemini timeout" seguido do 500 final, sem nada a indicar
  // que não havia mais nenhum provider para tentar a seguir (foi
  // exactamente o que aconteceu em produção em 07/Set — ver
  // requestId whwd9... nos logs). Este aviso torna isso óbvio de imediato.
  if (attempts.length === 1) {
    console.warn(`[${logPrefix}] Só 1 provider de visão configurado (${attempts[0].label}) — sem fallback se este falhar/atrasar. Configure MISTRAL_API_KEY/GITHUB_MODELS_TOKEN/OPENROUTER_API_KEY para redundância.`);
  }

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt.fn();
    } catch (err) {
      console.warn(`[${logPrefix}] ${attempt.label} falhou, a tentar o próximo provider:`, err.message);
      lastErr = err;
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
