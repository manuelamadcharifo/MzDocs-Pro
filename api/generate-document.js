// api/generate-document.js — v2.1 (AMOSTRA GRÁTIS + CUSTO PROGRESSIVO)
// 5 providers em corrida paralela: Groq + Gemini + OpenRouter + Cerebras + NVIDIA NIM
// Suporte a geração em cadeia (_planMode / _sectionMode) com rate-limit generoso
//
// CORREÇÕES v2.0:
//  1. Removido @supabase/supabase-js + require('ws'). A verificação do JWT
//     passou a usar api/_lib/supabaseAdmin.js (fetch puro contra /auth/v1/user).
//  2. NOVO: reembolso automático de crédito quando TODOS os providers falham.
//     O cliente envia `cost` (créditos debitados em /api/deduct-credit); se a
//     geração falhar por completo, este endpoint chama a RPC `refund_credit`
//     para devolver o crédito ao utilizador, evitando o cenário
//     "consumiu crédito e não gerou documento".
//
// NOVO v2.1 (Amostra grátis + custo progressivo):
//  3. _previewMode: true — gera uma AMOSTRA curta e gratuita do documento
//     (sem autenticação obrigatória, sem dedução de crédito) para o
//     utilizador decidir se vale a pena gastar o crédito. Tem rate-limit
//     próprio e mais restrito (ver checkRateLimit) e um maxTokens baixo
//     fixo no servidor (PREVIEW_MAX_TOKENS) — o cliente não pode pedir
//     mais do que isto, mesmo que tente.
//  4. Endpoint reaproveitado (não foi criado nenhum novo ficheiro em /api,
//     pois o projecto já está no limite de 12 functions do Vercel Hobby).
//     O custo progressivo por tamanho gerado (ver LongDocumentEngine.js)
//     também usa apenas os endpoints já existentes (/api/generate-document
//     e /api/deduct-credit) — nenhuma function nova foi necessária.

const { getUserFromToken, rpc } = require('./_lib/supabaseAdmin');

// Tokens máximos absolutos para uma amostra grátis — aplicado no servidor,
// independentemente do que o cliente envie, para que o preview nunca possa
// ser usado como substituto gratuito da geração completa.
const PREVIEW_MAX_TOKENS = 420;

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

// ─── GROQ ──────────────────────────────────────────────────────────────────
// Modelos ordenados: Llama 4 primeiro (sem limite diário), depois os clássicos como fallback
const GROQ_BASE   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',   // principal - 100K TPD
    'llama-3.1-70b-versatile',   // fallback quando TPD esgotado
    'llama-3.1-8b-instant',      // leve, sem limite diário
    'gemma2-9b-it',              // Google Gemma
    'mixtral-8x7b-32768',        // Mixtral - grande contexto
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
    'google/gemma-3-27b-it:free',             // estável e rápido
    'google/gemma-3-12b-it:free',             // alternativa leve
    'mistralai/mistral-7b-instruct:free',     // muito estável
    'qwen/qwen3-8b:free',                     // Qwen3 grátis
    'deepseek/deepseek-r1-0528-qwen3-8b:free', // DeepSeek R1
];

// ─── CEREBRAS ──────────────────────────────────────────────────────────────
// 1.5M tokens/dia grátis, 2400 t/s. Signup: cerebras.ai
const CEREBRAS_BASE   = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODELS = [
    'llama3.3-70b',    // nome correcto na API Cerebras
    'llama3.1-70b',    // fallback
    'llama3.1-8b',     // leve
];

// ─── NVIDIA NIM ────────────────────────────────────────────────────────────
// 40 req/min grátis. Signup: build.nvidia.com
const NVIDIA_BASE   = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODELS = [
    'meta/llama-3.3-70b-instruct',          // estável
    'meta/llama-3.1-70b-instruct',          // fallback
    'mistralai/mistral-7b-instruct-v0.3',   // leve e estável
];

// ─── RATE LIMIT (Upstash Redis — persiste entre instâncias Vercel) ──────────
// Se UPSTASH_REDIS_REST_URL não estiver configurado, cai no Map local (sem persistência)
// Setup: vercel.com/integrations/upstash → cria DB grátis → cola as env vars no Vercel

