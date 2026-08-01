// api/partners.js — Rede de Parceiras (Papelarias / Gráficas / Advogados)
// v2.0 (AUDITORIA Junho/2026)
// v2.1 (Julho/2026) — adicionado suporte a `type` para acomodar a área
// jurídica (advogados) na mesma tabela/endpoint, sem criar uma nova função
// serverless (o projecto está no limite de 12 funções do plano Vercel Hobby).
// ALTERAÇÕES v2.0:
//  1. Removido @supabase/supabase-js + require('ws') — usa api/_lib/supabaseAdmin.js.
//  2. isAdmin() passa a usar getUserFromToken() + selectOne() (fetch puro).
//  3. Lógica de negócio 100% preservada.
// ALTERAÇÕES v2.1:
//  1. Nova coluna `type` ('papelaria' | 'advogado') — VALID_SERVICES passa a
//     ser um mapa por tipo em vez de uma lista única.
//  2. Novos campos exclusivos de advogado: `credential_number` (nº da Ordem
//     dos Advogados de Moçambique — OAM) e `bio` (curta apresentação).
//  3. `credential_number` é obrigatório no registo quando type='advogado' e
//     NUNCA é auto-aprovado — não existe API pública da OAM para validar o
//     número, por isso a candidatura fica sempre 'pending' até um admin
//     confirmar manualmente (mesma máquina de aprovação já existente).
//
// Rotas:
//   POST /api/partners?action=register        — parceira submete candidatura
//   GET  /api/partners?action=nearby          — utilizador busca parceiras próximas
//   POST /api/partners?action=approve         — admin aprova parceira (gera access_code)
//   POST /api/partners?action=reject          — admin rejeita parceira
//   GET  /api/partners?action=list            — admin lista todas
//   POST /api/partners?action=toggle          — admin activa/desactiva
//   POST /api/partners?action=rate            — utilizador avalia parceira
//   POST /api/partners?action=regenerate-code — admin gera novo código de acesso
//   POST /api/partners?action=login           — NOVO: parceira entra no portal (telefone+código)
//   GET  /api/partners?action=me              — NOVO: parceira vê os seus próprios dados
//   POST /api/partners?action=update-profile  — NOVO: parceira edita os seus próprios dados
//   GET  /api/partners?action=check           — NOVO: ponte com afiliados.html — "esta papelaria já se candidatou?"
//
// Todas as rotas aceitam agora `type` ('papelaria' por omissão | 'advogado'):
//   POST .../register?         body.type
//   GET  .../nearby?type=advogado&specialty=laboral&lat=...&lng=...
//   GET  .../list?type=advogado&status=pending   (admin)

const crypto = require('crypto');
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

// SEGURANÇA (auditoria Jul/2026, ronda 2): igual ao mesmo ajuste em
// convert.js/extract-template.js — algumas rotas aqui (register, rate,
// check, login) são públicas e sem token; wildcard '*' permitia que
// qualquer site externo as chamasse a partir do browser de terceiros.
const ALLOWED_ORIGIN = process.env.SITE_URL || 'https://mzdocs.co.mz';

// Tipos de parceiro válidos.
const VALID_TYPES = ['papelaria', 'advogado'];

// Lista branca de serviços válidos, agora por tipo de parceiro — mesma usada
// no formulário de parceiros.html e no filtro de NearbyPartners.js.
// 'papelaria' mantém a lista original (nunca alterada). 'advogado' usa
// `services` para guardar as ÁREAS DE ATUAÇÃO jurídica.
const VALID_SERVICES = {
  papelaria: ['impressao', 'foto', 'plastificacao', 'encadernacao'],
  advogado:  ['civil', 'laboral', 'comercial', 'familia', 'penal', 'imobiliario', 'fiscal', 'sucessorio'],
};

function normalizeType(t) {
  return VALID_TYPES.includes(t) ? t : 'papelaria';
}

// CORRIGIDO (auditoria 1.3): 'phone' era comparado/guardado exactamente como
// escrito (com espaços/traços), enquanto 'whatsapp' já era normalizado só
// para dígitos. Os dois campos do mesmo formulário passam a ser tratados
// da mesma forma.
function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
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

// ── PORTAL DE PARCEIRAS — helpers ──────────────────────────────────────────
// NOVO: código de acesso de 6 dígitos, gerado quando a parceira é aprovada.
// Não é uma password que ela escolhe — é simples de ditar/enviar por
// WhatsApp (o canal que já usam para tudo) e fácil de regenerar se perderem.
function generateAccessCode() {
  return String(crypto.randomInt(100000, 1000000)); // 6 dígitos, sempre
}

