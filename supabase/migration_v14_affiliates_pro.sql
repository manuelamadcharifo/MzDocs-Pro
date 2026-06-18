-- ============================================================
-- MIGRAÇÃO v14 — Sistema de Afiliados Pro MzDocs Pro
-- Foco: Moçambique · Papelarias, Cyber Cafés, Universidades
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── 1. Novas colunas em profiles ─────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS aff_segment       TEXT DEFAULT 'individual'
    CHECK (aff_segment IN ('papelaria','cyber','universidade','explicacao','digitador','individual')),
  ADD COLUMN IF NOT EXISTS aff_tier          TEXT DEFAULT 'bronze'
    CHECK (aff_tier IN ('bronze','prata','ouro','diamante')),
  ADD COLUMN IF NOT EXISTS aff_business_name TEXT,
  ADD COLUMN IF NOT EXISTS aff_city          TEXT,
  ADD COLUMN IF NOT EXISTS aff_phone_mpesa   TEXT,
  ADD COLUMN IF NOT EXISTS aff_joined_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aff_last_active   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aff_is_blocked    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aff_block_reason  TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_profiles_aff_tier    ON profiles(aff_tier) WHERE aff_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_aff_segment ON profiles(aff_segment) WHERE aff_segment IS NOT NULL;

-- ── 2. Tabela de eventos antifraude ──────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_fraud_flags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flag_type     TEXT        NOT NULL,  -- 'self_referral','ip_burst','fake_clicks','suspicious_conversion'
  description   TEXT,
  severity      TEXT        DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  resolved      BOOLEAN     DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_affiliate ON affiliate_fraud_flags(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_resolved  ON affiliate_fraud_flags(resolved) WHERE resolved = FALSE;

-- ── 3. Tabela de metas mensais ────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_goals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month         TEXT        NOT NULL,  -- 'YYYY-MM'
  goal_clicks   INTEGER     DEFAULT 100,
  goal_conversions INTEGER  DEFAULT 10,
  goal_revenue  INTEGER     DEFAULT 500,  -- MZN
  actual_clicks INTEGER     DEFAULT 0,
  actual_conversions INTEGER DEFAULT 0,
  actual_revenue INTEGER    DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(affiliate_id, month)
);

-- ── 4. Tabela de ranking mensal (snapshot) ───────────────────
CREATE TABLE IF NOT EXISTS affiliate_ranking (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month         TEXT        NOT NULL,  -- 'YYYY-MM'
  rank_position INTEGER     NOT NULL,
  conversions   INTEGER     DEFAULT 0,
  revenue_mzn   INTEGER     DEFAULT 0,
  commission_mzn INTEGER    DEFAULT 0,
  tier          TEXT        DEFAULT 'bronze',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(affiliate_id, month)
);

CREATE INDEX IF NOT EXISTS idx_ranking_month ON affiliate_ranking(month, rank_position);

-- ── 5. Tabela de notificações de afiliados ───────────────────
CREATE TABLE IF NOT EXISTS affiliate_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,  -- 'commission','tier_up','withdrawal','goal','fraud'
  title         TEXT        NOT NULL,
  body          TEXT,
  is_read       BOOLEAN     DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aff_notifs_affiliate ON affiliate_notifications(affiliate_id, is_read, created_at DESC);

-- ── 6. Actualiazar system_settings com novos configs ─────────
INSERT INTO system_settings (key, value, description) VALUES
  ('aff_tier_prata_min',    '5',   'Conversões mínimas para tier Prata'),
  ('aff_tier_ouro_min',     '20',  'Conversões mínimas para tier Ouro'),
  ('aff_tier_diamante_min', '50',  'Conversões mínimas para tier Diamante'),
  ('aff_bonus_papelaria',   '5',   'Bónus extra % para segmento papelaria'),
  ('aff_bonus_cyber',       '3',   'Bónus extra % para segmento cyber café'),
  ('aff_bonus_universidade','5',   'Bónus extra % para segmento universidade'),
  ('aff_fraud_max_clicks_hr','30', 'Máximo cliques por hora para detecção de fraude'),
  ('aff_fraud_min_gap_min',  '5',  'Mínimo minutos entre cliques do mesmo IP')
