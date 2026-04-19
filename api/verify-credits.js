const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return res.status(200).set(headers).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).set(headers).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (!body) {
    try {
      body = JSON.parse(req);
    } catch {
      return res.status(400).set(headers).json({ error: 'Invalid body' });
    }
  }

  const { userId } = body || {};
  if (!userId) {
    return res.status(400).set(headers).json({ error: 'userId required' });
  }

  // If Supabase not configured, return default free credits
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(200).set(headers).json({
      userId,
      credits: 3,
      freeCredits: 3,
      paidCredits: 0,
      source: 'no-db'
    });
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data, error } = await sb
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single();

    if (error?.code === 'PGRST116') {
      // User doesn't exist, create with 3 free credits
      await sb.from('users').insert({
        id: userId,
        credits: 3,
        created_at: new Date().toISOString()
      });
      return res.status(200).set(headers).json({
        userId,
        credits: 3,
        source: 'new'
      });
    }

    return res.status(200).set(headers).json({
      userId,
      credits: data?.credits || 0,
      source: 'db'
    });

  } catch (error) {
    console.error('[verify-credits] Error:', error);
    return res.status(200).set(headers).json({
      userId,
      credits: 3,
      source: 'error-fallback'
    });
  }
};
