-- ============================================================================
-- migration_v36_tier_bonus_and_referral_signup.sql
-- Corrige duas promessas do afiliado.html que não tinham código por trás,
-- e um bug crítico encontrado no processo: referred_by nunca era gravado
-- no caminho normal do signup (ver ponto 3).
-- Aplicar no Supabase SQL Editor DEPOIS da v35.
-- ============================================================================

-- ── 1. BÓNUS DE COMISSÃO POR TIER (Prata +2% / Ouro +5% / Diamante +8%) ─────
-- O afiliado.html já promete isto há muito tempo, mas
-- process_affiliate_commission_v2 (v14) só somava o bónus de SEGMENTO
-- (papelaria/cyber/universidade) — o tier nunca entrava na conta. Um
-- afiliado Diamante ganhava sempre a mesma % que um Bronze do mesmo
-- segmento.
INSERT INTO system_settings (key, value, description) VALUES
  ('aff_tier_bonus_bronze',   '0', 'Bónus extra % de comissão para tier Bronze'),
  ('aff_tier_bonus_prata',    '2', 'Bónus extra % de comissão para tier Prata'),
  ('aff_tier_bonus_ouro',     '5', 'Bónus extra % de comissão para tier Ouro'),
  ('aff_tier_bonus_diamante', '8', 'Bónus extra % de comissão para tier Diamante')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION process_affiliate_commission_v2(
  p_transaction_id UUID,
  p_user_id        UUID,
  p_package_id     TEXT,
  p_amount         INTEGER
) RETURNS VOID AS $$
DECLARE
  v_affiliate_id     UUID;
  v_rate              NUMERIC;
  v_segment_bonus_rate NUMERIC := 0;
  v_tier_bonus_rate    NUMERIC := 0;
  v_commission         INTEGER;
  v_rate_key           TEXT;
  v_segment            TEXT;
  v_tier               TEXT;
  v_is_affiliate       BOOLEAN;
  v_is_blocked         BOOLEAN;
BEGIN
  SELECT referred_by INTO v_affiliate_id FROM profiles WHERE id = p_user_id;
  IF v_affiliate_id IS NULL THEN RETURN; END IF;

  -- CORRIGIDO (v36): a versão anterior fazia
  --   SELECT is_affiliate, aff_segment, aff_is_blocked INTO v_is_blocked, v_segment, v_is_blocked
  -- — v_is_blocked aparecia duas vezes na lista de destino, e o valor de
  -- is_affiliate lido aqui era sempre descartado (sobreposto por
  -- aff_is_blocked). Funcionava por coincidência porque havia um segundo
  -- SELECT is_affiliate mais abaixo, mas ficava confuso e frágil. Agora
  -- cada coluna tem a sua própria variável, e aproveita-se para também
  -- ler aff_tier (necessário para o bónus de tier).
  SELECT is_affiliate, aff_segment, aff_tier, aff_is_blocked
    INTO v_is_affiliate, v_segment, v_tier, v_is_blocked
    FROM profiles WHERE id = v_affiliate_id;

  IF NOT v_is_affiliate OR v_is_blocked THEN RETURN; END IF;

  -- Taxa base por pacote
  v_rate_key := 'aff_rate_' || p_package_id;
  SELECT COALESCE(value::numeric, 15) INTO v_rate
    FROM system_settings WHERE key = v_rate_key;
  IF v_rate IS NULL THEN v_rate := 15; END IF;

  -- Bónus por segmento (papelaria/cyber/universidade)
  SELECT COALESCE(value::numeric, 0) INTO v_segment_bonus_rate
    FROM system_settings WHERE key = 'aff_bonus_' || COALESCE(v_segment, 'individual');

  -- Bónus por tier (Bronze/Prata/Ouro/Diamante) — NOVO em v36
  SELECT COALESCE(value::numeric, 0) INTO v_tier_bonus_rate
    FROM system_settings WHERE key = 'aff_tier_bonus_' || COALESCE(v_tier, 'bronze');

  v_commission := FLOOR(p_amount * (v_rate + COALESCE(v_segment_bonus_rate, 0) + COALESCE(v_tier_bonus_rate, 0)) / 100);
  IF v_commission <= 0 THEN RETURN; END IF;

  INSERT INTO affiliate_commissions
    (affiliate_id, referred_user_id, transaction_id, package_id, sale_amount, commission_rate, commission_mzn, status)
    VALUES (v_affiliate_id, p_user_id, p_transaction_id, p_package_id, p_amount,
            v_rate + COALESCE(v_segment_bonus_rate, 0) + COALESCE(v_tier_bonus_rate, 0), v_commission, 'pending');

  UPDATE profiles
    SET aff_conversions  = aff_conversions + 1,
        aff_balance      = aff_balance + v_commission,
        aff_total_earned = aff_total_earned + v_commission,
        aff_last_active  = NOW()
    WHERE id = v_affiliate_id;

  -- Actualizar tier (pode subir de nível com esta conversão)
  PERFORM update_affiliate_tier(v_affiliate_id);

  -- Notificar nova comissão
  INSERT INTO affiliate_notifications (affiliate_id, type, title, body)
  VALUES (v_affiliate_id, 'commission',
    '💰 Nova Comissão!',
    'Ganhou ' || v_commission || ' MZN de comissão (pacote ' || p_package_id || ').');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2. BÓNUS DE CRÉDITOS POR REGISTO VIA LINK DE AFILIADO ───────────────────
