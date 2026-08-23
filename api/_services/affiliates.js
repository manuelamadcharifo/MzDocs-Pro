// api/_services/affiliates.js — PROGRAMA DE AFILIADOS (extraído de
// api/misc.js, P1-07)
// ──────────────────────────────────────────────────────────────────────────
// Namespace /api/misc?_ns=affiliate&_a=<action> (e /api/affiliate/<action>).
// Move puro do bloco handleAffiliate + todas as funções aff* — nenhuma
// lógica alterada. api/misc.js continua a ser o único entrypoint HTTP.
// ──────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const QRCode = require('qrcode');
const {
  restRequest,
  rpc,
  insert,
  update,
  selectOne,
  countRows,
  adminGetUserById,
  storageCreateSignedUrl,
} = require('../_lib/supabaseAdmin');
const { ORIGIN, parseBody, getAuthUser } = require('../_lib/httpHelpers');
const { logEvent } = require('../_lib/observability');

async function handleAffiliate(action, req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    switch (action) {
      case 'register':      return await affRegister(req, res);
      case 'dashboard':     return await affDashboard(req, res);
      case 'click':         return await affClick(req, res);
      case 'withdraw':      return await affWithdraw(req, res);
      case 'check':         return await affCheck(req, res);
      case 'ranking':       return await affRanking(req, res);
      case 'notifications': return await affNotifications(req, res);
      // v41: Kit de Marketing — materiais activos + QR pessoal do afiliado
      // (rota antes inexistente: o front-end de afiliado.html já chamava
      // /api/affiliate/materials e /api/affiliate/qrcode, mas caía sempre
      // no "default" abaixo e devolvia 404 "Acção não encontrada").
      case 'materials':     return await affMaterials(req, res);
      case 'qrcode':        return await affQrcode(req, res);
      default:              return res.status(404).json({ error: 'Acção não encontrada' });
    }
  } catch (err) {
    console.error('[handleAffiliate] crash:', action, err.message);
    // CORRIGIDO: o erro técnico cru (ex: detalhes internos do SDK Supabase)
    // chegava directamente ao utilizador final no ecrã ("Quero ser Parceiro").
    // Agora a mensagem amigável é a única coisa exposta na resposta da API —
    // o detalhe técnico continua disponível nos logs do servidor (console.error
    // acima) para diagnóstico, sem nunca aparecer na interface do utilizador.
    return res.status(500).json({ error: 'Não foi possível concluir o registo. Por favor, tente novamente dentro de alguns instantes.' });
  }
}

async function affRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sessão inválida' });
    const body = parseBody(req);
    const segment     = ['papelaria','cyber','universidade','explicacao','digitador','individual'].includes(body.segment) ? body.segment : 'individual';
    const businessName = (body.business_name || '').trim().slice(0, 100) || null;
    const city         = (body.city || '').trim().slice(0, 60) || null;
    const mpesaPhone   = (body.mpesa_phone || '').replace(/\s/g, '').slice(0, 20) || null;

    let profile;
    try {
      profile = await selectOne('profiles', 'id', user.id, '*');
    } catch (profileErr) {
      return res.status(500).json({ error: 'Erro ao ler perfil: ' + profileErr.message });
    }
    if (!profile) {
      const authUser = await adminGetUserById(user.id).catch(() => null);
      const meta = authUser?.user_metadata || {};
      try {
        await insert('profiles', {
          id: user.id, email: user.email || '', full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Utilizador',
          phone: meta.phone || null, credits: 0, plan: 'free', is_admin: false, is_temp: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      } catch (insertErr) {
        return res.status(500).json({ error: 'Não foi possível criar o perfil: ' + insertErr.message });
      }
      const newProfile = await selectOne('profiles', 'id', user.id, '*');
      if (!newProfile) return res.status(500).json({ error: 'Perfil criado mas não encontrado. Tente de novo.' });
      return continueRegister(res, user, newProfile, { segment, businessName, city, mpesaPhone });
    }
    if (profile.ref_code) {
      // Já registado — actualizar segmento/info extra se fornecido
      const updates = { aff_segment: segment };
      if (businessName) updates.aff_business_name = businessName;
      if (city) updates.aff_city = city;
      if (mpesaPhone) updates.aff_phone_mpesa = mpesaPhone;
      await update('profiles', 'id', user.id, updates);
      return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });
    }
    return continueRegister(res, user, profile, { segment, businessName, city, mpesaPhone });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
}

