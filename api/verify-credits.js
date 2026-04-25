// api/verify-credits.js
// Verificação de saldo de créditos — Supabase + fallback

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).end();
  }

  const { userId } = req.method === 'GET' 
    ? req.query 
    : req.body;

  if (!userId) {
    return res.status(400).set(corsHeaders).json({
      error: 'userId é obrigatório',
    });
  }

  // Tenta Supabase se configurado
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from('users')
        .select('credits, last_sync')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        return res.status(200).set(corsHeaders).json({
          success: true,
          credits: data.credits,
          source: 'supabase',
          lastSync: data.last_sync,
        });
      }

      // Utilizador novo — cria registo
      await supabase.from('users').insert({
        id: userId,
        credits: 3, // Créditos iniciais grátis
        created_at: new Date().toISOString(),
      });

      return res.status(200).set(corsHeaders).json({
        success: true,
        credits: 3,
        source: 'supabase',
        message: 'Novo utilizador — 3 créditos grátis',
      });

    } catch (e) {
      console.warn('Supabase falhou, usando fallback:', e.message);
    }
  }

  // Fallback — responde com os créditos locais enviados pelo frontend
  const localCredits = parseInt(req.body?.localCredits) || 0;

  return res.status(200).set(corsHeaders).json({
    success: true,
    credits: localCredits,
    source: 'local',
    warning: 'Modo offline — sincronize quando possível',
  });
}

export const config = { maxDuration: 10 };