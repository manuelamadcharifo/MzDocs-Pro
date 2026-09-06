-- supabase/migration_v15_receipt_verification.sql
-- Adiciona colunas de verificação automática de comprovativos à tabela transactions.
-- Execute no Supabase SQL Editor (uma vez).

-- ─── 1. Novas colunas na tabela transactions ────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS receipt_hash        TEXT,
  ADD COLUMN IF NOT EXISTS receipt_verified    BOOLEAN    DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_confidence  FLOAT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_ref         TEXT,
  ADD COLUMN IF NOT EXISTS verification_method TEXT       DEFAULT 'pending'
    CHECK (verification_method IN ('auto', 'manual', 'pending')),
  ADD COLUMN IF NOT EXISTS review_reason       TEXT;

-- Actualizar o CHECK de status para incluir review_needed
-- (só executa se a constraint existir com nome antigo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'transactions'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%status%'
  ) THEN
    -- Remover constraint antiga e recriar com review_needed
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
  END IF;
END $$;

-- Garantir que status aceita 'review_needed' e 'failed' para além dos existentes
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled', 'review_needed', 'completed'));

-- ─── 2. Índices para pesquisa rápida ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_status_created
  ON transactions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_receipt_hash
  ON transactions (receipt_hash)
  WHERE receipt_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_receipt_ref
  ON transactions (receipt_ref)
  WHERE receipt_ref IS NOT NULL;

-- ─── 3. Garantir que a RPC add_credits existe ────────────────────────────
-- Se já existir, este bloco não faz nada.
CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_credits INT;
BEGIN
  UPDATE profiles
    SET credits = credits + amount,
        updated_at = NOW()
  WHERE id = user_id
  RETURNING credits INTO new_credits;

  RETURN COALESCE(new_credits, amount);
END;
$$;

-- ─── 4. Vista para o painel admin (pending + review_needed) ──────────────
CREATE OR REPLACE VIEW v_pending_payments AS
SELECT
  t.id,
  t.reference_id,
  t.user_id,
  t.package_id,
  t.amount,
  t.credits,
  t.status,
  t.phone_number,
  t.receipt_confidence,
  t.verification_method,
  t.review_reason,
  t.created_at,
  p.full_name,
  p.email
FROM transactions t
LEFT JOIN profiles p ON p.id = t.user_id
WHERE t.status IN ('pending', 'review_needed')
ORDER BY t.created_at ASC;

-- ─── 5. RLS: service_role tem acesso total (já garantido pelas policies existentes)
-- Nenhuma alteração necessária nas policies — service_role bypassa RLS.

-- ─── Verificação final ───────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN (
    'receipt_hash', 'receipt_verified', 'receipt_confidence',
    'receipt_ref', 'verification_method', 'review_reason'
  )
ORDER BY column_name;
