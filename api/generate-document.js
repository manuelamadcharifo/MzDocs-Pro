// api/generate-document.js
// Motor de IA com 5 providers em corrida paralela + suporte a geração em cadeia
// Providers: Groq + Gemini + OpenRouter + Cerebras + NVIDIA NIM

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

// ─── GROQ ──────────────────────────────────────────────────────────────────
const GROQ_BASE   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
];

// ─── GEMINI ────────────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
];

// ─── OPENROUTER ────────────────────────────────────────────────────────────
const OR_BASE   = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODELS = [
    'google/gemini-2.0-flash-exp:free',
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'mistralai/mistral-7b-instruct:free',
];

// ─── CEREBRAS ──────────────────────────────────────────────────────────────
// 1.5M tokens/dia grátis — ultra-rápido (2400 t/s). Signup: cerebras.ai
const CEREBRAS_BASE   = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODELS = [
    'qwen-3-32b',          // melhor qualidade
    'llama3.1-70b',        // muito rápido
    'llama3.1-8b',         // fallback leve
];

// ─── NVIDIA NIM ────────────────────────────────────────────────────────────
// 40 req/min gratuitas. Signup: build.nvidia.com
const NVIDIA_BASE   = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODELS = [
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    'meta/llama-3.3-70b-instruct',
    'mistralai/mistral-large',
];

