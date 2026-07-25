// api/partners.js — Rede de Parceiras (Papelarias / Gráficas)
// v2.0 (AUDITORIA Junho/2026)
// ALTERAÇÕES v2.0:
//  1. Removido @supabase/supabase-js + require('ws') — usa api/_lib/supabaseAdmin.js.
//  2. isAdmin() passa a usar getUserFromToken() + selectOne() (fetch puro).
//  3. Lógica de negócio 100% preservada.
//
// Rotas:
//   POST /api/partners?action=register   — parceira submete candidatura
//   GET  /api/partners?action=nearby     — utilizador busca parceiras próximas
//   POST /api/partners?action=approve    — admin aprova parceira
//   POST /api/partners?action=reject     — admin rejeita parceira
//   GET  /api/partners?action=list       — admin lista todas
//   POST /api/partners?action=toggle     — admin activa/desactiva
//   POST /api/partners?action=rate       — utilizador avalia parceira

const {
  getUserFromToken,
  selectOne,
  update,
  insert,
  restRequest,
} = require('./_lib/supabaseAdmin');
// CORRIGIDO (auditoria 1.5): register e rate são públicos, sem autenticação,
// e não tinham nenhum limite de pedidos — mesma lib já usada por
// process-payment.js/misc.js/admin/index.js.
const { checkRateLimit } = require('./_lib/rateLimit');

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// Lista branca de serviços válidos — mesma usada no formulário de
// parceiros.html e no filtro de NearbyPartners.js.
const VALID_SERVICES = ['impressao', 'foto', 'plastificacao', 'encadernacao'];

// CORRIGIDO (auditoria 1.3): 'phone' era comparado/guardado exactamente como
// escrito (com espaços/traços), enquanto 'whatsapp' já era normalizado só
// para dígitos. Os dois campos do mesmo formulário passam a ser tratados
// da mesma forma.
function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

