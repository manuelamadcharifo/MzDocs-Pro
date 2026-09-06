-- supabase/migration_fix_credits.sql
-- EXECUTAR NO SQL EDITOR DO SUPABASE
--
-- Correcções ao sistema de créditos:
-- 1. Nova função deduct_credits(UUID, INTEGER) para deduzir N créditos de uma vez
-- 2. Simplificação de deduct_credit(UUID): removida a deleção de auth.users
--    (a eliminação de contas temp é agora feita no Node.js com service_role, mais fiável)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Função multi-crédito: deduct_credits(p_user_id, p_amount) ─────────────
-- Retorna:
--   >= 0  → créditos restantes após dedução
--     -1  → créditos insuficientes (ou utilizador não encontrado)
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Bloquear a linha para evitar race conditions
  SELECT credits
    INTO current_credits
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF current_credits < p_amount THEN RETURN -1; END IF;

  UPDATE profiles
     SET credits    = credits - p_amount,
         updated_at = NOW()
   WHERE id = p_user_id;

  -- NOTA: A eliminação de contas temporárias (is_temp) quando credits=0
  -- é feita no Node.js (api/deduct-credit.js) com service_role,
  -- pois DELETE FROM auth.users requer permissões de superuser
  -- que o SECURITY DEFINER não tem de forma fiável no Supabase.

  RETURN current_credits - p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credits(UUID, INTEGER) TO service_role;


-- ── 2. Simplificar deduct_credit(UUID) — remover DELETE FROM auth.users ──────
-- A eliminação fica a cargo do Node.js (mais fiável com service_role)
CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits
    INTO current_credits
    FROM profiles
   WHERE id = user_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF current_credits < 1 THEN RETURN -1; END IF;

  UPDATE profiles
     SET credits    = credits - 1,
         updated_at = NOW()
   WHERE id = user_id;

  -- Eliminação de conta temp feita no Node.js — não aqui
  RETURN current_credits - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO service_role;
