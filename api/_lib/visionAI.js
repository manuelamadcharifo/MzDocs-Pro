// api/_lib/visionAI.js — v2.0 (Set/2026 — cascata alargada de providers)
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
//   1. Gemini        — GEMINI_API_KEY        (já usado no motor de texto)
//   2. Groq           — GROQ_API_KEY          (modelos Llama 4 com visão)
//   3. Mistral        — MISTRAL_API_KEY       (Pixtral, modelo com visão)
//   4. GitHub Models  — GITHUB_MODELS_TOKEN   (gpt-4o-mini com visão)
//   5. OpenRouter     — OPENROUTER_API_KEY ou OR_API_KEY (vários :free)
//
// CORRIGIDO (Set/2026 — bug "template extraído não corresponde à imagem"):
// só havia 2 providers (Gemini + OpenRouter). Quando Gemini falhava (ou
// devolvia JSON cortado — ver nota nos tokens abaixo) e o OpenRouter também
// falhava/esgotava quota, TemplatePicker.js caía silenciosamente num
// template genérico aleatório, sem qualquer relação com a imagem do
// utilizador. Esta versão reaproveita as env vars de IA JÁ CONFIGURADAS na
// Vercel para o motor de geração de texto (aiProviderRegistry.js) — não é
// preciso criar nenhuma conta nova — para dar 5 tentativas independentes
// antes de desistir, reduzindo muito a frequência desse fallback.
//
// Todos os providers "kind: openai" (Groq, Mistral, GitHub Models,
// OpenRouter) falam o mesmo formato de chat/completions com
// `image_url: { url: "data:<mime>;base64,<...>" }` — por isso partilham o
// mesmo helper genérico `callOpenAIVision()` em vez de código duplicado.
//
// Uso:
//   const { analyzeImage } = require('./_lib/visionAI');
//   const text = await analyzeImage(imageBase64, prompt, { mimeType: 'image/jpeg' });
// ──────────────────────────────────────────────────────────────────────────

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');

// ── Gemini ─────────────────────────────────────────────────────────────────
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

async function callGemini(apiKey, imageBase64, mimeType, prompt) {
  let lastErr;
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt },
          ]}],
          // CORRIGIDO: 4096 tokens era insuficiente para o HTML+CSS completo
          // que o prompt pede (ex: CV com sidebar tem ~30 classes CSS) — a
          // resposta era cortada a meio, o JSON ficava inválido, parseJSON()
          // rebentava, e o chamador (TemplatePicker._handleUpload) caía no
          // fallback de template genérico/aleatório sem avisar o utilizador.
          // 8192 dá margem confortável para o HTML+CSS mais extenso previsto
          // nos prompts de extracção (CV e genérico). responseMimeType força
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
      console.warn(`[visionAI] Gemini ${model}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini: todos os modelos falharam');
}

// ── Helper genérico para providers "OpenAI-compatible" com visão ───────────
// Groq, Mistral, GitHub Models e OpenRouter usam todos o mesmo formato de
// chat/completions com content[] misto (image_url + text). Um único helper
// evita repetir a mesma lógica de retry/erro 4 vezes.
async function callOpenAIVision({ label, url, headers, models, imageBase64, mimeType, prompt, maxTokens }) {
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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
      console.warn(`[visionAI] ${label} ${model}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error(`${label}: todos os modelos falharam`);
}

// ── Groq (Llama 4 com visão — mesma GROQ_API_KEY já usada no motor de texto,
//    mas com modelos DIFERENTES: os modelos de texto de aiProviderRegistry.js
//    não têm visão; llama-4-scout/maverick sim) ──────────────────────────────
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
];
function callGroq(apiKey, imageBase64, mimeType, prompt) {
  return callOpenAIVision({
    label:   'Groq',
    url:     'https://api.groq.com/openai/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}` },
    models:  GROQ_VISION_MODELS,
    imageBase64, mimeType, prompt,
    maxTokens: 8192,
  });
}

// ── Mistral (Pixtral — modelo de visão da Mistral; mesma MISTRAL_API_KEY) ──
const MISTRAL_VISION_MODELS = ['pixtral-12b-2409', 'pixtral-large-latest'];
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
// maxTokensCap: 4096 para este provider) — respeitado aqui also.
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

// ── OpenRouter (vários modelos :free em cascata — último recurso, o mais
//    diverso em quantidade de modelos disponíveis) ─────────────────────────
const OR_VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5-8b',
  'meta-llama/llama-4-scout:free',
  'microsoft/phi-4-multimodal-instruct:free',
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
 * (Gemini → Groq → Mistral → GitHub Models → OpenRouter) até um responder
 * com sucesso, e devolve o texto bruto da resposta (normalmente JSON,
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

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const GROQ_KEY   = process.env.GROQ_API_KEY;
  const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
  const GITHUB_TOKEN = process.env.GITHUB_MODELS_TOKEN;
  const OR_KEY     = process.env.OPENROUTER_API_KEY || process.env.OR_API_KEY;

  // Cascata declarativa: cada entrada só entra se tiver a env var definida.
  // Mantém a ordem Gemini-primeiro (era o comportamento anterior, e é o
  // provider historicamente mais fiável para este prompt), mas já não pára
  // em apenas mais 1 fallback — agora são até 5 tentativas independentes.
  const attempts = [
    GEMINI_KEY   && { label: 'Gemini',        fn: () => callGemini(GEMINI_KEY, imageBase64, mimeType, prompt) },
    GROQ_KEY     && { label: 'Groq',          fn: () => callGroq(GROQ_KEY, imageBase64, mimeType, prompt) },
    MISTRAL_KEY  && { label: 'Mistral',       fn: () => callMistral(MISTRAL_KEY, imageBase64, mimeType, prompt) },
    GITHUB_TOKEN && { label: 'GitHub Models', fn: () => callGithub(GITHUB_TOKEN, imageBase64, mimeType, prompt) },
    OR_KEY       && { label: 'OpenRouter',    fn: () => callOpenRouter(OR_KEY, imageBase64, mimeType, prompt) },
  ].filter(Boolean);

  if (attempts.length === 0) {
    throw new Error('Nenhuma API key de IA de visão configurada (GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, GITHUB_MODELS_TOKEN ou OPENROUTER_API_KEY)');
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