async function isAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const { user } = await getUserFromToken(token).catch(() => ({ user: null }));
  if (!user) return false;
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin').catch(() => null);
  return profile?.is_admin === true;
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
async function handleRegister(req, res) {
  // CORRIGIDO (auditoria 1.5): limite de candidaturas por IP — sem isto,
  // alguém pode inundar a tabela partners com candidaturas falsas.
  const allowed = await checkRateLimit('partners-register', clientIp(req), { limit: 5, windowSec: 3600 }).catch(() => true);
  if (!allowed) return res.status(429).json({ error: 'Demasiadas candidaturas. Tente novamente mais tarde.' });

  const b = parseBody(req);
  const required = ['name', 'owner_name', 'phone', 'whatsapp', 'city', 'address', 'lat', 'lng', 'services'];
  for (const f of required) {
    if (!b[f] || (Array.isArray(b[f]) && b[f].length === 0))
      return res.status(400).json({ error: `Campo obrigatório em falta: ${f}` });
  }
  const lat = parseFloat(b.lat);
  const lng = parseFloat(b.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Coordenadas inválidas' });
  if (lat < -27 || lat > -10 || lng < 30 || lng > 41)
    return res.status(400).json({ error: 'Localização fora de Moçambique' });

  // CORRIGIDO (auditoria 1.3): normalizar 'phone' da mesma forma que
  // 'whatsapp' (só dígitos) ANTES de comparar e de guardar. Antes, duas
  // candidaturas da mesma papelaria com o telefone escrito de forma
  // diferente ("84 123 4567" vs "841234567") não eram apanhadas por esta
  // verificação amigável — o UNIQUE da base de dados protegia os dados,
  // mas devolvia um erro genérico em vez de "já está registada".
  const phoneDigits = onlyDigits(b.phone);
  if (phoneDigits.length < 9) return res.status(400).json({ error: 'Telefone inválido' });

  // Evitar duplicados pelo mesmo número
  const existing = await selectOne('partners', 'phone', phoneDigits, 'id,status').catch(() => null);
  if (existing) {
    const msgs = {
      pending:  'O seu pedido já foi submetido e está em análise.',
      approved: 'Esta papelaria já está registada.',
      rejected: 'Este número foi recusado. Contacte o suporte.',
    };
    return res.status(409).json({ error: msgs[existing.status] || 'Número já registado.' });
  }

  try {
    await insert('partners', {
      name:       b.name.trim().slice(0, 100),
      owner_name: b.owner_name.trim().slice(0, 80),
      phone:      phoneDigits.slice(0, 20),
      whatsapp:   onlyDigits(b.whatsapp).slice(0, 20),
      city:       b.city.trim().slice(0, 60),
      address:    b.address.trim().slice(0, 200),
      lat, lng,
      services:   (Array.isArray(b.services) ? b.services : [b.services]).slice(0, 8),
      hours:      (b.hours || '').trim().slice(0, 100),
      status:     'pending',
      active:     false,
    });
    return res.status(200).json({ ok: true, message: 'Candidatura recebida! Será contactado em até 48h após aprovação.' });
  } catch (err) {
    console.error('[partners/register]', err.message);
    return res.status(500).json({ error: 'Erro ao registar. Tente novamente.' });
  }
}

// ── NEARBY ────────────────────────────────────────────────────────────────────
async function handleNearby(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  const q   = req.query || {};
  const lat = parseFloat(q.lat);
  const lng = parseFloat(q.lng);
  // CORRIGIDO (auditoria 1.7): 'service' vinha da query e era inserido
  // directamente no filtro PostgREST sem confirmar que era um dos 4
  // valores válidos — um valor inesperado podia partir o filtro e devolver
  // um 500 em vez de uma lista vazia.
  const svcRaw = q.service || '';
  const svc = VALID_SERVICES.includes(svcRaw) ? svcRaw : '';
  const km  = Math.min(parseFloat(q.km || '10'), 30);

  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat e lng são obrigatórios' });

  const delta = km / 111;
  let path = `partners?status=eq.approved&active=eq.true&lat=gte.${lat - delta}&lat=lte.${lat + delta}&lng=gte.${lng - delta}&lng=lte.${lng + delta}&select=id,name,owner_name,phone,whatsapp,city,address,lat,lng,services,hours,rating_sum,rating_count&limit=50`;
  if (svc) path += `&services=cs.{"${svc}"}`;

  try {
    const data = await restRequest(path);

    function haversine(lat1, lng1, lat2, lng2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    const results = (Array.isArray(data) ? data : [])
      .map(p => ({
        ...p,
        distance_km: Math.round(haversine(lat, p.lat, lng, p.lng) * 10) / 10,
        rating: p.rating_count > 0 ? Math.round((p.rating_sum / p.rating_count) * 10) / 10 : null,
      }))
      .filter(p => p.distance_km <= km)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5);

    return res.status(200).json({ ok: true, partners: results });
  } catch (err) {
    console.error('[partners/nearby]', err.message);
    return res.status(500).json({ error: 'Erro ao buscar parceiras' });
  }
}

// ── ADMIN: LIST ──────────────────────────────────────────────────────────────
async function handleList(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const status = (req.query?.status || 'pending').replace(/[^a-z]/g, '');
  try {
    const data = await restRequest(`partners?status=eq.${status}&order=created_at.desc&limit=200`);
    return res.status(200).json({ ok: true, partners: Array.isArray(data) ? data : [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── ADMIN: APPROVE ───────────────────────────────────────────────────────────
async function handleApprove(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  try {
    await update('partners', 'id', id, { status: 'approved', active: true });
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ── ADMIN: REJECT ────────────────────────────────────────────────────────────
async function handleReject(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  try {
    await update('partners', 'id', id, { status: 'rejected', active: false });
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ── ADMIN: TOGGLE ────────────────────────────────────────────────────────────
async function handleToggle(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id, active } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  try {
    await update('partners', 'id', id, { active: !!active });
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ── RATE ──────────────────────────────────────────────────────────────────────
// CORRIGIDO (auditoria 1.4): este endpoint não pedia login/token, não impedia
// votos repetidos, e não confirmava se o 'id' era sequer uma parceira
// aprovada e activa — um concorrente (ou a própria papelaria) podia correr
// o pedido em ciclo e inflar/destruir a nota de qualquer parceira à vontade.
// Agora exige um 'visitor_id' (o mesmo anónimo que o MarketingTracker já usa
// em localStorage), bloqueia mais de uma avaliação do mesmo visitante à
// mesma parceira num período de 30 dias (tabela partner_ratings), e só
// aceita votos para parceiras 'approved' + 'active'.
const RATING_COOLDOWN_DAYS = 30;

async function handleRate(req, res) {
  // Bug 1.5: rate limit próprio, mais generoso que o registo mas ainda assim
  // presente (antes não havia nenhum limite neste endpoint público).
  const allowed = await checkRateLimit('partners-rate', clientIp(req), { limit: 20, windowSec: 3600 }).catch(() => true);
  if (!allowed) return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente mais tarde.' });

  const b = parseBody(req);
  const visitorId = String(b.visitor_id || '').trim().slice(0, 100);
  if (!b.id || !b.rating) return res.status(400).json({ error: 'id e rating obrigatórios' });
  if (!visitorId) return res.status(400).json({ error: 'visitor_id obrigatório' });

  const rating = Math.min(5, Math.max(1, parseInt(b.rating)));
  if (isNaN(rating)) return res.status(400).json({ error: 'rating inválido' });

  try {
    const p = await selectOne('partners', 'id', b.id, 'id,status,active,rating_sum,rating_count');
    if (!p || p.status !== 'approved' || !p.active) {
      return res.status(404).json({ error: 'Parceira não encontrada' });
    }

    // Já existe avaliação deste visitante a esta parceira?
    const existingRows = await restRequest(
      `partner_ratings?partner_id=eq.${encodeURIComponent(b.id)}&visitor_id=eq.${encodeURIComponent(visitorId)}&select=id,rating,created_at&limit=1`
    ).catch(() => []);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;

    if (existing) {
      const ageDays = (Date.now() - new Date(existing.created_at).getTime()) / 86400000;
      if (ageDays < RATING_COOLDOWN_DAYS) {
        return res.status(409).json({ error: `Já avaliou esta parceira. Pode voltar a avaliar depois de ${RATING_COOLDOWN_DAYS} dias.` });
      }
      // Cooldown passou: actualizar a avaliação em vez de contar como nova
      // (ajusta rating_sum pela diferença, rating_count mantém-se).
      const delta = rating - existing.rating;
      await restRequest(`partner_ratings?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body: { rating, updated_at: new Date().toISOString() },
      });
      await update('partners', 'id', b.id, { rating_sum: p.rating_sum + delta });
      return res.status(200).json({ ok: true });
    }

    // Primeira avaliação deste visitante a esta parceira
    await insert('partner_ratings', { partner_id: b.id, visitor_id: visitorId, rating });
    await update('partners', 'id', b.id, {
      rating_sum:   p.rating_sum + rating,
      rating_count: p.rating_count + 1,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[partners/rate]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || req.query?._a || '').toLowerCase();

  try {
    if (req.method === 'GET'  && action === 'nearby')   return await handleNearby(req, res);
    if (req.method === 'GET'  && action === 'list')     return await handleList(req, res);
    if (req.method === 'POST' && action === 'register') return await handleRegister(req, res);
    if (req.method === 'POST' && action === 'approve')  return await handleApprove(req, res);
    if (req.method === 'POST' && action === 'reject')   return await handleReject(req, res);
    if (req.method === 'POST' && action === 'toggle')   return await handleToggle(req, res);
    if (req.method === 'POST' && action === 'rate')     return await handleRate(req, res);
    return res.status(404).json({ error: `Acção desconhecida: ${action}` });
  } catch (err) {
    console.error('[partners] crash:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
