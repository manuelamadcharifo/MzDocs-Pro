-- ============================================================
-- MIGRAÇÃO v39 — Templates: venda sempre em CRÉDITOS (não valor monetário fixo)
-- Execute no SQL Editor do Supabase, DEPOIS da migration_v38.
--
-- Ajuste pedido: quem usa um template paga sempre em CRÉDITOS — a mesma
-- moeda já usada em toda a plataforma (credit_cost) — nunca um valor em
-- MZN fixo definido livremente pelo criador/admin. O equivalente em MZN
-- continua a existir e a ser mostrado (para o criador perceber o valor
-- real e poder levantar via M-Pesa), mas passa a ser calculado
-- DINAMICAMENTE a partir da taxa média dos pacotes de créditos activos
-- (a mesma fonte de verdade usada no checkout — ver api/_lib/packages.js),
-- em vez de um preço fixo gravado por template.
--
-- Esta migração:
--  1. Remove a coluna price_mzn de templates_custom — deixou de ser a
--     fonte do preço; o preço é sempre credit_cost (já existia desde a
--     migration_v12, usada para templates "premium").
--  2. Actualiza process_template_sale para receber o valor em MZN já
--     calculado pela API (p_amount_mzn = credit_cost × taxa MZN/crédito
--     do momento), em vez de o ler de price_mzn.
-- ============================================================

ALTER TABLE templates_custom DROP COLUMN IF EXISTS price_mzn;

CREATE OR REPLACE FUNCTION process_template_sale(
  p_template_id   UUID,
  p_buyer_id      UUID,
  p_credits_spent INT DEFAULT 0,
  p_amount_mzn    NUMERIC DEFAULT 0
) RETURNS JSON AS $$
DECLARE
  v_tpl RECORD;
  v_author_share   NUMERIC;
  v_platform_share NUMERIC;
BEGIN
  SELECT id, user_id, status, is_public, credit_cost, author_share_percent
    INTO v_tpl
    FROM templates_custom
    WHERE id = p_template_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Template não encontrado');
  END IF;

  -- Sem repartição quando: template sem autor de royalties (ex: oficial da
  -- equipa), o próprio autor a usar o seu template, template gratuito
  -- (credit_cost = 0), ou valor em MZN não calculado/omitido pela API.
  IF v_tpl.user_id IS NULL OR v_tpl.user_id = p_buyer_id
     OR COALESCE(v_tpl.credit_cost, 0) <= 0
     OR p_amount_mzn IS NULL OR p_amount_mzn <= 0 THEN
    RETURN json_build_object('success', true, 'split', false);
  END IF;

  v_author_share   := ROUND(p_amount_mzn * (v_tpl.author_share_percent / 100.0), 2);
  v_platform_share := ROUND(p_amount_mzn - v_author_share, 2);

  UPDATE profiles SET
    template_author_balance      = COALESCE(template_author_balance, 0) + v_author_share,
    template_author_total_earned = COALESCE(template_author_total_earned, 0) + v_author_share
  WHERE id = v_tpl.user_id;

  INSERT INTO template_sales
    (template_id, author_id, buyer_id, credits_spent, amount_mzn, author_share_mzn, platform_share_mzn)
  VALUES
    (p_template_id, v_tpl.user_id, p_buyer_id, COALESCE(p_credits_spent, 0), p_amount_mzn, v_author_share, v_platform_share);

  RETURN json_build_object(
    'success', true, 'split', true,
    'amount_mzn', p_amount_mzn,
    'author_share_mzn', v_author_share, 'platform_share_mzn', v_platform_share
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
