// api/generate-document.js — v2.3 (AUTO-CURA DE PROVIDERS/MODELOS)
// N providers em corrida paralela (todos os que tiverem env var configurada
// na Vercel — ver api/_lib/aiProviderRegistry.js). Suporte a geração em
// cadeia (_planMode / _sectionMode) com rate-limit generoso.
//
// CORREÇÕES v2.0:
//  1. Removido @supabase/supabase-js + require('ws'). A verificação do JWT
//     passou a usar api/_lib/supabaseAdmin.js (fetch puro contra /auth/v1/user).
//  2. Reembolso automático de crédito quando TODOS os providers falham.
//
// v2.1 (Amostra grátis + custo progressivo):
//  3. _previewMode: true — gera uma AMOSTRA curta e gratuita do documento.
//  4. Endpoint reaproveitado (limite de 12 functions do Vercel Hobby).
//
// v2.2 (Monitorização dos providers):
//  5. Cada tentativa (sucesso ou falha) de cada provider é registada de
//     forma assíncrona na tabela ai_provider_daily_usage — alimenta a aba
//     "IA Providers" em /admin.html.
//
// NOVO v2.3 (auto-cura de providers/modelos — substituição automática):
//  6. api/_lib/aiProviderRegistry.js passou a ser a FONTE ÚNICA de config
//     de todos os providers (activos + reserva já ligados). Qualquer chave
//     nova (MISTRAL_API_KEY, SAMBANOVA_API_KEY, TOGETHER_API_KEY,
//     FIREWORKS_API_KEY, além das 5 originais) entra na corrida sozinha,
//     assim que existir na Vercel — sem editar este ficheiro.
//  7. api/_lib/modelDiscovery.js consulta o endpoint /models real de cada
//     provider (com cache) e filtra a lista curada para os modelos que
//     REALMENTE existem neste momento. Se o provider trocar o catálogo
//     por completo (ex: Cerebras), o motor usa directamente os primeiros
//     modelos devolvidos pela descoberta ao vivo — substituição automática
//     sem deploy novo.
//  8. api/_lib/modelHealth.js é um disjuntor por modelo: desactiva 7 dias
//     um modelo com erro permanente ("decommissioned", "model not found",
//     "no endpoints found"...) e desactiva temporariamente (10min→30min→2h)
//     um modelo com falhas repetidas transitórias — sem gastar mais pedidos
//     num modelo que se sabe estar avariado.

const { getUserFromToken, rpc } = require('./_lib/supabaseAdmin');
const { PROVIDERS }               = require('./_lib/aiProviderRegistry');
const { isModelDisabled, recordModelResult } = require('./_lib/modelHealth');
const { getAvailableModels }      = require('./_lib/modelDiscovery');

// Regista (fire-and-forget) o uso de cada provider na tabela
// ai_provider_daily_usage — alimenta a aba "IA Providers" do painel admin
// (tokens usados, pedidos ok/falha, online/offline). Nunca bloqueia nem
// faz falhar a geração do documento: qualquer erro aqui é apenas logado.
function logProviderUsageAsync(provider, success, result, err) {
    rpc('record_ai_provider_usage', {
        p_provider: provider,
        p_success: success,
        p_model: result?.model || null,
        p_tokens_prompt: result?.usage?.prompt_tokens || result?.usage?.promptTokenCount || 0,
        p_tokens_completion: result?.usage?.completion_tokens || result?.usage?.candidatesTokenCount || 0,
        p_error_message: err ? String(err.message || err).slice(0, 300) : null,
    }).catch(e => console.warn('[ai-usage-log]', provider, e.message));
}

// Tokens máximos absolutos para uma amostra grátis — aplicado no servidor,
// independentemente do que o cliente envie, para que o preview nunca possa
// ser usado como substituto gratuito da geração completa.
const PREVIEW_MAX_TOKENS = 420;

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

// ─── RATE LIMIT (Upstash Redis — persiste entre instâncias Vercel) ──────────
// Se UPSTASH_REDIS_REST_URL não estiver configurado, cai no Map local (sem persistência)
// Setup: vercel.com/integrations/upstash → cria DB grátis → cola as env vars no Vercel

