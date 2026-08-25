// api/_lib/aiRace.js
// ──────────────────────────────────────────────────────────────────────────
// NOVO (Ago/2026): extraído de api/generate-document.js SEM alterar o
// comportamento — era o único sítio do projecto com o motor de corrida
// paralela por tiers (generoso → médio → reserva_ativa, timeout de 9s por
// provider, disjuntor por modelo, descoberta ao vivo de modelos). O blog
// (api/_services/blog.js, função de geração automática/agendada de
// artigos) tinha a SUA PRÓPRIA versão simplificada, com só 2 providers
// fixos (Groq → Gemini), sem tiers, sem disjuntor, sem descoberta de
// modelos e sem timeout — por isso bastou os dois esgotarem quota no
// mesmo dia (ver incidente de 19–23/08/2026: 3 publicações agendadas
// falharam com "Nenhum provider de IA disponível") para a fila parar de
// vez, apesar de existirem outros ~7-11 providers já configurados e a
// funcionar normalmente na geração de documentos.
//
// api/generate-document.js e api/_services/blog.js importam AMBOS deste
// módulo agora — uma só implementação, um só sítio para corrigir no
// futuro. api/generate-document.js continua a ser o único a expor um
// endpoint HTTP; este ficheiro não cria nenhuma Serverless Function nova
// (é só um module.exports normal, tal como qualquer outro em api/_lib/).
// ──────────────────────────────────────────────────────────────────────────

const { rpc } = require('./supabaseAdmin');
const { PROVIDERS } = require('./aiProviderRegistry');
const { isModelDisabled, recordModelResult } = require('./modelHealth');
const { getAvailableModels } = require('./modelDiscovery');

// Constrói o mapa { providerId: apiKey } a partir do registo central —
// qualquer provider com a env var correspondente configurada na Vercel
// entra automaticamente. Usado por generate-document.js e por blog.js.
function buildApiKeysFromEnv() {
    const apiKeys = {};
    for (const p of PROVIDERS) {
        const val = process.env[p.envVar];
        if (val) apiKeys[p.id] = val;
    }
    return apiKeys;
}

// Regista (fire-and-forget) o uso de cada provider na tabela
// ai_provider_daily_usage — alimenta a aba "IA Providers" do painel admin.
// Nunca bloqueia nem faz falhar a chamada: qualquer erro aqui é só logado.
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── CORRIDA PARALELA por tiers, com controlo de custo e timeout ─────────
// Grupo primário (por omissão): apenas tiers "generoso" + "médio" — cobre a
// esmagadora maioria dos pedidos com 2-3 chamadas em vez de 9+. O tier
// "reserva_ativa" só entra se o grupo primário falhar por completo.
const PRIMARY_TIERS       = ['generoso', 'medio'];
const PROVIDER_TIMEOUT_MS = 9000; // 9s por provider — evita que um lento bloqueie a resposta

const DEFAULT_SYSTEM_PROMPT = 'És um assistente de IA que responde exactamente no formato pedido pelo utilizador, sem comentários adicionais.';

async function raceAllProviders(prompt, apiKeys, preferProvider, maxTokens, systemPrompt, temperature) {
    const sysPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temp      = Number.isFinite(temperature) ? temperature : 0.7;

    // avail: todos os providers do registo central que têm chave configurada
    // (independentemente do tier — usado para o fallback de reserva depois)
    const avail = {};
    for (const providerCfg of PROVIDERS) {
        if (apiKeys[providerCfg.id]) avail[providerCfg.id] = providerCfg;
    }
    if (Object.keys(avail).length === 0) throw new Error('Nenhum provider disponível');

    // Grupo primário: só generoso + médio
    let primaryIds = Object.keys(avail).filter(id => PRIMARY_TIERS.includes(avail[id].tier));

    // Provider preferido (consistência entre secções de um documento em
    // cadeia — ver LongDocumentEngine.js) entra sempre à frente no grupo
    // primário, mesmo que seja de reserva — já foi "escolhido" numa secção
    // anterior porque os primários falharam, não faz sentido voltar a
    // tentá-los do zero a meio do mesmo documento.
    if (preferProvider && avail[preferProvider]) {
        primaryIds = [preferProvider, ...primaryIds.filter(id => id !== preferProvider)];
    }

    // Nenhum provider generoso/médio configurado (ex.: só NVIDIA/Mistral
    // ligados) → corre directamente com o que existir, sem tier a mais.
    if (primaryIds.length === 0) primaryIds = Object.keys(avail);

    try {
        return await raceGroup(primaryIds, avail, apiKeys, prompt, maxTokens, sysPrompt, temp);
    } catch (primaryErr) {
        // Fallback: só os providers "reserva_ativa" que ainda não foram tentados
        const reserveIds = Object.keys(avail)
            .filter(id => avail[id].tier === 'reserva_ativa' && !primaryIds.includes(id));

        if (reserveIds.length === 0) throw primaryErr;

        console.warn('[raceAllProviders] Grupo primário (generoso+médio) falhou por completo — fallback para reserva_ativa:', reserveIds);
        return await raceGroup(reserveIds, avail, apiKeys, prompt, maxTokens, sysPrompt, temp);
    }
}

