-- ============================================
-- MIGRAÇÃO v8.0 - MzDocs Pro Pricing & Temp Accounts
-- Execute no SQL Editor do Supabase
-- ============================================

-- 1. Adicionar novas colunas à tabela profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'normal'
    CHECK (account_type IN ('normal', 'avulso')),
  ADD COLUMN IF NOT EXISTS credits_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_credit_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_credit_used BOOLEAN DEFAULT FALSE;

-- Garantir que created_at existe (pode já existir)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Criar tabela de pacotes de preços
CREATE TABLE IF NOT EXISTS credit_packages (
  id           TEXT PRIMARY KEY,
  name         TEXT        NOT NULL,
  credits      INTEGER     NOT NULL,
  price_mzn    INTEGER     NOT NULL,
  is_active    BOOLEAN     DEFAULT TRUE,
  sort_order   INTEGER     DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Inserir/actualizar pacotes optimizados para Moçambique
INSERT INTO credit_packages (id, name, credits, price_mzn, sort_order) VALUES
  ('avulso',  'Avulso',  3,   50,   1),
  ('starter', 'Starter', 10,  120,  2),
  ('basico',  'Básico',  25,  280,  3),
  ('pro',     'Pro',     60,  600,  4),
  ('empresa', 'Empresa', 150, 1500, 5)
ON CONFLICT (id) DO UPDATE SET
  credits   = EXCLUDED.credits,
  price_mzn = EXCLUDED.price_mzn,
  sort_order = EXCLUDED.sort_order;

-- 4. Criar tabela de log de uso de créditos (auditoria)
CREATE TABLE IF NOT EXISTS credit_usage_log (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID    REFERENCES profiles(id) ON DELETE CASCADE,
  document_type     TEXT    NOT NULL,
  credits_used      INTEGER NOT NULL,
  remaining_credits INTEGER NOT NULL,
  used_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Função auxiliar: normalizar telefone
CREATE OR REPLACE FUNCTION normalize_phone(p_phone TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN regexp_replace(p_phone, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Função: Criar conta temporária (Avulso) — 3 créditos, expira em 7 dias
CREATE OR REPLACE FUNCTION create_temp_account(
  p_phone     TEXT,
  p_full_name TEXT DEFAULT 'Utilizador Avulso'
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (
    id, phone, full_name, credits, account_type, credits_expires_at, created_at
  ) VALUES (
    v_user_id,
    normalize_phone(p_phone),
    p_full_name,
    3,
    'avulso',
    NOW() + INTERVAL '7 days',
    NOW()
  );

  RETURN jsonb_build_object(
    'success',    true,
    'user_id',    v_user_id,
    'credits',    3,
    'expires_at', NOW() + INTERVAL '7 days'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função: Criar conta normal com 1 crédito grátis (expira em 1 mês)
CREATE OR REPLACE FUNCTION create_normal_account(
  p_user_id   UUID,
  p_phone     TEXT,
  p_email     TEXT,
  p_full_name TEXT
)
RETURNS JSONB AS $$
BEGIN
  INSERT INTO profiles (
    id, phone, email, full_name, credits, account_type, credits_expires_at, created_at
  ) VALUES (
    p_user_id,
    normalize_phone(p_phone),
    p_email,
    p_full_name,
    1,
    'normal',
    NOW() + INTERVAL '1 month',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    phone    = EXCLUDED.phone,
    email    = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    credits  = CASE
                 WHEN profiles.free_credit_used = TRUE THEN profiles.credits
                 ELSE 1
               END,
    account_type       = 'normal',
    credits_expires_at = CASE
                           WHEN profiles.free_credit_used = TRUE THEN profiles.credits_expires_at
                           ELSE NOW() + INTERVAL '1 month'
                         END;

  RETURN jsonb_build_object(
    'success',    true,
    'credits',    1,
    'expires_at', NOW() + INTERVAL '1 month'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Função: Debitar crédito de forma atómica (com log de uso)
CREATE OR REPLACE FUNCTION deduct_credit_atomic(
  p_user_id      UUID,
  p_document_type TEXT,
  p_document_cost INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
  v_profile    RECORD;
  v_new_credits INTEGER;
BEGIN
  -- LOCK na linha para evitar race conditions
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Perfil não encontrado');
  END IF;

  -- Verificar expiração de créditos
  IF v_profile.credits_expires_at IS NOT NULL
     AND v_profile.credits_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'error',        'Créditos expirados',
      'expired_at',   v_profile.credits_expires_at,
      'account_type', v_profile.account_type
    );
  END IF;

  -- Verificar saldo
  IF v_profile.credits < p_document_cost THEN
    RETURN jsonb_build_object(
      'error',        'Créditos insuficientes',
      'current_credits', v_profile.credits,
      'required',     p_document_cost,
      'account_type', v_profile.account_type
    );
  END IF;

  v_new_credits := v_profile.credits - p_document_cost;

  UPDATE profiles
  SET
    credits             = v_new_credits,
    last_credit_used_at = NOW(),
    updated_at          = NOW(),
    free_credit_used    = CASE
                            WHEN v_profile.account_type = 'normal'
                                 AND v_profile.free_credit_used = FALSE
                                 AND v_profile.credits = 1
                            THEN TRUE
                            ELSE v_profile.free_credit_used
                          END
  WHERE id = p_user_id;

  -- Registar uso para auditoria
  INSERT INTO credit_usage_log (user_id, document_type, credits_used, remaining_credits, used_at)
  VALUES (p_user_id, p_document_type, p_document_cost, v_new_credits, NOW());

  RETURN jsonb_build_object(
    'success',           true,
    'remaining_credits', v_new_credits,
    'account_type',      v_profile.account_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Função: Limpeza automática de contas temporárias expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_temp_accounts()
RETURNS TABLE(deleted_count INTEGER, reason TEXT) AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Regra 1: Contas Avulso com 0 créditos há mais de 24h
  WITH deleted_zero AS (
    DELETE FROM profiles
    WHERE account_type = 'avulso'
      AND credits = 0
      AND last_credit_used_at IS NOT NULL
      AND last_credit_used_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted_zero;
  RETURN QUERY SELECT v_count, TEXT 'zero_credits_24h';

  -- Regra 2: Contas Avulso criadas há mais de 7 dias
  v_count := 0;
  WITH deleted_expired AS (
    DELETE FROM profiles
    WHERE account_type = 'avulso'
      AND created_at < NOW() - INTERVAL '7 days'
      AND (credits_expires_at IS NULL OR credits_expires_at < NOW())
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted_expired;
  RETURN QUERY SELECT v_count, TEXT 'expired_7days';

  -- Regra 3: Contas normais com créditos expirados — apenas zerar, não deletar
  UPDATE profiles
  SET credits = 0, credits_expires_at = NULL, updated_at = NOW()
  WHERE account_type = 'normal'
    AND credits > 0
    AND credits_expires_at IS NOT NULL
    AND credits_expires_at < NOW();

  RETURN QUERY SELECT 0, TEXT 'normal_expired_credits_reset';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Função: deduct_credits(UUID, INTEGER) — compatibilidade com deduct-credit.js
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
  new_credits     INTEGER;
BEGIN
  SELECT credits INTO current_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF current_credits IS NULL OR current_credits < p_amount THEN
    RETURN -1;
  END IF;

  new_credits := current_credits - p_amount;

  UPDATE profiles
  SET credits = new_credits, last_credit_used_at = NOW(), updated_at = NOW()
  WHERE id = p_user_id;

  RETURN new_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_cleanup
  ON profiles(account_type, credits, last_credit_used_at, created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_expiry
  ON profiles(credits_expires_at) WHERE credits_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_usage_user
  ON credit_usage_log(user_id, used_at DESC);

-- 12. Trigger: updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FIM DA MIGRAÇÃO v8.0
-- ============================================
