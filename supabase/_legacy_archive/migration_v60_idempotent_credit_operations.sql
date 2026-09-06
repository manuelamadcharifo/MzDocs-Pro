-- migration_v60_idempotent_credit_operations.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P1-08 (auditoria Ago/2026) — "Fluxo de refund merece teste de falha real /
-- idempotência, não apenas try/catch."
--
-- PROBLEMA:
-- O fluxo normal é: 1) /api/deduct-credit debita N créditos, 2) o cliente
-- chama /api/generate-document, 3) se a IA falhar, generate-document.js
-- chama rpc('refund_credit') a devolver o crédito. Cada um destes passos é
-- ATÓMICO isoladamente (lock de linha via FOR UPDATE), mas a SEQUÊNCIA como
-- um todo não é idempotente: se a resposta de um destes pedidos se perder
-- na rede depois de o servidor já ter processado (ex.: o timeout do
-- cliente dispara mesmo a operação já ter tido sucesso do lado do
-- servidor) e o pedido for repetido com os MESMOS parâmetros, o utilizador
-- pode ser debitado ou reembolsado duas vezes.
--
-- SOLUÇÃO:
-- Cada dedução/reembolso pode agora ser identificado por um operation_id
-- (UUID gerado pelo CLIENTE uma única vez por tentativa de geração,
-- reenviado sem alterações em qualquer retry dessa MESMA tentativa — ver
-- assets/js/services/Services.js). O servidor guarda esse operation_id em
-- credit_logs com um índice único (user_id, operation_id, action); um
-- segundo pedido com o mesmo operation_id nunca volta a tocar em
-- profiles.credits — devolve directamente o saldo já resultante da
-- primeira execução (replayed=true).
--
-- Sem operation_id (ex.: chamadas antigas do cliente antes do deploy desta
-- versão, ou ferramentas administrativas), o comportamento é EXACTAMENTE
-- o mesmo de antes — deduct_credits()/refund_credit() originais continuam
-- a existir e a ser chamados como fallback (ver api/deduct-credit.js e
-- api/generate-document.js). Este ficheiro é 100% aditivo, não altera
-- nenhuma função existente.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Colunas novas em credit_logs (idempotentes, seguras em produção) ──
ALTER TABLE credit_logs ADD COLUMN IF NOT EXISTS operation_id  UUID;
ALTER TABLE credit_logs ADD COLUMN IF NOT EXISTS balance_after INTEGER;

-- Um mesmo operation_id pode legitimamente aparecer duas vezes (uma linha
-- 'consume', uma linha 'refund' — dedução seguida do seu próprio
-- reembolso), por isso o índice único inclui `action`. Parcial: nunca
-- afecta as linhas antigas, todas com operation_id NULL.
CREATE UNIQUE INDEX IF NOT EXISTS credit_logs_user_operation_action_uniq
  ON credit_logs (user_id, operation_id, action)
  WHERE operation_id IS NOT NULL;

COMMENT ON COLUMN credit_logs.operation_id IS
  'P1-08 (Ago/2026): UUID gerado pelo cliente por tentativa de geração — permite reconhecer e ignorar retries duplicados de dedução/reembolso. NULL em linhas antigas ou de operações que não passam por este mecanismo (ex.: compras).';
COMMENT ON COLUMN credit_logs.balance_after IS
  'P1-08 (Ago/2026): saldo de profiles.credits imediatamente depois desta operação — devolvido directamente num replay idempotente, sem repetir a dedução/reembolso.';


