-- ============================================================
-- MIGRATION v23 — Corrige v_templates_gallery (faltavam template_html/css)
-- ============================================================
-- PROBLEMA: a galeria de templates (templates.html) mostrava sempre o
-- fallback genérico ("Título do Documento de Exemplo... texto de
-- demonstração") em vez do conteúdo real de cada template — mesmo para
-- templates com template_html/template_css reais guardados na tabela
-- templates_custom (ex.: os 70 templates oficiais inseridos pela
-- migration_v22_seed_official_templates.sql).
--
-- CAUSA: a view v_templates_gallery (criada na migration_v12) nunca
-- incluiu as colunas template_html e template_css — o frontend pedia
-- "SELECT * FROM v_templates_gallery" (via PostgREST, sem select=
-- explícito) e simplesmente nunca recebia esses campos, por não
-- existirem na view, independentemente de existirem na tabela de base.
--
-- CORREÇÃO: CREATE OR REPLACE VIEW é seguro de re-executar em produção —
-- não apaga dados, apenas redefine a consulta da view. Basta rodar este
-- script no SQL Editor do Supabase.
-- ============================================================

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
  t.template_html,
  t.template_css,
  CASE
    WHEN t.rating_count > 0
    THEN ROUND(t.rating_sum::numeric / t.rating_count, 1)
    ELSE NULL
  END AS avg_rating,
  (t.use_count * 3 + t.downloads * 2 + t.likes + COALESCE(t.rating_count, 0)) AS popularity_score,
  t.created_at,
  p.full_name AS author_name,
  t.updated_at
FROM templates_custom t
LEFT JOIN profiles p ON p.id = t.user_id
WHERE t.status = 'approved'
  AND t.is_public = true
  AND t.template_type != 'private';

-- A view v_my_templates ("Os Meus") também não tinha estas colunas — sem
-- elas, o autor de um template não consegue pré-visualizar o seu próprio
-- conteúdo enviado, mesmo antes de aprovação. Mantém-se EXACTAMENTE a
-- mesma lista de colunas e o mesmo filtro de segurança (WHERE user_id =
-- auth.uid(), que restringe esta view aos templates do próprio utilizador)
-- da definição original em migration_v12 — apenas template_html e
-- template_css foram adicionados.
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
  t.template_html,
  t.template_css,
  t.created_at,
  t.updated_at,
  t.user_id
FROM templates_custom t
WHERE t.user_id = auth.uid();