async function checkRateLimit(req, isChainCall, isPreview) {
    const auth = req.headers['authorization'];
    const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const mode = isPreview ? ':p' : (isChainCall ? ':c' : '');
    const key  = 'rl:' + (auth ? `u:${auth.slice(-16)}` : `i:${ip}`) + mode;

    // Preview: limite curto e por IP/utilizador, pensado para impedir abuso
    // (gerar "amostras" em loop como substituto da geração paga), mas generoso
    // o suficiente para um utilizador real testar 2-3 serviços antes de decidir.
    const limit     = isPreview ? 4 : (isChainCall ? (auth ? 60 : 20) : (auth ? 20 : 8));
    const windowSec = isPreview ? 60 : (isChainCall ? 10 : 60);

    // ── Upstash Redis (persistente entre instâncias) ──────────────────────────
    const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
        try {
            const headers = {
                Authorization: `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            };
            // Pipeline: INCR + EXPIRE em duas chamadas (REST API Upstash)
            const incrRes  = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers });
            const incrData = await incrRes.json();
            const count    = incrData.result;

            // Definir expiração só no primeiro request da janela (count === 1)
            if (count === 1) {
                await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSec}`, { method: 'POST', headers });
            }
            return count <= limit;
        } catch (redisErr) {
            // Redis indisponível — fallback para Map local com aviso
            console.warn('[rate-limit] Redis unavailable, using local Map:', redisErr.message);
        }
    }

    // ── Fallback: Map local (sem persistência entre cold starts, mas funcional) ─
    const now   = Date.now();
    const entry = _localRateMap.get(key) || { count: 0, reset: now + windowSec * 1000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowSec * 1000; }
    entry.count++;
    _localRateMap.set(key, entry);
    return entry.count <= limit;
}