-- ── 2. deduct_credits_idempotent — versão com protecção contra retry ─────
-- Mesmo contrato de deduct_credits() quando p_operation_id é NULL (aceita
-- NULL de propósito — chamador pode continuar a não passar operation_id).
-- Devolve (remaining_credits, replayed): remaining_credits segue a mesma
-- convenção de sempre (>=0 = saldo restante, -1 = insuficiente/utilizador
-- não encontrado); replayed=true significa "esta dedução JÁ tinha
-- acontecido antes, nada foi alterado agora".
CREATE OR REPLACE FUNCTION deduct_credits_idempotent(
  p_user_id       UUID,
  p_amount        INTEGER,
  p_operation_id  UUID    DEFAULT NULL,
  p_document_type TEXT    DEFAULT NULL,
  p_credit_source TEXT    DEFAULT 'paid'
)
RETURNS TABLE(remaining_credits INTEGER, replayed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_balance INTEGER;
  v_current           INTEGER;
BEGIN
  -- Replay rápido: já existe um registo desta dedução exacta? Não toca
  -- em profiles.credits — devolve o saldo já gravado da primeira vez.
  IF p_operation_id IS NOT NULL THEN
    SELECT cl.balance_after INTO v_existing_balance
      FROM credit_logs cl
     WHERE cl.user_id = p_user_id
       AND cl.operation_id = p_operation_id
       AND cl.action = 'consume'
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_balance, TRUE;
      RETURN;
    END IF;
  END IF;

  BEGIN
    SELECT credits INTO v_current FROM profiles WHERE id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT -1, FALSE;
      RETURN;
    END IF;
    IF v_current < p_amount THEN
      RETURN QUERY SELECT -1, FALSE;
      RETURN;
    END IF;

    UPDATE profiles
       SET credits    = credits - p_amount,
           updated_at = NOW()
     WHERE id = p_user_id;

    INSERT INTO credit_logs (
      user_id, action, credits, document_type, credit_source,
      operation_id, balance_after, note
    ) VALUES (
      p_user_id, 'consume', -p_amount, p_document_type, p_credit_source,
      p_operation_id, v_current - p_amount,
      CASE WHEN p_operation_id IS NULL
           THEN 'Dedução via RPC idempotente (sem operation_id)'
           ELSE 'Dedução via RPC idempotente' END
    );

    BEGIN
      PERFORM _consume_credit_ledger(p_user_id, p_amount);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- degradação segura (P2), igual a deduct_credits()
    END;

  EXCEPTION WHEN unique_violation THEN
    -- Corrida real: outra chamada CONCORRENTE com o MESMO operation_id
    -- venceu entretanto e já commitou a sua dedução. Este bloco inteiro
    -- (incluindo o UPDATE profiles acima, graças ao savepoint implícito
    -- do PL/pgSQL neste BEGIN/EXCEPTION) é revertido — o saldo nunca é
    -- tocado duas vezes. Devolvemos o saldo que a chamada vencedora gravou.
    SELECT cl.balance_after INTO v_existing_balance
      FROM credit_logs cl
     WHERE cl.user_id = p_user_id
       AND cl.operation_id = p_operation_id
       AND cl.action = 'consume'
     LIMIT 1;
    RETURN QUERY SELECT v_existing_balance, TRUE;
    RETURN;
  END;

  RETURN QUERY SELECT (v_current - p_amount), FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_credits_idempotent(UUID, INTEGER, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credits_idempotent(UUID, INTEGER, UUID, TEXT, TEXT) TO service_role;


-- ── 3. refund_credit_idempotent — mesmo princípio, para o reembolso ──────
CREATE OR REPLACE FUNCTION refund_credit_idempotent(
  p_user_id       UUID,
  p_amount        INTEGER,
  p_operation_id  UUID DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_note          TEXT DEFAULT 'Reembolso automático — geração de IA falhou após dedução'
)
RETURNS TABLE(remaining_credits INTEGER, replayed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_balance INTEGER;
  v_new_credits       INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'refund_credit_idempotent: p_amount deve ser positivo (recebido: %)', p_amount;
  END IF;

  IF p_operation_id IS NOT NULL THEN
    SELECT cl.balance_after INTO v_existing_balance
      FROM credit_logs cl
     WHERE cl.user_id = p_user_id
       AND cl.operation_id = p_operation_id
       AND cl.action = 'refund'
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_balance, TRUE;
      RETURN;
    END IF;
  END IF;

  BEGIN
    UPDATE profiles
       SET credits    = credits + p_amount,
           updated_at = NOW()
     WHERE id = p_user_id
    RETURNING credits INTO v_new_credits;

    IF v_new_credits IS NULL THEN
      RAISE EXCEPTION 'refund_credit_idempotent: utilizador % não encontrado', p_user_id;
    END IF;

    INSERT INTO credit_logs (
      user_id, action, credits, document_type, operation_id, balance_after, note
    ) VALUES (
      p_user_id, 'refund', p_amount, p_document_type, p_operation_id, v_new_credits, p_note
    );

    BEGIN
      INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
      VALUES (p_user_id, p_amount, p_amount, 'refund', NOW() + INTERVAL '30 days');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- degradação segura (P2), igual a refund_credit()
    END;

  EXCEPTION WHEN unique_violation THEN
    -- Mesma lógica da dedução: outra chamada concorrente com o mesmo
    -- operation_id já reembolsou entretanto; este bloco é revertido por
    -- inteiro e devolvemos o saldo que essa chamada gravou.
    SELECT cl.balance_after INTO v_existing_balance
      FROM credit_logs cl
     WHERE cl.user_id = p_user_id
       AND cl.operation_id = p_operation_id
       AND cl.action = 'refund'
     LIMIT 1;
    RETURN QUERY SELECT v_existing_balance, TRUE;
    RETURN;
  END;

  RETURN QUERY SELECT v_new_credits, FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credit_idempotent(UUID, INTEGER, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_credit_idempotent(UUID, INTEGER, UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION deduct_credits_idempotent(UUID, INTEGER, UUID, TEXT, TEXT) IS
  'P1-08 (Ago/2026): como deduct_credits(), mas com protecção contra retry via operation_id. Ver api/deduct-credit.js.';
COMMENT ON FUNCTION refund_credit_idempotent(UUID, INTEGER, UUID, TEXT, TEXT) IS
  'P1-08 (Ago/2026): como refund_credit(), mas com protecção contra retry via operation_id. Ver api/generate-document.js.';
