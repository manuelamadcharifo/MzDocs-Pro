// api/_lib/observability.js — Observabilidade estruturada (P2-04, Ago/2026)
// ──────────────────────────────────────────────────────────────────────────
// PROBLEMA (auditoria): o projecto tinha bastante `console.log`/`warn`/
// `error`, útil durante desenvolvimento, mas nada estruturado — impossível
// responder rapidamente a perguntas como "quantos pagamentos foram
// auto-aprovados hoje?" ou "qual a taxa de fallback do OCR esta semana?"
// sem grep manual nos logs do Vercel.
//
// O QUE ESTE MÓDULO FAZ:
//   1. logEvent(category, event, data) — emite UMA linha JSON por evento em
//      stdout (Vercel captura automaticamente; qualquer log drain externo
//      — Axiom, Datadog, Better Stack, etc. — pode ser ligado sem mudar
//      nada no código da aplicação, só a configuração do projecto Vercel).
//   2. Best-effort: grava também em `metrics_events` (ver
//      supabase/migration_v59_observability.sql) para permitir dashboards
//      SQL simples sem depender de um serviço externo pago. Esta escrita
//      NUNCA bloqueia nem lança excepção — se falhar, o evento já foi
//      emitido em stdout de qualquer forma.
//
// TAXONOMIA DE EVENTOS (ver docs/observability.md para a lista completa):
//   payment.*   — pending, auto_approved, review_needed, credited,
//                 credit_failed, duplicate_receipt
//   ocr.*       — started, success, failed, fallback_model
//   ai.*        — request, success, timeout, fallback
//   document.*  — generation_started, generation_success, generation_failed,
//                 refund_success, refund_failed
//   ledger.*    — consumed, expired
//
// USO:
//   const { logEvent } = require('../_lib/observability');
//   logEvent('payment', 'auto_approved', { transactionId, userId, credits });
// ──────────────────────────────────────────────────────────────────────────

let _restRequestLazy = null;
function _getRestRequest() {
  // Lazy require para evitar dependência circular com supabaseAdmin em
  // módulos que importam observability antes de supabaseAdmin estar pronto.
  if (!_restRequestLazy) {
    try { _restRequestLazy = require('./supabaseAdmin').restRequest; }
    catch (_) { _restRequestLazy = null; }
  }
  return _restRequestLazy;
}

const VALID_CATEGORIES = new Set(['payment', 'ocr', 'ai', 'document', 'ledger', 'auth', 'partner', 'system']);

/**
 * Emite um evento estruturado. Nunca lança — observabilidade não pode
 * derrubar o fluxo principal.
 *
 * @param {string} category  — um de VALID_CATEGORIES (log de aviso se fora da lista, mas não bloqueia)
 * @param {string} event     — nome curto do evento, ex: 'auto_approved'
 * @param {object} [data]    — payload adicional (ids, montantes, latências, etc.)
 * @param {object} [opts]
 * @param {boolean} [opts.persist=true] — também gravar em metrics_events (best-effort)
 */
function logEvent(category, event, data = {}, opts = {}) {
  const persist = opts.persist !== false;
  const record = {
    ts:       new Date().toISOString(),
    category,
    event,
    ...sanitize(data),
  };

  if (!VALID_CATEGORIES.has(category)) {
    console.warn('[observability] categoria não reconhecida (a registar mesmo assim):', category);
  }

  // 1. stdout estruturado — sempre, síncrono, nunca falha.
  try {
    console.log(`[metric] ${JSON.stringify(record)}`);
  } catch (_) {
    console.log('[metric] falha ao serializar evento', category, event);
  }

  // 2. Persistência best-effort em metrics_events — fire-and-forget.
  if (persist) {
    const restRequest = _getRestRequest();
    if (restRequest) {
      restRequest('metrics_events', {
        method: 'POST',
        body: {
          category,
          event,
          payload:    sanitize(data),
          created_at: record.ts,
        },
        prefer: 'return=minimal',
      }).catch(() => { /* tabela pode não existir ainda / rede instável — nunca bloquear */ });
    }
  }

  return record;
}

// Remove campos obviamente sensíveis antes de logar/persistir (defesa em
// profundidade — quem chama logEvent já deve evitar passar segredos, mas
// isto protege contra um esquecimento, ex.: alguém passar o objecto inteiro
// do body de um request de pagamento, que pode conter receiptImage base64).
const SENSITIVE_KEYS = new Set(['password', 'tempPass', 'receiptImage', 'token', 'authorization', 'secret', 'access_code']);

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) { out[k] = '[REDACTED]'; continue; }
    if (typeof v === 'string' && v.length > 500) { out[k] = v.slice(0, 500) + '…[truncated]'; continue; }
    out[k] = v;
  }
  return out;
}

/**
 * Helper de conveniência para medir latência de uma operação assíncrona e
 * logar automaticamicamente sucesso/falha + duração em ms.
 *
 *   const result = await withTiming('ai', 'request', () => callGemini(...), { model: 'gemini-2.5-flash' });
 */
async function withTiming(category, event, fn, extraData = {}) {
  const start = Date.now();
  try {
    const result = await fn();
    logEvent(category, `${event}_success`, { ...extraData, duration_ms: Date.now() - start });
    return result;
  } catch (err) {
    logEvent(category, `${event}_failed`, { ...extraData, duration_ms: Date.now() - start, error: String(err && err.message || err) });
    throw err;
  }
}

module.exports = { logEvent, withTiming };
