// api/_lib/visionAI.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// Helper reutilizável de IA visão (imagem → texto/JSON).
// Extraído de api/extract-template.js para ser partilhado com
// api/misc.js (verify-receipt) e qualquer futura function que
// precise de analisar imagens.
//
// NÃO é uma Serverless Function — é um módulo Node interno (_lib/).
// Não conta para o limite de 12 functions do Vercel Hobby.
//
// Providers suportados (em cascata):
//   1. Gemini (primário) — usa GEMINI_API_KEY
//   2. OpenRouter (fallback) — usa OPENROUTER_API_KEY ou OR_API_KEY
//
// Uso:
//   const { analyzeImage } = require('./_lib/visionAI');
//   const text = await analyzeImage(imageBase64, prompt, { mimeType: 'image/jpeg' });
// ──────────────────────────────────────────────────────────────────────────

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const OR_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OR_VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5-8b',
  'meta-llama/llama-4-scout:free',
  'microsoft/phi-4-multimodal-instruct:free',
];

// ── Gemini ─────────────────────────────────────────────────────────────────
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
          generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
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

// ── OpenRouter ─────────────────────────────────────────────────────────────
async function callOpenRouter(apiKey, imageBase64, mimeType, prompt) {
  let lastErr;
  for (const model of OR_VISION_MODELS) {
    try {
      const res = await fetch(OR_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': SITE_URL,
          'X-Title': 'MzDocs Pro',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          temperature: 0.1,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ]}],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastErr = new Error(d?.error?.message || `OR HTTP ${res.status} (${model})`);
        if (res.status === 429) { continue; }
        throw lastErr;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('OR resposta vazia');
      console.log(`[visionAI] OpenRouter OK ${model} (${text.length} chars)`);
      return text;
    } catch (err) {
      console.warn(`[visionAI] OR ${model}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('OpenRouter: todos os modelos falharam');
}

/**
 * analyzeImage — chama Gemini (ou OpenRouter como fallback) com a imagem e
 * devolve a resposta em texto puro (normalmente JSON, dependendo do prompt).
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
  const OR_KEY     = process.env.OPENROUTER_API_KEY || process.env.OR_API_KEY;

  if (!GEMINI_KEY && !OR_KEY) {
    throw new Error('Nenhuma API key de IA configurada (GEMINI_API_KEY ou OPENROUTER_API_KEY)');
  }

  // Tentar Gemini primeiro
  if (GEMINI_KEY) {
    try {
      return await callGemini(GEMINI_KEY, imageBase64, mimeType, prompt);
    } catch (geminiErr) {
      console.warn(`[${logPrefix}] Gemini falhou, a tentar OpenRouter:`, geminiErr.message);
      if (OR_KEY) {
        return await callOpenRouter(OR_KEY, imageBase64, mimeType, prompt);
      }
      throw geminiErr;
    }
  }

  return await callOpenRouter(OR_KEY, imageBase64, mimeType, prompt);
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
