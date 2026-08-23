// api/_services/legal.js — LEGAL-SEARCH, busca semântica de artigos de lei
// (extraído de api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Move puro — nenhuma lógica alterada. api/misc.js continua a ser o único
// entrypoint HTTP (rota /api/misc?action=legal-search).
// ──────────────────────────────────────────────────────────────────────────

const { buscarArtigosRelevantes } = require('../_lib/legalSearch');
const { checkRateLimit } = require('../_lib/rateLimit');
const { ORIGIN, parseBody } = require('../_lib/httpHelpers');
const { logEvent } = require('../_lib/observability');

async function checkLegalSearchRateLimit(ip) {
  // max 20 buscas por IP por minuto — generoso para uso normal
  return checkRateLimit('legal-search', ip, { limit: 20, windowSec: 60 });
}

// Mapeia cada serviço jurídico aos diplomas relevantes — restringir a
// busca evita que, por exemplo, uma procuração receba por engano um
// artigo do Código Penal sobre crimes fiscais só porque a frase tem
// alguma semelhança semântica incidental. Quando um serviço não está
// aqui, a busca corre sobre TODOS os diplomas confirmados.
const DIPLOMAS_POR_SERVICO = {
  arrendamento: ['codigo-civil'],
  procuracao:   ['codigo-civil', 'codigo-notariado', 'estatuto-oam'],
  requerimento: ['lei-proteccao-social', 'lei-orgaos-locais', 'lei-estrangeiros', 'lei-sistema-tributario'],
  residencia:   ['codigo-civil', 'codigo-penal'],
  acta:         ['codigo-civil', 'lei-actividades-comerciais', 'lei-associacoes'],
};

async function handleLegalSearch(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (ip && !await checkLegalSearchRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente dentro de 1 minuto.' });
  }

  const body = parseBody(req);
  const { query = '', serviceType = '' } = body;

  if (!query.trim()) {
    return res.status(400).json({ error: 'query é obrigatório (descrição do que se procura, ex: "procuração para venda de imóvel").' });
  }
  if (query.length > 500) {
    return res.status(400).json({ error: 'query demasiado longa (máx. 500 caracteres).' });
  }

  const diplomaSlugs = DIPLOMAS_POR_SERVICO[serviceType] || null;

  try {
    const { resultados, avisoQualidade } = await buscarArtigosRelevantes(query, { diplomaSlugs });
    return res.status(200).json({ resultados, avisoQualidade, encontrado: resultados.length > 0 });
  } catch (err) {
    console.error('[legal-search] erro:', err.message);
    // Falhar de forma graciosa: o frontend trata "encontrado: false" como
    // "sem base legal recuperada" e cai no texto genérico de fallback
    // (ver LegalContext.js) — nunca bloqueia a geração do documento por
    // a busca jurídica ter falhado.
    return res.status(200).json({ resultados: [], avisoQualidade: false, encontrado: false, erro: 'busca_indisponivel' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOG-CRON — publica a fila de agendamento e, se activado, gera um novo
// artigo por IA quando chega a hora (auditoria de conteúdo, v27).
// Chamado diariamente pelo cron nativo do Vercel (vercel.json) em
// GET /api/misc?action=blog-cron, com o cabeçalho Authorization: Bearer
// $CRON_SECRET (Vercel injecta isto automaticamente quando CRON_SECRET
// está definido nas env vars). Também aceita POST com o cabeçalho
// x-cron-secret, para permitir accionar manualmente ou via um serviço
// externo (ex: cron-job.org), tal como o padrão já usado em
// cleanup-temp-accounts.js.
// ════════════════════════════════════════════════════════════════════════════


module.exports = { handleLegalSearch };