async function continueRegister(res, user, profile, extra = {}) {
  try {
    const namePart = (profile.full_name || user.email || 'MZD').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const ref_code = namePart + Math.floor(10000 + Math.random() * 90000);
    const existing = await selectOne('profiles', 'ref_code', ref_code, 'id');
    const finalCode = existing ? ref_code + Math.floor(Math.random() * 9) : ref_code;
    const updates = {
      ref_code: finalCode,
      is_affiliate: false,
      aff_segment:  extra.segment || 'individual',
      aff_joined_at: new Date().toISOString(),
    };
    if (extra.businessName) updates.aff_business_name = extra.businessName;
    if (extra.city)         updates.aff_city          = extra.city;
    if (extra.mpesaPhone)   updates.aff_phone_mpesa   = extra.mpesaPhone;
    try {
      await update('profiles', 'id', user.id, updates);
    } catch (updateErr) {
      console.error('[affRegister] erro ao actualizar perfil:', updateErr.message, updateErr.code);
      if (updateErr.message.includes('column') || updateErr.code === '42703')
        return res.status(500).json({ error: 'Não foi possível concluir o registo. A equipa já foi notificada.', sql_needed: true });
      return res.status(500).json({ error: 'Não foi possível guardar o seu registo. Por favor, tente novamente.' });
    }

    // NOVO (Fase 5): avisa o admin de uma nova candidatura a afiliado —
    // best-effort, nunca deve fazer a candidatura falhar.
    insert('admin_notifications', {
      type:    'affiliate_application',
      title:   '🤝 Nova candidatura a afiliado',
      message: `${profile.full_name || user.email || 'Utilizador'} candidatou-se (código ${finalCode}). Aguarda aprovação.`,
      link:    '#affiliates',
    }).catch(e => console.warn('[affRegister] admin_notifications insert falhou:', e.message));

    return res.status(200).json({ success: true, ref_code: finalCode, is_affiliate: false, message: 'Candidatura enviada! Aguarde aprovação em 24-48h.' });
  } catch (err) {
    console.error('[affRegister] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível concluir o registo. Por favor, tente novamente dentro de alguns instantes.' });
  }
}