// Map local apenas como fallback quando Redis não está configurado
const _localRateMap = new Map();

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', SITE_URL);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const {
        serviceType, prompt, userId,
        _reedit, _currentContent, _instruction,
        _preferProvider,
        _planMode,    // planeamento (retorna JSON de secções)
        _sectionMode, // geração de uma secção individual
        _previewMode, // NOVO v2.1: amostra grátis, sem dedução de crédito
        // creditsRemaining enviado pelo cliente após /api/deduct-credit ter debitado com sucesso
        creditsRemaining: preDeductedCredits,
        // cost: créditos já debitados para este pedido (usado para reembolso automático em caso de falha)
        cost: deductedCost,
    } = body;

    // Chamadas de cadeia (_planMode ou _sectionMode) têm rate-limit próprio.
    // _previewMode é mutuamente exclusivo com isso — uma amostra nunca encadeia.
    const isPreview   = !!_previewMode && !_planMode && !_sectionMode;
    const isChainCall = !isPreview && !!(_planMode || _sectionMode);

    if (!await checkRateLimit(req, isChainCall, isPreview)) {
        const retryAfter = isPreview ? 60 : (isChainCall ? 10 : 60);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: isPreview
                ? 'Já gerou várias amostras grátis. Aguarde um pouco ou gere o documento completo.'
                : 'Muitos pedidos. Aguarde alguns segundos.',
            code: 'RATE_LIMIT',
            retryAfter,
        });
    }

    const GROQ_KEY     = process.env.GROQ_API_KEY;
    const GEMINI_KEY   = process.env.GEMINI_API_KEY;
    const OR_KEY       = process.env.OPENROUTER_API_KEY;
    const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
    const NVIDIA_KEY   = process.env.NVIDIA_API_KEY;

    if (!GROQ_KEY && !GEMINI_KEY && !OR_KEY && !CEREBRAS_KEY && !NVIDIA_KEY) {
        return res.status(503).json({ error: 'Nenhuma API key configurada.' });
    }

    let finalPrompt = prompt;
    if (_reedit && _currentContent && _instruction) {
        finalPrompt = `Você é um editor de documentos profissional.\n\nDOCUMENTO ATUAL:\n"""\n${_currentContent}\n"""\n\nINSTRUÇÃO: "${_instruction}"\n\nEdite o documento aplicando a instrução. Mantenha o formato Markdown. Devolva apenas o documento editado, sem comentários.`;
    }

    if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });

    // NOVO v2.1: em modo preview, instrui o modelo a escrever apenas a abertura
    // do documento (cabeçalho + primeiro parágrafo/secção) e a parar de forma
    // limpa — isto além do corte rígido de maxTokens (PREVIEW_MAX_TOKENS) que
    // já impede uma resposta longa mesmo que o modelo ignore a instrução.
    if (isPreview) {
        finalPrompt = `${finalPrompt}\n\n---\nIMPORTANTE: Esta é apenas uma AMOSTRA GRÁTIS para o utilizador avaliar a qualidade antes de gerar o documento completo. Escreva APENAS o cabeçalho/título e a abertura do documento (primeiro parágrafo ou primeira secção, no máximo). Pare num ponto natural — não tente preencher o documento todo. Não escreva "[continua]" nem comentários meta.`;
    }

    // CORRIGIDO (auditoria A-3): limite de tamanho do prompt — sem isto um
    // pedido malicioso com 100.000+ caracteres consome tokens de todos os 5
    // providers, pode causar timeout dos 60s da Vercel e ainda debitar crédito.
    const MAX_PROMPT_LENGTH = 15000;
    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({
            error: `Prompt demasiado longo (${finalPrompt.length} caracteres). Máximo: ${MAX_PROMPT_LENGTH}.`,
            code:  'PROMPT_TOO_LONG',
        });
    }

    // ── Autenticação ───────────────────────────────────────────────────────
    // A DEDUÇÃO DE CRÉDITOS é feita ANTES desta chamada pelo cliente via /api/deduct-credit.
    // Este endpoint apenas verifica o JWT (para logging) e gera o documento.
    // Chamadas de cadeia interna (_planMode / _sectionMode) não requerem token.
    // NOVO v2.1: chamadas de preview (_previewMode) também não exigem token —
    // a amostra grátis deve funcionar mesmo para visitantes não autenticados,
    // que é precisamente o público que precisa de ver qualidade antes de criar
    // conta/comprar créditos. Não há dedução de crédito neste modo.
    let verifiedUserId = userId;
    if (!isChainCall && !isPreview) {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!token) {
            return res.status(401).json({
                error: 'Autenticação obrigatória para gerar documentos.',
                code: 'AUTH_REQUIRED',
            });
        }
        try {
            const { user: jwtUser, error: authErr } = await getUserFromToken(token);
            if (authErr || !jwtUser) {
                return res.status(401).json({
                    error: 'Sessão inválida ou expirada. Inicie sessão novamente.',
                    code: 'AUTH_REQUIRED',
                });
            }
            verifiedUserId = jwtUser.id;
        } catch (e) {
            console.error('[generate-document] Erro ao verificar JWT:', e.message);
            return res.status(401).json({ error: 'Erro ao verificar sessão.' });
        }
    } else if (isPreview) {
        // Best-effort: se o visitante já tiver sessão, identificamo-lo nos logs,
        // mas a ausência/invalidade do token NUNCA bloqueia o preview.
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (token) {
            try {
                const { user: jwtUser } = await getUserFromToken(token);
                if (jwtUser) verifiedUserId = jwtUser.id;
            } catch (_) { /* ignorar — preview continua anónimo */ }
        }
    }

    // creditsAfterDeduction: valor já debitado pelo /api/deduct-credit — apenas reenviado ao cliente
    // Em modo preview isto é sempre null (nenhum crédito foi tocado).
    const creditsAfterDeduction = isPreview
        ? null
        : (typeof preDeductedCredits === 'number' ? preDeductedCredits : null);

    const maxTokens = isPreview
        ? PREVIEW_MAX_TOKENS
        : (_sectionMode ? 8192 : (_planMode ? 1024 : 8192));

    try {
        const result = await raceAllProviders(finalPrompt, {
            GROQ_KEY, GEMINI_KEY, OR_KEY, CEREBRAS_KEY, NVIDIA_KEY,
        }, _preferProvider, maxTokens);

        if (!isChainCall) {
            console.log(JSON.stringify({
                event: isPreview ? 'doc_preview_generated' : 'doc_generated', serviceType,
                provider: result.provider, model: result.model,
                ms: result.ms,
                userId: verifiedUserId ? verifiedUserId.slice(0, 8) + '***' : 'anon',
                ts: new Date().toISOString(),
            }));
        }

        return res.status(200).json({
            document: result.content,
            model: `${result.provider} · ${result.model}`,
            // creditsRemaining vem sempre do servidor — nunca calculado no cliente
            // Em preview é sempre null: nenhum crédito foi tocado.
            creditsRemaining: creditsAfterDeduction,
            usage: result.usage,
            preview: isPreview || undefined,
        });

    } catch (err) {
        console.error('[generate-document] Todos os providers falharam:', err?.message);

        // NOVO v2.0: tentar reembolsar automaticamente o crédito já debitado.
        // Só aplicável a chamadas normais (não-chain, não-preview), com utilizador
        // autenticado e um custo válido informado pelo cliente. Em modo preview
        // nunca há nada para reembolsar (nenhum crédito foi debitado).
        let refunded = false;
        let creditsAfterRefund = creditsAfterDeduction;

        if (!isChainCall && !isPreview && verifiedUserId && (deductedCost === 1 || deductedCost === 2)) {
            try {
                const newCredits = await rpc('refund_credit', { p_user_id: verifiedUserId, p_amount: deductedCost });
                if (newCredits !== undefined && newCredits !== null) {
                    refunded = true;
                    creditsAfterRefund = newCredits;
                }
            } catch (refundErr) {
                console.error('[generate-document] Falha ao reembolsar crédito automaticamente:', refundErr.message);
            }
        }

        return res.status(503).json({
            error: refunded
                ? 'Serviço de IA temporariamente indisponível. O crédito foi devolvido automaticamente — tente novamente.'
                : (isPreview
                    ? 'Não foi possível gerar a amostra agora. Tente novamente em alguns segundos.'
                    : 'Serviço de IA temporariamente indisponível. Tente novamente.'),
            code: 'SERVICE_UNAVAILABLE',
            refunded,
            creditsRemaining: creditsAfterRefund,
        });
    }
}

