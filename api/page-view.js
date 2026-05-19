// api/page-view.js — v8.1
// Incrementa o contador de views de uma página do blog.
// Chamado pelo script inline de cada página estática.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { slug } = req.body || {};
  if (!slug || typeof slug !== 'string' || slug.length > 100) {
    return res.status(400).json({ error: 'slug inválido' });
  }

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
    );
    await supabaseAdmin.rpc('increment_page_views', { p_slug: slug });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