async function affDashboard(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const profile = await selectOne('profiles', 'id', user.id,
    'ref_code,is_affiliate,aff_balance,aff_total_earned,aff_clicks,aff_conversions,full_name,phone,aff_segment,aff_tier,aff_business_name,aff_city,aff_phone_mpesa,aff_is_blocked,aff_block_reason');
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  const commissions = await restRequest(
    `affiliate_commissions?affiliate_id=eq.${user.id}&order=created_at.desc&limit=20` +
    `&select=id,package_id,sale_amount,commission_mzn,status,created_at`
  );

  let withdrawals = await restRequest(
    `affiliate_withdrawals?affiliate_id=eq.${user.id}&order=created_at.desc&limit=10` +
    `&select=id,amount,mpesa_phone,status,created_at,processed_at,receipt_number,receipt_screenshot_path`
  );

  // SEGURANÇA (auditoria Jul/2026): o bucket "affiliate-receipts" é privado
  // — gera-se aqui um URL assinado e temporário (5 min) só para os
  // levantamentos deste afiliado autenticado, em vez de expor um URL
  // público permanente.
  withdrawals = await Promise.all(
    (withdrawals || []).map(async (w) => ({
      ...w,
      receipt_screenshot_url: w.receipt_screenshot_path
        ? await storageCreateSignedUrl('affiliate-receipts', w.receipt_screenshot_path, 300)
        : null,
    }))
  );

  // NOVO: "Meus Referidos" — lista de quem se registou com o link deste
  // afiliado (profiles.referred_by), não só quem já gerou comissão. Antes
  // só se via o total agregado de cliques/conversões — agora dá para ver
  // exactamente QUEM entrou pelo link e se já é cliente pagante ou não.
  const referralsRaw = await restRequest(
    `profiles?referred_by=eq.${user.id}&order=created_at.desc&limit=200` +
    `&select=id,full_name,phone,created_at,account_type`
  );

  let referrals = [];
  let payingReferrals = 0;
  if (referralsRaw && referralsRaw.length) {
    const refIds = referralsRaw.map(r => r.id);
    const idsList = refIds.map(id => encodeURIComponent(id)).join(',');
    const commByReferred = await restRequest(
      `affiliate_commissions?affiliate_id=eq.${user.id}&referred_user_id=in.(${idsList})` +
      `&select=referred_user_id,commission_mzn,status`
    );

    const commMap = {};
    (commByReferred || []).forEach(c => {
      const m = commMap[c.referred_user_id] || { count: 0, total: 0, paid: false };
      m.count += 1;
      if (c.status === 'approved' || c.status === 'paid') { m.total += c.commission_mzn || 0; m.paid = true; }
      commMap[c.referred_user_id] = m;
    });

    referrals = referralsRaw.map(r => {
      const c = commMap[r.id];
      if (c?.paid) payingReferrals++;
      // Privacidade: primeiro nome + inicial do apelido (mesmo padrão já
      // usado no ranking de afiliados), nunca o telefone completo do
      // referido a outro utilizador.
      const parts = (r.full_name || '').trim().split(/\s+/).filter(Boolean);
      const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] || 'Utilizador');
      return {
        id: r.id,
        name: displayName,
        joined_at: r.created_at,
        account_type: r.account_type || 'normal',
        purchased: !!c?.paid,
        commissions_count: c?.count || 0,
        commission_total: c?.total || 0,
      };
    });
  }

  // Ranking do mês actual
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const rankingRaw = await restRequest(
    `affiliate_ranking?month=eq.${currentMonth}&order=rank_position.asc&limit=10` +
    `&select=affiliate_id,rank_position,conversions,commission_mzn,tier`
  );

  // Enriquecer ranking com nomes
  let ranking = [];
  if (rankingRaw && rankingRaw.length > 0) {
    const ids = rankingRaw.map(r => r.affiliate_id);
    const idsList = ids.map(id => encodeURIComponent(id)).join(',');
    const pnames = await restRequest(`profiles?id=in.(${idsList})&select=id,full_name,aff_segment,ref_code`);
    const nameMap = {};
    (pnames || []).forEach(p => { nameMap[p.id] = p; });
    ranking = rankingRaw.map(r => ({
      ...r,
      name: nameMap[r.affiliate_id]?.full_name?.split(' ')[0] + ' ' + (nameMap[r.affiliate_id]?.full_name?.split(' ')[1]?.[0] || '') + '.' || 'Parceiro',
      segment: nameMap[r.affiliate_id]?.aff_segment || 'individual',
      ref_code: nameMap[r.affiliate_id]?.ref_code || '',
    }));
  }

  // Notificações não lidas
  const notifs = await restRequest(
    `affiliate_notifications?affiliate_id=eq.${user.id}&is_read=eq.false&order=created_at.desc&limit=5` +
    `&select=id,type,title,body,created_at`
  );
  const unreadCount = await countRows('affiliate_notifications', `?affiliate_id=eq.${user.id}&is_read=eq.false`);

  const settingsKeys = ['aff_min_withdraw', 'aff_rate_basico', 'aff_rate_pro', 'aff_rate_empresa', 'aff_bonus_papelaria', 'aff_bonus_cyber', 'aff_bonus_universidade']
    .map(k => encodeURIComponent(k)).join(',');
  const settings = await restRequest(`system_settings?key=in.(${settingsKeys})&select=key,value`);
  const cfg = {};
  (settings || []).forEach(s => { cfg[s.key] = s.value; });

  return res.status(200).json({
    success: true,
    profile: {
      ref_code:     profile.ref_code,
      is_affiliate: profile.is_affiliate,
      is_blocked:   profile.aff_is_blocked || false,
      block_reason: profile.aff_block_reason || null,
      balance:      profile.aff_balance || 0,
      total_earned: profile.aff_total_earned || 0,
      clicks:       profile.aff_clicks || 0,
      conversions:  profile.aff_conversions || 0,
      name:         profile.full_name || 'Parceiro',
      mpesa_phone:  profile.aff_phone_mpesa || profile.phone || '',
      segment:      profile.aff_segment || 'individual',
      tier:         profile.aff_tier || 'bronze',
      link:         `${SITE_URL}/?ref=${profile.ref_code}`,
      conversion_rate: profile.aff_clicks > 0 ? Math.round((profile.aff_conversions / profile.aff_clicks) * 100) : 0,
    },
    commissions:  commissions || [],
    withdrawals:  withdrawals || [],
    referrals,
    referrals_summary: {
      total:  referralsRaw?.length || 0,
      paying: payingReferrals,
    },
    ranking,
    notifications: notifs || [],
    unread_notifications: unreadCount || 0,
    config: cfg,
  });
}

