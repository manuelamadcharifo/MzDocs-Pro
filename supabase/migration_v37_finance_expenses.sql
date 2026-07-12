-- ============================================================
-- MIGRAÇÃO v37 — Finanças: despesas operacionais e "Valor Levantável"
-- Execute no SQL Editor do Supabase.
--
-- Contexto: o painel admin (separador novo "Finanças") precisa de saber
-- quanto dinheiro pode realmente ser levantado da plataforma, ou seja:
--
--   Valor Levantável = Receita Total Confirmada
--                     − Saldo reservado para Afiliados (profiles.aff_balance)
--                     − Despesas Operacionais registadas (finance_expenses)
--                     − Já Levantado pelo dono (finance_withdrawals)
--
-- Os custos recorrentes (domínio anual na mozdomains.co.mz, plano Vercel,
-- orçamento de providers de IA pagos) ficam configuráveis em
-- system_settings (chaves "finance_*"), lidos por api/admin/index.js
-- (acção "finance") e amortizados automaticamente por mês. A taxa de
-- câmbio USD→MZN usada para converter os custos em dólar é sempre obtida
-- em tempo real (nunca fixa nesta migração nem no código).
-- ============================================================

-- ── 1. Despesas operacionais (domínio, hosting, IA, outras) ────────────────
CREATE TABLE IF NOT EXISTS finance_expenses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT        NOT NULL CHECK (category IN ('domain', 'hosting', 'ai_providers', 'other')),
  description   TEXT,
  amount_mzn    NUMERIC(12,2) NOT NULL CHECK (amount_mzn > 0),
  is_recurring  BOOLEAN     NOT NULL DEFAULT FALSE,
  occurred_at   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_occurred_at
  ON finance_expenses(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_category
  ON finance_expenses(category);

-- RLS activo, sem políticas para anon/authenticated — apenas o
-- service_role (usado pelas funções serverless em /api/admin) acede a
-- esta tabela, tal como admin_logs e as restantes tabelas só-admin.
ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;

-- ── 2. Levantamentos já feitos pelo dono da plataforma ─────────────────────
CREATE TABLE IF NOT EXISTS finance_withdrawals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_mzn    NUMERIC(12,2) NOT NULL CHECK (amount_mzn > 0),
  note          TEXT,
  withdrawn_at  DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_withdrawals_withdrawn_at
  ON finance_withdrawals(withdrawn_at DESC);

ALTER TABLE finance_withdrawals ENABLE ROW LEVEL SECURITY;

-- ── 3. Configuração de custos recorrentes em system_settings ──────────────
-- Valores por omissão — o admin pode (e deve) ajustar no separador
-- Finanças. O domínio (200 MZN/ano na mozdomains.co.mz, conforme
-- informado) já entra com o valor real; os restantes ficam a 0 até serem
-- confirmados, para nunca subtrair um custo que não existe de facto.
INSERT INTO system_settings (key, value, description, updated_at) VALUES
  ('finance_domain_provider',      'mozdomains.co.mz', 'Fornecedor do domínio (informativo)', NOW()),
  ('finance_domain_annual_mzn',    '200',              'Custo anual do domínio, em MZN', NOW()),
  ('finance_domain_renewal_date',  '',                 'Próxima data de renovação do domínio (AAAA-MM-DD)', NOW()),
  ('finance_vercel_plan',          'Hobby (Grátis)',   'Nome do plano Vercel actualmente usado', NOW()),
  ('finance_vercel_monthly_usd',   '0',                'Custo mensal do plano Vercel, em USD (0 se Hobby/grátis)', NOW()),
  ('finance_ai_monthly_usd',       '0',                'Orçamento mensal para providers de IA pagos, em USD (0 enquanto só usar tiers grátis)', NOW()),
  ('finance_other_monthly_mzn',    '0',                'Outras despesas operacionais mensais recorrentes, em MZN', NOW())
ON CONFLICT (key) DO NOTHING;
