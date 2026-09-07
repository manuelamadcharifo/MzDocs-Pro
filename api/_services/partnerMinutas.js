// api/_services/partnerMinutas.js — MINUTAS DE PARCEIRO (marketplace de
// conteúdo jurídico, distinto do marketplace de templates VISUAIS já
// existente em api/_services/templates.js).
// ──────────────────────────────────────────────────────────────────────────
// Namespace /api/misc?_ns=partnerMinutas&_a=<action> — segue exactamente o
// mesmo padrão de api/_services/templates.js e api/_services/affiliates.js
// (ver api/misc.js). Não cria nenhuma Serverless Function nova — o projecto
// já está no limite de 12 do plano Vercel Hobby.
//
// Diferença central face a templates_custom: aqui o parceiro submete TEXTO
// (o clausulado de uma minuta, com placeholders {{CAMPO}}), não HTML/CSS de
// aparência. Por ser conteúdo jurídico, a submissão exige aceitação
// expressa e registada de responsabilidade legal exclusiva do autor (ver
// api/_lib/minutaLiabilityDisclaimer.js) — sem isso, a própria base de
// dados rejeita o INSERT (CHECK liability_accepted = true), como segunda
// camada de protecção além da validação aqui.
// ──────────────────────────────────────────────────────────────────────────

const {
  restRequest,
  insert,
  update,
  selectOne,
} = require('../_lib/supabaseAdmin');
const { ORIGIN, parseBody, getAuthUser, clientIp } = require('../_lib/httpHelpers');
const {
  servicosComMinutaDeParceiro,
  placeholdersPermitidos,
  validarMinuta,
} = require('../_lib/minutaEngine');
const {
  MINUTA_LIABILITY_DISCLAIMER_VERSION,
  MINUTA_LIABILITY_DISCLAIMER_TEXT,
} = require('../_lib/minutaLiabilityDisclaimer');

async function handlePartnerMinutas(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  switch (action) {
    case 'disclaimer':    return pmDisclaimer(req, res);
    case 'service-types': return pmServiceTypes(req, res);
    case 'submit':        return pmSubmit(req, res);
    case 'mine':          return pmMine(req, res);
    case 'list':          return pmList(req, res);
    case 'get':           return pmGet(req, res);
    case 'toggle-active': return pmToggleActive(req, res);
    case 'pending':       return pmPending(req, res);
    case 'approve':       return pmApprove(req, res);
    case 'reject':        return pmReject(req, res);
    default:              return res.status(404).json({ error: 'Acção de minuta de parceiro não encontrada' });
  }
}

// Mesma regra de negócio já usada para vender templates visuais (ver
// isEligibleTemplateSeller em api/_services/templates.js) — a plataforma só
// publica conteúdo de quem já está associado ao projecto (afiliado
// aprovado, ou parceiro aprovado e activo). Duplicado aqui de propósito
// (função pequena e estável) em vez de importado de templates.js, para
// este módulo não depender de detalhes internos de outro domínio.
async function isEligiblePartnerAuthor(userId) {
  if (!userId) return false;
  try {
    const profile = await selectOne('profiles', 'id', userId, 'is_affiliate');
    if (profile?.is_affiliate) return true;
  } catch (_) { /* ignora — trata como não elegível */ }
  try {
    const rows = await restRequest(
      `partners?linked_user_id=eq.${userId}&status=eq.approved&active=eq.true&select=id&limit=1`
    );
    if (Array.isArray(rows) && rows.length) return true;
  } catch (_) { /* coluna pode não existir ainda */ }
  return false;
}

// GET — texto oficial do disclaimer, para o formulário mostrar antes de
// submeter (e para o próprio submit devolver erro claro se o frontend
// enviar uma versão desactualizada — ver pmSubmit).
async function pmDisclaimer(req, res) {
  return res.status(200).json({
    success: true,
    version: MINUTA_LIABILITY_DISCLAIMER_VERSION,
    text: MINUTA_LIABILITY_DISCLAIMER_TEXT,
  });
}

// GET — lista de service_types que aceitam minuta de parceiro nesta
// versão, cada um com os placeholders permitidos (o formulário usa isto
// para mostrar ao autor exactamente que {{TOKENS}} pode usar).
async function pmServiceTypes(req, res) {
  const tipos = servicosComMinutaDeParceiro().map(serviceType => ({
    serviceType,
    placeholders: placeholdersPermitidos(serviceType),
  }));
  return res.status(200).json({ success: true, serviceTypes: tipos });
}

