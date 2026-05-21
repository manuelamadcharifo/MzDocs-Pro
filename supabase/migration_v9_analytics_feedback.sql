-- ============================================================
-- MIGRAÇÃO v9 — Analytics, Feedback, Online Sessions
-- Execute no SQL Editor do Supabase APÓS v8.2
-- ============================================================

-- ── 1. page_views — visitas por página por dia ─────────────────────────────
CREATE TABLE IF NOT EXISTS page_views (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page     TEXT        NOT NULL DEFAULT '/',
  date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  views    INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (page, date)
);
CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views(date DESC);

-- Incremento atómico ao fazer upsert
CREATE OR REPLACE FUNCTION increment_page_view(p_page TEXT, p_date DATE)
RETURNS VOID AS $$
BEGIN
  INSERT INTO page_views (page, date, views) VALUES (p_page, p_date, 1)
  ON CONFLICT (page, date) DO UPDATE SET views = page_views.views + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. online_sessions — TTL 5 min via updated_at ─────────────────────────
CREATE TABLE IF NOT EXISTS online_sessions (
  session_id TEXT        PRIMARY KEY,
  page       TEXT        NOT NULL DEFAULT '/',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_online_sessions_updated ON online_sessions(updated_at DESC);

-- Limpar sessões antigas automaticamente (cron diário; ou chamado pelo front-end)
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS VOID AS $$
BEGIN
  DELETE FROM online_sessions WHERE updated_at < NOW() - INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. user_feedback — reacções e ratings dos utilizadores ────────────────
CREATE TABLE IF NOT EXISTS user_feedback (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service    TEXT        NOT NULL,
  rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT        DEFAULT '',
  user_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_service    ON user_feedback(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON user_feedback(created_at DESC);

-- RLS
ALTER TABLE page_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback    ENABLE ROW LEVEL SECURITY;

-- page_views: só admin lê; service_role escreve via API
CREATE POLICY "page_views_admin_read" ON page_views
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- online_sessions: só admin lê
CREATE POLICY "online_sessions_admin_read" ON online_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- user_feedback: qualquer autenticado pode inserir; admin lê tudo
CREATE POLICY "feedback_insert_any" ON user_feedback
  FOR INSERT WITH CHECK (true);

CREATE POLICY "feedback_admin_read" ON user_feedback
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ============================================================
-- FIM DA MIGRAÇÃO v9
-- ============================================================
