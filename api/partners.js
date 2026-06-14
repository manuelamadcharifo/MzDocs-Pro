// api/partners.js — Rede de Parceiras (Papelarias / Gráficas)
// Rotas:
//   POST /api/partners?action=register   — parceira submete candidatura
//   GET  /api/partners?action=nearby     — utilizador busca parceiras próximas
//   POST /api/partners?action=approve    — admin aprova parceira
//   POST /api/partners?action=reject     — admin rejeita parceira
//   GET  /api/partners?action=list       — admin lista todas
//   POST /api/partners?action=toggle     — admin activa/desactiva
//
// Tabela Supabase (criar manualmente):
// ─────────────────────────────────────────────────────────────────────────────
// CREATE EXTENSION IF NOT EXISTS postgis;
//
// CREATE TABLE partners (
//   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   name         text NOT NULL,
//   owner_name   text NOT NULL,
//   phone        text NOT NULL,
//   whatsapp     text NOT NULL,
//   city         text NOT NULL,
//   address      text NOT NULL,
//   lat          float8 NOT NULL,
//   lng          float8 NOT NULL,
//   services     text[] NOT NULL DEFAULT '{}',
//   hours        text,
//   status       text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
//   active       boolean NOT NULL DEFAULT false,
//   rating_sum   int NOT NULL DEFAULT 0,
//   rating_count int NOT NULL DEFAULT 0,
//   created_at   timestamptz NOT NULL DEFAULT now()
// );
//
// CREATE INDEX partners_location ON partners USING gist (
//   ST_SetSRID(ST_MakePoint(lng, lat), 4326)
// );
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

function makeClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
  );
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
  const sb = makeClient();
  const { data } = await sb.auth.getUser(token).catch(() => ({ data: {} }));
  if (!data?.user) return false;
  const { data: profile } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return profile?.role === 'admin';
}

// ── REGISTER — parceira submete candidatura ──────────────────────────────────
async function handleRegister(req, res) {
  const b = parseBody(req);
  const required = ['name', 'owner_name', 'phone', 'whatsapp', 'city', 'address', 'lat', 'lng', 'services'];
  for (const f of required) {
    if (!b[f] || (Array.isArray(b[f]) && b[f].length === 0)) {
      return res.status(400).json({ error: `Campo obrigatório em falta: ${f}` });
    }
  }
  const lat = parseFloat(b.lat);
  const lng = parseFloat(b.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Coordenadas inválidas' });
  if (lat < -27 || lat > -10 || lng < 30 || lng > 41)
    return res.status(400).json({ error: 'Localização fora de Moçambique' });

  const sb = makeClient();

  // Evitar duplicados pelo mesmo número
  const { data: existing } = await sb.from('partners').select('id,status').eq('phone', b.phone.trim()).maybeSingle();
  if (existing) {
    const msgs = { pending: 'O seu pedido já foi submetido e está em análise.', approved: 'Esta papelaria já está registada.', rejected: 'Este número foi recusado. Contacte o suporte.' };
    return res.status(409).json({ error: msgs[existing.status] || 'Número já registado.' });
  }

  const { error } = await sb.from('partners').insert({
    name:        b.name.trim().slice(0, 100),
    owner_name:  b.owner_name.trim().slice(0, 80),
    phone:       b.phone.trim().slice(0, 20),
    whatsapp:    b.whatsapp.trim().replace(/\D/g, '').slice(0, 20),
    city:        b.city.trim().slice(0, 60),
    address:     b.address.trim().slice(0, 200),
    lat, lng,
    services:    (Array.isArray(b.services) ? b.services : [b.services]).slice(0, 8),
    hours:       (b.hours || '').trim().slice(0, 100),
    status:      'pending',
    active:      false,
  });

  if (error) { console.error('[partners/register]', error); return res.status(500).json({ error: 'Erro ao registar. Tente novamente.' }); }
  return res.status(200).json({ ok: true, message: 'Candidatura recebida! Será contactado em até 48h após aprovação.' });
}

// ── NEARBY — utilizador busca parceiras ─────────────────────────────────────
async function handleNearby(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  const q  = req.query || {};
  const lat = parseFloat(q.lat);
  const lng = parseFloat(q.lng);
  const svc = q.service || '';          // 'impressao' | 'foto' | 'conversao'
  const km  = Math.min(parseFloat(q.km || '10'), 30);

  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat e lng são obrigatórios' });

  const sb = makeClient();

  // Fórmula Haversine aproximada directamente no Supabase
  // (sem PostGIS: filtramos por bounding box e calculamos distância no JS)
  const delta = km / 111; // ~1 grau = 111 km
  let query = sb.from('partners')
    .select('id,name,owner_name,phone,whatsapp,city,address,lat,lng,services,hours,rating_sum,rating_count')
    .eq('status', 'approved')
    .eq('active', true)
    .gte('lat', lat - delta)
    .lte('lat', lat + delta)
    .gte('lng', lng - delta)
    .lte('lng', lng + delta);

  if (svc) query = query.contains('services', [svc]);

  const { data, error } = await query.limit(50);
  if (error) { console.error('[partners/nearby]', error); return res.status(500).json({ error: 'Erro ao buscar parceiras' }); }

  // Calcular distância real e ordenar
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  const results = (data || [])
    .map(p => ({
      ...p,
      distance_km: Math.round(haversine(lat, p.lat, lng, p.lng) * 10) / 10,
      rating: p.rating_count > 0 ? Math.round((p.rating_sum / p.rating_count) * 10) / 10 : null,
    }))
    .filter(p => p.distance_km <= km)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 5);

  return res.status(200).json({ ok: true, partners: results });
}

