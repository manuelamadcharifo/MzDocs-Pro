// api/affiliate.js — Sistema de Afiliados MzDocs Pro
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL        = (process.env.SITE_URL || 'https://mzdocs.co.mz').replace(/\/$/, '');
const ORIGIN          = SITE_URL;

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return {}; }
}

async function getUser(supabase, req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
  return user || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url    = req.url || '';
  const action = url.split('/api/affiliate/')[1]?.split('?')[0] || '';

  const supabase = getClient();

  switch (action) {
    case 'register':   return handleRegister(req, res, supabase);
    case 'dashboard':  return handleDashboard(req, res, supabase);
    case 'click':      return handleClick(req, res, supabase);
    case 'withdraw':   return handleWithdraw(req, res, supabase);
    case 'check':      return handleCheck(req, res, supabase);
    default:           return res.status(404).json({ error: 'Acção não encontrada' });
  }
}

// ── Pedir para ser afiliado ────────────────────────────────────────────────
async function handleRegister(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase
    .from('profiles').select('ref_code, is_affiliate, full_name').eq('id', user.id).single();

  if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
  if (profile.ref_code) return res.status(200).json({ success: true, ref_code: profile.ref_code, is_affiliate: profile.is_affiliate });

  // Gerar código único
  const { data: codeData } = await supabase.rpc('generate_ref_code');
  const ref_code = codeData;

  await supabase.from('profiles').update({ ref_code, is_affiliate: false }).eq('id', user.id);

  return res.status(200).json({
    success: true,
    ref_code,
    is_affiliate: false,
    message: 'Código criado! Aguarde aprovação para começar a ganhar comissões.',
  });
}

// ── Dashboard do afiliado ──────────────────────────────────────────────────
async function handleDashboard(req, res, supabase) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('ref_code, is_affiliate, aff_balance, aff_total_earned, aff_clicks, aff_conversions, full_name, phone')
    .eq('id', user.id).single();

  if (!profile?.ref_code) return res.status(404).json({ error: 'Não é afiliado' });

  // Comissões recentes (últimas 20)
  const { data: commissions } = await supabase
    .from('affiliate_commissions')
    .select('id, package_id, sale_amount, commission_mzn, status, created_at')
    .eq('affiliate_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Levantamentos
  const { data: withdrawals } = await supabase
    .from('affiliate_withdrawals')
    .select('id, amount, mpesa_phone, status, created_at, processed_at')
    .eq('affiliate_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Cliques dos últimos 30 dias por dia
  const since30 = new Date(); since30.setDate(since30.getDate() - 30);
  const { data: clicksRaw } = await supabase
    .from('affiliate_clicks')
    .select('created_at, converted')
    .eq('affiliate_id', user.id)
    .gte('created_at', since30.toISOString());

  const clicksByDay = {};
  (clicksRaw || []).forEach(c => {
    const day = c.created_at.split('T')[0];
    if (!clicksByDay[day]) clicksByDay[day] = { clicks: 0, conversions: 0 };
    clicksByDay[day].clicks++;
    if (c.converted) clicksByDay[day].conversions++;
  });

  // Configurações (taxa mínima levantamento)
  const { data: settings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['aff_min_withdraw', 'aff_rate_basico', 'aff_rate_pro', 'aff_rate_empresa']);

  const cfg = {};
  (settings || []).forEach(s => { cfg[s.key] = s.value; });

  return res.status(200).json({
    success: true,
    profile: {
      ref_code:        profile.ref_code,
      is_affiliate:    profile.is_affiliate,
      balance:         profile.aff_balance || 0,
      total_earned:    profile.aff_total_earned || 0,
      clicks:          profile.aff_clicks || 0,
      conversions:     profile.aff_conversions || 0,
      link:            `${SITE_URL}/?ref=${profile.ref_code}`,
      conversion_rate: profile.aff_clicks > 0
        ? Math.round((profile.aff_conversions / profile.aff_clicks) * 100)
        : 0,
    },
    commissions:   commissions || [],
    withdrawals:   withdrawals || [],
    clicksByDay,
    config: cfg,
  });
}

// ── Registar clique (chamado ao aterrar no site com ?ref=) ─────────────────
async function handleClick(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const body    = parseBody(req);
  const refCode = body.ref_code;
  const page    = (body.page || '/').slice(0, 200);
  if (!refCode) return res.status(400).json({ error: 'ref_code em falta' });

  // Hash do IP para deduplicação sem guardar dados pessoais
  const ip      = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const ipHash  = require('crypto').createHash('sha256').update(ip + refCode).digest('hex').slice(0, 16);

  await supabase.rpc('register_affiliate_click', {
    p_ref_code: refCode,
    p_ip_hash:  ipHash,
    p_page:     page,
  }).catch(() => {});

  return res.status(200).json({ ok: true });
}

// ── Pedir levantamento ─────────────────────────────────────────────────────
async function handleWithdraw(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await getUser(supabase, req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });

  const body  = parseBody(req);
  const phone = (body.phone || '').replace(/\s/g, '');
  const amount = parseInt(body.amount || 0);

  if (!phone || !/^\+?258[0-9]{9}$/.test(phone.replace('+', '')))
    return res.status(400).json({ error: 'Número M-Pesa inválido' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('aff_balance, is_affiliate, ref_code')
    .eq('id', user.id).single();

  if (!profile?.is_affiliate) return res.status(403).json({ error: 'Não é afiliado aprovado' });

  const { data: minSetting } = await supabase
    .from('system_settings').select('value').eq('key', 'aff_min_withdraw').single();
  const minWithdraw = parseInt(minSetting?.value || '200');

  if (amount < minWithdraw)
    return res.status(400).json({ error: `Valor mínimo de levantamento: ${minWithdraw} MZN` });
  if (amount > (profile.aff_balance || 0))
    return res.status(400).json({ error: 'Saldo insuficiente' });

  // Criar pedido de levantamento
  const { error } = await supabase.from('affiliate_withdrawals').insert({
    affiliate_id: user.id,
    amount,
    mpesa_phone: phone,
    status: 'pending',
  });
  if (error) throw error;

  // Debitar saldo provisoriamente
  await supabase.from('profiles')
    .update({ aff_balance: (profile.aff_balance - amount) })
    .eq('id', user.id);

  return res.status(200).json({
    success: true,
    message: `Pedido de ${amount} MZN submetido. Será processado em até 48 horas via M-Pesa.`,
  });
}

// ── Verificar ref_code e obter dados do afiliado (público) ─────────────────
async function handleCheck(req, res, supabase) {
  const refCode = req.query?.ref || '';
  if (!refCode) return res.status(400).json({ error: 'ref em falta' });

  const { data } = await supabase
    .from('profiles')
    .select('full_name, is_affiliate, ref_code')
    .eq('ref_code', refCode)
    .single();

  if (!data) return res.status(404).json({ error: 'Link inválido' });

  return res.status(200).json({
    valid:        true,
    is_affiliate: data.is_affiliate,
    name:         data.full_name || 'Parceiro MzDocs',
  });
}
