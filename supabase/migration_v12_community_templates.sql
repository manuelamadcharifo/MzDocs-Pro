-- ============================================================
-- MIGRAÇÃO v12 — Sistema de Templates Comunitários
-- Executar no SQL Editor do Supabase após migration_v11
-- ============================================================

-- ── 1. ESTENDER tabela templates_custom ──────────────────────────────────────
--    Adicionar colunas para suportar os 4 tipos e funcionalidades comunitárias

ALTER TABLE templates_custom
  ADD COLUMN IF NOT EXISTS template_type  TEXT    NOT NULL DEFAULT 'community'
    CHECK (template_type IN ('official','community','premium','private')),
  ADD COLUMN IF NOT EXISTS is_featured    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_order INT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS credit_cost    INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_token    TEXT    UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preview_url    TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags           TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS use_count      INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_note     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by    UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS version        INT     NOT NULL DEFAULT 1;

-- Comentários para documentação
COMMENT ON COLUMN templates_custom.template_type IS
  'official=equipa MzDocs | community=submetido por utilizador | premium=pago com créditos | private=só o dono vê';
COMMENT ON COLUMN templates_custom.share_token IS
  'Token único para partilha pública de templates privados via link directo';
COMMENT ON COLUMN templates_custom.credit_cost IS
  'Créditos necessários para usar. 0=gratuito. >0 só para premium.';
COMMENT ON COLUMN templates_custom.is_featured IS
  'Destacado pelo admin — aparece no topo da galeria';

-- ── 2. TABELA: template_uses ──────────────────────────────────────────────────
--    Regista cada vez que um utilizador aplica um template ao gerar um documento

CREATE TABLE IF NOT EXISTS template_uses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES templates_custom(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  session_id  TEXT        DEFAULT NULL,
  service_key TEXT        NOT NULL,   -- 'cv', 'carta', 'trabalho', …
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE template_uses IS
  'Rastreio de uso de templates — diferente de download (template foi mesmo aplicado)';

-- ── 3. TABELA: template_saves ─────────────────────────────────────────────────
--    Utilizadores podem guardar templates na sua colecção pessoal

CREATE TABLE IF NOT EXISTS template_saves (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES templates_custom(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, user_id)
);

COMMENT ON TABLE template_saves IS
  'Colecção pessoal — utilizador guarda templates para usar mais tarde';

-- ── 4. TABELA: template_reports ──────────────────────────────────────────────
--    Utilizadores podem reportar templates inadequados

CREATE TABLE IF NOT EXISTS template_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES templates_custom(id) ON DELETE CASCADE,
  reporter_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reason      TEXT        NOT NULL CHECK (reason IN ('spam','inappropriate','copyright','poor_quality','other')),
  detail      TEXT        DEFAULT '',
  resolved    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. TABELA: template_history ──────────────────────────────────────────────
--    Audit trail de todas as acções admin sobre templates

CREATE TABLE IF NOT EXISTS template_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES templates_custom(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL, -- 'submitted','approved','rejected','edited','featured','unfeatured','type_changed'
  old_value   JSONB       DEFAULT NULL,
  new_value   JSONB       DEFAULT NULL,
  note        TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE template_history IS
  'Audit log imutável de todas as alterações a templates';

-- ── 6. ÍNDICES ────────────────────────────────────────────────────────────────

-- Galeria pública: tipo + serviço + destacados primeiro
CREATE INDEX IF NOT EXISTS idx_tpl_type_service
  ON templates_custom(template_type, service_type, status)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_tpl_featured
  ON templates_custom(is_featured, featured_order)
  WHERE is_featured = true AND status = 'approved';

-- Pesquisa por tags (GIN para arrays)
CREATE INDEX IF NOT EXISTS idx_tpl_tags
  ON templates_custom USING GIN(tags);

-- Templates privados — lookup por share_token
CREATE INDEX IF NOT EXISTS idx_tpl_share_token
  ON templates_custom(share_token)
  WHERE share_token IS NOT NULL;

-- Popularidade para ordenação
CREATE INDEX IF NOT EXISTS idx_tpl_use_count
  ON templates_custom(use_count DESC)
  WHERE status = 'approved' AND is_public = true;

-- Admin: templates pendentes por data
CREATE INDEX IF NOT EXISTS idx_tpl_pending_date
  ON templates_custom(created_at ASC)
  WHERE status = 'pending';

-- Histórico por template
CREATE INDEX IF NOT EXISTS idx_tpl_history
  ON template_history(template_id, created_at DESC);

-- Reports não resolvidos
CREATE INDEX IF NOT EXISTS idx_tpl_reports_unresolved
  ON template_reports(resolved, created_at DESC)
  WHERE resolved = false;

-- Uses por template para contagem
CREATE INDEX IF NOT EXISTS idx_tpl_uses_template
  ON template_uses(template_id, used_at DESC);

-- Saves por utilizador
CREATE INDEX IF NOT EXISTS idx_tpl_saves_user
  ON template_saves(user_id, saved_at DESC);

-- ── 7. RLS — ROW LEVEL SECURITY ───────────────────────────────────────────────

-- ---- templates_custom (já tem RLS activo) ----

-- Remover policies antigas para recriar limpas
DROP POLICY IF EXISTS "tpl_public_read"  ON templates_custom;
DROP POLICY IF EXISTS "tpl_owner_read"   ON templates_custom;
DROP POLICY IF EXISTS "tpl_insert"       ON templates_custom;

-- Leitura pública: approved + public (qualquer tipo excepto private)
CREATE POLICY "tpl_read_public" ON templates_custom
  FOR SELECT USING (
    status = 'approved'
    AND is_public = true
    AND template_type != 'private'
  );

-- Dono vê os seus próprios (todos os estados, incluindo private)
CREATE POLICY "tpl_read_own" ON templates_custom
  FOR SELECT USING (auth.uid() = user_id);

-- Acesso por share_token (templates privados partilhados)
CREATE POLICY "tpl_read_share_token" ON templates_custom
  FOR SELECT USING (
    share_token IS NOT NULL
    AND template_type = 'private'
  );

-- Qualquer utilizador autenticado pode submeter
CREATE POLICY "tpl_insert_auth" ON templates_custom
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND template_type IN ('community','private')  -- utilizadores só criam estes tipos
  );

-- Dono pode editar os seus templates (limitado: não pode mudar type para official/premium)
CREATE POLICY "tpl_update_own" ON templates_custom
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND template_type IN ('community','private')
  );

