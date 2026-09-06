-- ============================================================
-- MIGRAÇÃO v10 — Sistema de Afiliados MzDocs Pro
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── 1. Adicionar colunas de afiliado à tabela profiles ───────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ref_code       TEXT UNIQUE,          -- código único do afiliado ex: MZ-ABC123
  ADD COLUMN IF NOT EXISTS referred_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_affiliate   BOOLEAN DEFAULT FALSE, -- afiliado aprovado
  ADD COLUMN IF NOT EXISTS aff_balance    INTEGER DEFAULT 0,     -- saldo em MZN
  ADD COLUMN IF NOT EXISTS aff_total_earned INTEGER DEFAULT 0,  -- total histórico ganho
  ADD COLUMN IF NOT EXISTS aff_clicks     INTEGER DEFAULT 0,     -- cliques no link
  ADD COLUMN IF NOT EXISTS aff_conversions INTEGER DEFAULT 0;   -- conversões (pagamentos)

-- Índices
CREATE INDEX IF NOT EXISTS idx_profiles_ref_code    ON profiles(ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_is_affiliate ON profiles(is_affiliate) WHERE is_affiliate = TRUE;

-- ── 2. Tabela de comissões ────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id UUID       NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id  UUID        REFERENCES transactions(id) ON DELETE SET NULL,
  package_id      TEXT        NOT NULL,                 -- starter, basico, pro, empresa
  sale_amount     INTEGER     NOT NULL,                 -- valor da venda em MZN
  commission_rate NUMERIC(4,2) NOT NULL DEFAULT 0.15,  -- 15% por defeito
  commission_mzn  INTEGER     NOT NULL,                 -- valor comissão em MZN
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','paid','cancelled')),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aff_comm_affiliate ON affiliate_commissions(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aff_comm_status    ON affiliate_commissions(status);

-- ── 3. Tabela de cliques no link de afiliado ─────────────────
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_hash      TEXT,        -- hash do IP para deduplicação (sem guardar IP real)
  user_agent   TEXT,
  page         TEXT DEFAULT '/',
  converted    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aff_clicks_affiliate ON affiliate_clicks(affiliate_id, created_at DESC);

-- ── 4. Tabela de levantamentos ────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       INTEGER     NOT NULL,                   -- MZN
  mpesa_phone  TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','completed','rejected')),
  admin_note   TEXT,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aff_withdraw_affiliate ON affiliate_withdrawals(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aff_withdraw_status    ON affiliate_withdrawals(status);

-- ── 5. Configurações de comissão por pacote ───────────────────
INSERT INTO system_settings (key, value, description) VALUES
  ('aff_rate_avulso',  '10', 'Comissão afiliado pacote Avulso (%)'),
  ('aff_rate_starter', '15', 'Comissão afiliado pacote Starter (%)'),
  ('aff_rate_basico',  '15', 'Comissão afiliado pacote Básico (%)'),
  ('aff_rate_pro',     '20', 'Comissão afiliado pacote Pro (%)'),
  ('aff_rate_empresa', '20', 'Comissão afiliado pacote Empresa (%)'),
  ('aff_min_withdraw', '200', 'Levantamento mínimo afiliado (MZN)'),
  ('aff_bonus_signup', '5',  'Bónus créditos por cada registo via link afiliado'),
  ('aff_active',       'true', 'Sistema de afiliados activo')
ON CONFLICT (key) DO NOTHING;

-- ── 6. Função: gerar código de afiliado único ─────────────────
CREATE OR REPLACE FUNCTION generate_ref_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_count INT;
BEGIN
  LOOP
    code := 'MZ-' || upper(substr(md5(random()::text), 1, 6));
    SELECT COUNT(*) INTO exists_count FROM profiles WHERE ref_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ── 7. Função: registar clique no link de afiliado ────────────
CREATE OR REPLACE FUNCTION register_affiliate_click(p_ref_code TEXT, p_ip_hash TEXT, p_page TEXT)
RETURNS UUID AS $$
DECLARE
  v_affiliate_id UUID;
  v_click_id UUID;
  v_recent_click INT;
BEGIN
  SELECT id INTO v_affiliate_id FROM profiles WHERE ref_code = p_ref_code AND is_affiliate = TRUE;
  IF v_affiliate_id IS NULL THEN RETURN NULL; END IF;

  -- Deduplicar: mesmo IP nas últimas 24h não conta
  SELECT COUNT(*) INTO v_recent_click
    FROM affiliate_clicks
    WHERE affiliate_id = v_affiliate_id
      AND ip_hash = p_ip_hash
      AND created_at > NOW() - INTERVAL '24 hours';

  IF v_recent_click = 0 THEN
    INSERT INTO affiliate_clicks (affiliate_id, ip_hash, page)
      VALUES (v_affiliate_id, p_ip_hash, p_page)
      RETURNING id INTO v_click_id;
    UPDATE profiles SET aff_clicks = aff_clicks + 1 WHERE id = v_affiliate_id;
  END IF;

  RETURN v_click_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Função: processar comissão após pagamento confirmado ────
CREATE OR REPLACE FUNCTION process_affiliate_commission(
  p_transaction_id UUID,
  p_user_id        UUID,
  p_package_id     TEXT,
  p_amount         INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_affiliate_id   UUID;
  v_rate           NUMERIC;
  v_commission     INTEGER;
  v_rate_key       TEXT;
BEGIN
  -- Obter afiliado que referiu este utilizador
  SELECT referred_by INTO v_affiliate_id FROM profiles WHERE id = p_user_id;
  IF v_affiliate_id IS NULL THEN RETURN; END IF;

  -- Verificar se o afiliado está aprovado
  IF NOT (SELECT is_affiliate FROM profiles WHERE id = v_affiliate_id) THEN RETURN; END IF;

  -- Obter taxa de comissão do pacote
  v_rate_key := 'aff_rate_' || p_package_id;
  SELECT COALESCE(value::numeric, 15) INTO v_rate
    FROM system_settings WHERE key = v_rate_key;
  IF v_rate IS NULL THEN v_rate := 15; END IF;

  v_commission := FLOOR(p_amount * v_rate / 100);
  IF v_commission <= 0 THEN RETURN; END IF;

  -- Registar comissão
  INSERT INTO affiliate_commissions
    (affiliate_id, referred_user_id, transaction_id, package_id, sale_amount, commission_rate, commission_mzn, status)
    VALUES (v_affiliate_id, p_user_id, p_transaction_id, p_package_id, p_amount, v_rate, v_commission, 'pending');

  -- Actualizar contadores do afiliado
  UPDATE profiles
    SET aff_conversions   = aff_conversions + 1,
        aff_balance       = aff_balance + v_commission,
        aff_total_earned  = aff_total_earned + v_commission
    WHERE id = v_affiliate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. RLS ────────────────────────────────────────────────────
ALTER TABLE affiliate_commissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_withdrawals  ENABLE ROW LEVEL SECURITY;

-- Afiliado vê apenas os seus dados
CREATE POLICY "aff_comm_own" ON affiliate_commissions
  FOR SELECT USING (affiliate_id = auth.uid());

CREATE POLICY "aff_clicks_own" ON affiliate_clicks
  FOR SELECT USING (affiliate_id = auth.uid());

CREATE POLICY "aff_withdraw_own" ON affiliate_withdrawals
  FOR SELECT USING (affiliate_id = auth.uid());

CREATE POLICY "aff_withdraw_insert" ON affiliate_withdrawals
  FOR INSERT WITH CHECK (affiliate_id = auth.uid());

-- Admin vê tudo
CREATE POLICY "aff_comm_admin" ON affiliate_commissions
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "aff_clicks_admin" ON affiliate_clicks
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "aff_withdraw_admin" ON affiliate_withdrawals
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- FIM DA MIGRAÇÃO v10
-- ============================================================
