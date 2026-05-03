// api/generate-document.js
// 3 providers em corrida paralela: Groq + Gemini + OpenRouter
// O primeiro a responder com sucesso cancela os outros imediatamente

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

// ─── GROQ ──────────────────────────────────────────────────────────────────
// API compatível com OpenAI. Sub-200ms TTFT. 1000 req/dia gratuitos.
// Signup: console.groq.com (sem cartão de crédito)
const GROQ_BASE   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',   // melhor qualidade, 30 RPM, 1000 RPD
    'llama-3.1-8b-instant',      // mais rápido, 30 RPM, 14400 RPD
    'gemma2-9b-it',              // alternativa Google open-source
];

// ─── GEMINI ────────────────────────────────────────────────────────────────
// API directa Google. 1500 req/dia gratuitos. 8192 tokens output.
// Signup: aistudio.google.com (sem cartão de crédito)
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    'gemini-2.5-flash-lite-preview-06-17',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
];

// ─── OPENROUTER ────────────────────────────────────────────────────────────
// Agrega múltiplos providers. 50-1000 req/dia gratuitos.
// Signup: openrouter.ai (sem cartão de crédito)
const OR_BASE   = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODELS = [
    'openrouter/auto',
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'mistralai/mistral-7b-instruct:free',
];

// ─── RATE LIMIT INTERNO ────────────────────────────────────────────────────
const rateMap = new Map();
function checkRateLimit(ip) {
    const now   = Date.now();
    const entry = rateMap.get(ip) || { count: 0, reset: now + 60_000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
    entry.count++;
    rateMap.set(ip, entry);
    return entry.count <= 10;
}

const SITE_URL = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', SITE_URL);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Muitos pedidos. Aguarde 1 minuto.', code: 'RATE_LIMIT' });
    }

    const GROQ_KEY   = process.env.GROQ_API_KEY;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const OR_KEY     = process.env.OPENROUTER_API_KEY;

    if (!GROQ_KEY && !GEMINI_KEY && !OR_KEY) {
        return res.status(503).json({ error: 'Nenhuma API key configurada.' });
    }

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const { serviceType, prompt, userId, userCredits, _reedit, _currentContent, _instruction } = body;

    let finalPrompt = prompt;
    if (_reedit && _currentContent && _instruction) {
        finalPrompt = `Você é um editor de documentos profissional.\n\nDOCUMENTO ATUAL:\n"""\n${_currentContent}\n"""\n\nINSTRUÇÃO: "${_instruction}"\n\nEdite o documento aplicando a instrução. Mantenha o formato Markdown. Devolva apenas o documento editado, sem comentários.`;
    }

    if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });
    if (typeof userCredits === 'number' && userCredits < 1) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', code: 'INSUFFICIENT_CREDITS' });
    }

    try {
        const result = await raceAllProviders(finalPrompt, { GROQ_KEY, GEMINI_KEY, OR_KEY });

        console.log(JSON.stringify({
            event: 'doc_generated', serviceType,
            provider: result.provider,
            model: result.model,
            ms: result.ms,
            userId: userId ? userId.slice(0, 8) + '***' : 'anon',
            ts: new Date().toISOString(),
        }));

        return res.status(200).json({
            document: result.content,
            model: `${result.provider} · ${result.model}`,
            creditsRemaining: typeof userCredits === 'number' ? Math.max(0, userCredits - 1) : null,
            usage: result.usage,
        });

    } catch (err) {
        console.error('[generate-document] Todos os providers falharam:', err?.message);
        return res.status(503).json({
            error: 'Serviço de IA temporariamente indisponível. Tente novamente em instantes.',
            code: 'SERVICE_UNAVAILABLE',
        });
    }
}

