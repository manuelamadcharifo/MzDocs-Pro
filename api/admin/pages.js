// api/admin/pages.js — v8.1
// CRUD de páginas do blog. Apenas administradores autenticados.
// Métodos: GET (lista/detalhe) · POST (criar) · PUT (actualizar) · DELETE (eliminar)
// Após criar/actualizar uma página publicada, gera o ficheiro HTML estático em /pages/.

const { createClient } = require('@supabase/supabase-js');
const ws  = require('ws');

const SITE_URL = process.env.SITE_URL || 'https://mz-docs-pro.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth ────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: 'Supabase não configurado' });

  const supabase      = createClient(supabaseUrl, anonKey || serviceKey, { realtime: { transport: ws } });
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // Verificar utilizador e permissão de admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });

  try {
    // ── GET — listar todas ou buscar por slug ──────────────────────────────
    if (req.method === 'GET') {
      const { slug } = req.query;
      if (slug) {
        const { data, error } = await supabaseAdmin
          .from('blog_pages').select('*').eq('slug', slug).single();
        if (error) return res.status(404).json({ error: 'Página não encontrada' });
        return res.status(200).json(data);
      }
      const { data, error } = await supabaseAdmin
        .from('blog_pages')
        .select('id, slug, title, meta_description, published, views, ai_generated, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // ── POST — criar nova página ───────────────────────────────────────────
    if (req.method === 'POST') {
      const { slug, title, meta_description, content_html, published = false, ai_generated = false } = req.body;

      if (!slug || !title || !content_html) {
        return res.status(400).json({ error: 'slug, title e content_html são obrigatórios' });
      }

      const cleanSlug = slugify(slug);
      const { data, error } = await supabaseAdmin
        .from('blog_pages')
        .insert({ slug: cleanSlug, title, meta_description, content_html, published, ai_generated, author_id: user.id })
        .select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma página com este slug' });
        throw error;
      }

      return res.status(201).json({ success: true, page: data });
    }

    // ── PUT — actualizar página existente ─────────────────────────────────
    if (req.method === 'PUT') {
      const { id, slug, title, meta_description, content_html, published, ai_generated } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      const updates = {};
      if (slug             !== undefined) updates.slug             = slugify(slug);
      if (title            !== undefined) updates.title            = title;
      if (meta_description !== undefined) updates.meta_description = meta_description;
      if (content_html     !== undefined) updates.content_html     = content_html;
      if (published        !== undefined) updates.published        = published;
      if (ai_generated     !== undefined) updates.ai_generated     = ai_generated;

      const { data, error } = await supabaseAdmin
        .from('blog_pages').update(updates).eq('id', id).select().single();
      if (error) throw error;

      return res.status(200).json({ success: true, page: data });
    }

    // ── DELETE — eliminar página ───────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });

      const { data: page } = await supabaseAdmin
        .from('blog_pages').select('slug').eq('id', id).single();

      const { error } = await supabaseAdmin.from('blog_pages').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ success: true, deleted_slug: page?.slug });
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (err) {
    console.error('[admin/pages]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Utilidades ─────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remover acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}
