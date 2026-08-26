-- ============================================================
-- MIGRAÇÃO v64 — Compras de templates pagos (desbloqueio permanente)
-- Execute no SQL Editor do Supabase.
--
-- PROBLEMA CORRIGIDO (2 bugs reais, confirmados por captura de ecrã do
-- utilizador):
--
-- 1. O modal de detalhe de um template na Galeria (templates.html →
--    openDetail) buscava os dados via "/api/templates?action=list&id=...",
--    cujo SELECT (em api/_services/templates.js → tplList) nunca incluía a
--    coluna credit_cost. Resultado: um template PAGO (ex: 2 créditos,
--    correctamente mostrado como "⭐ 2 cr" no cartão da grelha, que usa um
--    endpoint diferente) aparecia no modal de detalhe como "✓ Gratuito" —
--    e pior, o botão "Usar este Template" também lia credit_cost desse
--    mesmo objecto (sempre undefined), pelo que NUNCA debitava créditos,
--    mesmo em templates premium. Um bug de fuga de receita real, não só
--    visual. A correcção do SELECT está em api/_services/templates.js.
--
-- 2. Não existia NENHUM registo de "este utilizador já pagou por este
--    template" — cada vez que "Usar este Template" fosse chamado (mesmo
--    corrigido o bug acima), o utilizador seria cobrado OUTRA VEZ pelo
--    MESMO template, indefinidamente. O pedido do cliente é explícito:
--    "uma vez pago o template fica disponível para o usuário que pagou
--    por tempo indefinido" — esta tabela é essa memória permanente.
-- ============================================================

CREATE TABLE IF NOT EXISTS template_purchases (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID        NOT NULL REFERENCES templates_custom(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credits_paid  INT         NOT NULL DEFAULT 0 CHECK (credits_paid >= 0),
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Um utilizador só pode "possuir" cada template uma única vez — a
  -- verificação de posse (existe uma linha aqui?) é o que decide se
  -- "Usar este Template" cobra créditos outra vez ou não.
  UNIQUE (template_id, user_id)
);

COMMENT ON TABLE template_purchases IS
  'Registo permanente de quem já pagou por um template pago — depois da primeira compra, o utilizador pode voltar a usar o mesmo template sem ser cobrado novamente.';
COMMENT ON COLUMN template_purchases.credits_paid IS
  'Créditos efectivamente debitados nesta compra (o preço pode mudar depois; guarda-se o valor pago no momento).';

CREATE INDEX IF NOT EXISTS idx_tpl_purchases_user
  ON template_purchases(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE template_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpl_purchases_read_own" ON template_purchases;
CREATE POLICY "tpl_purchases_read_own" ON template_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- Inserção só através da API com service_role (api/_services/templates.js
-- → tplUse), nunca directamente do browser — impede um utilizador de
-- criar o seu próprio registo de "já paguei" sem realmente debitar
-- créditos. Não se cria nenhuma policy de INSERT/UPDATE/DELETE para
-- utilizadores autenticados; a service_role key ignora RLS por definição.