-- ---- template_uses ----
ALTER TABLE template_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpl_uses_insert" ON template_uses
  FOR INSERT WITH CHECK (true);  -- visitantes também podem usar

CREATE POLICY "tpl_uses_read_own" ON template_uses
  FOR SELECT USING (auth.uid() = user_id);

-- ---- template_saves ----
ALTER TABLE template_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpl_saves_own" ON template_saves
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---- template_reports ----
ALTER TABLE template_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpl_reports_insert" ON template_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tpl_reports_read_own" ON template_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- ---- template_history ----
ALTER TABLE template_history ENABLE ROW LEVEL SECURITY;

-- Histórico é só de leitura para todos (transparência)
CREATE POLICY "tpl_history_read" ON template_history
  FOR SELECT USING (true);

-- Apenas service_role pode inserir (via funções SECURITY DEFINER)

-- ── 8. FUNÇÕES SUPABASE ───────────────────────────────────────────────────────

-- 8a. Submeter template (atómica: insere + regista histórico)
CREATE OR REPLACE FUNCTION submit_community_template(
  p_user_id       UUID,
  p_service_type  TEXT,
  p_template_name TEXT,
  p_description   TEXT,
  p_template_html TEXT,
  p_template_css  TEXT,
  p_thumbnail_url TEXT    DEFAULT NULL,
  p_template_file TEXT    DEFAULT NULL,
  p_preview_url   TEXT    DEFAULT NULL,
  p_tags          TEXT[]  DEFAULT '{}',
  p_template_type TEXT    DEFAULT 'community'  -- 'community' ou 'private'
) RETURNS JSON AS $$
DECLARE
  v_id    UUID;
  v_token TEXT;
