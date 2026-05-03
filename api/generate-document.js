// api/generate-document.js — Proxy OpenRouter com corridas paralelas

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

// Modelos confirmados activos em Maio 2026 (openrouter.ai/collections/free-models)
// Agrupados em waves: primeiro tenta Wave 1 em paralelo, se todos falharem tenta Wave 2
const WAVE1 = [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
];
const WAVE2 = [
    'google/gemma-3-12b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
];

// Rate limit simples em memória (por IP, 10 req/min para não esgotar quotas)
const rateMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateMap.get(ip) || { count: 0, reset: now + 60_000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
    entry.count++;
    rateMap.set(ip, entry);
    return entry.count <= 10;
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

    // Tenta uma wave de modelos em paralelo — retorna o primeiro que responder com sucesso
    async function tryWave(models) {
        return Promise.any(
            models.map(model =>
                callOpenRouter(finalPrompt, model, OPENROUTER_KEY)
                    .then(result => ({ ...result, model }))
                    .catch(err => {
                        console.warn(`[generate-document] ${model} falhou:`, err.status, err.message);
                        throw err; // Promise.any precisa de rejeição para tentar o próximo
                    })
            )
        );
    }

    try {
        // Wave 1: 3 modelos em paralelo
        let result;
        try {
            result = await tryWave(WAVE1);
        } catch {
            // Todos da Wave 1 falharam — tenta Wave 2
            console.warn('[generate-document] Wave 1 falhou, a tentar Wave 2…');
            result = await tryWave(WAVE2);
        }

        console.log(JSON.stringify({
            event: 'doc_generated', serviceType,
            model: result.model,
            userId: userId ? userId.slice(0, 8) + '***' : 'anon',
            ts: new Date().toISOString()
        }));

        return res.status(200).json({
            document: result.content,
            model: result.model,
            creditsRemaining: typeof userCredits === 'number' ? Math.max(0, userCredits - 1) : null,
            usage: result.usage
        });

    } catch (err) {
        // Ambas as waves falharam
        console.error('[generate-document] Todas as waves falharam:', err);
        return res.status(503).json({
            error: 'Serviço de IA temporariamente indisponível. Tente novamente em 30 segundos.',
            code: 'SERVICE_UNAVAILABLE',
        });
    }
}

async function callOpenRouter(prompt, model, apiKey) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://mz-docs-pro.vercel.app',
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
        signal: AbortSignal.timeout(50_000), // 50s timeout por chamada (dentro do limite 60s da Vercel)
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const e = new Error(data?.error?.message || `OpenRouter HTTP ${res.status}`);
        e.status = res.status;
        throw e;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) throw Object.assign(new Error('Resposta vazia do modelo'), { status: 503 });
    return { content, usage: data.usage };
}

export const config = { maxDuration: 60 };