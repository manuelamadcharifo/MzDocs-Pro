-- ============================================================
-- MIGRAÇÃO v8.2 — Admin Tables, Blog, Analytics, Settings
-- Execute no SQL Editor do Supabase APÓS v8.0 e v8.1
-- ============================================================

-- ── 1. credit_usage_log (necessária para deduct_credit_atomic) ─────────────
CREATE TABLE IF NOT EXISTS credit_usage_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  document_type     TEXT        NOT NULL,
  credits_used      INTEGER     NOT NULL,
  remaining_credits INTEGER     NOT NULL,
  used_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_usage_user
  ON credit_usage_log(user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_date
  ON credit_usage_log(used_at DESC);

-- ── 2. admin_users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL UNIQUE,
  full_name     TEXT        NOT NULL DEFAULT '',
  role          VARCHAR(20) NOT NULL DEFAULT 'editor'
                CHECK (role IN ('superadmin','admin','editor','viewer')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. admin_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  action      VARCHAR(80) NOT NULL,
  target_type VARCHAR(50),
  target_id   TEXT,
  details     JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin   ON admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);

-- ── 4. system_settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  description TEXT,
  updated_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('site_name',               'MzDocs Pro',       'Nome do site'),
  ('free_credits_normal',     '1',                'Créditos grátis para conta normal'),
  ('free_credits_expiry_days','30',               'Validade dos créditos grátis (dias)'),
  ('temp_credits',            '3',                'Créditos para conta avulso'),
  ('temp_account_expiry_days','7',                'Validade da conta avulso (dias)'),
  ('auto_delete_temp_hours',  '24',               'Horas para eliminar conta avulso após 0 créditos'),
  ('blog_enabled',            'true',             'Blog activo'),
  ('whatsapp_support',        '+258858695506',    'Número de suporte WhatsApp'),
  ('mpesa_env',               'sandbox',          'Ambiente M-Pesa (sandbox|production)'),
  ('pkg_avulso_price',        '50',               'Preço pacote Avulso (MZN)'),
  ('pkg_avulso_credits',      '3',                'Créditos pacote Avulso'),
  ('pkg_starter_price',       '120',              'Preço pacote Starter (MZN)'),
  ('pkg_starter_credits',     '10',               'Créditos pacote Starter'),
  ('pkg_basico_price',        '280',              'Preço pacote Básico (MZN)'),
  ('pkg_basico_credits',      '25',               'Créditos pacote Básico'),
  ('pkg_pro_price',           '600',              'Preço pacote Pro (MZN)'),
  ('pkg_pro_credits',         '60',               'Créditos pacote Pro'),
  ('pkg_empresa_price',       '1500',             'Preço pacote Empresa (MZN)'),
  ('pkg_empresa_credits',     '150',              'Créditos pacote Empresa')
ON CONFLICT (key) DO NOTHING;

-- ── 5. analytics_metrics ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  metric_type  VARCHAR(50) NOT NULL,
  metric_name  TEXT        NOT NULL,
  metric_value INTEGER     NOT NULL DEFAULT 0,
  details      JSONB,
  UNIQUE(metric_date, metric_type, metric_name)
);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_metrics(metric_date DESC);

-- ── 6. blog_categories ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT,
  color       TEXT        NOT NULL DEFAULT '#3B82F6',
  post_count  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO blog_categories (name, slug, description, color) VALUES
  ('Documentos',  'documentos', 'Guias sobre criação de documentos',        '#3B82F6'),
  ('Emprego',     'emprego',    'Dicas de carreira e candidaturas',          '#10B981'),
  ('Negócios',    'negocios',   'Formalização e gestão de negócios',         '#8B5CF6'),
  ('Educação',    'educacao',   'Trabalhos académicos e formação',           '#F59E0B'),
  ('Legal',       'legal',      'Informação legal e administrativa',         '#EF4444'),
  ('Tutoriais',   'tutoriais',  'Como usar o MzDocs Pro',                   '#06B6D4')
ON CONFLICT (slug) DO NOTHING;