// Corre um grupo de providers em paralelo com Promise.any, timeout
// individual por provider e cancelamento dos restantes assim que um vencer.
async function raceGroup(ids, avail, apiKeys, prompt, maxTokens, systemPrompt, temperature) {
    const winner = new AbortController();

    const makeRacer = async (providerCfg, apiKey) => {
        const timeoutCtrl = new AbortController();
        const timeoutId   = setTimeout(() => timeoutCtrl.abort(), PROVIDER_TIMEOUT_MS);
        const signal       = AbortSignal.any([winner.signal, timeoutCtrl.signal]);

        try {
            const t0     = Date.now();
            const result = await tryProviderChain(providerCfg, apiKey, prompt, signal, maxTokens, systemPrompt, temperature);
            winner.abort();
            logProviderUsageAsync(providerCfg.id, true, result, null);
            return { ...result, ms: Date.now() - t0 };
        } catch (err) {
            if (err.name === 'AbortError') {
                // Outro provider já venceu — não é uma falha real, não conta
                // para o disjuntor nem para o log de erros.
                if (winner.signal.aborted) throw new Error('cancelled');
                // Excedeu o tecto de tempo individual — conta como falha
                // deste provider para que o Promise.any continue para o
                // próximo, sem esperar por ele indefinidamente.
                const timeoutErr = new Error(`${providerCfg.name}: timeout (${PROVIDER_TIMEOUT_MS}ms)`);
                logProviderUsageAsync(providerCfg.id, false, null, timeoutErr);
                throw timeoutErr;
            }
            logProviderUsageAsync(providerCfg.id, false, null, err);
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const racers = ids.map(id => makeRacer(avail[id], apiKeys[id]));
    return Promise.any(racers);
}

// ─── CADEIA DE FALLBACK DENTRO DE UM PROVIDER ─────────────────────────────
// Para cada provider: descobre ao vivo que modelos ele realmente tem agora
// (best-effort), cruza com a lista curada, salta modelos desactivados pelo
// disjuntor, e tenta cada candidato por ordem até um responder.
async function tryProviderChain(providerCfg, apiKey, prompt, signal, maxTokens, systemPrompt, temperature) {
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
                ? await tryGeminiModel(providerCfg, model, apiKey, prompt, signal, maxTokens, systemPrompt, temperature)
                : await tryOpenAIModel(providerCfg, model, apiKey, prompt, signal, maxTokens, systemPrompt, temperature);
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
async function tryOpenAIModel(providerCfg, model, apiKey, prompt, signal, maxTokens, systemPrompt, temperature) {
    const res = await fetch(providerCfg.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...providerCfg.authHeader(apiKey) },
        signal,
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: prompt },
            ],
            max_tokens: Math.min(maxTokens, providerCfg.maxTokensCap),
            temperature,
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
async function tryGeminiModel(providerCfg, model, apiKey, prompt, signal, maxTokens, systemPrompt, temperature) {
    const res = await fetch(`${providerCfg.chatUrlBase}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: Math.min(maxTokens, providerCfg.maxTokensCap),
                temperature, topP: 0.9,
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

module.exports = { raceAllProviders, buildApiKeysFromEnv, logProviderUsageAsync };