// ── ADMIN: LIST ──────────────────────────────────────────────────────────────
async function handleList(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const q = req.query || {};
  const status = q.status || 'pending';
  const sb = makeClient();
  const { data, error } = await sb.from('partners').select('*').eq('status', status).order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, partners: data || [] });
}

// ── ADMIN: APPROVE ───────────────────────────────────────────────────────────
async function handleApprove(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const sb = makeClient();
  const { error } = await sb.from('partners').update({ status: 'approved', active: true }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── ADMIN: REJECT ────────────────────────────────────────────────────────────
async function handleReject(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const sb = makeClient();
  const { error } = await sb.from('partners').update({ status: 'rejected', active: false }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── ADMIN: TOGGLE active ─────────────────────────────────────────────────────
async function handleToggle(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id, active } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const sb = makeClient();
  const { error } = await sb.from('partners').update({ active: !!active }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── RATE — utilizador avalia parceira ───────────────────────────────────────
async function handleRate(req, res) {
  const b = parseBody(req);
  if (!b.id || !b.rating) return res.status(400).json({ error: 'id e rating obrigatórios' });
  const rating = Math.min(5, Math.max(1, parseInt(b.rating)));
  const sb = makeClient();
  const { data: p } = await sb.from('partners').select('rating_sum,rating_count').eq('id', b.id).maybeSingle();
  if (!p) return res.status(404).json({ error: 'Parceira não encontrada' });
  const { error } = await sb.from('partners').update({
    rating_sum:   p.rating_sum + rating,
    rating_count: p.rating_count + 1,
  }).eq('id', b.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || req.query?._a || '').toLowerCase();

  try {
    if (req.method === 'GET'  && action === 'nearby')  return await handleNearby(req, res);
    if (req.method === 'GET'  && action === 'list')    return await handleList(req, res);
    if (req.method === 'POST' && action === 'register') return await handleRegister(req, res);
    if (req.method === 'POST' && action === 'approve')  return await handleApprove(req, res);
    if (req.method === 'POST' && action === 'reject')   return await handleReject(req, res);
    if (req.method === 'POST' && action === 'toggle')   return await handleToggle(req, res);
    if (req.method === 'POST' && action === 'rate')     return await handleRate(req, res);
    return res.status(404).json({ error: `Acção desconhecida: ${action}` });
  } catch (err) {
    console.error('[partners] crash:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