ON CONFLICT (key) DO NOTHING;

-- ── 7. Função: calcular e actualizar tier do afiliado ─────────
CREATE OR REPLACE FUNCTION update_affiliate_tier(p_affiliate_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_conversions INTEGER;
  v_new_tier    TEXT;
  v_old_tier    TEXT;
BEGIN
  SELECT aff_conversions, aff_tier
    INTO v_conversions, v_old_tier
    FROM profiles WHERE id = p_affiliate_id;

  v_new_tier := CASE
    WHEN v_conversions >= 50 THEN 'diamante'
    WHEN v_conversions >= 20 THEN 'ouro'
    WHEN v_conversions >= 5  THEN 'prata'
    ELSE 'bronze'
  END;

  IF v_new_tier != COALESCE(v_old_tier, 'bronze') THEN
    UPDATE profiles SET aff_tier = v_new_tier WHERE id = p_affiliate_id;
    -- Notificar tier upgrade
    IF v_new_tier IN ('prata', 'ouro', 'diamante') THEN
      INSERT INTO affiliate_notifications (affiliate_id, type, title, body)
      VALUES (p_affiliate_id, 'tier_up',
        '🎉 Novo Nível Alcançado!',
        'Parabéns! Subiu para o nível ' || upper(v_new_tier) || '. Continue a partilhar e ganhe mais comissões!');
    END IF;
  END IF;

  RETURN v_new_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Função: detectar cliques suspeitos (antifraude) ────────
CREATE OR REPLACE FUNCTION check_affiliate_fraud(
  p_affiliate_id UUID,
  p_ip_hash TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_clicks_last_hour INTEGER;
  v_is_own_click     BOOLEAN;
BEGIN
  -- Verificar se é o próprio afiliado (auto-clique)
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = p_affiliate_id AND id = auth.uid()
  ) INTO v_is_own_click;

  IF v_is_own_click THEN
    INSERT INTO affiliate_fraud_flags (affiliate_id, flag_type, description, severity)
    VALUES (p_affiliate_id, 'self_referral', 'Clique no próprio link de afiliado', 'high');
    RETURN TRUE;
  END IF;

  -- Verificar burst de cliques (>30/hora do mesmo IP)
  SELECT COUNT(*) INTO v_clicks_last_hour
    FROM affiliate_clicks
    WHERE affiliate_id = p_affiliate_id
      AND ip_hash = p_ip_hash
      AND created_at > NOW() - INTERVAL '1 hour';

  IF v_clicks_last_hour >= 30 THEN
    INSERT INTO affiliate_fraud_flags (affiliate_id, flag_type, description, severity)
    VALUES (p_affiliate_id, 'ip_burst',
      'IP com ' || v_clicks_last_hour || ' cliques na última hora', 'critical');
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. Função: processar comissão com bónus por segmento ──────
CREATE OR REPLACE FUNCTION process_affiliate_commission_v2(
  p_transaction_id UUID,
  p_user_id        UUID,
  p_package_id     TEXT,
  p_amount         INTEGER
) RETURNS VOID AS $$
DECLARE
  v_affiliate_id   UUID;
  v_rate           NUMERIC;
  v_bonus_rate     NUMERIC := 0;
  v_commission     INTEGER;
  v_rate_key       TEXT;
  v_segment        TEXT;
  v_is_blocked     BOOLEAN;
BEGIN
  SELECT referred_by INTO v_affiliate_id FROM profiles WHERE id = p_user_id;
  IF v_affiliate_id IS NULL THEN RETURN; END IF;

  -- Verificar se afiliado está aprovado e não bloqueado
  SELECT is_affiliate, aff_segment, aff_is_blocked
    INTO v_is_blocked, v_segment, v_is_blocked
    FROM profiles WHERE id = v_affiliate_id;

  IF v_is_blocked OR NOT (SELECT is_affiliate FROM profiles WHERE id = v_affiliate_id) THEN RETURN; END IF;

  -- Taxa base por pacote
  v_rate_key := 'aff_rate_' || p_package_id;
  SELECT COALESCE(value::numeric, 15) INTO v_rate
    FROM system_settings WHERE key = v_rate_key;
  IF v_rate IS NULL THEN v_rate := 15; END IF;

  -- Bónus por segmento
  SELECT COALESCE(value::numeric, 0) INTO v_bonus_rate
    FROM system_settings WHERE key = 'aff_bonus_' || COALESCE(v_segment, 'individual');

  v_commission := FLOOR(p_amount * (v_rate + COALESCE(v_bonus_rate, 0)) / 100);
  IF v_commission <= 0 THEN RETURN; END IF;

  INSERT INTO affiliate_commissions
    (affiliate_id, referred_user_id, transaction_id, package_id, sale_amount, commission_rate, commission_mzn, status)
    VALUES (v_affiliate_id, p_user_id, p_transaction_id, p_package_id, p_amount,
            v_rate + COALESCE(v_bonus_rate, 0), v_commission, 'pending');

  UPDATE profiles
    SET aff_conversions  = aff_conversions + 1,
        aff_balance      = aff_balance + v_commission,
        aff_total_earned = aff_total_earned + v_commission,
        aff_last_active  = NOW()
    WHERE id = v_affiliate_id;

  -- Actualizar tier
  PERFORM update_affiliate_tier(v_affiliate_id);

  -- Notificar nova comissão
  INSERT INTO affiliate_notifications (affiliate_id, type, title, body)
  VALUES (v_affiliate_id, 'commission',
    '💰 Nova Comissão!',
    'Ganhou ' || v_commission || ' MZN de comissão (pacote ' || p_package_id || ').');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. Função: gerar ranking mensal ─────────────────────────
CREATE OR REPLACE FUNCTION generate_monthly_ranking(p_month TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO affiliate_ranking (affiliate_id, month, rank_position, conversions, revenue_mzn, commission_mzn, tier)
  SELECT
    p.id,
    p_month,
    ROW_NUMBER() OVER (ORDER BY COALESCE(agg.total_commission, 0) DESC),
    COALESCE(agg.total_conversions, 0),
    COALESCE(agg.total_revenue, 0),
    COALESCE(agg.total_commission, 0),
    p.aff_tier
  FROM profiles p
  LEFT JOIN (
    SELECT affiliate_id,
           COUNT(*) AS total_conversions,
           SUM(sale_amount) AS total_revenue,
           SUM(commission_mzn) AS total_commission
    FROM affiliate_commissions
    WHERE date_trunc('month', created_at) = to_date(p_month, 'YYYY-MM')::timestamptz
    GROUP BY affiliate_id
  ) agg ON agg.affiliate_id = p.id
  WHERE p.is_affiliate = TRUE
  ON CONFLICT (affiliate_id, month) DO UPDATE
    SET rank_position = EXCLUDED.rank_position,
        conversions   = EXCLUDED.conversions,
        revenue_mzn   = EXCLUDED.revenue_mzn,
        commission_mzn = EXCLUDED.commission_mzn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 11. RLS para novas tabelas ────────────────────────────────
ALTER TABLE affiliate_fraud_flags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_ranking          ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_notifications    ENABLE ROW LEVEL SECURITY;

-- Fraude: só admin
CREATE POLICY "fraud_admin" ON affiliate_fraud_flags
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Metas: afiliado vê as suas
CREATE POLICY "goals_own" ON affiliate_goals
  FOR SELECT USING (affiliate_id = auth.uid());
CREATE POLICY "goals_admin" ON affiliate_goals
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Ranking: público (leitura)
CREATE POLICY "ranking_read" ON affiliate_ranking
  FOR SELECT USING (TRUE);
CREATE POLICY "ranking_admin" ON affiliate_ranking
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Notificações: afiliado
CREATE POLICY "notifs_own" ON affiliate_notifications
  FOR ALL USING (affiliate_id = auth.uid());
CREATE POLICY "notifs_admin" ON affiliate_notifications
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- FIM DA MIGRAÇÃO v14
-- ============================================================
