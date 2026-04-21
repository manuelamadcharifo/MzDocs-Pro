// api/verify-credits.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let body;
  try { body = JSON.parse(req.body || '{}'); } catch { return res.status(400).json({error:'Body inválido'}); }

  const { userId } = body;
  if (!userId) return res.status(400).json({error:'userId obrigatório'});

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    // Sem Supabase: retornar créditos gratuitos padrão
    return res.status(200).json({ userId, credits:3, freeCredits:3, paidCredits:0 });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await sb.from('users').select('credits').eq('id', userId).single();
    if (error?.code === 'PGRST116') {
      await sb.from('users').insert({ id: userId, credits: 3 });
      return res.status(200).json({ userId, credits:3, source:'new' });
    }
    return res.status(200).json({ userId, credits: data?.credits || 0, source:'db' });
  } catch (e) {
    return res.status(200).json({ userId, credits:3, source:'fallback' });
  }
};