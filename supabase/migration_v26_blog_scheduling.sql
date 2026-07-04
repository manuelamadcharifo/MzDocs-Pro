-- migration_v26_blog_scheduling.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adiciona suporte a publicação agendada e geração automática (IA) de
-- artigos do blog, sem tocar na tabela legada e não usada "blog_posts"
-- (a tabela realmente usada pela app é "blog_pages" — ver migration_v8_1).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Campos extra em blog_pages para acompanhar agendamento/origem
ALTER TABLE blog_pages ADD COLUMN IF NOT EXISTS scheduled_at    TIMESTAMPTZ;
ALTER TABLE blog_pages ADD COLUMN IF NOT EXISTS topic_keywords  TEXT;

CREATE INDEX IF NOT EXISTS idx_blog_pages_scheduled
  ON blog_pages(scheduled_at)
  WHERE published = FALSE AND scheduled_at IS NOT NULL;

-- 2. Fila de publicação — tanto títulos colocados manualmente pelo admin
--    (source='manual') como os planeados pela IA (source='ai') passam por
--    aqui. O cron (/api/misc?action=blog-cron) processa o que estiver
--    "pending" e com scheduled_at já vencido.
CREATE TABLE IF NOT EXISTS blog_schedule_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  keywords      TEXT,
  source        TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  blog_page_id  UUID        REFERENCES blog_pages(id) ON DELETE SET NULL,
  error_note    TEXT,
  created_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_queue_due
  ON blog_schedule_queue(scheduled_at)
  WHERE status = 'pending';

ALTER TABLE blog_schedule_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_full_access_blog_queue" ON blog_schedule_queue;
CREATE POLICY "admin_full_access_blog_queue" ON blog_schedule_queue
  FOR ALL USING (auth.role() = 'service_role');

-- 3. Definições de geração automática (lidas/escritas via
--    /api/admin?action=settings, já existente para as outras chaves)
INSERT INTO system_settings (key, value, description) VALUES
  ('blog_autogen_enabled',        'false', 'Gerar artigos de blog automaticamente por IA'),
  ('blog_autogen_interval_days',  '7',     'Intervalo (dias) entre artigos gerados automaticamente'),
  ('blog_autogen_last_run',       '',      'Timestamp ISO da última geração automática (gerido pelo sistema)')
ON CONFLICT (key) DO NOTHING;