// NOVO: token de sessão assinado (HMAC), sem dependências novas — usa o
// crypto nativo do Node, tal como o resto da api já faz (ver hashes em
// misc.js/convert.js). O segredo é o SUPABASE_SERVICE_ROLE_KEY, que já é
// obrigatório no servidor e nunca chega ao cliente — evita ter de pedir
// mais uma variável de ambiente só para isto.
const PARTNER_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias

function signPartnerToken(partnerId) {
  const secret  = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mzdocs-fallback';
  const payload = Buffer.from(JSON.stringify({ pid: partnerId, exp: Date.now() + PARTNER_TOKEN_TTL_MS })).toString('base64url');
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyPartnerToken(token) {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mzdocs-fallback';
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    // Comparação em tempo constante — evita timing attacks a adivinhar a assinatura.
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.pid || !data.exp || Date.now() > data.exp) return null;
    return data.pid;
  } catch (_) {
    return null;
  }
}

async function getPartnerFromRequest(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const pid = verifyPartnerToken(token);
  if (!pid) return null;
  const partner = await selectOne('partners', 'id', pid, 'id,status,active,name,owner_name,phone,whatsapp,city,address,lat,lng,type,services,hours,credential_number,bio,rating_sum,rating_count').catch(() => null);
  if (!partner || partner.status !== 'approved') return null;
  return partner;
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
async function handleRegister(req, res) {
  // CORRIGIDO (auditoria 1.5): limite de candidaturas por IP — sem isto,
  // alguém pode inundar a tabela partners com candidaturas falsas.
  const allowed = await checkRateLimit('partners-register', clientIp(req), { limit: 5, windowSec: 3600 }).catch(() => true);
  if (!allowed) return res.status(429).json({ error: 'Demasiadas candidaturas. Tente novamente mais tarde.' });

  const b = parseBody(req);
  const type = normalizeType(b.type);
  const required = ['name', 'owner_name', 'phone', 'whatsapp', 'city', 'address', 'lat', 'lng', 'services'];
  for (const f of required) {
    if (!b[f] || (Array.isArray(b[f]) && b[f].length === 0))
      return res.status(400).json({ error: `Campo obrigatório em falta: ${f}` });
  }
  // NOVO (v2.1): advogado tem de indicar o nº da Ordem dos Advogados de
  // Moçambique (OAM). Não há forma de validar automaticamente — isto só
  // impede submissões vazias; a verificação real é manual, feita pelo admin
  // antes de aprovar (ver handleApprove).
  if (type === 'advogado') {
    const credential = String(b.credential_number || '').trim();
    if (!credential) return res.status(400).json({ error: 'Nº de inscrição na Ordem dos Advogados (OAM) é obrigatório' });
  }
  const services = (Array.isArray(b.services) ? b.services : [b.services]).filter(s => VALID_SERVICES[type].includes(s));
  if (services.length === 0) {
    return res.status(400).json({ error: type === 'advogado' ? 'Escolha pelo menos uma área de atuação' : 'Escolha pelo menos um serviço' });
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
      approved: 'Este número já está registado como parceiro.',
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
      type:       type,
      services:   services.slice(0, 8),
      hours:      (b.hours || '').trim().slice(0, 100),
      credential_number: type === 'advogado' ? String(b.credential_number).trim().slice(0, 40) : null,
      bio:        type === 'advogado' ? String(b.bio || '').trim().slice(0, 280) : null,
      status:     'pending',
      active:     false,
    });
    const msg = type === 'advogado'
      ? 'Candidatura recebida! A nossa equipa confirma a sua inscrição na Ordem e contacta-o em até 48h.'
      : 'Candidatura recebida! Será contactado em até 48h após aprovação.';
    return res.status(200).json({ ok: true, message: msg });
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
  // NOVO (v2.1): 'type' escolhe o mapa de serviços válidos a usar na
  // validação de 'service' abaixo — mantém o mesmo raciocínio da correcção
  // 1.7 (nunca deixar entrar um valor não previsto no filtro PostgREST).
  const type = normalizeType(q.type);
  const svcRaw = q.service || '';
  const svc = VALID_SERVICES[type].includes(svcRaw) ? svcRaw : '';
  const km  = Math.min(parseFloat(q.km || '10'), 30);

  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat e lng são obrigatórios' });

  const delta = km / 111;
  let path = `partners?status=eq.approved&active=eq.true&type=eq.${type}&lat=gte.${lat - delta}&lat=lte.${lat + delta}&lng=gte.${lng - delta}&lng=lte.${lng + delta}&select=id,name,owner_name,phone,whatsapp,city,address,lat,lng,type,services,hours,credential_number,bio,rating_sum,rating_count&limit=50`;
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
  // NOVO (v2.1): filtro opcional por tipo — admin-parceiros.html passa a ter
  // uma sub-aba Papelarias/Advogados dentro de cada estado.
  const typeRaw = req.query?.type;
  const typeFilter = typeRaw && VALID_TYPES.includes(typeRaw) ? `&type=eq.${typeRaw}` : '';
  try {
    const data = await restRequest(`partners?status=eq.${status}${typeFilter}&order=created_at.desc&limit=200`);
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
    // NOVO: gera o código de acesso ao portal de self-service nesta altura
    // — é o momento em que a parceira passa a ter algo próprio para gerir.
    const access_code = generateAccessCode();
    await update('partners', 'id', id, { status: 'approved', active: true, access_code });
    return res.status(200).json({ ok: true, access_code });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

// ── ADMIN: REGENERATE CODE ──────────────────────────────────────────────────
// NOVO: para quando a parceira perde/esquece o código — o admin gera um novo
// sem ter de rejeitar/reaprovar a parceira.
async function handleRegenerateCode(req, res) {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Sem permissão' });
  const { id } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  try {
    const access_code = generateAccessCode();
    await update('partners', 'id', id, { access_code });
    return res.status(200).json({ ok: true, access_code });
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

// ── PORTAL: LOGIN ────────────────────────────────────────────────────────────
// NOVO: entrada com telefone + código de 6 dígitos (não é conta Supabase —
// as parceiras nunca tiveram email/password, só telefone, desde sempre).
async function handleLogin(req, res) {
  // Rate limit apertado: é um PIN de 6 dígitos, tem de ser difícil de
  // adivinhar por tentativa-erro. 8 tentativas/hora por IP chega para uso
  // legítimo (a parceira só faz login de vez em quando) e torna inviável
  // andar às cegas pelas 900 mil combinações possíveis.
  const allowed = await checkRateLimit('partners-login', clientIp(req), { limit: 8, windowSec: 3600 }).catch(() => true);
  if (!allowed) return res.status(429).json({ error: 'Demasiadas tentativas. Tente novamente mais tarde.' });

  const b = parseBody(req);
  const phoneDigits = onlyDigits(b.phone);
  const code = String(b.access_code || '').trim();
  if (!phoneDigits || !code) return res.status(400).json({ error: 'Telefone e código são obrigatórios' });

  try {
    const partner = await selectOne('partners', 'phone', phoneDigits, 'id,status,access_code,name').catch(() => null);
    if (!partner || partner.status !== 'approved' || !partner.access_code) {
      return res.status(401).json({ error: 'Telefone ou código incorrecto.' });
    }
    // Comparação em tempo constante, mesmo para um PIN curto — hábito seguro.
    const a = Buffer.from(code.padEnd(6, ' '));
    const b2 = Buffer.from(String(partner.access_code).padEnd(6, ' '));
    if (a.length !== b2.length || !crypto.timingSafeEqual(a, b2)) {
      return res.status(401).json({ error: 'Telefone ou código incorrecto.' });
    }
    const token = signPartnerToken(partner.id);
    return res.status(200).json({ ok: true, token, name: partner.name });
  } catch (err) {
    console.error('[partners/login]', err.message);
    return res.status(500).json({ error: 'Erro ao entrar. Tente novamente.' });
  }
}

// ── PORTAL: ME ───────────────────────────────────────────────────────────────
async function handleMe(req, res) {
  const partner = await getPartnerFromRequest(req);
  if (!partner) return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  return res.status(200).json({
    ok: true,
    partner: {
      ...partner,
      rating: partner.rating_count > 0 ? Math.round((partner.rating_sum / partner.rating_count) * 10) / 10 : null,
    },
  });
}

// ── PORTAL: UPDATE PROFILE ────────────────────────────────────────────────────
// NOVO: a parceira só pode editar os campos que são seguros para self-service
// (horário, morada/coordenadas, serviços, WhatsApp, ligar/desligar
// visibilidade). 'phone' (é a própria credencial de login) e 'name'/
// 'owner_name' ficam de fora — mudar isso continua a passar pelo admin, para
// evitar confusão sobre quem é "dona" de uma candidatura já aprovada.
async function handleUpdateProfile(req, res) {
  const partner = await getPartnerFromRequest(req);
  if (!partner) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

  const b = parseBody(req);
  const patch = {};

  if (b.hours !== undefined) patch.hours = String(b.hours).trim().slice(0, 100);
  if (b.address !== undefined) {
    const address = String(b.address).trim().slice(0, 200);
    if (!address) return res.status(400).json({ error: 'Morada não pode ficar vazia' });
    patch.address = address;
  }
  if (b.whatsapp !== undefined) {
    const wa = onlyDigits(b.whatsapp);
    if (!wa || wa.length < 9) return res.status(400).json({ error: 'WhatsApp inválido' });
    patch.whatsapp = wa.slice(0, 20);
  }
  if (b.services !== undefined) {
    const services = (Array.isArray(b.services) ? b.services : [b.services]).filter(s => VALID_SERVICES[normalizeType(partner.type)].includes(s));
    if (services.length === 0) return res.status(400).json({ error: partner.type === 'advogado' ? 'Escolha pelo menos uma área de atuação' : 'Escolha pelo menos um serviço' });
    patch.services = services.slice(0, 8);
  }
  // NOVO (v2.1): bio só faz sentido para advogado, mas não há mal em aceitar
  // de qualquer parceiro que a envie — o campo fica simplesmente sem uso na
  // UI de papelaria.
  if (b.bio !== undefined) patch.bio = String(b.bio).trim().slice(0, 280);
  if (b.lat !== undefined && b.lng !== undefined) {
    const lat = parseFloat(b.lat), lng = parseFloat(b.lng);
    if (isNaN(lat) || isNaN(lng) || lat < -27 || lat > -10 || lng < 30 || lng > 41) {
      return res.status(400).json({ error: 'Localização inválida' });
    }
    patch.lat = lat; patch.lng = lng;
  }
  if (b.active !== undefined) patch.active = !!b.active;

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para actualizar' });

  try {
    await update('partners', 'id', partner.id, patch);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[partners/update-profile]', err.message);
    return res.status(500).json({ error: 'Erro ao guardar. Tente novamente.' });
  }
}

// ── PONTE COM O PROGRAMA DE AFILIADOS ────────────────────────────────────────
// NOVO: quem se regista em afiliado.html com o segmento "Papelaria" (ou
// Cyber/Universidade) ganha comissão por referências, mas isso é um
// programa completamente diferente do marketplace de parceiras (mapa "perto
// de si") — os dois nunca estiveram ligados. Este endpoint deixa
// afiliado.html perguntar, sem expor dados sensíveis, "este número já
// está candidato/aprovado no marketplace?", para só mostrar o convite a
// quem ainda não avançou.
async function handleCheck(req, res) {
  // Rate limit: é público e sem autenticação — sem isto, dava para varrer
  // números de telefone à procura de quem está registado.
  const allowed = await checkRateLimit('partners-check', clientIp(req), { limit: 30, windowSec: 3600 }).catch(() => true);
  if (!allowed) return res.status(429).json({ error: 'Demasiados pedidos.' });

  const phoneDigits = onlyDigits(req.query?.phone);
  if (!phoneDigits) return res.status(400).json({ error: 'phone obrigatório' });
  try {
    const partner = await selectOne('partners', 'phone', phoneDigits, 'status').catch(() => null);
    return res.status(200).json({ exists: !!partner, status: partner?.status || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || req.query?._a || '').toLowerCase();

  try {
    if (req.method === 'GET'  && action === 'nearby')          return await handleNearby(req, res);
    if (req.method === 'GET'  && action === 'list')            return await handleList(req, res);
    if (req.method === 'POST' && action === 'register')        return await handleRegister(req, res);
    if (req.method === 'POST' && action === 'approve')         return await handleApprove(req, res);
    if (req.method === 'POST' && action === 'reject')          return await handleReject(req, res);
    if (req.method === 'POST' && action === 'toggle')          return await handleToggle(req, res);
    if (req.method === 'POST' && action === 'rate')            return await handleRate(req, res);
    if (req.method === 'POST' && action === 'regenerate-code') return await handleRegenerateCode(req, res);
    if (req.method === 'POST' && action === 'login')           return await handleLogin(req, res);
    if (req.method === 'GET'  && action === 'me')              return await handleMe(req, res);
    if (req.method === 'POST' && action === 'update-profile')  return await handleUpdateProfile(req, res);
    if (req.method === 'GET'  && action === 'check')           return await handleCheck(req, res);
    return res.status(404).json({ error: `Acção desconhecida: ${action}` });
  } catch (err) {
    console.error('[partners] crash:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
