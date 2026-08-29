// api/_lib/modelHealth.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// DISJUNTOR (circuit breaker) por modelo. Memoriza falhas recentes de cada
// combinação provider+modelo e diz ao motor de corrida (generate-document.js)
// quais modelos SALTAR — temporária ou permanentemente — sem qualquer
// intervenção manual.
//
// Duas categorias de falha:
//   1. PERMANENTE — mensagens como "decommissioned", "model not found",
//      "no endpoints found" (o modelo já não existe no provider). O modelo
//      é desactivado por 7 dias (tempo mais do que suficiente para o
//      Manuel notar no painel admin ou para o provider reverter a decisão).
//   2. TRANSITÓRIA — timeouts, erros 5xx, respostas vazias, etc. Só desliga
//      o modelo depois de 3 falhas SEGUIDAS, com backoff crescente
//      (10min → 30min → 2h), para não desactivar um modelo por um azar
//      pontual da rede.
//
// Persistência: reaproveita o MESMO Upstash Redis já configurado no projecto
// para o rate-limit (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) —
// ver api/generate-document.js → checkRateLimit(). Sem Redis configurado,
// cai num Map local em memória (funciona dentro da mesma instância Vercel
// "quente", sem persistir entre cold starts — degradação graciosa, nunca
// bloqueia a geração de documentos).
// ──────────────────────────────────────────────────────────────────────────

const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Fallback em memória: chave -> { failures, disabledUntil, reason }
const _localHealth = new Map();

// Padrões de erro que significam "este modelo já não existe/não está
// disponível neste provider" — não vale a pena voltar a tentar em breve.
const PERMANENT_ERROR_RE = /decommission|deprecat|does not exist|model[_ ]not[_ ]found|no endpoints? found|invalid model|unknown model|not a valid model|model_not_found|no such model/i;

const PERMANENT_DISABLE_MS = 7 * 24 * 60 * 60 * 1000;                    // 7 dias
const TRANSIENT_STEPS_MS   = [10 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000]; // 10min → 30min → 2h
const FAILURE_THRESHOLD    = 3; // nº de falhas seguidas antes de desactivar temporariamente

function healthKey(provider, model) {
    return `mh:${provider}:${model}`;
}

async function _redisGet(k) {
    try {
        const r = await fetch(`${redisUrl}/get/${encodeURIComponent(k)}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
        });
        const d = await r.json();
        return d?.result ? JSON.parse(d.result) : null;
    } catch {
        return null;
    }
}

async function _redisSet(k, value, ttlSec) {
    try {
        const url = `${redisUrl}/set/${encodeURIComponent(k)}/${encodeURIComponent(JSON.stringify(value))}` +
            (ttlSec ? `?EX=${ttlSec}` : '');
        await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${redisToken}` } });
    } catch {
        // best-effort — nunca deve fazer a geração de documento falhar
    }
}

async function _get(k) {
    if (redisUrl && redisToken) return _redisGet(k);
    return _localHealth.get(k) || null;
}

async function _set(k, value, ttlSec) {
    if (redisUrl && redisToken) return _redisSet(k, value, ttlSec);
    _localHealth.set(k, value);
    if (ttlSec) {
        const t = setTimeout(() => _localHealth.delete(k), ttlSec * 1000);
        if (typeof t.unref === 'function') t.unref();
    }
}