async function checkRateLimit(req, isChainCall, isPreview) {
    const auth = req.headers['authorization'];
    const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const mode = isPreview ? ':p' : (isChainCall ? ':c' : '');
    const key  = 'rl:' + (auth ? `u:${auth.slice(-16)}` : `i:${ip}`) + mode;

    const limit     = isPreview ? 4 : (isChainCall ? (auth ? 60 : 20) : (auth ? 20 : 8));
    const windowSec = isPreview ? 60 : (isChainCall ? 10 : 60);

    const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
        try {
            const headers = {
                Authorization: `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            };
            const incrRes  = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers });
            const incrData = await incrRes.json();
            const count    = incrData.result;

            if (count === 1) {
                await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSec}`, { method: 'POST', headers });
            }
            return count <= limit;
        } catch (redisErr) {
            console.warn('[rate-limit] Redis unavailable, using local Map:', redisErr.message);
        }
    }

    const now   = Date.now();
    const entry = _localRateMap.get(key) || { count: 0, reset: now + windowSec * 1000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowSec * 1000; }
    entry.count++;
    _localRateMap.set(key, entry);
    return entry.count <= limit;
}

const _localRateMap = new Map();

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
        _previewMode, // amostra grátis, sem dedução de crédito
        creditsRemaining: preDeductedCredits,
        cost: deductedCost,
    } = body;

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

    // Constrói o mapa de chaves disponíveis a partir do REGISTO CENTRAL —
    // qualquer provider listado em aiProviderRegistry.js entra aqui
    // automaticamente assim que a sua env var existir na Vercel.
    const apiKeys = {};
    for (const p of PROVIDERS) {
        const val = process.env[p.envVar];
        if (val) apiKeys[p.id] = val;
    }

    if (Object.keys(apiKeys).length === 0) {
        return res.status(503).json({ error: 'Nenhuma API key configurada.' });
    }

    let finalPrompt = prompt;
    if (_reedit && _currentContent && _instruction) {
        finalPrompt = `Você é um editor de documentos profissional.\n\nDOCUMENTO ATUAL:\n"""\n${_currentContent}\n"""\n\nINSTRUÇÃO: "${_instruction}"\n\nEdite o documento aplicando a instrução. Mantenha o formato Markdown. Devolva apenas o documento editado, sem comentários.`;
    }

    if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });

    if (isPreview) {
        finalPrompt = `${finalPrompt}\n\n---\nIMPORTANTE: Esta é apenas uma AMOSTRA GRÁTIS para o utilizador avaliar a qualidade antes de gerar o documento completo. Escreva APENAS o cabeçalho/título e a abertura do documento (primeiro parágrafo ou primeira secção, no máximo). Pare num ponto natural — não tente preencher o documento todo. Não escreva "[continua]" nem comentários meta.`;
    }

    // CORRIGIDO (auditoria A-3): limite de tamanho do prompt.
    const MAX_PROMPT_LENGTH = 15000;
    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({
            error: `Prompt demasiado longo (${finalPrompt.length} caracteres). Máximo: ${MAX_PROMPT_LENGTH}.`,
            code:  'PROMPT_TOO_LONG',
        });
    }

    // ── Autenticação ───────────────────────────────────────────────────────
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
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (token) {
            try {
                const { user: jwtUser } = await getUserFromToken(token);
                if (jwtUser) verifiedUserId = jwtUser.id;
            } catch (_) { /* ignorar — preview continua anónimo */ }
        }
    }

    const creditsAfterDeduction = isPreview
        ? null
        : (typeof preDeductedCredits === 'number' ? preDeductedCredits : null);

    const maxTokens = isPreview
        ? PREVIEW_MAX_TOKENS
        : (_sectionMode ? 8192 : (_planMode ? 1024 : 8192));

    try {
        const result = await raceAllProviders(finalPrompt, apiKeys, _preferProvider, maxTokens);

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
            creditsRemaining: creditsAfterDeduction,
            usage: result.usage,
            preview: isPreview || undefined,
        });

    } catch (err) {
        console.error('[generate-document] Todos os providers falharam:', err?.message);

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
async function raceAllProviders(prompt, apiKeys, preferProvider, maxTokens) {
    const winner = new AbortController();

    const makeRacer = async (providerCfg, apiKey) => {
        try {
            const t0     = Date.now();
            const result = await tryProviderChain(providerCfg, apiKey, prompt, winner.signal, maxTokens);
            winner.abort();
            logProviderUsageAsync(providerCfg.id, true, result, null);
            return { ...result, ms: Date.now() - t0 };
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('cancelled');
            logProviderUsageAsync(providerCfg.id, false, null, err);
            throw err;
        }
    };

    // avail: apenas os providers do registo central que têm chave configurada
    const avail = {};
    for (const providerCfg of PROVIDERS) {
        if (apiKeys[providerCfg.id]) avail[providerCfg.id] = providerCfg;
    }

    if (Object.keys(avail).length === 0) throw new Error('Nenhum provider disponível');

    // Provider preferido vai primeiro, os outros em paralelo atrás
    const orderedIds = preferProvider && avail[preferProvider]
        ? [preferProvider, ...Object.keys(avail).filter(k => k !== preferProvider)]
        : Object.keys(avail);

    const racers = orderedIds.map(id => makeRacer(avail[id], apiKeys[id]));
    return Promise.any(racers);
}

// ─── CADEIA DE FALLBACK DENTRO DE UM PROVIDER ─────────────────────────────
// Para cada provider: descobre ao vivo que modelos ele realmente tem agora
// (best-effort), cruza com a lista curada, salta modelos desactivados pelo
// disjuntor, e tenta cada candidato por ordem até um responder.
async function tryProviderChain(providerCfg, apiKey, prompt, signal, maxTokens) {
    let lastErr;

    const discovered = await getAvailableModels(providerCfg, apiKey);
    let candidates = discovered
        ? providerCfg.models.filter(m => discovered.includes(m))
        : providerCfg.models.slice();

    // Se NENHUM dos modelos curados existir mais no catálogo real do
    // provider (troca de catálogo completa, ex: Cerebras), usa directamente
    // os primeiros modelos que a descoberta ao vivo devolveu — é isto que
    // torna a substituição verdadeiramente automática, sem deploy novo.
    if (discovered && candidates.length === 0) {
        candidates = discovered.slice(0, 5);
        console.warn(`[${providerCfg.name}] catálogo curado indisponível — a usar descoberta ao vivo:`, candidates);
    }

    for (const model of candidates) {
        if (signal.aborted) throw new DOMException('', 'AbortError');

        if (await isModelDisabled(providerCfg.id, model)) {
            continue; // desactivado pelo disjuntor — salta sem gastar um pedido
        }

        try {
            const result = providerCfg.kind === 'gemini'
                ? await tryGeminiModel(providerCfg, model, apiKey, prompt, signal, maxTokens)
                : await tryOpenAIModel(providerCfg, model, apiKey, prompt, signal, maxTokens);
            recordModelResult(providerCfg.id, model, true, null); // fire-and-forget
            return result;
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`[${providerCfg.name}] ${model} falhou:`, err.message);
            recordModelResult(providerCfg.id, model, false, err); // fire-and-forget
            if (err.status === 429 && !err._skipFast) await sleep(800);
            lastErr = err;
        }
    }
    throw lastErr || new Error(`${providerCfg.name}: nenhum modelo disponível (todos desactivados ou catálogo vazio)`);
}

