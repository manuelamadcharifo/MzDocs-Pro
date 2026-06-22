-- supabase/migration_v12_refund_credit.sql
-- ──────────────────────────────────────────────────────────────────────────
-- RECONSTRUÍDO — Junho/2026 (auditoria de consistência).
--
-- PROBLEMA ENCONTRADO: o README.md instrui a executar este ficheiro e
-- descreve-o como "Novo (v12): RPC refund_credit + índice em credit_logs",
-- mas o ficheiro não existia em `supabase/` — nem em nenhum outro lugar do
-- repositório. Como consequência, a tabela `credit_logs` (referenciada em
-- api/deduct-credit.js, api/process-payment.js, api/admin/index.js e
-- api/misc.js) também não tinha nenhum `CREATE TABLE` no repo.
--
-- Sem este ficheiro, a chamada `rpc('refund_credit', ...)` em
-- api/generate-document.js e api/deduct-credit.js falha sempre, e o código
-- cai no fallback manual (leitura + escrita não-atómica em `profiles`) —
-- o que reintroduz exactamente a condição de corrida que a RPC deveria
-- eliminar (ver ROADMAP-ESCALA.md, secção sobre `deduct_credit_atomic`).
--
-- Este ficheiro foi reconstruído a partir do uso real no código-fonte
-- (assinatura da função, nome dos parâmetros, colunas de `credit_logs`
-- inseridas em api/deduct-credit.js, api/process-payment.js, api/misc.js
-- e api/admin/index.js). Se a tabela `credit_logs` já existir na sua base
-- de dados de produção com uma estrutura diferente, reveja antes de
-- executar — todos os passos abaixo usam `IF NOT EXISTS` / `CREATE OR
-- REPLACE` e são seguros para reexecutar.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela credit_logs ────────────────────────────────────────────────
-- Histórico de toda a movimentação de créditos (consumo, reembolso, compra,
-- bónus). Colunas confirmadas pelo uso em api/deduct-credit.js (consume,
-- refund), api/process-payment.js (purchase_pending), api/misc.js
-- (bonus, via verify-receipt) e api/admin/index.js (purchase_confirmed,
-- bonus via aprovação manual de comprovativo).

CREATE TABLE IF NOT EXISTS credit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id  UUID        REFERENCES transactions(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL CHECK (
                    action IN ('consume','refund','purchase_pending','purchase_confirmed','bonus')
                  ),
  credits         INTEGER     NOT NULL,           -- negativo em 'consume', positivo nos restantes
  document_type   TEXT,                           -- tipo de documento gerado (quando aplicável)
  note            TEXT,                           -- descrição legível da operação
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice principal: histórico por utilizador, mais recente primeiro
-- (consulta usada no painel admin e no histórico do próprio utilizador).
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_created
  ON credit_logs(user_id, created_at DESC);

-- Índice auxiliar: localizar todos os registos de uma transacção específica.
CREATE INDEX IF NOT EXISTS idx_credit_logs_transaction
  ON credit_logs(transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_logs_own_select" ON credit_logs;
CREATE POLICY "credit_logs_own_select" ON credit_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "credit_logs_admin_select" ON credit_logs;
CREATE POLICY "credit_logs_admin_select" ON credit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- As inserções são feitas exclusivamente pelo backend com a Service Role Key
-- (api/_lib/supabaseAdmin.js), que ignora RLS — não é necessária política de INSERT.

-- ── 2. Função refund_credit ──────────────────────────────────────────────
-- Reembolso atómico de créditos. Chamada quando a geração de IA falha por
-- completo DEPOIS de o crédito já ter sido debitado (todos os providers
-- indisponíveis) — ver api/generate-document.js e api/deduct-credit.js
-- (modo `{ refund: true }`).
--
-- Assinatura confirmada pelo código: rpc('refund_credit', { p_user_id, p_amount })
-- Retorna o novo saldo de créditos (INTEGER), usado directamente como
-- `creditsRemaining` na resposta ao cliente.

CREATE OR REPLACE FUNCTION refund_credit(
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
    RAISE EXCEPTION 'refund_credit: p_amount deve ser positivo';
  END IF;

  UPDATE profiles
  SET credits    = credits + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'refund_credit: utilizador % não encontrado', p_user_id;
  END IF;

  INSERT INTO credit_logs (user_id, action, credits, note)
  VALUES (p_user_id, 'refund', p_amount, 'Reembolso automático — geração de IA falhou após dedução');

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- NOTA: se a sua base de dados em produção JÁ tiver uma tabela `credit_logs`
-- com estrutura diferente da acima (por ter sido criada manualmente ao
-- longo do tempo, dado que não existia nenhuma migração para ela), o
-- `CREATE TABLE IF NOT EXISTS` não fará nada — nesse caso, confirme que as
-- colunas usadas pelo código (user_id, transaction_id, action, credits,
-- document_type, note) já existem na sua tabela antes de prosseguir.
-- ──────────────────────────────────────────────────────────────────────────
