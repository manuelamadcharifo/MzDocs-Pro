-- ============================================================
-- MIGRATION v56 — Limite máximo de 10 créditos por template
-- Execute no SQL Editor do Supabase, DEPOIS da migration_v55.
--
-- PROBLEMA: templates_custom.credit_cost nunca teve um limite superior na
-- base de dados. O código da API (api/misc.js, api/admin/index.js) e o
-- formulário (templates.html) permitiam até 50 créditos — mas o limite
-- REAL do projecto, aplicado no momento de cobrar (api/deduct-credit.js,
-- VALID_COSTS = 1..10), é 10. Um template aprovado/gravado com mais de 10
-- créditos ficava com um preço que o próprio endpoint de dedução nunca
-- conseguiria cobrar.
--
-- Esta migração:
--   1) Corrige AGORA qualquer template já gravado acima de 10 créditos,
--      baixando-o para 10.
--   2) Adiciona um CHECK constraint em templates_custom.credit_cost, para
--      que — tal como a percentagem do criador (author_share_percent,
--      60-70%) já é garantida por CHECK — o limite de 10 créditos deixe
--      de depender apenas do código da API estar correcto em todos os
--      caminhos (submissão, edição pelo admin, futuras alterações).
-- Seguro para correr múltiplas vezes.
-- ============================================================

-- 1) Corrigir dados já existentes acima do novo limite.
UPDATE templates_custom
SET credit_cost = 10,
    updated_at  = NOW()
WHERE credit_cost > 10;

-- 2) Garantir o limite ao nível da base de dados.
ALTER TABLE templates_custom
  DROP CONSTRAINT IF EXISTS chk_templates_custom_credit_cost_max10;

ALTER TABLE templates_custom
  ADD CONSTRAINT chk_templates_custom_credit_cost_max10
  CHECK (credit_cost >= 0 AND credit_cost <= 10);

COMMENT ON COLUMN templates_custom.credit_cost IS
  'Preço em créditos para usar este template (0 = gratuito). Máximo 10, o mesmo limite de qualquer operação cobrada na plataforma (ver VALID_COSTS em api/deduct-credit.js) — reforçado aqui por CHECK constraint.';

-- ── Verificação rápida ──────────────────────────────────────────────────
-- SELECT id, template_name, credit_cost FROM templates_custom WHERE credit_cost > 10;
-- (deve devolver 0 linhas)
