-- ============================================================
-- FIX — Templates aprovados que não aparecem na Galeria pública
-- Execute no SQL Editor do Supabase.
--
-- SINTOMA: um template criado pelo próprio utilizador aparece como
-- "✅ Aprovado" no separador "Os Meus", mas nunca aparece em "Galeria" —
-- nem sequer ordenando por "Mais Recentes".
--
-- CAUSA: a Galeria (v_templates_gallery) só mostra linhas com
-- status = 'approved' E is_public = true. O separador "Os Meus"
-- (v_my_templates) mostra o "✅ Aprovado" só a partir do campo `status`,
-- SEM olhar para `is_public` — por isso é possível um template ficar com
-- status='approved' mas is_public ainda a false (por ter sido aprovado
-- antes das correcções ao endpoint /api/admin/templates incluídas nesta
-- entrega, ou por qualquer edição manual na base de dados), e o "Os Meus"
-- continua a mostrar "Aprovado" na mesma, escondendo o problema.
--
-- Este script:
--   1) Corrige AGORA todas as linhas já aprovadas mas não públicas
--      (excepto as privadas, que nunca devem entrar na galeria pública).
--   2) Reaplica a definição mais recente e correcta de v_templates_gallery
--      e v_my_templates (idêntica à migration_v23), para o caso de o
--      projecto Supabase ainda estar a usar uma versão antiga da view.
-- Seguro para correr múltiplas vezes.
-- ============================================================

-- 1) Backfill: qualquer template já aprovado, público por natureza
--    (community/official/premium — nunca 'private'), passa mesmo a
--    is_public = true.
UPDATE templates_custom
SET is_public = true,
    updated_at = NOW()
WHERE status = 'approved'
  AND template_type <> 'private'
  AND is_public IS DISTINCT FROM true;

-- 2) Reaplicar a view da galeria pública (mesma definição da migration_v23)
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
  (t.use_count * 3 + t.downloads * 2 + t.likes + COALESCE(t.rating_count, 0)) AS popularity_score,
  t.created_at,
  p.full_name AS author_name,
  t.updated_at,
  t.template_html,
  t.template_css
FROM templates_custom t
LEFT JOIN profiles p ON p.id = t.user_id
WHERE t.status = 'approved'
  AND t.is_public = true
  AND t.template_type != 'private';

-- 3) Reaplicar a view "Os Meus" com os mesmos campos (inclui is_public,
--    agora exposto, para o frontend poder mostrar um aviso "Aprovado, mas
--    ainda não visível na galeria" em vez de dar a entender que já está
--    tudo publicado quando não está).
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
  t.is_public,
  t.rejection_note,
  t.use_count,
  t.downloads,
  t.is_featured,
  t.credit_cost,
  t.author_share_percent,
  t.created_at,
  t.updated_at,
  t.user_id,
  t.template_html,
  t.template_css
FROM templates_custom t
WHERE t.user_id = auth.uid();

-- ── Verificação rápida — confirme que o seu template já está visível ──────
-- SELECT id, template_name, status, is_public, template_type
-- FROM templates_custom
-- WHERE template_name ILIKE '%Requerimento Simples Moçambicano%';
