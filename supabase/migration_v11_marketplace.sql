-- ============================================================
-- MIGRAÇÃO v11 — Template Marketplace
-- Execute no SQL Editor do Supabase após migration_v10
-- ============================================================

-- ── 1. Tabela principal de templates ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates_custom (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  service_type    TEXT        NOT NULL,                     -- 'trabalho','cv','carta'…
  template_name   TEXT        NOT NULL,
  description     TEXT        DEFAULT '',
  thumbnail_url   TEXT        DEFAULT NULL,
  template_html   TEXT        DEFAULT '',                   -- HTML/CSS do template
  template_css    TEXT        DEFAULT '',                   -- CSS isolado para o preview
  template_file   TEXT        DEFAULT NULL,                 -- URL do ficheiro DOCX/PDF original
  status          TEXT        DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  rejection_note  TEXT        DEFAULT NULL,
  downloads       INT         DEFAULT 0,
  likes           INT         DEFAULT 0,
  rating_sum      INT         DEFAULT 0,
  rating_count    INT         DEFAULT 0,
  is_public       BOOLEAN     DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Avaliações de templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_ratings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        REFERENCES templates_custom(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  rating      INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, user_id)   -- um utilizador, uma avaliação por template
);

-- ── 3. Downloads (tracking) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_downloads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        REFERENCES templates_custom(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  session_id  TEXT        DEFAULT NULL,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tpl_service   ON templates_custom(service_type, status);
CREATE INDEX IF NOT EXISTS idx_tpl_status    ON templates_custom(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpl_user      ON templates_custom(user_id);
CREATE INDEX IF NOT EXISTS idx_tpl_public    ON templates_custom(is_public, service_type) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_tpl_rating    ON template_ratings(template_id);
CREATE INDEX IF NOT EXISTS idx_tpl_downloads ON template_downloads(template_id);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE templates_custom   ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_ratings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_downloads ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ver templates aprovados e públicos
CREATE POLICY "tpl_public_read" ON templates_custom
  FOR SELECT USING (status = 'approved' AND is_public = true);

-- Dono pode ver os seus (incluindo pendentes)
CREATE POLICY "tpl_owner_read" ON templates_custom
  FOR SELECT USING (auth.uid() = user_id);

-- Qualquer autenticado pode submeter
CREATE POLICY "tpl_insert" ON templates_custom
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admin pode ler e actualizar tudo (service_role bypassa RLS automaticamente)

-- Ratings — qualquer autenticado pode avaliar templates aprovados
CREATE POLICY "rating_read"   ON template_ratings FOR SELECT USING (true);
CREATE POLICY "rating_insert" ON template_ratings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Downloads — inserção pública (visitantes também podem descarregar)
CREATE POLICY "dl_insert" ON template_downloads
  FOR INSERT WITH CHECK (true);
CREATE POLICY "dl_read"   ON template_downloads
  FOR SELECT USING (auth.uid() = user_id);

-- ── 6. Funções ────────────────────────────────────────────────────────────────

-- Incrementar downloads atomicamente
CREATE OR REPLACE FUNCTION increment_template_downloads(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE templates_custom
    SET downloads = downloads + 1, updated_at = NOW()
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registar avaliação e recalcular média
CREATE OR REPLACE FUNCTION rate_template(
  p_template_id UUID,
  p_user_id     UUID,
  p_rating      INT,
  p_comment     TEXT DEFAULT ''
) RETURNS JSON AS $$
DECLARE
  v_avg NUMERIC;
BEGIN
  INSERT INTO template_ratings (template_id, user_id, rating, comment)
    VALUES (p_template_id, p_user_id, p_rating, p_comment)
    ON CONFLICT (template_id, user_id) DO UPDATE
      SET rating = p_rating, comment = p_comment;

  UPDATE templates_custom
    SET rating_sum   = (SELECT COALESCE(SUM(rating), 0) FROM template_ratings WHERE template_id = p_template_id),
        rating_count = (SELECT COUNT(*)                  FROM template_ratings WHERE template_id = p_template_id),
        updated_at   = NOW()
    WHERE id = p_template_id
    RETURNING ROUND(rating_sum::numeric / NULLIF(rating_count, 0), 1) INTO v_avg;

  RETURN json_build_object('success', true, 'avg', v_avg);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aprovar template (chamado via admin)
CREATE OR REPLACE FUNCTION approve_template(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE templates_custom
    SET status = 'approved', is_public = true, updated_at = NOW()
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rejeitar template
CREATE OR REPLACE FUNCTION reject_template(p_template_id UUID, p_note TEXT DEFAULT '')
RETURNS VOID AS $$
BEGIN
  UPDATE templates_custom
    SET status = 'rejected', is_public = false, rejection_note = p_note, updated_at = NOW()
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpl_updated_at
  BEFORE UPDATE ON templates_custom
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 8. Activar Realtime nos templates (para admin ver novas submissões) ────────
ALTER PUBLICATION supabase_realtime ADD TABLE templates_custom;

-- ── 9. Confirmação ────────────────────────────────────────────────────────────
SELECT 'Migração v11 concluída — Template Marketplace activo' AS status;
