-- migration_v28_blog_pages_published_at.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Corrige bug: api/misc.js (blog-cron) e api/admin/index.js (analytics)
-- leem/escrevem "published_at" em blog_pages, mas essa coluna nunca foi
-- criada na v8.1 (só existe na tabela legada "blog_posts", não usada).
-- Resultado: PostgREST rejeita o insert com
-- "Could not find the 'published_at' column of 'blog_pages' in the schema
-- cache", e o cron falha silenciosamente todos os dias.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE blog_pages ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Backfill: artigos já publicados manualmente antes desta migração ficam
-- sem published_at (NULL). Usa updated_at como aproximação razoável do
-- momento de publicação, para não distorcer o analytics.
UPDATE blog_pages
SET published_at = updated_at
WHERE published = TRUE AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_blog_pages_published_at
  ON blog_pages(published_at DESC)
  WHERE published = TRUE;

-- ─────────────────────────────────────────────────────────────────────────
-- FIM DA MIGRAÇÃO v28
-- ─────────────────────────────────────────────────────────────────────────