-- ── 7. blog_posts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT        NOT NULL UNIQUE,
  title            TEXT        NOT NULL,
  meta_title       TEXT,
  meta_description TEXT        NOT NULL DEFAULT '',
  meta_keywords    TEXT,
  excerpt          TEXT,
  content          TEXT        NOT NULL DEFAULT '',
  featured_image   TEXT,
  category         TEXT,
  tags             TEXT[],
  author_id        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','published','archived')),
  published_at     TIMESTAMPTZ,
  view_count       INTEGER     NOT NULL DEFAULT 0,
  seo_score        INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status    ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug      ON blog_posts(slug);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 8. dashboard_summary VIEW ─────────────────────────────────────────────
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM profiles WHERE account_type = 'normal'
     OR account_type IS NULL)                                        AS total_normal_users,
  (SELECT COUNT(*) FROM profiles WHERE account_type = 'avulso')     AS total_temp_users,
  (SELECT COUNT(*) FROM profiles
     WHERE created_at > NOW() - INTERVAL '24 hours')                AS new_users_24h,
  (SELECT COUNT(*) FROM credit_usage_log
     WHERE used_at > NOW() - INTERVAL '24 hours')                   AS documents_24h,
  (SELECT COUNT(*) FROM credit_usage_log
     WHERE used_at > NOW() - INTERVAL '7 days')                     AS documents_7d,
  (SELECT COUNT(*) FROM credit_usage_log)                           AS total_documents_generated,
  (SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE status = 'completed'
       AND completed_at > NOW() - INTERVAL '30 days')               AS revenue_30d,
  (SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE status = 'completed')                                     AS total_revenue,
  (SELECT COUNT(*) FROM blog_posts WHERE status = 'published')      AS published_posts,
  (SELECT COUNT(*) FROM blog_posts WHERE status = 'draft')          AS draft_posts,
  (SELECT COUNT(*) FROM transactions WHERE status = 'pending')      AS pending_payments;

-- ── 9. promote_to_admin function ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION promote_to_admin(
  p_user_id UUID,
  p_role    VARCHAR(20) DEFAULT 'admin'
)
RETURNS JSONB AS $$
DECLARE
  v_email     TEXT;
  v_full_name TEXT;
BEGIN
  SELECT email, full_name INTO v_email, v_full_name
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Utilizador não encontrado');
  END IF;

  INSERT INTO admin_users (id, email, full_name, role)
  VALUES (p_user_id, v_email, v_full_name, p_role)
  ON CONFLICT (id) DO UPDATE SET
    role      = p_role,
    is_active = TRUE;

  UPDATE profiles SET is_admin = TRUE WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'role',    p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. RLS for new tables ────────────────────────────────────────────────
ALTER TABLE admin_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage_log  ENABLE ROW LEVEL SECURITY;

-- admin_users: só admins
CREATE POLICY "admin_users_admin_only" ON admin_users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- admin_logs: só admins lêem
CREATE POLICY "admin_logs_admin_only" ON admin_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- system_settings: service_role lê/escreve; admins lêem
CREATE POLICY "settings_admin_read" ON system_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );
CREATE POLICY "settings_admin_write" ON system_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- credit_usage_log: utilizador vê o seu; admins vêem tudo
CREATE POLICY "usage_log_own" ON credit_usage_log
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "usage_log_admin" ON credit_usage_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- blog_posts: público lê publicados; admins fazem tudo
CREATE POLICY "blog_posts_public_read" ON blog_posts
  FOR SELECT USING (status = 'published');
CREATE POLICY "blog_posts_admin_all" ON blog_posts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- blog_categories: público lê; admins escrevem
CREATE POLICY "blog_cat_public_read" ON blog_categories FOR SELECT USING (TRUE);
CREATE POLICY "blog_cat_admin_write" ON blog_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- analytics: só admins
CREATE POLICY "analytics_admin_only" ON analytics_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ── 11. Ensure update_updated_at_column exists (safe re-create) ───────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FIM DA MIGRAÇÃO v8.2
-- ============================================================
