const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
// api/verify-credits.js
// Verificação de saldo de créditos — tabela profiles (corrigido)

const origin = process.env.SITE_URL || 'https://mzdocs.co.mz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // Require Authorization token to prevent unauthenticated credit snooping
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Autenticação obrigatória', code: 'AUTH_REQUIRED' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { userId } = body;

  if (!userId) {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        realtime: { transport: ws },
      });

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

      // Perfil não encontrado — não criar aqui, o trigger do Supabase faz isso no registo
      // Devolver 0 para não atribuir créditos indevidos a visitantes/utilizadores anónimos
      return res.status(200).json({
        success: true,
        credits: 0,
        source: 'supabase',
        message: 'Perfil ainda não criado — aguardar trigger pós-registo',
      });

    } catch (e) {
      console.warn('[verify-credits] Supabase falhou, fallback local:', e.message);
    }
  }

  // Fallback offline
  const localCredits = parseInt(body?.localCredits) || 0;
  return res.status(200).json({
    success: true,
    credits: localCredits,
    source: 'local',
    warning: 'Modo offline',
  });
}

// maxDuration configurado em vercel.json se necessário