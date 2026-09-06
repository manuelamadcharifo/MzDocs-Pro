-- supabase/migration_v57_atomic_payment_confirmation.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P0/P1-02 (auditoria Ago/2026) — RPC ATÓMICA REAL para "confirmar pagamento
-- + creditar utilizador".
--
-- O QUE HAVIA ANTES (api/_services/payments.js / verifyReceiptInternal):
--   1. PATCH transactions SET status='completed' WHERE id=... AND status='pending'
--   2. (passo separado, chamada HTTP REST diferente) rpc('add_credits', ...)
--   3. insert em credit_logs
--
--   Cada passo era uma chamada de rede distinta ao PostgREST. O código já
--   tinha uma boa protecção contra DUPLA execução (o PATCH só afecta 0/1
--   linhas por causa do filtro "&status=eq.pending", e há uma checagem a
--   credit_logs antes de creditar de novo) — mas não era uma única
--   transacção de base de dados. Se o processo Node morresse, ou a rede
--   falhasse, exactamente ENTRE o passo 1 e o passo 2, a transacção ficava
--   'completed' sem nenhum crédito atribuído, dependendo de um retry manual
--   ou automático para reparar — exactamente o cenário que o comentário
--   original "Pagamento já está confirmado — não reverter" documentava.
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   confirm_payment_and_credit() faz os três passos acima DENTRO da mesma
--   função PL/pgSQL — que o Postgres executa como uma única transacção
--   atómica (tudo ou nada) — e devolve um resultado estruturado em vez de
--   o chamador ter de inferir o que aconteceu a partir de dois retornos
--   REST separados.
--
-- LIMITAÇÃO CONHECIDA E ACEITE (documentada, não escondida): quando o
-- pagamento é de um cliente "avulso" sem conta ainda criada (userId NULL),
-- a criação da conta usa a API de Admin do Supabase Auth — uma chamada
-- HTTP externa que NÃO PODE viver dentro de uma transacção SQL. Esse
-- caminho continua em api/_services/payments.js (_createAvulsoAccount),
-- protegido pela MESMA verificação de idempotência já existente (checar
-- credit_logs antes de criar a conta). Esta RPC resolve o caso mais comum
-- e mais fácil de ficar inconsistente: comprador com conta já existente.
--
-- Idempotente — pode ser executada novamente sem efeitos colaterais.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION confirm_payment_and_credit(
  p_transaction_id   UUID,
  p_receipt_hash     TEXT,
  p_receipt_ref      TEXT    DEFAULT NULL,
  p_confidence       NUMERIC DEFAULT NULL,
  p_credits          INTEGER DEFAULT 0,
  p_user_id          UUID    DEFAULT NULL,
  p_verification_note TEXT   DEFAULT 'Pagamento auto-verificado'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx              RECORD;
  v_already_credited BOOLEAN := FALSE;
  v_new_balance     INTEGER;
BEGIN
  -- 1. Bloquear a linha da transacção — nenhuma outra chamada concorrente
  --    (ex.: dois uploads quase simultâneos do mesmo comprovativo) consegue
  --    ler/escrever esta linha até este bloco terminar.
  SELECT id, status, user_id, visitor_id
    INTO v_tx
    FROM transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'transaction_not_found'
    );
  END IF;

  -- 2. Já não está pending/review_needed? Outra chamada já tratou disto
  --    (ou o admin confirmou manualmente entretanto) — não repetir.
  IF v_tx.status NOT IN ('pending', 'review_needed') THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_confirmed', true, 'credited', false,
      'status', v_tx.status
    );
  END IF;

  -- 3. Confirmar a transacção.
  UPDATE transactions
     SET status               = 'completed',
         confirmed_at         = NOW(),
         receipt_hash         = COALESCE(p_receipt_hash, receipt_hash),
         receipt_verified     = TRUE,
         receipt_confidence   = p_confidence,
         verification_method  = 'auto',
         receipt_ref          = COALESCE(p_receipt_ref, receipt_ref)
   WHERE id = p_transaction_id;

  -- 4. Idempotência do crédito: se já existe um credit_logs para esta
  --    transacção (ex.: retry depois de uma falha parcial anterior à
  --    introdução desta RPC), não creditar de novo.
  SELECT EXISTS (
    SELECT 1 FROM credit_logs WHERE transaction_id = p_transaction_id
  ) INTO v_already_credited;

  IF v_already_credited THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_confirmed', false, 'already_credited', true,
      'credited', false
    );
  END IF;

  -- 5. Sem utilizador conhecido (fluxo avulso sem conta ainda) ou 0
  --    créditos a atribuir: a transacção fica confirmada, mas quem chamou
  --    esta RPC (api/_services/payments.js) é responsável por criar a
  --    conta avulso a seguir, fora desta transacção SQL.
  IF p_user_id IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_confirmed', false, 'credited', false,
      'reason', 'no_user_or_zero_credits'
    );
  END IF;

  -- 6. Creditar — reutiliza add_credits() (já abre lote no credit_ledger,
  --    ver migration_v52) para não duplicar essa lógica aqui.
  v_new_balance := add_credits(p_user_id, p_credits);

  INSERT INTO credit_logs (user_id, transaction_id, action, credits, document_type, note)
  VALUES (
    p_user_id, p_transaction_id, 'bonus', p_credits, NULL,
    p_verification_note || ' (confidence: ' || COALESCE(p_confidence::TEXT, 'n/d') || ')'
  );

  RETURN jsonb_build_object(
    'ok', true, 'already_confirmed', false, 'credited', true,
    'new_balance', v_new_balance, 'visitor_id', v_tx.visitor_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_payment_and_credit(UUID, TEXT, TEXT, NUMERIC, INTEGER, UUID, TEXT) TO service_role;
-- NUNCA conceder a 'authenticated' — esta função altera saldo de créditos e
-- só deve ser chamada pelo backend (Service Role Key), nunca pelo browser.

COMMENT ON FUNCTION confirm_payment_and_credit IS
  'P0/P1-02 (Ago/2026): confirma transacção + credita utilizador numa única transacção SQL atómica. Ver api/_services/payments.js:verifyReceiptInternal.';
