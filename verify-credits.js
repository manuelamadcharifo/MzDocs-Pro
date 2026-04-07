// ══════════════════════════════════════════════════════════
//  netlify/functions/verify-credits.js
//  Verificação e sincronização de créditos do utilizador
//  Em produção: substituir localStorage por base de dados
// ══════════════════════════════════════════════════════════

const FREE_CREDITS_MONTHLY = 3;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido' }) }; }

  const { userId } = body;
  if (!userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId obrigatório' }) };
  }

  // ── PRODUÇÃO: Consultar base de dados ────────────────────
  // Descomente e adapte para Supabase, PlanetScale, etc.
  //
  // const { createClient } = require('@supabase/supabase-js');
  // const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  //
  // const { data: user } = await supabase
  //   .from('users')
  //   .select('paid_credits, free_used_this_month, last_reset_month')
  //   .eq('user_id', userId)
  //   .single();
  //
  // const currentMonth = new Date().toISOString().slice(0,7);
  // const freeUsed = user?.last_reset_month === currentMonth ? (user?.free_used_this_month || 0) : 0;
  // const freeLeft = Math.max(0, FREE_CREDITS_MONTHLY - freeUsed);
  // const paidCredits = user?.paid_credits || 0;
  // const total = freeLeft + paidCredits;

  // ── DEMO: Retornar créditos padrão (sem BD) ──────────────
  // Em produção, remova este bloco e use o Supabase acima
  const currentMonth = new Date().toISOString().slice(0, 7);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      userId,
      credits: FREE_CREDITS_MONTHLY, // demo — substituir com BD
      freeCredits: FREE_CREDITS_MONTHLY,
      paidCredits: 0,
      month: currentMonth,
      message: 'OK',
    }),
  };
};
