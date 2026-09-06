-- ============================================================
-- MIGRAÇÃO v38 — Templates: corrige aprovação/rejeição + repartição de vendas
-- Execute no SQL Editor do Supabase.
--
-- PARTE A corrige um bug real e confirmado na secção "Templates" do painel
-- admin: ao Aprovar/Rejeitar, o front-end (AdminApp.js) tentava gravar
-- approved_at/rejected_at — colunas que NUNCA chegaram a ser criadas em
-- nenhuma migração anterior. Isto fazia a operação falhar sempre com um
-- erro SQL ("column does not exist"). Além disso, o front-end usava o
-- cliente Supabase directamente no browser (RLS), e a única política de
-- escrita em templates_custom é "tpl_update_own" (só o autor do template
-- pode editar o seu próprio registo) — ou seja, mesmo depois de corrigir
-- as colunas, um admin continuaria sem conseguir aprovar/rejeitar/definir
-- preço em templates submetidos por OUTRO utilizador, porque a RLS
-- bloqueia. A correcção definitiva está em AdminApp.js: as acções passam
-- a usar a API /api/admin/templates (que já existia, usa a service role
-- e ignora RLS de propósito) em vez de acesso directo à tabela.
--
-- PARTE B implementa a repartição de receita pedida: o cliente pode criar
-- um template com preço e regras próprias, e a percentagem da venda fica
-- sempre entre 60%-70% para o criador (vendedor) e 30%-40% para a
-- plataforma — nunca fora desta banda, mesmo que alguém tente enviar um
-- valor diferente (CHECK constraint no banco de dados, não só validação
-- no servidor).
-- ============================================================

-- ── A. Colunas em falta usadas pelo fluxo de aprovação/rejeição ────────────
ALTER TABLE templates_custom
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ DEFAULT NULL;

-- ── B.1 Preço e percentagem de repartição por template ─────────────────────
ALTER TABLE templates_custom
  ADD COLUMN IF NOT EXISTS price_mzn NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (price_mzn >= 0),
  ADD COLUMN IF NOT EXISTS author_share_percent NUMERIC(5,2) NOT NULL DEFAULT 65
    CHECK (author_share_percent BETWEEN 60 AND 70);

COMMENT ON COLUMN templates_custom.price_mzn IS
  'Preço em MZN (equivalente) cobrado quando outro utilizador usa este template. 0 = gratuito, sem repartição.';
COMMENT ON COLUMN templates_custom.author_share_percent IS
  'Percentagem da venda que fica para o criador do template. Sempre entre 60 e 70 — o resto (30 a 40%) fica para a plataforma.';

-- ── B.2 Saldo de royalties do criador (mesmo padrão de aff_balance) ────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS template_author_balance      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS template_author_total_earned NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── B.3 Ledger de vendas — uma linha por cada uso pago de um template ─────
CREATE TABLE IF NOT EXISTS template_sales (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        UUID        NOT NULL REFERENCES templates_custom(id) ON DELETE CASCADE,
  author_id          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_id           UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  credits_spent      INT         NOT NULL DEFAULT 0,
  amount_mzn         NUMERIC(10,2) NOT NULL,
  author_share_mzn   NUMERIC(10,2) NOT NULL,
  platform_share_mzn NUMERIC(10,2) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_sales_author   ON template_sales(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_sales_template ON template_sales(template_id);

ALTER TABLE template_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tplsales_read_own" ON template_sales;
CREATE POLICY "tplsales_read_own" ON template_sales
  FOR SELECT USING (auth.uid() = author_id);

-- ── B.4 Levantamentos de royalties do criador (mirror de affiliate_withdrawals) ─
CREATE TABLE IF NOT EXISTS template_withdrawals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  mpesa_phone  TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','completed','rejected')),
  admin_note   TEXT,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpl_withdraw_author ON template_withdrawals(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpl_withdraw_status  ON template_withdrawals(status);

ALTER TABLE template_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tplwd_read_own" ON template_withdrawals;
CREATE POLICY "tplwd_read_own" ON template_withdrawals
  FOR SELECT USING (auth.uid() = author_id);

-- ── B.5 RPC: processa o uso pago de um template de forma atómica ──────────
-- Chamada pela API (service role) sempre que alguém usa um template
-- pertencente a outro utilizador. O valor da venda é sempre o
-- templates_custom.price_mzn gravado no servidor — nunca um valor vindo
-- do pedido do cliente — para não ser possível manipular o preço.
-- Bloqueia a linha do template (FOR UPDATE) para nunca haver condições de
-- corrida entre usos simultâneos, calcula a repartição a partir de
-- author_share_percent (sempre 60-70%, garantido pelo CHECK da tabela) e
-- credita o saldo do criador de forma atómica.
CREATE OR REPLACE FUNCTION process_template_sale(
  p_template_id   UUID,
  p_buyer_id      UUID,
  p_credits_spent INT DEFAULT 0
) RETURNS JSON AS $$
DECLARE
  v_tpl RECORD;
  v_amount_mzn     NUMERIC;
  v_author_share   NUMERIC;
  v_platform_share NUMERIC;
BEGIN
  SELECT id, user_id, status, is_public, price_mzn, author_share_percent
    INTO v_tpl
    FROM templates_custom
    WHERE id = p_template_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Template não encontrado');
  END IF;

  -- Sem repartição quando: template sem autor de royalties (ex: oficial da
  -- equipa), o próprio autor a usar o seu template, ou template gratuito.
  IF v_tpl.user_id IS NULL OR v_tpl.user_id = p_buyer_id
     OR v_tpl.price_mzn IS NULL OR v_tpl.price_mzn <= 0 THEN
    RETURN json_build_object('success', true, 'split', false);
  END IF;

  v_amount_mzn     := v_tpl.price_mzn;
  v_author_share   := ROUND(v_amount_mzn * (v_tpl.author_share_percent / 100.0), 2);
  v_platform_share := ROUND(v_amount_mzn - v_author_share, 2);

  UPDATE profiles SET
    template_author_balance      = COALESCE(template_author_balance, 0) + v_author_share,
    template_author_total_earned = COALESCE(template_author_total_earned, 0) + v_author_share
  WHERE id = v_tpl.user_id;

  INSERT INTO template_sales
    (template_id, author_id, buyer_id, credits_spent, amount_mzn, author_share_mzn, platform_share_mzn)
  VALUES
    (p_template_id, v_tpl.user_id, p_buyer_id, COALESCE(p_credits_spent, 0), v_amount_mzn, v_author_share, v_platform_share);

  RETURN json_build_object(
    'success', true, 'split', true,
    'amount_mzn', v_amount_mzn,
    'author_share_mzn', v_author_share, 'platform_share_mzn', v_platform_share
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