// ─── CORRIDA PARALELA ──────────────────────────────────────────────────────
// Lança todos os providers disponíveis ao mesmo tempo.
// Promise.any() retorna o primeiro com sucesso e os outros são cancelados.
async function raceAllProviders(prompt, keys) {
    const { GROQ_KEY, GEMINI_KEY, OR_KEY } = keys;

    // Um AbortController partilhado — quando um ganha, cancela todos os outros
    const winner = new AbortController();

    const makeRacer = async (providerFn) => {
        try {
            const t0     = Date.now();
            const result = await providerFn(prompt, winner.signal);
            winner.abort(); // Sou o vencedor — cancelo os restantes
            return { ...result, ms: Date.now() - t0 };
        } catch (err) {
            if (err.name === 'AbortError') {
                // Fui cancelado porque outro ganhou — rejeita para Promise.any ignorar
                throw new Error('cancelled');
            }
            throw err;
        }
    };

    const racers = [];
    if (GROQ_KEY)   racers.push(makeRacer((p, s) => tryGroq(p, GROQ_KEY, s)));
    if (GEMINI_KEY) racers.push(makeRacer((p, s) => tryGemini(p, GEMINI_KEY, s)));
    if (OR_KEY)     racers.push(makeRacer((p, s) => tryOpenRouter(p, OR_KEY, s)));

    // Promise.any: resolve com o primeiro sucesso, rejeita só se TODOS falharem
    return Promise.any(racers);
}

// ─── GROQ ─────────────────────────────────────────────────────────────────
async function tryGroq(prompt, apiKey, signal) {
    let lastErr;
    for (const model of GROQ_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(GROQ_BASE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                signal,
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user',   content: prompt },
                    ],
                    max_tokens: 8192,
                    temperature: 0.7,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                const e = new Error(d?.error?.message || `Groq HTTP ${res.status}`);
                e.status = res.status;
                if (res.status === 429) await sleep(1000);
                throw e;
            }
            const data    = await res.json();
            const content = data.choices?.[0]?.message?.content?.trim() || '';
            if (!content) throw new Error('Groq resposta vazia');
            return { content, provider: 'Groq', model, usage: data.usage };
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`[Groq] ${model} falhou:`, err.message);
            lastErr = err;
        }
    }
    throw lastErr || new Error('Groq: todos os modelos falharam');
}

// ─── GEMINI ───────────────────────────────────────────────────────────────
async function tryGemini(prompt, apiKey, signal) {
    let lastErr;
    for (const modelId of GEMINI_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(`${GEMINI_BASE}/${modelId}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 8192, temperature: 0.7, topP: 0.9 },
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
                const e = new Error(d?.error?.message || `Gemini HTTP ${res.status}`);
                e.status = res.status;
                if (res.status === 429) await sleep(1500);
                throw e;
            }
            const data    = await res.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (!content) throw new Error(`Gemini vazio (${data.candidates?.[0]?.finishReason})`);
            return {
                content,
                provider: 'Gemini',
                model: modelId,
                usage: {
                    prompt_tokens:     data.usageMetadata?.promptTokenCount     || 0,
                    completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
                },
            };
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`[Gemini] ${modelId} falhou:`, err.message);
            lastErr = err;
        }
    }
    throw lastErr || new Error('Gemini: todos os modelos falharam');
}

// ─── OPENROUTER ───────────────────────────────────────────────────────────
async function tryOpenRouter(prompt, apiKey, signal) {
    let lastErr;
    for (const model of OR_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(OR_BASE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': SITE_URL,
                    'X-Title': 'MzDocs Pro',
                },
                signal,
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user',   content: prompt },
                    ],
                    max_tokens: 4096,
                    temperature: 0.7,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                const e = new Error(d?.error?.message || `OR HTTP ${res.status}`);
                e.status = res.status;
                if (res.status === 429) await sleep(1000);
                throw e;
            }
            const data    = await res.json();
            const content = data.choices?.[0]?.message?.content?.trim() || '';
            if (!content) throw new Error('OpenRouter resposta vazia');
            return { content, provider: 'OpenRouter', model: data.model || model, usage: data.usage };
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`[OpenRouter] ${model} falhou:`, err.message);
            lastErr = err;
        }
    }
    throw lastErr || new Error('OpenRouter: todos os modelos falharam');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export const config = { maxDuration: 60 };