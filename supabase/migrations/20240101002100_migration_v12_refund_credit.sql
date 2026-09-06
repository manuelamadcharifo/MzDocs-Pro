-- supabase/migration_v12_refund_credit.sql
-- ──────────────────────────────────────────────────────────────────────────
-- RECONSTRUÍDO — Junho/2026 (auditoria de consistência).
-- ACTUALIZADO — para aplicar sobre base de dados de produção existente.
--
-- O que este ficheiro faz:
--   1. Garante que os índices e políticas RLS da tabela `credit_logs`
--      existem (a tabela em si já existe em produção — confirmado pelo
--      schema exportado — por isso usamos apenas ADD IF NOT EXISTS / DROP+
--      CREATE POLICY / CREATE INDEX IF NOT EXISTS).
--   2. Remove qualquer versão anterior de `refund_credit` (que existia
--      com assinatura diferente — só p_user_id, sem p_amount) e recria-a
--      com a assinatura que o código espera: (p_user_id UUID, p_amount INT).
--
-- ERRO que este ficheiro corrige:
--   "cannot remove parameter defaults from existing function"
--   Causado por tentar CREATE OR REPLACE quando a assinatura diverge.
--   Solução: DROP FUNCTION explícito antes do CREATE.
--
-- Seguro para reexecutar: todos os passos são idempotentes.
-- ──────────────────────────────────────────────────────────────────────────


-- ── 1. Índices em credit_logs (tabela já existe) ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_credit_logs_user_created
  ON credit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_logs_transaction
  ON credit_logs(transaction_id) WHERE transaction_id IS NOT NULL;


-- ── 2. RLS em credit_logs ────────────────────────────────────────────────

ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_logs_own_select" ON credit_logs;
CREATE POLICY "credit_logs_own_select" ON credit_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "credit_logs_admin_select" ON credit_logs;
CREATE POLICY "credit_logs_admin_select" ON credit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Inserções feitas pelo backend via Service Role Key (ignora RLS).


-- ── 3. Função refund_credit ──────────────────────────────────────────────
-- Assinatura usada pelo código:
--   rpc('refund_credit', { p_user_id: UUID, p_amount: INTEGER })
-- Retorna o novo saldo de créditos do utilizador (INTEGER).
--
-- DROP explícito necessário porque a versão antiga tinha apenas 1 parâmetro
-- (p_user_id UUID) — o PostgreSQL não permite alterar a lista de parâmetros
-- com CREATE OR REPLACE; exige DROP + CREATE.

DROP FUNCTION IF EXISTS refund_credit(UUID);
DROP FUNCTION IF EXISTS refund_credit(UUID, INTEGER);

CREATE FUNCTION refund_credit(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'refund_credit: p_amount deve ser positivo (recebido: %)', p_amount;
  END IF;

  UPDATE profiles
  SET    credits    = credits + p_amount,
         updated_at = NOW()
  WHERE  id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'refund_credit: utilizador % não encontrado', p_user_id;
  END IF;

  INSERT INTO credit_logs (user_id, action, credits, note)
  VALUES (
    p_user_id,
    'refund',
    p_amount,
    'Reembolso automático — geração de IA falhou após dedução'
  );

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER) TO service_role;


-- ── 4. Verificação final ─────────────────────────────────────────────────
-- Execute este SELECT para confirmar que a função foi criada correctamente:
--
-- SELECT proname, pg_get_function_arguments(oid) AS args,
--        pg_get_function_result(oid) AS returns
-- FROM   pg_proc
-- WHERE  proname = 'refund_credit';
--
-- Deverá retornar:
--   proname       | args                            | returns
--   refund_credit | p_user_id uuid, p_amount integer | integer
-- ──────────────────────────────────────────────────────────────────────────
