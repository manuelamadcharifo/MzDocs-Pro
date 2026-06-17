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

  // Evitar duplicados pelo mesmo número
  const existing = await selectOne('partners', 'phone', b.phone.trim(), 'id,status').catch(() => null);
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
      phone:      b.phone.trim().slice(0, 20),
      whatsapp:   b.whatsapp.trim().replace(/\D/g, '').slice(0, 20),
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
  const svc = q.service || '';
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
async function handleRate(req, res) {
  const b = parseBody(req);
  if (!b.id || !b.rating) return res.status(400).json({ error: 'id e rating obrigatórios' });
  const rating = Math.min(5, Math.max(1, parseInt(b.rating)));
  try {
    const p = await selectOne('partners', 'id', b.id, 'rating_sum,rating_count');
    if (!p) return res.status(404).json({ error: 'Parceira não encontrada' });
    await update('partners', 'id', b.id, {
      rating_sum:   p.rating_sum + rating,
      rating_count: p.rating_count + 1,
    });
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
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