async function pmSubmit(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const eligible = await isEligiblePartnerAuthor(user.id);
  if (!eligible) {
    return res.status(403).json({
      error: 'Só afiliados ou parceiros aprovados podem submeter minutas. Torne-se afiliado para poder participar neste programa.',
      code: 'NOT_ELIGIBLE',
    });
  }

  const body = parseBody(req);
  const { service_type, minuta_name, description, minuta_text } = body;

  if (!service_type || !minuta_name || !minuta_text) {
    return res.status(400).json({ error: 'service_type, minuta_name e minuta_text são obrigatórios' });
  }

  const permitidos = placeholdersPermitidos(service_type);
  if (!permitidos) {
    return res.status(400).json({
      error: `Este tipo de documento ainda não aceita minutas de parceiro. Tipos disponíveis: ${servicosComMinutaDeParceiro().join(', ')}`,
      code: 'SERVICE_TYPE_NOT_SUPPORTED',
    });
  }

  const validacao = validarMinuta(service_type, minuta_text);
  if (!validacao.ok) {
    return res.status(400).json({
      error: `A minuta usa placeholder(s) não reconhecido(s) para este tipo de documento: ${validacao.placeholdersInvalidos.join(', ')}. Placeholders permitidos: ${permitidos.join(', ')}`,
      code: 'INVALID_PLACEHOLDERS',
      placeholdersInvalidos: validacao.placeholdersInvalidos,
      placeholdersPermitidos: permitidos,
    });
  }

  // ── Aceitação de responsabilidade legal — obrigatória, sem excepção ────
  // O frontend tem de enviar de volta a versão do disclaimer que mostrou
  // (obtida via pmDisclaimer) — se não bater com a versão actual do
  // servidor, rejeita-se: o autor tem de ver e aceitar SEMPRE o texto mais
  // recente, nunca uma versão em cache ou desactualizada do formulário.
  const { liability_accepted, liability_accepted_version } = body;
  if (liability_accepted !== true) {
    return res.status(400).json({
      error: 'É obrigatório aceitar a declaração de responsabilidade para submeter uma minuta.',
      code: 'LIABILITY_NOT_ACCEPTED',
    });
  }
  if (liability_accepted_version !== MINUTA_LIABILITY_DISCLAIMER_VERSION) {
    return res.status(400).json({
      error: 'A declaração de responsabilidade foi actualizada. Reveja e aceite novamente antes de submeter.',
      code: 'LIABILITY_VERSION_MISMATCH',
      currentVersion: MINUTA_LIABILITY_DISCLAIMER_VERSION,
      currentText: MINUTA_LIABILITY_DISCLAIMER_TEXT,
    });
  }

  let data;
  try {
    data = await insert('partner_minutas', {
      user_id: user.id,
      service_type: String(service_type).trim().slice(0, 50),
      minuta_name: String(minuta_name).trim().slice(0, 100),
      description: (description || '').trim().slice(0, 500),
      minuta_text: String(minuta_text).slice(0, 20000),
      placeholders_used: validacao.placeholdersUsados,
      status: 'pending',
      is_active: true,
      liability_accepted: true,
      liability_accepted_text: MINUTA_LIABILITY_DISCLAIMER_TEXT,
      liability_accepted_ip: clientIp(req),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({
    success: true,
    id: data.id,
    message: 'Minuta submetida! Fica visível ao público assim que for aprovada pela nossa equipa.',
  });
}

// GET — as minhas próprias submissões (qualquer estado).
async function pmMine(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const data = await restRequest(
    `partner_minutas?user_id=eq.${user.id}&order=created_at.desc&select=id,service_type,minuta_name,description,status,rejection_reason,is_active,use_count,created_at`
  );
  return res.status(200).json({ success: true, minutas: data || [] });
}

// GET — minutas aprovadas e activas de um service_type (o que o utilizador
// final vê ao escolher entre "minuta da plataforma" e minutas de
// parceiros). Público — não exige sessão, tal como a galeria de templates.
async function pmList(req, res) {
  const service = req.query?.service_type;
  if (!service) return res.status(400).json({ error: 'service_type obrigatório' });
  const data = await restRequest(
    `partner_minutas?service_type=eq.${encodeURIComponent(service)}&status=eq.approved&is_active=eq.true` +
    `&order=use_count.desc&select=id,minuta_name,description,use_count,created_at`
  );
  return res.status(200).json({ success: true, minutas: data || [] });
}

// GET — texto real de UMA minuta aprovada, para o cliente a usar na
// geração (ver assets/js/services/minutas/partnerMinutaClient.js). Regista
// o uso (contador best-effort, tal como o downloads de templates_custom —
// não é crítico o suficiente para justificar uma RPC atómica dedicada).
async function pmGet(req, res) {
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const row = await selectOne('partner_minutas', 'id', id,
    'id,service_type,minuta_name,minuta_text,status,is_active,use_count');
  if (!row || row.status !== 'approved' || !row.is_active) {
    return res.status(404).json({ error: 'Minuta não encontrada ou não disponível' });
  }
  update('partner_minutas', 'id', id, { use_count: (row.use_count || 0) + 1 }).catch(() => {});
  return res.status(200).json({
    success: true,
    id: row.id,
    service_type: row.service_type,
    minuta_name: row.minuta_name,
    minuta_text: row.minuta_text,
  });
}

// POST — autor liga/desliga a própria minuta (sem apagar).
async function pmToggleActive(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const { id, is_active } = parseBody(req);
  if (!id || typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'id e is_active (boolean) são obrigatórios' });
  }
  const owned = await selectOne('partner_minutas', 'id', id, 'user_id');
  if (!owned || owned.user_id !== user.id) {
    return res.status(403).json({ error: 'Esta minuta não lhe pertence' });
  }
  await update('partner_minutas', 'id', id, { is_active });
  return res.status(200).json({ success: true });
}

// ── Moderação (admin) ───────────────────────────────────────────────────
async function pmPending(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const data = await restRequest(
    'partner_minutas?status=eq.pending&order=created_at.asc' +
    '&select=id,user_id,service_type,minuta_name,description,minuta_text,placeholders_used,created_at'
  );
  return res.status(200).json({ success: true, minutas: data || [] });
}

async function pmApprove(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { id } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  await update('partner_minutas', 'id', id, {
    status: 'approved',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  });
  return res.status(200).json({ success: true });
}

async function pmReject(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const profile = await selectOne('profiles', 'id', user.id, 'is_admin');
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
  const { id, reason } = parseBody(req);
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  await update('partner_minutas', 'id', id, {
    status: 'rejected',
    rejection_reason: (reason || '').trim().slice(0, 500),
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  });
  return res.status(200).json({ success: true });
}

module.exports = { handlePartnerMinutas };
