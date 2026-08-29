-- ============================================================
-- MIGRAÇÃO v66 — Primeiro documento grátis (não crédito)
-- Execute no SQL Editor do Supabase, DEPOIS da migration_v65.
--
-- PEDIDO DO CLIENTE: "quero que o primeiro documento seja grátis não 1
-- crédito como antes... qualquer documento do projecto desde que seja o
-- primeiro do projecto tem que ser gratuito... o mesmo acontece com o 1
-- crédito que se ganha ao usar uma referência de afiliado tem que ser 2
-- documentos... os modelos pagos têm que permanecer pagos, apenas os
-- documentos iniciais é que têm de ser grátis."
--
-- DIFERENÇA FACE AO MECANISMO ANTIGO ("1 crédito grátis no registo"):
-- Um crédito grátis só cobre um documento se esse documento custar
-- exactamente 1 crédito — mas nem todos custam (VALID_COSTS vai de 1 a
-- 10, ver api/_services/account.js). "O primeiro documento é grátis",
-- tal como pedido, tem de cobrir o PRIMEIRO documento seja qual for o
-- custo real dele, sem tocar no saldo de créditos. Por isso este mecanismo
-- é um CONTADOR PRÓPRIO (free_documents_used), separado dos créditos —
-- não um saldo inicial de créditos como antes.
--
-- NÃO SE APLICA A TEMPLATES PAGOS: a verificação em
-- api/_services/account.js (handleDeductCredit) exclui explicitamente
-- qualquer documentType que comece por "template_" (a mesma convenção já
-- usada para a compra de templates do marketplace — ver migration_v64) —
-- "os modelos pagos têm que permanecer pagos" aplica-se sempre, mesmo ao
-- primeiro documento de uma conta nova.
-- ============================================================

-- ── 1. Contador de documentos grátis já usados (separado de créditos) ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS free_documents_used INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.free_documents_used IS
  'v66: quantos documentos "grátis" (fora do sistema de créditos) esta conta já gerou. Limite: 1 para contas normais, 2 para contas registadas através de um link de afiliado (referred_by IS NOT NULL) — ver grant_free_document(). Nunca usado para templates pagos do marketplace (documentType começado por "template_").';

-- ── 2. Contas já existentes: não recebem este benefício retroactivamente ──
-- Só interessa a quem se regista A PARTIR de agora. Uma conta que já
-- gerou pelo menos um documento (total_documents > 0) ou já tinha
-- consumido o antigo crédito grátis (free_credit_used = TRUE) é marcada
-- como já tendo usado o seu "documento grátis", para nunca dar um bónus
-- não pedido a quem já é utilizador activo.
UPDATE profiles
   SET free_documents_used = 1
 WHERE free_documents_used = 0
   AND (COALESCE(total_documents, 0) > 0 OR free_credit_used = TRUE);

-- ── 3. Desligar o mecanismo antigo (créditos grátis no registo) ──────────
-- handle_new_user() (migration_v21) já lê "free_credits_normal" de
-- system_settings em tempo de execução — não precisa de nenhuma alteração
-- de código/trigger, só do VALOR desta configuração. Contas novas passam
-- a nascer com 0 créditos; o primeiro (ou os dois primeiros, se referida)
-- documento(s) ficam cobertos pelo mecanismo novo, sem tocar em créditos.
INSERT INTO system_settings (key, value, description) VALUES
  ('free_credits_normal', '0', 'v66: DESLIGADO — substituído pelo mecanismo de documento(s) grátis (free_documents_used), que não é limitado a 1 crédito e cobre o custo real do primeiro documento gerado.')
  ON CONFLICT (key) DO UPDATE SET value = '0';

-- ── 4. Desligar o antigo bónus de 1 crédito por registo via afiliado ─────
-- grant_referral_signup_bonus() (migration_v36) já lê "aff_bonus_signup"
-- de system_settings e não faz nada se for 0 — de novo, só a configuração
-- muda, a função e a chamada em api/auth/index.js continuam intactas. O
-- benefício de quem se regista por afiliado passa a ser inteiramente o
-- allowance de 2 documentos grátis (ver grant_free_document() abaixo),
-- não um crédito extra.
INSERT INTO system_settings (key, value, description) VALUES
  ('aff_bonus_signup', '0', 'v66: DESLIGADO — substituído pelo allowance de 2 documentos grátis (em vez de 1) para quem se regista através de um link de afiliado, ver grant_free_document().')
  ON CONFLICT (key) DO UPDATE SET value = '0';

-- ── 5. RPC: concede um documento grátis, se ainda houver direito ────────
-- Atómica (FOR UPDATE) e idempotente por operation_id (mesmo padrão já
-- usado pela dedução paga — ver migration_v60_idempotent_credit_operations.sql):
-- um pedido repetido com o MESMO operation_id (retry de rede) devolve
-- sucesso sem voltar a consumir o contador.
CREATE OR REPLACE FUNCTION grant_free_document(
  p_user_id       UUID,
  p_operation_id  UUID,
  p_document_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_used      INTEGER;
  v_referred  UUID;
  v_allowance INTEGER;
  v_replay    BOOLEAN;
BEGIN
  IF p_operation_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM credit_logs
      WHERE user_id = p_user_id AND operation_id = p_operation_id AND action = 'free_document'
    ) INTO v_replay;
    IF v_replay THEN RETURN TRUE; END IF;
  END IF;

  SELECT free_documents_used, referred_by INTO v_used, v_referred
    FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_used IS NULL THEN RETURN FALSE; END IF; -- utilizador não encontrado

  -- 1 documento grátis para toda a gente; 2 para quem se registou através
  -- de um link de afiliado — substitui o antigo bónus de 1 crédito extra
  -- (aff_bonus_signup, agora desligado no passo 4 acima).
  v_allowance := CASE WHEN v_referred IS NOT NULL THEN 2 ELSE 1 END;

  IF v_used >= v_allowance THEN RETURN FALSE; END IF;

  UPDATE profiles SET free_documents_used = free_documents_used + 1 WHERE id = p_user_id;

  INSERT INTO credit_logs (user_id, action, credits, document_type, credit_source, operation_id, note)
  VALUES (
    p_user_id, 'free_document', 0, p_document_type, 'free_first_document', p_operation_id,
    'Documento gratuito (' || (v_used + 1) || '/' || v_allowance || ')'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION grant_free_document IS
  'v66: concede o(s) documento(s) inicial(is) grátis de uma conta, sem tocar em profiles.credits. NUNCA deve ser chamada para documentType a começar por "template_" — ver validação em api/_services/account.js (handleDeductCredit), que impede isso antes mesmo de chamar esta função.';

-- Confirmação (correr manualmente para verificar):
-- SELECT key, value FROM system_settings WHERE key IN ('free_credits_normal','aff_bonus_signup');
-- SELECT id, free_documents_used, referred_by, total_documents FROM profiles ORDER BY created_at DESC LIMIT 20;