// v41: GET /api/affiliate/materials — lista os materiais de marketing
// activos (panfletos/banners/etc.) enviados pelo admin. Cada peça é
// devolvida com a imagem (base64) ou link externo e as zonas de QR/texto
// já definidas — a composição final (QR pessoal colado por cima) acontece
// no browser do afiliado, nunca aqui no servidor.
async function affMaterials(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const profile = await selectOne('profiles', 'id', user.id, 'ref_code');
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  let data;
  try {
    data = await restRequest(
      'marketing_materials?is_active=eq.true&order=sort_order.asc,created_at.desc' +
      '&select=id,title,description,category,media_type,file_data,external_url,width_px,height_px,qr_zone,text_zone,sort_order,created_at'
    );
  } catch (error) {
    console.error('[affMaterials]', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar os materiais de marketing.' });
  }

  return res.status(200).json({ success: true, materials: data || [] });
}

// v41: GET /api/affiliate/qrcode — gera (em memória, sem gravar em disco)
// o PNG do QR code pessoal do afiliado, apontando para o seu link de
// referência (?ref=CODIGO). Usado para compor os materiais de marketing
// no browser do afiliado (canvas) com o SEU QR colado por cima.
async function affQrcode(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const profile = await selectOne('profiles', 'id', user.id, 'ref_code,full_name');
  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  try {
    const link = `${SITE_URL}/?ref=${profile.ref_code}`;
    const qr_png = await QRCode.toDataURL(link, { width: 500, margin: 2, color: { dark: '#07101F', light: '#FFFFFF' } });
    return res.status(200).json({
      success: true,
      qr_png,
      ref_code: profile.ref_code,
      full_name: profile.full_name || '',
      link,
    });
  } catch (err) {
    console.error('[affQrcode]', err.message);
    return res.status(500).json({ error: 'Não foi possível gerar o seu QR code.' });
  }
}

async function affClick(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body    = parseBody(req);
  const refCode = (body.ref_code || '').trim().toUpperCase();
  const page    = (body.page || '/').slice(0, 200);
  if (!refCode) return res.status(400).json({ error: 'ref_code em falta' });
  const ip     = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip + refCode).digest('hex').slice(0, 16);
  // Antifraude: verificar burst de cliques antes de registar
  const sinceIso = new Date(Date.now() - 3600000).toISOString();
  const recentClicks = await restRequest(
    `affiliate_clicks?ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`
  );
  const clickCount = recentClicks?.length || 0;
  if (clickCount >= 30) {
    // Burst detectado — registar fraude mas retornar ok silenciosamente
    const aff = await selectOne('profiles', 'ref_code', refCode, 'id');
    if (aff) {
      try {
        await insert('affiliate_fraud_flags', {
          affiliate_id: aff.id, flag_type: 'ip_burst',
          description: 'IP com ' + (clickCount+1) + ' cliques na última hora', severity: 'critical',
        });
      } catch (_) { /* registo de fraude é best-effort — não deve bloquear a resposta ao clique */ }
    }
    return res.status(200).json({ ok: true });
  }
  try {
    await rpc('register_affiliate_click', { p_ref_code: refCode, p_ip_hash: ipHash, p_page: page });
  } catch (error) {
    console.error('[affClick] error:', error.message);
  }
  return res.status(200).json({ ok: true });
}

