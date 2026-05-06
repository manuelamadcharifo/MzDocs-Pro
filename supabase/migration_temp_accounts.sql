-- supabase/migration_temp_accounts.sql
-- Contas temporárias para pagamento avulso
-- Executar no SQL Editor do Supabase APÓS migration_monthly_credits.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Adicionar colunas de conta temporária à tabela profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_temp        BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temp_ref       TEXT,        -- referência MANxxxxxxx
  ADD COLUMN IF NOT EXISTS temp_password  TEXT;        -- password gerada (texto limpo para mostrar ao utilizador 1x)

CREATE INDEX IF NOT EXISTS idx_profiles_temp_ref ON profiles (temp_ref) WHERE temp_ref IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Função: deduct_credit COM auto-eliminação de conta temporária
--    Substitui a função anterior — ao chegar a 0 e ser conta temp, elimina tudo
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
  is_temporary    BOOLEAN;
BEGIN
  SELECT credits, is_temp
    INTO current_credits, is_temporary
    FROM profiles
   WHERE id = user_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF current_credits < 1 THEN RETURN -1; END IF;

  -- Descontar crédito
  UPDATE profiles
     SET credits    = credits - 1,
         updated_at = NOW()
   WHERE id = user_id;

  -- Se ficou a 0 e é conta temporária → eliminar utilizador do Supabase Auth
  -- (CASCADE apaga o profile e os documents automaticamente)
  IF (current_credits - 1) = 0 AND is_temporary THEN
    DELETE FROM auth.users WHERE id = user_id;
    RETURN 0;
  END IF;

  RETURN current_credits - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: contas temporárias podem ler/actualizar o seu próprio perfil
--    (mesma política já existente — auth.uid() = id cobre tudo)
-- ─────────────────────────────────────────────────────────────────────────────

-- Política extra: admin pode ver is_temp
DROP POLICY IF EXISTS "admin_view_temp" ON profiles;
CREATE POLICY "admin_view_temp" ON profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p
     WHERE p.id = auth.uid() AND p.is_admin = TRUE
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Função auxiliar para admin confirmar pagamento avulso e criar conta temp
--    Chamada pelo novo endpoint /api/admin/confirm-avulso
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_temp_account_for_avulso(
  p_reference_id  TEXT,
  p_phone         TEXT,
  p_credits       INTEGER,
  p_temp_email    TEXT,
  p_temp_password TEXT
)
RETURNS JSONB AS $$
DECLARE
  tx RECORD;
BEGIN
  -- Localizar transacção pela referência
  SELECT * INTO tx
    FROM transactions
   WHERE reference_id = p_reference_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"error":"Transação não encontrada"}'::JSONB;
  END IF;
  IF tx.status = 'completed' THEN
    RETURN '{"error":"Transação já confirmada"}'::JSONB;
  END IF;

  -- Marcar transacção como concluída
  UPDATE transactions
     SET status       = 'completed',
         confirmed_at = NOW()
   WHERE reference_id = p_reference_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_temp_account_for_avulso(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