// Consulta se um modelo está actualmente desactivado. NUNCA lança erro —
// em caso de dúvida (Redis em baixo, etc.) assume-se que o modelo está
// disponível: falha aberta (tenta na mesma), nunca falha fechada (bloqueia
// tudo por causa de um problema no próprio disjuntor).
//
// NOVO (Ago/2026) — `opts.discoveredLive`: quando o chamador (aiRace.js)
// acabou de confirmar, via GET /models do PRÓPRIO provider, que este modelo
// existe agora, um disjuntor PERMANENTE antigo (7 dias, disparado por uma
// mensagem tipo "model not found"/"decommissioned") deixa de fazer sentido
// — a fonte mais actual e mais autorizada (o provider, agora mesmo) diz o
// contrário. Isto corrige o cenário visto no painel admin com a Cerebras:
// um modelo era marcado como permanentemente indisponível numa troca de
// catálogo, e mesmo depois da Cerebras o repor (ou de a lista curada ser
// corrigida), o motor continuava a ignorá-lo até o disjuntor expirar
// sozinho — agora a descoberta ao vivo tem sempre a palavra final sobre
// disponibilidade REAL, o disjuntor permanente só continua a proteger
// contra o caso em que a descoberta falhou ou não confirma o modelo.
// Falhas TRANSITÓRIAS (rate limit, 5xx, timeout) continuam a respeitar o
// cooldown normal mesmo com descoberta positiva — a existência do modelo
// não é a mesma coisa que estar disponível AGORA para mais um pedido.
async function isModelDisabled(provider, model, opts = {}) {
    try {
        const state = await _get(healthKey(provider, model));
        if (!state || !state.disabledUntil) return false;
        const stillDisabled = Date.now() < state.disabledUntil;
        if (stillDisabled && state.permanent && opts.discoveredLive) {
            return false;
        }
        return stillDisabled;
    } catch {
        return false;
    }
}

// Regista o resultado de uma tentativa (sucesso ou falha). Fire-and-forget
// por natureza — quem chama não precisa (nem deve) fazer `await` disto no
// caminho crítico da resposta ao utilizador.
async function recordModelResult(provider, model, success, err) {
    try {
        const k = healthKey(provider, model);

        if (success) {
            // Sucesso limpa completamente o histórico de falhas do modelo.
            await _set(k, { failures: 0, disabledUntil: 0 }, 3600 * 24);
            return;
        }

        const msg = String(err?.message || err || '');

        if (PERMANENT_ERROR_RE.test(msg)) {
            await _set(
                k,
                { failures: 99, disabledUntil: Date.now() + PERMANENT_DISABLE_MS, reason: msg.slice(0, 200), permanent: true },
                Math.ceil(PERMANENT_DISABLE_MS / 1000),
            );
            console.warn(`[modelHealth] ${provider}/${model} desactivado por 7 dias (erro permanente): ${msg.slice(0, 150)}`);
            return;
        }

        const prev     = (await _get(k)) || { failures: 0, disabledUntil: 0 };
        const failures = (prev.failures || 0) + 1;

        if (failures >= FAILURE_THRESHOLD) {
            const stepIdx  = Math.min(failures - FAILURE_THRESHOLD, TRANSIENT_STEPS_MS.length - 1);
            const cooldown = TRANSIENT_STEPS_MS[stepIdx];
            await _set(
                k,
                { failures, disabledUntil: Date.now() + cooldown, reason: msg.slice(0, 200) },
                Math.ceil(cooldown / 1000),
            );
            console.warn(`[modelHealth] ${provider}/${model} desactivado por ${Math.round(cooldown / 60000)}min após ${failures} falhas seguidas: ${msg.slice(0, 150)}`);
        } else {
            await _set(k, { failures, disabledUntil: 0 }, 3600);
        }
    } catch (e) {
        console.warn('[modelHealth] erro ao registar resultado (ignorado):', e.message);
    }
}

async function _redisDel(k) {
    try {
        await fetch(`${redisUrl}/del/${encodeURIComponent(k)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${redisToken}` },
        });
    } catch {
        // best-effort — nunca deve fazer o reset falhar de forma ruidosa
    }
}

// NOVO — Reinicia MANUALMENTE o disjuntor de uma lista de modelos de um
// provider. Usado pelo botão "🔄 Reactivar" no painel admin (IA Providers):
// depois de resolver a causa real de uma falha (nova chave, créditos
// repostos, catálogo do provider normalizado), o Manuel já não precisa de
// esperar o cooldown automático (10min→30min→2h, ou 7 dias no caso de erro
// permanente) para o motor voltar a tentar esses modelos — isto limpa o
// estado de falhas registado (Redis ou memória local, conforme o que
// estiver configurado) imediatamente.
async function resetProviderHealth(providerId, models) {
    const list = Array.isArray(models) ? models : [];
    const keys = list.map(m => healthKey(providerId, m));
    for (const k of keys) {
        if (redisUrl && redisToken) await _redisDel(k);
        else _localHealth.delete(k);
    }
    return keys.length;
}

module.exports = { isModelDisabled, recordModelResult, resetProviderHealth };
