// api/verify-credits.js
// Verificação de saldo de créditos — tabela profiles (corrigido)

const origin = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userId } = req.method === 'GET' ? req.query : req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // CORRIGIDO: usar tabela 'profiles' (não 'users')
      const { data, error } = await supabase
        .from('profiles')
        .select('credits, updated_at')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        return res.status(200).json({
          success: true,
          credits: data.credits,
          source: 'supabase',
          lastSync: data.updated_at,
        });
      }

      // Novo utilizador — criar perfil com 3 créditos
      await supabase.from('profiles').insert({
        id: userId,
        credits: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        credits: 3,
        source: 'supabase',
        message: 'Novo utilizador — 3 créditos grátis',
      });

    } catch (e) {
      console.warn('[verify-credits] Supabase falhou, fallback local:', e.message);
    }
  }

  // Fallback offline
  const localCredits = parseInt(req.body?.localCredits) || 0;
  return res.status(200).json({
    success: true,
    credits: localCredits,
    source: 'local',
    warning: 'Modo offline',
  });
}

export const config = { maxDuration: 10 };