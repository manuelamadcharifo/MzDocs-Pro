-- ============================================================
-- MIGRATION v55 — Só afiliados/parceiros aprovados podem VENDER templates
-- Execute no SQL Editor do Supabase, DEPOIS da migration_v54.
--
-- REGRA DE NEGÓCIO PEDIDA: a plataforma não tem como pagar royalties a
-- quem não está associado ao projecto. Um utilizador comum continua a
-- poder criar e submeter os seus próprios templates (privados, ou
-- públicos gratuitos na Galeria) — mas NUNCA lhes pode definir um preço
-- em créditos (credit_cost > 0), a não ser que seja:
--   a) afiliado aprovado (profiles.is_affiliate = true), ou
--   b) parceiro aprovado e activo (tabela partners), com a sua conta de
--      login associada via partners.linked_user_id (novo — ver PARTE A).
--
-- GARANTIA: esta migração implementa a regra com um TRIGGER na base de
-- dados (PARTE B) — não apenas validação no código da API. Isto significa
-- que, mesmo que exista um bug futuro em api/misc.js ou no painel admin,
-- nunca é possível gravar um template com credit_cost > 0 pertencente a
-- um utilizador que não seja afiliado/parceiro: o trigger força
-- automaticamente credit_cost = 0 nesse caso, em qualquer INSERT/UPDATE,
-- seja qual for o caminho de código que lá chegar.
-- ============================================================

-- ── PARTE A: ligar um parceiro (papelaria/advogado) à sua conta de login ──
-- Hoje a tabela `partners` (papelarias, advogados) não tem qualquer ligação
-- a `profiles`/auth — os parceiros autenticam-se com telefone+código de
-- acesso próprio (parceiro-portal.html), sem conta Supabase Auth. Para um
-- parceiro poder também vender templates com a SUA conta de utilizador da
-- plataforma, é preciso associar as duas coisas manualmente (o admin faz
-- isto uma vez, ao aprovar o parceiro).
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partners_linked_user
  ON partners(linked_user_id) WHERE linked_user_id IS NOT NULL;

COMMENT ON COLUMN partners.linked_user_id IS
  'Conta de login (profiles.id) deste parceiro na plataforma — opcional. Associada manualmente pelo admin. Permite ao parceiro vender templates com a sua conta normal.';

-- ── PARTE B: trigger de garantia — bloqueia credit_cost > 0 para quem não é elegível ──
CREATE OR REPLACE FUNCTION enforce_template_credit_eligibility()
RETURNS TRIGGER AS $$
DECLARE
  v_eligible BOOLEAN;
BEGIN
  -- Gratuito: nada a validar.
  IF NEW.credit_cost IS NULL OR NEW.credit_cost <= 0 THEN
    RETURN NEW;
  END IF;

  -- Templates sem autor (user_id NULL) são conteúdo oficial da própria
  -- plataforma (ver migration_v22) — não envolvem pagar royalties a
  -- ninguém, por isso não são afectados por esta regra.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = NEW.user_id AND p.is_affiliate = TRUE)
    OR EXISTS (
      SELECT 1 FROM partners pt
      WHERE pt.linked_user_id = NEW.user_id AND pt.status = 'approved' AND pt.active = TRUE
    )
  ) INTO v_eligible;

  IF NOT v_eligible THEN
    -- Não rejeita a operação inteira (não queremos partir a submissão nem
    -- a aprovação do admin) — simplesmente força a partilha gratuita.
    NEW.credit_cost := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_template_credit_eligibility ON templates_custom;
CREATE TRIGGER trg_enforce_template_credit_eligibility
  BEFORE INSERT OR UPDATE OF credit_cost, user_id ON templates_custom
  FOR EACH ROW
  EXECUTE FUNCTION enforce_template_credit_eligibility();

-- ── PARTE C: corrigir dados já existentes que violem a regra ──────────────
-- Qualquer template hoje com credit_cost > 0 cujo autor não seja afiliado
-- nem parceiro ligado passa a gratuito.
UPDATE templates_custom t
SET credit_cost = 0, updated_at = NOW()
WHERE t.credit_cost > 0
  AND t.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = t.user_id AND p.is_affiliate = TRUE)
  AND NOT EXISTS (
    SELECT 1 FROM partners pt
    WHERE pt.linked_user_id = t.user_id AND pt.status = 'approved' AND pt.active = TRUE
  );

-- ── Como associar um parceiro à sua conta (fazer manualmente, um a um) ────
-- UPDATE partners SET linked_user_id = '<uuid do profiles do parceiro>'
-- WHERE id = '<uuid do parceiro em partners>';
--
-- Como tornar alguém afiliado (já existente noutras partes do painel admin):
-- UPDATE profiles SET is_affiliate = true WHERE id = '<uuid>';
