// api/_lib/httpHelpers.js
// ──────────────────────────────────────────────────────────────────────────
// Extraído de api/misc.js durante o refactor P1-07 (Ago/2026) — antes disto,
// parseBody() e getAuthUser() estavam definidas dentro do monólito de
// ~3.200 linhas e eram reimplementadas/reusadas informalmente por todas as
// secções (pagamentos, OCR, templates, afiliados, etc.). Agora vivem aqui,
// junto de ORIGIN/SITE_URL, e cada módulo em api/_services/*.js importa
// exactamente o que precisa.
//
// Nenhuma lógica foi alterada — comportamento 100% preservado.
// ──────────────────────────────────────────────────────────────────────────

const { getUserFromToken } = require('./supabaseAdmin');

const SITE_URL = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');
const ORIGIN   = SITE_URL;

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

async function getAuthUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { user } = await getUserFromToken(token);
  return user;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

module.exports = { SITE_URL, ORIGIN, parseBody, getAuthUser, clientIp };
