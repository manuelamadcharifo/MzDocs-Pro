// api/verify-credits.js
const { createClient } = require('@supabase/supabase-js');
const ErrorHandler = require('../utils/ErrorHandler');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    let body;
    try { body = JSON.parse(req.body || '{}'); }
    catch { res.status(400).json({ error: 'Body inválido' }); return; }

    const { userId } = body;
    if (!userId) { res.status(400).json({ error: 'userId obrigatório' }); return; }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      // Sem Supabase: retornar créditos gratuitos padrão
      res.status(200).json({ userId, credits: 3, freeCredits: 3, paidCredits: 0, source: 'no-db' });
      return;
    }

    try {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data, error } = await sb.from('users').select('credits').eq('id', userId).single();
      if (error?.code === 'PGRST116') {
        await sb.from('users').insert({ id: userId, credits: 3, created_at: new Date().toISOString() });
        res.status(200).json({ userId, credits: 3, source: 'new' });
        return;
      }
      res.status(200).json({ userId, credits: data?.credits || 0, source: 'db' });
    } catch (e) {
      ErrorHandler.logError('verify-credits', e);
      res.status(200).json({ userId, credits: 3, source: 'error-fallback' });
    }

  } catch (error) {
    ErrorHandler.logError('verify-credits', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};