-- aff_bonus_signup ('5 créditos por cada registo via link de afiliado') já
-- existia em system_settings desde a v10, mas nunca era lido em lado
-- nenhum do código — configuração morta. Implementado agora: quando alguém
-- se regista com ?ref=<código de afiliado>, recebe este bónus SOMADO aos
-- créditos grátis normais.
--
-- Descoberta importante ao implementar isto: profiles.referred_by nunca
-- estava a ser gravado no caminho normal de signup — api/auth/index.js
-- calculava o valor mas só o incluía no PATCH de "fallback" (que só corre
-- se o primeiro PATCH falhar, o que quase nunca acontece). Ou seja,
-- comissões de afiliado por compras de utilizadores REFERIDOS podiam já
-- estar a falhar silenciosamente para todos os registos feitos por link —
-- corrigido em paralelo em api/auth/index.js (ver ficheiro anexo).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_bonus_given BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION grant_referral_signup_bonus(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_referred_by UUID;
  v_already     BOOLEAN;
  v_bonus       INTEGER;
BEGIN
  SELECT referred_by, referral_bonus_given
    INTO v_referred_by, v_already
    FROM profiles WHERE id = p_user_id;

  IF v_referred_by IS NULL OR v_already THEN RETURN 0; END IF;

  SELECT COALESCE(value::INTEGER, 0) INTO v_bonus
    FROM system_settings WHERE key = 'aff_bonus_signup';
  IF v_bonus IS NULL OR v_bonus <= 0 THEN RETURN 0; END IF;

  -- WHERE referral_bonus_given = FALSE evita concessão dupla em caso de
  -- chamadas concorrentes/repetidas (retries de rede, por exemplo).
  UPDATE profiles
    SET credits = credits + v_bonus,
        referral_bonus_given = TRUE
    WHERE id = p_user_id AND referral_bonus_given = FALSE;

  IF FOUND THEN
    -- Avisa o afiliado que alguém se registou pelo seu link — reaproveita
    -- a mesma central de notificações usada para comissões/tier.
    INSERT INTO affiliate_notifications (affiliate_id, type, title, body)
    VALUES (v_referred_by, 'referral_signup',
      '👋 Novo registo pelo seu link!',
      'Alguém criou conta a partir do seu link de afiliado e recebeu ' || v_bonus || ' créditos extra de boas-vindas.');
    RETURN v_bonus;
  END IF;

  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Confirmação (correr manualmente para verificar):
-- SELECT key, value FROM system_settings WHERE key LIKE 'aff_tier_bonus_%' OR key = 'aff_bonus_signup';
