// api/_lib/rateLimit.js
// ──────────────────────────────────────────────────────────────────────────
// CORRIGIDO (auditoria, ponto 5): generate-document.js já tinha rate
// limiting robusto via Upstash Redis (persistente entre instâncias
// serverless da Vercel — cada invocação pode rodar num container
// diferente, então um Map em memória do processo NÃO é confiável: um
// atacante pode facilmente contornar o limite acertando instâncias
// diferentes). Mas verify-receipt e legal-search em api/misc.js usavam só
// um Map local, sem essa protecção. Este módulo extrai a lógica
// já testada de generate-document.js para ser partilhada por todos os
// endpoints que precisem de rate limiting.
//
// Se UPSTASH_REDIS_REST_URL/TOKEN não estiverem configurados, cai
// graciosamente para um Map local por endpoint (melhor que nada, mas sem
// persistência entre cold starts/instâncias — documentar isto ao usar).
//
// Uso:
//   const { checkRateLimit } = require('./_lib/rateLimit');
//   const allowed = await checkRateLimit('receipt', ip, { limit: 3, windowSec: 60 });
//   if (!allowed) return res.status(429).json({ error: 'Demasiados pedidos.' });
// ──────────────────────────────────────────────────────────────────────────

const _localRateMaps = new Map(); // namespace → Map(key → {count, reset})

function _getLocalMap(namespace) {
  if (!_localRateMaps.has(namespace)) _localRateMaps.set(namespace, new Map());
  return _localRateMaps.get(namespace);
}

/**
 * @param {string} namespace - identifica o endpoint/uso (ex.: 'receipt', 'legal-search')
 * @param {string} identity  - identificador do chamador (ex.: IP, user id)
 * @param {object} opts
 * @param {number} [opts.limit=10]     - máximo de pedidos na janela
 * @param {number} [opts.windowSec=60] - duração da janela em segundos
 * @returns {Promise<boolean>} true se dentro do limite, false se excedido
 */
async function checkRateLimit(namespace, identity, opts = {}) {
  const limit     = opts.limit     ?? 10;
  const windowSec = opts.windowSec ?? 60;
  const key       = `rl:${namespace}:${identity || 'unknown'}`;

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
      console.warn(`[rate-limit:${namespace}] Redis indisponível, a usar Map local:`, redisErr.message);
    }
  }

  // ── Fallback: Map local (sem persistência entre cold starts/instâncias) ──
  const map   = _getLocalMap(namespace);
  const now   = Date.now();
  const entry = map.get(key) || { count: 0, reset: now + windowSec * 1000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowSec * 1000; }
  entry.count++;
  map.set(key, entry);
  return entry.count <= limit;
}

module.exports = { checkRateLimit };
