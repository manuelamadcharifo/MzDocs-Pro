// api/_lib/modelDiscovery.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// Vai buscar a lista REAL de modelos disponíveis num provider (endpoint
// GET /models), em vez de confiar cegamente na lista curada e estática do
// código. É isto que permite ao sistema sobreviver quando um provider muda
// o catálogo sem aviso — a Cerebras já o fez várias vezes em 2026, chegando
// a reduzir o catálogo público a apenas 2 modelos de um dia para o outro.
//
// Resultado colocado em cache (Redis se configurado, senão memória local)
// durante DISCOVERY_TTL_SEC para não bater no endpoint /models a cada
// pedido de documento.
//
// Falha de forma TOTALMENTE silenciosa: qualquer problema (timeout, chave
// inválida, endpoint em baixo, provider sem suporte a /models) devolve
// `null` e quem chamou (api/generate-document.js) usa a lista curada tal
// como já fazia antes desta funcionalidade existir. A descoberta nunca
// atrasa nem bloqueia a geração de um documento.
// ──────────────────────────────────────────────────────────────────────────

const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Fallback em memória: provider -> { ids, expires }
const _localCache = new Map();

const DISCOVERY_TTL_SEC = 3 * 60 * 60; // 3 horas
const FETCH_TIMEOUT_MS  = 4000;        // nunca atrasar a geração do documento por causa disto

async function _fetchWithTimeout(url, opts) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
        clearTimeout(t);
    }
}

async function _cacheGet(provider) {
    if (redisUrl && redisToken) {
        try {
            const r = await fetch(`${redisUrl}/get/${encodeURIComponent('md:' + provider)}`, {
                headers: { Authorization: `Bearer ${redisToken}` },
            });
            const d = await r.json();
            return d?.result ? JSON.parse(d.result) : null;
        } catch {
            return null;
        }
    }
    const c = _localCache.get(provider);
    if (c && c.expires > Date.now()) return c.ids;
    return null;
}

async function _cacheSet(provider, ids) {
    if (redisUrl && redisToken) {
        try {
            const url = `${redisUrl}/set/${encodeURIComponent('md:' + provider)}/${encodeURIComponent(JSON.stringify(ids))}?EX=${DISCOVERY_TTL_SEC}`;
            await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${redisToken}` } });
        } catch {
            // best-effort
        }
        return;
    }
    _localCache.set(provider, { ids, expires: Date.now() + DISCOVERY_TTL_SEC * 1000 });
}

// Formato OpenAI-compatible: { data: [{ id: '...' }, ...] }
function _parseOpenAIModelsResponse(json) {
    if (!Array.isArray(json?.data)) return null;
    return json.data.map(m => m.id).filter(Boolean);
}

// Formato Gemini ListModels: { models: [{ name: 'models/gemini-2.5-flash' }, ...] }
function _parseGeminiModelsResponse(json) {
    if (!Array.isArray(json?.models)) return null;
    return json.models.map(m => (m.name || '').replace(/^models\//, '')).filter(Boolean);
}

// Devolve a lista de modelos disponíveis AGORA para um provider, ou `null`
// se a descoberta não for possível — nunca lança excepção.
async function getAvailableModels(providerCfg, apiKey) {
    if (!providerCfg.modelsUrl) return null;

    const cached = await _cacheGet(providerCfg.id);
    if (cached) return cached;

    try {
        let res, ids;
        if (providerCfg.kind === 'gemini') {
            res = await _fetchWithTimeout(`${providerCfg.modelsUrl}?key=${apiKey}`, {});
            if (!res.ok) return null;
            ids = _parseGeminiModelsResponse(await res.json());
        } else {
            res = await _fetchWithTimeout(providerCfg.modelsUrl, {
                headers: providerCfg.authHeader(apiKey),
            });
            if (!res.ok) return null;
            ids = _parseOpenAIModelsResponse(await res.json());
        }
        if (!ids || ids.length === 0) return null;
        await _cacheSet(providerCfg.id, ids);
        return ids;
    } catch {
        return null; // descoberta é best-effort — nunca bloqueia a geração
    }
}

module.exports = { getAvailableModels };