async function affWithdraw(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  const body   = parseBody(req);
  const phone  = (body.phone || '').replace(/\s/g, '');
  const amount = parseInt(body.amount || 0);
  if (!phone || !/^(\+?258)?[0-9]{9}$/.test(phone.replace('+258', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });
  const profile = await selectOne('profiles', 'id', user.id, 'aff_balance,is_affiliate,aff_is_blocked,aff_tier');
  if (!profile?.is_affiliate) return res.status(403).json({ error: 'Apenas afiliados aprovados podem levantar' });
  if (profile.aff_is_blocked) return res.status(403).json({ error: 'Conta suspensa. Contacte o suporte.' });
  const minSetting = await selectOne('system_settings', 'key', 'aff_min_withdraw', 'value');
  let minWithdraw = parseInt(minSetting?.value || '200');
  // Diamante tem mínimo reduzido
  if (profile.aff_tier === 'diamante') minWithdraw = Math.max(50, Math.floor(minWithdraw * 0.5));
  if (amount < minWithdraw) return res.status(400).json({ error: `Valor mínimo: ${minWithdraw} MZN` });
  if (amount > (profile.aff_balance || 0)) return res.status(400).json({ error: 'Saldo insuficiente' });
  // Verificar levantamento pendente em duplicado
  const pendingW = await restRequest(`affiliate_withdrawals?affiliate_id=eq.${user.id}&status=eq.pending&select=id&limit=1`);
  if (pendingW && pendingW.length > 0)
    return res.status(400).json({ error: 'Já tem um levantamento pendente. Aguarde a conclusão.' });
  try {
    await insert('affiliate_withdrawals', { affiliate_id: user.id, amount, mpesa_phone: phone, status: 'pending' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  await update('profiles', 'id', user.id, { aff_balance: (profile.aff_balance || 0) - amount });
  // Notificação
  try {
    await insert('affiliate_notifications', {
      affiliate_id: user.id, type: 'withdrawal',
      title: '💸 Pedido de Levantamento',
      body: `Pedido de ${amount} MZN submetido. Processado em até 48h via M-Pesa.`,
    });
  } catch (_) { /* notificação é best-effort */ }

  // NOVO (Fase 5): avisa o admin de que há um levantamento à espera de
  // processamento — o afiliado já recebeu a confirmação acima; isto é só
  // para o admin saber sem ter de ir verificar a secção manualmente.
  insert('admin_notifications', {
    type:    'withdrawal_request',
    title:   '💸 Pedido de levantamento de afiliado',
    message: `${amount} MZN para ${phone}. Processar em até 48h.`,
    link:    '#affiliates',
  }).catch(e => console.warn('[affWithdraw] admin_notifications insert falhou:', e.message));
  return res.status(200).json({ success: true, message: `Pedido de ${amount} MZN submetido. Processado em até 48 horas via M-Pesa.` });
}

async function affCheck(req, res) {
  const refCode = req.query?.ref || '';
  if (!refCode) return res.status(400).json({ error: 'ref em falta' });
  const data = await selectOne('profiles', 'ref_code', refCode, 'full_name,is_affiliate,ref_code,aff_segment');
  if (!data) return res.status(404).json({ error: 'Link inválido' });
  return res.status(200).json({
    valid: true, is_affiliate: data.is_affiliate,
    name: data.full_name || 'Parceiro MzDocs',
    segment: data.aff_segment || 'individual',
  });
}

async function affRanking(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const month = req.query?.month || new Date().toISOString().slice(0, 7);
  const ranking = await restRequest(
    `affiliate_ranking?month=eq.${month}&order=rank_position.asc&limit=20` +
    `&select=affiliate_id,rank_position,conversions,revenue_mzn,commission_mzn,tier`
  );
  if (!ranking || !ranking.length) return res.status(200).json({ success: true, ranking: [], month });
  const ids = ranking.map(r => r.affiliate_id);
  const idsList = ids.map(id => encodeURIComponent(id)).join(',');
  const profiles = await restRequest(`profiles?id=in.(${idsList})&select=id,full_name,aff_segment`);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return res.status(200).json({
    success: true, month,
    ranking: ranking.map(r => ({
      ...r,
      name: pm[r.affiliate_id]?.full_name?.split(' ').slice(0,2).join(' ') || 'Parceiro',
      segment: pm[r.affiliate_id]?.aff_segment || 'individual',
    })),
  });
}

async function affNotifications(req, res) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  if (req.method === 'POST') {
    // Marcar como lidas
    await update('affiliate_notifications', 'affiliate_id', user.id, { is_read: true }, '&is_read=eq.false');
    return res.status(200).json({ success: true });
  }
  const data = await restRequest(
    `affiliate_notifications?affiliate_id=eq.${user.id}&order=created_at.desc&limit=20` +
    `&select=id,type,title,body,is_read,created_at`
  );
  return res.status(200).json({ success: true, notifications: data || [] });
}
// ════════════════════════════════════════════════════════════════════════════
// OCR-ANALYZE — proxy IA (preservado integralmente da v1.0)
// ════════════════════════════════════════════════════════════════════════════

module.exports = { handleAffiliate };