// ─── RATE LIMIT INTERNO ────────────────────────────────────────────────────
const rateMap = new Map();
function checkRateLimit(req) {
    const auth = req.headers['authorization'];
    const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const key  = auth ? `auth:${auth.slice(-16)}` : `ip:${ip}`;

    const now   = Date.now();
    const entry = rateMap.get(key) || { count: 0, reset: now + 60_000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
    entry.count++;
    rateMap.set(key, entry);

    const limit = auth ? 30 : 8; // mais espaço para geração em cadeia
    return entry.count <= limit;
}

const SITE_URL = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', SITE_URL);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

    if (!checkRateLimit(req)) {
        return res.status(429).json({ error: 'Muitos pedidos. Aguarde 1 minuto.', code: 'RATE_LIMIT' });
    }

    const GROQ_KEY     = process.env.GROQ_API_KEY;
    const GEMINI_KEY   = process.env.GEMINI_API_KEY;
    const OR_KEY       = process.env.OPENROUTER_API_KEY;
    const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
    const NVIDIA_KEY   = process.env.NVIDIA_API_KEY;

    if (!GROQ_KEY && !GEMINI_KEY && !OR_KEY && !CEREBRAS_KEY && !NVIDIA_KEY) {
        return res.status(503).json({ error: 'Nenhuma API key configurada.' });
    }

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const {
        serviceType, prompt, userId, userCredits,
        _reedit, _currentContent, _instruction,
        _preferProvider, // hint para geração em cadeia
        _planMode,       // modo planeamento — retorna JSON estruturado
        _sectionMode,    // modo secção — max tokens altos
    } = body;

    let finalPrompt = prompt;
    if (_reedit && _currentContent && _instruction) {
        finalPrompt = `Você é um editor de documentos profissional.\n\nDOCUMENTO ATUAL:\n"""\n${_currentContent}\n"""\n\nINSTRUÇÃO: "${_instruction}"\n\nEdite o documento aplicando a instrução. Mantenha o formato Markdown. Devolva apenas o documento editado, sem comentários.`;
    }

    if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });
    if (typeof userCredits === 'number' && userCredits < 1 && !_planMode && !_sectionMode) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', code: 'INSUFFICIENT_CREDITS' });
    }

    // maxTokens: mais alto para secções e planos de negócios
    const maxTokens = _sectionMode ? 8192 : (_planMode ? 2048 : 8192);

    try {
        const result = await raceAllProviders(finalPrompt, {
            GROQ_KEY, GEMINI_KEY, OR_KEY, CEREBRAS_KEY, NVIDIA_KEY,
        }, _preferProvider, maxTokens);

        // Log
        const isModeCall = _planMode || _sectionMode;
        if (!isModeCall) {
            console.log(JSON.stringify({
                event: 'doc_generated', serviceType,
                provider: result.provider,
                model: result.model,
                ms: result.ms,
                userId: userId ? userId.slice(0, 8) + '***' : 'anon',
                ts: new Date().toISOString(),
            }));
        }

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

// ─── CORRIDA PARALELA COM PROVIDER PREFERENCE ─────────────────────────────
async function raceAllProviders(prompt, keys, preferProvider, maxTokens = 8192) {
    const { GROQ_KEY, GEMINI_KEY, OR_KEY, CEREBRAS_KEY, NVIDIA_KEY } = keys;
    const winner = new AbortController();

    const makeRacer = async (providerFn) => {
        try {
            const t0     = Date.now();
            const result = await providerFn(prompt, winner.signal, maxTokens);
            winner.abort();
            return { ...result, ms: Date.now() - t0 };
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('cancelled');
            throw err;
        }
    };

    // Se há preferência de provider, colocá-lo primeiro mas ainda em corrida
    const providerMap = {
        groq:       GROQ_KEY     ? (p, s) => tryGroq(p, GROQ_KEY, s, maxTokens)         : null,
        gemini:     GEMINI_KEY   ? (p, s) => tryGemini(p, GEMINI_KEY, s, maxTokens)     : null,
        openrouter: OR_KEY       ? (p, s) => tryOpenRouter(p, OR_KEY, s, maxTokens)     : null,
        cerebras:   CEREBRAS_KEY ? (p, s) => tryCerebras(p, CEREBRAS_KEY, s, maxTokens) : null,
        nvidia:     NVIDIA_KEY   ? (p, s) => tryNvidia(p, NVIDIA_KEY, s, maxTokens)     : null,
    };

    // Ordena providers: preferred primeiro, depois os restantes
    const order = preferProvider && providerMap[preferProvider]
        ? [preferProvider, ...Object.keys(providerMap).filter(k => k !== preferProvider)]
        : Object.keys(providerMap);

    const racers = order
        .filter(k => providerMap[k])
        .map(k => makeRacer(providerMap[k]));

    if (racers.length === 0) throw new Error('Nenhum provider disponível');
    return Promise.any(racers);
}

// ─── GROQ ─────────────────────────────────────────────────────────────────
async function tryGroq(prompt, apiKey, signal, maxTokens = 8192) {
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
                    max_tokens: Math.min(maxTokens, 8192), // Groq max
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
async function tryGemini(prompt, apiKey, signal, maxTokens = 8192) {
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
                    generationConfig: {
                        maxOutputTokens: Math.min(maxTokens, 65536), // Gemini 2.5 Flash suporta muito mais
                        temperature: 0.7,
                        topP: 0.9,
                    },
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
async function tryOpenRouter(prompt, apiKey, signal, maxTokens = 8192) {
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
                    max_tokens: Math.min(maxTokens, 16384),
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

// ─── CEREBRAS ─────────────────────────────────────────────────────────────
async function tryCerebras(prompt, apiKey, signal, maxTokens = 8192) {
    let lastErr;
    for (const model of CEREBRAS_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(CEREBRAS_BASE, {
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
                    max_tokens: Math.min(maxTokens, 16000),
                    temperature: 0.7,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                const e = new Error(d?.error?.message || `Cerebras HTTP ${res.status}`);
                e.status = res.status;
                if (res.status === 429) await sleep(800);
                throw e;
            }
            const data    = await res.json();
            const content = data.choices?.[0]?.message?.content?.trim() || '';
            if (!content) throw new Error('Cerebras resposta vazia');
            return { content, provider: 'Cerebras', model, usage: data.usage };
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`[Cerebras] ${model} falhou:`, err.message);
            lastErr = err;
        }
    }
    throw lastErr || new Error('Cerebras: todos os modelos falharam');
}

// ─── NVIDIA NIM ───────────────────────────────────────────────────────────
async function tryNvidia(prompt, apiKey, signal, maxTokens = 8192) {
    let lastErr;
    for (const model of NVIDIA_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(NVIDIA_BASE, {
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
                    max_tokens: Math.min(maxTokens, 32768),
                    temperature: 0.7,
                    stream: false,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                const e = new Error(d?.error?.message || `NVIDIA HTTP ${res.status}`);
                e.status = res.status;
                if (res.status === 429) await sleep(1200);
                throw e;
            }
            const data    = await res.json();
            const content = data.choices?.[0]?.message?.content?.trim() || '';
            if (!content) throw new Error('NVIDIA resposta vazia');
            return { content, provider: 'NVIDIA NIM', model, usage: data.usage };
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`[NVIDIA] ${model} falhou:`, err.message);
            lastErr = err;
        }
    }
    throw lastErr || new Error('NVIDIA: todos os modelos falharam');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export const config = { maxDuration: 120 }; // Vercel Pro: 120s para geração em cadeia