// ─── CORRIDA PARALELA com provider preferido ──────────────────────────────
async function raceAllProviders(prompt, keys, preferProvider, maxTokens) {
    const { GROQ_KEY, GEMINI_KEY, OR_KEY, CEREBRAS_KEY, NVIDIA_KEY } = keys;
    const winner = new AbortController();

    const makeRacer = async (fn) => {
        try {
            const t0     = Date.now();
            const result = await fn(prompt, winner.signal, maxTokens);
            winner.abort();
            return { ...result, ms: Date.now() - t0 };
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('cancelled');
            throw err;
        }
    };

    // Mapa de providers disponíveis
    const avail = {};
    if (GROQ_KEY)     avail.groq       = (p, s) => tryGroq(p, GROQ_KEY, s, maxTokens);
    if (GEMINI_KEY)   avail.gemini     = (p, s) => tryGemini(p, GEMINI_KEY, s, maxTokens);
    if (OR_KEY)       avail.openrouter = (p, s) => tryOpenRouter(p, OR_KEY, s, maxTokens);
    if (CEREBRAS_KEY) avail.cerebras   = (p, s) => tryCerebras(p, CEREBRAS_KEY, s, maxTokens);
    if (NVIDIA_KEY)   avail.nvidia     = (p, s) => tryNvidia(p, NVIDIA_KEY, s, maxTokens);

    if (Object.keys(avail).length === 0) throw new Error('Nenhum provider disponível');

    // Provider preferido vai primeiro, os outros em paralelo atrás
    const ordered = preferProvider && avail[preferProvider]
        ? [preferProvider, ...Object.keys(avail).filter(k => k !== preferProvider)]
        : Object.keys(avail);

    const racers = ordered.map(k => makeRacer(avail[k]));
    return Promise.any(racers);
}

// ─── GROQ ──────────────────────────────────────────────────────────────────
async function tryGroq(prompt, apiKey, signal, maxTokens) {
    let lastErr;
    for (const model of GROQ_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(GROQ_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                signal,
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user',   content: prompt },
                    ],
                    max_tokens: Math.min(maxTokens, 8192),
                    temperature: 0.7,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                const msg = d?.error?.message || `Groq HTTP ${res.status}`;
                const e = new Error(msg);
                e.status = res.status;
                // Se for limite DIÁRIO (TPD), não adianta esperar — vai para o próximo modelo
                if (res.status === 429 && msg.includes('per day')) {
                    console.warn(`[Groq] TPD esgotado para ${model}, a saltar para próximo`);
                    lastErr = e;
                    continue; // salta imediatamente para o próximo modelo
                }
                // Limite por minuto (TPM) — vale a pena esperar um pouco
                if (res.status === 429) await sleep(2000);
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

// ─── GEMINI ────────────────────────────────────────────────────────────────
async function tryGemini(prompt, apiKey, signal, maxTokens) {
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
                        maxOutputTokens: Math.min(maxTokens, 65536),
                        temperature: 0.7, topP: 0.9,
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
                const msg = d?.error?.message || `Gemini HTTP ${res.status}`;
                const e = new Error(msg);
                e.status = res.status;
                // Quota esgotada por minuto — salta imediatamente, não vale esperar
                if (res.status === 429) {
                    console.warn(`[Gemini] Quota RPM para ${modelId}, a saltar`);
                    lastErr = e;
                    continue;
                }
                throw e;
            }
            const data    = await res.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (!content) throw new Error(`Gemini vazio (${data.candidates?.[0]?.finishReason})`);
            return {
                content, provider: 'Gemini', model: modelId,
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

// ─── OPENROUTER ────────────────────────────────────────────────────────────
async function tryOpenRouter(prompt, apiKey, signal, maxTokens) {
    let lastErr;
    for (const model of OR_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(OR_BASE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': SITE_URL, 'X-Title': 'MzDocs Pro',
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

// ─── CEREBRAS ──────────────────────────────────────────────────────────────
async function tryCerebras(prompt, apiKey, signal, maxTokens) {
    let lastErr;
    for (const model of CEREBRAS_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(CEREBRAS_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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

// ─── NVIDIA NIM ────────────────────────────────────────────────────────────
async function tryNvidia(prompt, apiKey, signal, maxTokens) {
    let lastErr;
    for (const model of NVIDIA_MODELS) {
        if (signal.aborted) throw new DOMException('', 'AbortError');
        try {
            const res = await fetch(NVIDIA_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                signal,
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user',   content: prompt },
                    ],
                    max_tokens: Math.min(maxTokens, 32768),
                    temperature: 0.7, stream: false,
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

