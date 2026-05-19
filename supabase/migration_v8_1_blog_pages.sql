-- ============================================================
-- MIGRAÇÃO v8.1 — Blog / Páginas Estáticas
-- Execute no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_pages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL UNIQUE,          -- ex: como-fazer-cv-mocambique
  title           TEXT        NOT NULL,
  meta_description TEXT       NOT NULL DEFAULT '',
  content_html    TEXT        NOT NULL DEFAULT '',
  published       BOOLEAN     NOT NULL DEFAULT FALSE,
  author_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  views           INTEGER     NOT NULL DEFAULT 0,
  ai_generated    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_blog_pages_slug      ON blog_pages(slug);
CREATE INDEX IF NOT EXISTS idx_blog_pages_published ON blog_pages(published, updated_at DESC);

-- Trigger updated_at (reutiliza função já criada na v8.0)
DROP TRIGGER IF EXISTS update_blog_pages_updated_at ON blog_pages;
CREATE TRIGGER update_blog_pages_updated_at
  BEFORE UPDATE ON blog_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: admin pode fazer tudo; público só lê publicadas
ALTER TABLE blog_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_public_read" ON blog_pages
  FOR SELECT USING (published = TRUE);

CREATE POLICY "blog_admin_all" ON blog_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- Função: incrementar views de forma atómica
CREATE OR REPLACE FUNCTION increment_page_views(p_slug TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE blog_pages SET views = views + 1 WHERE slug = p_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIM DA MIGRAÇÃO v8.1
-- ============================================================
