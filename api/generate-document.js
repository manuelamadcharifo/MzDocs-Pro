// api/generate-document.js — Proxy seguro para OpenRouter + rate limit simples

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

const MODELS = [
    'deepseek/deepseek-chat-v3-5:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-3-12b-it:free',
    'qwen/qwen3-8b:free',
];

// Rate limit simples em memória (por IP, 20 req/min)
const rateMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const window = 60_000;
    const max = 20;
    const entry = rateMap.get(ip) || { count: 0, reset: now + window };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + window; }
    entry.count++;
    rateMap.set(ip, entry);
    return entry.count <= max;
}

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Limite de pedidos atingido. Aguarde 1 minuto.', code: 'RATE_LIMIT' });
    }

    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) return res.status(503).json({ error: 'Serviço indisponível. Configure OPENROUTER_API_KEY.' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const { serviceType, prompt, userId, userCredits, _reedit, _currentContent, _instruction } = body;

    let finalPrompt = prompt;
    if (_reedit === true && _currentContent && _instruction) {
        finalPrompt = `Você é um editor de documentos profissional.\n\nDOCUMENTO ATUAL:\n"""\n${_currentContent}\n"""\n\nINSTRUÇÃO: "${_instruction}"\n\nEdite o documento acima seguindo a instrução. Mantenha o formato Markdown. Responda apenas com o documento editado.`;
    }

    if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });
    if (typeof userCredits === 'number' && userCredits < 1) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', code: 'INSUFFICIENT_CREDITS' });
    }

    let lastError = null;
    for (let i = 0; i < MODELS.length; i++) {
        const model = MODELS[i];
        try {
            const result = await callOpenRouter(finalPrompt, model, OPENROUTER_KEY);
            console.log(JSON.stringify({ event: 'doc_generated', serviceType, model, userId: userId ? userId.slice(0,8)+'***' : 'anon', ts: new Date().toISOString() }));
            return res.status(200).json({
                document: result.content,
                model,
                creditsRemaining: typeof userCredits === 'number' ? Math.max(0, userCredits - 1) : null,
                usage: result.usage
            });
        } catch (err) {
            console.warn(`[generate-document] ${model} falhou:`, err.status, err.message);
            lastError = err;
            if (err.status === 429 || err.status === 503 || err.status === 502) {
                if (i < MODELS.length - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
                continue;
            }
            break;
        }
    }

    const status = lastError?.status === 429 ? 429 : 503;
    return res.status(status).json({
        error: status === 429 ? 'Limite de velocidade atingido. Tente novamente em segundos.' : 'Serviço de IA temporariamente indisponível.',
        code:  status === 429 ? 'RATE_LIMIT' : 'SERVICE_UNAVAILABLE',
    });
}

async function callOpenRouter(prompt, model, apiKey) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.VERCEL_URL || 'https://mz-docs-pro.vercel.app',
            'X-Title': 'MzDocs Pro',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: prompt },
            ],
            max_tokens: 4000,
            temperature: 0.7,
            top_p: 0.9,
        }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const e = new Error(data?.error?.message || `OpenRouter HTTP ${res.status}`);
        e.status = res.status;
        throw e;
    }
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
}

export const config = { maxDuration: 60 };