BEGIN
  -- Validar tipo
  IF p_template_type NOT IN ('community','private') THEN
    RAISE EXCEPTION 'Tipo inválido: apenas community ou private são permitidos';
  END IF;

  -- Gerar share_token para templates privados
  IF p_template_type = 'private' THEN
    v_token := encode(gen_random_bytes(16), 'hex');
  END IF;

  INSERT INTO templates_custom (
    user_id, service_type, template_name, description,
    template_html, template_css, thumbnail_url, template_file,
    preview_url, tags, template_type, share_token,
    status, is_public
  ) VALUES (
    p_user_id, p_service_type, p_template_name, p_description,
    p_template_html, p_template_css, p_thumbnail_url, p_template_file,
    p_preview_url, p_tags,
    p_template_type,
    v_token,
    CASE WHEN p_template_type = 'private' THEN 'approved' ELSE 'pending' END,
    CASE WHEN p_template_type = 'private' THEN false ELSE false END
  ) RETURNING id INTO v_id;

  -- Registar no histórico
  INSERT INTO template_history (template_id, actor_id, action, new_value)
    VALUES (v_id, p_user_id, 'submitted', jsonb_build_object(
      'type', p_template_type, 'service', p_service_type, 'name', p_template_name
    ));

  RETURN json_build_object(
    'success', true,
    'id', v_id,
    'share_token', v_token,
    'status', CASE WHEN p_template_type = 'private' THEN 'approved' ELSE 'pending' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8b. Aprovar template (admin)
CREATE OR REPLACE FUNCTION admin_approve_template(
  p_template_id UUID,
  p_admin_id    UUID,
  p_note        TEXT    DEFAULT '',
  p_featured    BOOLEAN DEFAULT false
) RETURNS JSON AS $$
DECLARE
  v_old JSONB;
BEGIN
  SELECT jsonb_build_object('status', status, 'is_public', is_public)
    INTO v_old FROM templates_custom WHERE id = p_template_id;

  UPDATE templates_custom SET
    status       = 'approved',
    is_public    = true,
    is_featured  = p_featured,
    admin_note   = p_note,
    reviewed_by  = p_admin_id,
    reviewed_at  = NOW(),
    updated_at   = NOW()
  WHERE id = p_template_id;

  INSERT INTO template_history (template_id, actor_id, action, old_value, new_value, note)
    VALUES (p_template_id, p_admin_id, 'approved', v_old,
      jsonb_build_object('status','approved','is_public',true,'is_featured',p_featured), p_note);

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8c. Rejeitar template (admin)
CREATE OR REPLACE FUNCTION admin_reject_template(
  p_template_id UUID,
  p_admin_id    UUID,
  p_note        TEXT DEFAULT ''
) RETURNS JSON AS $$
DECLARE
  v_old JSONB;
BEGIN
  SELECT jsonb_build_object('status', status) INTO v_old
    FROM templates_custom WHERE id = p_template_id;

  UPDATE templates_custom SET
    status         = 'rejected',
    is_public      = false,
    rejection_note = p_note,
    admin_note     = p_note,
    reviewed_by    = p_admin_id,
    reviewed_at    = NOW(),
    updated_at     = NOW()
  WHERE id = p_template_id;

  INSERT INTO template_history (template_id, actor_id, action, old_value, new_value, note)
    VALUES (p_template_id, p_admin_id, 'rejected', v_old,
      jsonb_build_object('status','rejected'), p_note);

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8d. Destacar / remover destaque (admin)
CREATE OR REPLACE FUNCTION admin_feature_template(
  p_template_id UUID,
  p_admin_id    UUID,
  p_featured    BOOLEAN,
  p_order       INT DEFAULT NULL
) RETURNS JSON AS $$
BEGIN
  UPDATE templates_custom SET
    is_featured  = p_featured,
    featured_order = CASE WHEN p_featured THEN p_order ELSE NULL END,
    updated_at   = NOW()
  WHERE id = p_template_id;

  INSERT INTO template_history (template_id, actor_id, action, new_value)
    VALUES (p_template_id, p_admin_id,
      CASE WHEN p_featured THEN 'featured' ELSE 'unfeatured' END,
      jsonb_build_object('featured', p_featured, 'order', p_order));

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8e. Mudar tipo de template (admin: ex. promover community→official ou →premium)
CREATE OR REPLACE FUNCTION admin_change_template_type(
  p_template_id   UUID,
  p_admin_id      UUID,
  p_new_type      TEXT,
  p_credit_cost   INT  DEFAULT 0,
  p_note          TEXT DEFAULT ''
) RETURNS JSON AS $$
DECLARE
  v_old_type TEXT;
BEGIN
  IF p_new_type NOT IN ('official','community','premium','private') THEN
    RAISE EXCEPTION 'Tipo inválido';
  END IF;

  SELECT template_type INTO v_old_type FROM templates_custom WHERE id = p_template_id;

  UPDATE templates_custom SET
    template_type = p_new_type,
    credit_cost   = CASE WHEN p_new_type = 'premium' THEN p_credit_cost ELSE 0 END,
    updated_at    = NOW()
  WHERE id = p_template_id;

  INSERT INTO template_history (template_id, actor_id, action, old_value, new_value, note)
    VALUES (p_template_id, p_admin_id, 'type_changed',
      jsonb_build_object('type', v_old_type),
      jsonb_build_object('type', p_new_type, 'credit_cost', p_credit_cost), p_note);

  RETURN json_build_object('success', true, 'new_type', p_new_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8f. Usar template (regista uso + incrementa contador)
CREATE OR REPLACE FUNCTION use_template(
  p_template_id UUID,
  p_user_id     UUID    DEFAULT NULL,
  p_session_id  TEXT    DEFAULT NULL,
  p_service_key TEXT    DEFAULT ''
) RETURNS JSON AS $$
DECLARE
  v_tpl     RECORD;
BEGIN
  SELECT template_type, credit_cost, status, is_public
    INTO v_tpl FROM templates_custom WHERE id = p_template_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Template não encontrado');
  END IF;

  -- Verificar se template está acessível
  IF v_tpl.status != 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Template não disponível');
  END IF;

  -- Templates premium: verificar créditos (lógica simplificada — o frontend valida antes)
  -- A dedução real de créditos é feita pelo deduct-credit.js existente

  -- Incrementar contador de uso atomicamente
  UPDATE templates_custom
    SET use_count = use_count + 1, updated_at = NOW()
    WHERE id = p_template_id;

  -- Registar uso individual
  INSERT INTO template_uses (template_id, user_id, session_id, service_key)
    VALUES (p_template_id, p_user_id, p_session_id, p_service_key);

  RETURN json_build_object('success', true, 'credit_cost', v_tpl.credit_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8g. Guardar / remover template da colecção pessoal
CREATE OR REPLACE FUNCTION toggle_save_template(
  p_template_id UUID,
  p_user_id     UUID
) RETURNS JSON AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM template_saves
    WHERE template_id = p_template_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM template_saves
      WHERE template_id = p_template_id AND user_id = p_user_id;
    RETURN json_build_object('saved', false);
  ELSE
    INSERT INTO template_saves (template_id, user_id)
      VALUES (p_template_id, p_user_id)
      ON CONFLICT DO NOTHING;
    RETURN json_build_object('saved', true);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8h. Gerar novo share_token para template privado
CREATE OR REPLACE FUNCTION regenerate_share_token(
  p_template_id UUID,
  p_user_id     UUID
) RETURNS JSON AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Verificar dono
  IF NOT EXISTS (
    SELECT 1 FROM templates_custom WHERE id = p_template_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Não autorizado');
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');

  UPDATE templates_custom SET share_token = v_token, updated_at = NOW()
    WHERE id = p_template_id;

  RETURN json_build_object('success', true, 'share_token', v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. VIEW: galeria pública com métricas calculadas ─────────────────────────
CREATE OR REPLACE VIEW v_templates_gallery AS
SELECT
  t.id,
  t.template_type,
  t.service_type,
  t.template_name,
  t.description,
  t.thumbnail_url,
  t.preview_url,
  t.tags,
  t.is_featured,
  t.featured_order,
  t.credit_cost,
  t.downloads,
  t.use_count,
  t.likes,
  t.rating_count,
  CASE
    WHEN t.rating_count > 0
    THEN ROUND(t.rating_sum::numeric / t.rating_count, 1)
    ELSE NULL
  END AS avg_rating,
  -- Score de popularidade composto (para ordenação inteligente)
  (t.use_count * 3 + t.downloads * 2 + t.likes + COALESCE(t.rating_count, 0)) AS popularity_score,
  t.created_at,
  p.full_name AS author_name,
  -- Não expor user_id na galeria pública
  t.updated_at
FROM templates_custom t
LEFT JOIN profiles p ON p.id = t.user_id
WHERE t.status = 'approved'
  AND t.is_public = true
  AND t.template_type != 'private';

-- ── 10. VIEW: meus templates (para o utilizador autenticado) ──────────────────
CREATE OR REPLACE VIEW v_my_templates AS
SELECT
  t.id,
  t.template_type,
  t.service_type,
  t.template_name,
  t.description,
  t.thumbnail_url,
  t.share_token,
  t.status,
  t.rejection_note,
  t.use_count,
  t.downloads,
  t.is_featured,
  t.created_at,
  t.updated_at,
  t.user_id
FROM templates_custom t
WHERE t.user_id = auth.uid();

-- ── 11. Migrar dados existentes ───────────────────────────────────────────────
-- Templates já aprovados passam a tipo 'official' se não tiverem user_id
UPDATE templates_custom
  SET template_type = 'official'
  WHERE user_id IS NULL AND status = 'approved';

-- Templates de utilizadores ficam como 'community'
UPDATE templates_custom
  SET template_type = 'community'
  WHERE user_id IS NOT NULL AND template_type = 'community';

-- ── 12. Funções legacy — manter compatibilidade com misc.js existente ─────────
-- approve_template e reject_template são rediricionadas para as novas com defaults
CREATE OR REPLACE FUNCTION approve_template(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM admin_approve_template(p_template_id, NULL, '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_template(p_template_id UUID, p_note TEXT DEFAULT '')
RETURNS VOID AS $$
BEGIN
  PERFORM admin_reject_template(p_template_id, NULL, p_note);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 13. Trigger: updated_at (reutilizar função existente) ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tpl_uses_updated_at'
  ) THEN
    -- template_uses e template_saves não precisam de updated_at
    NULL;
  END IF;
END$$;

-- ── 14. Confirmação ───────────────────────────────────────────────────────────
SELECT
  'Migração v12 concluída — Templates Comunitários activos' AS status,
  (SELECT COUNT(*) FROM templates_custom) AS total_templates,
  (SELECT COUNT(*) FROM templates_custom WHERE template_type = 'official') AS official,
  (SELECT COUNT(*) FROM templates_custom WHERE template_type = 'community') AS community;
