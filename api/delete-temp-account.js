// api/delete-temp-account.js — v10.0 (LPD/RGPD: direito ao esquecimento p/ TODAS as contas)
// ALTERAÇÕES v10.0:
//  1. NOVO: este endpoint servia só contas 'avulso' (com regras de crédito
//     zero + janela de graça). Contas normais só podiam pedir eliminação
//     manualmente por WhatsApp (perfil.html), o que não cumpre o direito ao
//     esquecimento como um processo self-service. Agora, quando o utilizador
//     autenticado tem account_type 'normal' (ou qualquer valor que não seja
//     'avulso'), este mesmo endpoint aceita { confirmDeletion: true } no
//     corpo do pedido e executa a eliminação definitiva de imediato — sem
//     mudar nenhuma regra já existente para contas avulso (inalteradas).
//  2. NOVO: rate limiting (o endpoint não tinha nenhum).
//  3. NOVO: transactions.user_id é anonimizado (SET NULL) em vez de apagado
//     — os registos financeiros têm de ser preservados para efeitos fiscais/
//     contabilísticos (obrigação legal), mas deixam de estar associados à
//     pessoa. documents é apagado via CASCADE já existente no schema
//     (documents.user_id REFERENCES profiles(id) ON DELETE CASCADE).
//  4. Lógica de negócio da v9.0 para contas 'avulso' 100% preservada.

const {
  getUserFromToken,
  selectOne,
  restRequest,
  adminDeleteUser,
} = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');

const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim() || 'unknown';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase não configurado no servidor' });
  }

  // NOVO: protecção de rate limit — eliminação de conta é uma acção rara e
  // sensível, 5 tentativas/hora por IP é mais do que suficiente para uso legítimo.
  const ip = getClientIp(req);
  const rlOk = await checkRateLimit('delete-account', ip, { limit: 5, windowSec: 3600 });
  if (!rlOk) return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente mais tarde.' });

  try {
    // 1. Verificar token e obter utilizador
    const { user, error: authErr } = await getUserFromToken(token);
    if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

    // 2. Confirmar tipo de conta
    const profile = await selectOne(
      'profiles', 'id', user.id,
      'account_type,credits,last_credit_used_at,created_at'
    );

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    // NOVO (LPD/RGPD — direito ao esquecimento): contas normais podem pedir
    // eliminação definitiva e imediata a qualquer momento, desde que o
    // pedido confirme explicitamente a intenção (evita eliminação acidental
    // por replay de pedido ou duplo clique). Isto é independente das regras
    // de conta 'avulso' abaixo, que continuam inalteradas.
    if (profile.account_type !== 'avulso') {
      const body = parseJsonBody(req);
      if (!body || body.confirmDeletion !== true) {
        return res.status(400).json({
          deleted: false,
          reason: 'confirmation_required',
          message: 'Para eliminar definitivamente a sua conta, reenvie o pedido com { "confirmDeletion": true }.',
        });
      }
      return handleFullAccountErasure(res, user.id);
    }

    if (profile.credits > 0) {
      return res.status(200).json({ deleted: false, reason: 'has_credits', credits: profile.credits });
    }

    // Verificar janelas de graça
    const now       = Date.now();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();

    const zeroCreditsExpired = profile.last_credit_used_at && profile.last_credit_used_at < cutoff24h;
    const createdExpired     = profile.created_at && profile.created_at < cutoff7d;

    if (!zeroCreditsExpired && !createdExpired) {
      const graceEnds = profile.last_credit_used_at
        ? new Date(new Date(profile.last_credit_used_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      return res.status(200).json({
        deleted:           false,
        reason:            'within_grace_period',
        grace_period_ends: graceEnds,
      });
    }

    // 3. Eliminar conta via Auth Admin API
    const deleted = await adminDeleteUser(user.id);
    if (!deleted) {
      // Fallback: eliminar directamente o profile
      try {
        await restRequest(`profiles?id=eq.${user.id}`, { method: 'DELETE' });
      } catch (profileDelErr) {
        return res.status(500).json({ error: 'Falha ao eliminar conta: ' + profileDelErr.message });
      }
    }

    console.log('[delete-temp-account] Conta avulso ' + user.id.slice(0, 8) + '*** eliminada');
    return res.status(200).json({ deleted: true, deleted_at: new Date().toISOString() });

  } catch (err) {
    console.error('[delete-temp-account] Excepção:', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};

function parseJsonBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAÇÃO DEFINITIVA — contas normais (direito ao esquecimento)
// ─────────────────────────────────────────────────────────────────────────────
// Ordem importa: transactions.user_id NÃO tem ON DELETE CASCADE (schema.sql —
// é FK simples para profiles(id), de propósito, porque registos financeiros
// têm de sobreviver por obrigação legal/fiscal). Por isso anonimiza-se
// transactions primeiro (SET user_id = NULL, mantém valor/referência/data
// para contabilidade), só depois se apaga o utilizador. documents.user_id
// TEM ON DELETE CASCADE (confirmado em schema.sql), por isso é apagado
// automaticamente quando o profile/auth.user for eliminado — não precisa de
// passo manual aqui.
async function handleFullAccountErasure(res, userId) {
  try {
    // 1. Anonimizar transacções (preserva registo fiscal/contabilístico,
    //    remove a ligação à pessoa)
    try {
      await restRequest(`transactions?user_id=eq.${userId}`, {
        method: 'PATCH',
        body:   { user_id: null },
        prefer: 'return=minimal',
      });
    } catch (txErr) {
      console.warn('[delete-temp-account] Falha ao anonimizar transactions:', txErr.message);
      // não bloqueia a eliminação por causa disto — regista e continua
    }

    // 2. Eliminar utilizador via Auth Admin API — cascata para profiles e,
    //    a partir daí, para documents (ambos ON DELETE CASCADE no schema).
    const deleted = await adminDeleteUser(userId);
    if (!deleted) {
      // Fallback: eliminar directamente o profile se a Auth Admin API falhar
      // (ex.: utilizador já não existe em auth.users mas o profile ficou órfão)
      try {
        await restRequest(`profiles?id=eq.${userId}`, { method: 'DELETE' });
      } catch (profileDelErr) {
        return res.status(500).json({ error: 'Falha ao eliminar conta: ' + profileDelErr.message });
      }
    }

    console.log('[delete-temp-account] Conta normal ' + userId.slice(0, 8) + '*** eliminada (pedido do utilizador — direito ao esquecimento)');
    return res.status(200).json({ deleted: true, deleted_at: new Date().toISOString() });
  } catch (err) {
    console.error('[delete-temp-account] Excepção na eliminação definitiva:', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}