// ─── Chamada genérica a um modelo OpenAI-compatible (Groq, Cerebras,
//     OpenRouter, NVIDIA, Mistral, SambaNova, Together, Fireworks...) ──────
async function tryOpenAIModel(providerCfg, model, apiKey, prompt, signal, maxTokens) {
    const res = await fetch(providerCfg.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...providerCfg.authHeader(apiKey) },
        signal,
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: prompt },
            ],
            max_tokens: Math.min(maxTokens, providerCfg.maxTokensCap),
            temperature: 0.7,
        }),
    });
    if (!res.ok) {
        const d   = await res.json().catch(() => ({}));
        const msg = d?.error?.message || d?.message || `${providerCfg.name} HTTP ${res.status}`;
        const e   = new Error(msg);
        e.status  = res.status;
        // Limite DIÁRIO esgotado — não vale a pena esperar, salta já para o próximo modelo
        if (res.status === 429 && /per day|daily/i.test(msg)) e._skipFast = true;
        throw e;
    }
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    if (!content) throw new Error(`${providerCfg.name} resposta vazia`);
    return { content, provider: providerCfg.name, model: data.model || model, usage: data.usage };
}

// ─── Chamada específica à API Gemini (formato próprio) ────────────────────
async function tryGeminiModel(providerCfg, model, apiKey, prompt, signal, maxTokens) {
    const res = await fetch(`${providerCfg.chatUrlBase}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: Math.min(maxTokens, providerCfg.maxTokensCap),
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
        const d   = await res.json().catch(() => ({}));
        const msg = d?.error?.message || `Gemini HTTP ${res.status}`;
        const e   = new Error(msg);
        e.status  = res.status;
        // Quota esgotada por minuto — salta imediatamente, não vale esperar
        if (res.status === 429) e._skipFast = true;
        throw e;
    }
    const data    = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!content) throw new Error(`Gemini vazio (${data.candidates?.[0]?.finishReason})`);
    return {
        content, provider: 'Gemini', model,
        usage: {
            prompt_tokens:     data.usageMetadata?.promptTokenCount     || 0,
            completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        },
    };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
