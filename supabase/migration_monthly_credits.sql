-- supabase/migration_monthly_credits.sql
-- Migração: sistema de créditos mensais por plano
-- Executar no SQL Editor do Supabase

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Adicionar colunas necessárias à tabela profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS welcome_bonus_given BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plan              TEXT    DEFAULT 'free',      -- free | starter | basico | pro
  ADD COLUMN IF NOT EXISTS plan_expires_at   TIMESTAMPTZ,                 -- NULL = sem plano activo
  ADD COLUMN IF NOT EXISTS monthly_renewal_at TIMESTAMPTZ;                -- data do último crédito mensal

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Marcar utilizadores existentes com ≤ 3 créditos como bónus já dado
--    (impede que recebam os 3 créditos novamente)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE profiles
  SET welcome_bonus_given = TRUE
  WHERE created_at < NOW();   -- todos os existentes — o bónus já foi (ou não deve ser) dado

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Actualizar trigger handle_new_user para marcar bónus e não usar DEFAULT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id, full_name, phone, email,
        credits, welcome_bonus_given, plan
    )
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
        3,      -- 3 créditos de boas-vindas (uma única vez)
        TRUE,   -- bónus já dado → nunca repetir
        'free'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Créditos mensais por plano
--    starter → 1 crédito/mês
--    basico  → 3 créditos/mês
--    pro     → 8 créditos/mês
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION grant_monthly_credits(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    prof           RECORD;
    monthly_amount INTEGER;
    now_ts         TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO prof FROM profiles WHERE id = target_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN -1; END IF;

    -- Só processa se tiver plano activo e não expirado
    IF prof.plan = 'free' OR prof.plan IS NULL THEN RETURN prof.credits; END IF;
    IF prof.plan_expires_at IS NOT NULL AND prof.plan_expires_at < now_ts THEN
        -- Plano expirado: reverter para free
        UPDATE profiles SET plan = 'free', plan_expires_at = NULL WHERE id = target_user_id;
        RETURN prof.credits;
    END IF;

    -- Verificar se já recebeu créditos este mês
    IF prof.monthly_renewal_at IS NOT NULL
       AND date_trunc('month', prof.monthly_renewal_at) = date_trunc('month', now_ts)
    THEN
        RETURN prof.credits; -- já recebeu este mês
    END IF;

    -- Calcular créditos pelo plano
    monthly_amount := CASE prof.plan
        WHEN 'starter' THEN 1
        WHEN 'basico'  THEN 3
        WHEN 'pro'     THEN 8
        ELSE 0
    END;

    IF monthly_amount = 0 THEN RETURN prof.credits; END IF;

    UPDATE profiles
    SET credits          = credits + monthly_amount,
        monthly_renewal_at = now_ts,
        updated_at       = now_ts
    WHERE id = target_user_id;

    RETURN prof.credits + monthly_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Actualizar a função confirm_payment (admin) para gravar o plano
--    Esta função é chamada pelo painel admin ao confirmar pagamento
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION confirm_payment_and_set_plan(
    p_transaction_id UUID,
    p_admin_id       UUID
)
RETURNS JSONB AS $$
DECLARE
    tx      RECORD;
    credits_to_add INTEGER;
    new_plan TEXT;
    expiry   TIMESTAMPTZ;
    new_credits INTEGER;
BEGIN
    SELECT * INTO tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN RETURN '{"error":"transaction not found"}'::JSONB; END IF;
    IF tx.status = 'completed' THEN RETURN '{"error":"already confirmed"}'::JSONB; END IF;

    -- Mapear pacote → créditos e plano
    credits_to_add := tx.credits;
    new_plan := CASE tx.package_id
        WHEN 'starter' THEN 'starter'
        WHEN 'basico'  THEN 'basico'
        WHEN 'pro'     THEN 'pro'
        ELSE 'free'   -- avulso não dá plano
    END;

    -- Plano válido por 30 dias a contar da confirmação
    expiry := CASE WHEN new_plan <> 'free' THEN NOW() + INTERVAL '30 days' ELSE NULL END;

    -- Marcar transacção como concluída
    UPDATE transactions
    SET status = 'completed', confirmed_by = p_admin_id, confirmed_at = NOW()
    WHERE id = p_transaction_id;

    -- Adicionar créditos + actualizar plano
    UPDATE profiles
    SET credits          = credits + credits_to_add,
        plan             = CASE WHEN new_plan <> 'free' THEN new_plan ELSE plan END,
        plan_expires_at  = COALESCE(expiry, plan_expires_at),
        updated_at       = NOW()
    WHERE id = tx.user_id
    RETURNING credits INTO new_credits;

    RETURN jsonb_build_object(
        'success',     true,
        'credits',     new_credits,
        'plan',        new_plan,
        'expires_at',  expiry
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissão para admin chamar estas funções
GRANT EXECUTE ON FUNCTION grant_monthly_credits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_payment_and_set_plan(UUID, UUID) TO authenticated;
