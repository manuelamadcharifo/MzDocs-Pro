-- supabase/migration_v51_bonus_credits.sql
-- ──────────────────────────────────────────────────────────────────────────
-- NOVO (pedido do fundador — controlo máximo sobre créditos e promoções,
-- Agosto/2026): o painel de admin passou a ter os campos "Créditos Bónus /
-- Promoções" (bonus_credits_enabled, bonus_credits_amount,
-- bonus_credits_expiry_days em system_settings), mas escrevê-los sozinhos
-- não tinha NENHUM efeito real — só ficavam guardados na tabela, sem
-- nenhum código a lê-los. Esta migração faz o mesmo que a
-- migration_v21_dynamic_signup_credits.sql já fez para
-- free_credits_normal/free_credits_expiry_days: liga o valor guardado a um
-- efeito real no momento do registo.
--
-- Comportamento: se bonus_credits_enabled = 'true', o valor de
-- bonus_credits_amount é SOMADO aos créditos grátis normais
-- (free_credits_normal) na conta recém-criada — ou seja, uma promoção
-- "+5 créditos bónus este mês" dá 1 (grátis) + 5 (bónus) = 6 créditos ao
-- novo utilizador, sem mexer no valor base de créditos grátis.
--
-- NOTA IMPORTANTE (transparência, para não criar uma falsa sensação de
-- controlo): bonus_credits_expiry_days fica guardado mas NÃO é aplicado
-- aqui nem em lado nenhum do sistema — nenhum crédito (grátis, bónus ou
-- comprado) expira automaticamente hoje; a conta apenas grava
-- credits_expires_at para os créditos GRÁTIS iniciais (usado só para
-- mostrar essa data ao utilizador, ver handleConfig em api/misc.js — nunca
-- houve, e continua a não haver, nenhum cron/job que efectivamente zere
-- créditos expirados). Construir essa aplicação real exigiria um ledger
-- de créditos por concessão (cada lote com a sua própria data de validade)
-- em vez do único número acumulado que profiles.credits é hoje — mudança
-- maior, fora do âmbito desta migração.
--
-- Idempotente — pode ser executada novamente sem problemas.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits        INTEGER;
  v_expiry_days    INTEGER;
  v_bonus_enabled  BOOLEAN;
  v_bonus_amount   INTEGER;
BEGIN
  SELECT value::INTEGER INTO v_credits
  FROM system_settings WHERE key = 'free_credits_normal';
  IF v_credits IS NULL OR v_credits < 0 THEN
    v_credits := 1; -- fallback: valor antigo hard-coded
  END IF;

  SELECT value::INTEGER INTO v_expiry_days
  FROM system_settings WHERE key = 'free_credits_expiry_days';
  IF v_expiry_days IS NULL OR v_expiry_days <= 0 THEN
    v_expiry_days := 30; -- fallback: valor antigo hard-coded
  END IF;

  -- NOVO: créditos bónus/promocionais — somados por cima dos créditos
  -- grátis normais, só se a promoção estiver activa no admin.
  v_bonus_enabled := FALSE;
  BEGIN
    SELECT (value = 'true') INTO v_bonus_enabled
    FROM system_settings WHERE key = 'bonus_credits_enabled';
  EXCEPTION WHEN OTHERS THEN
    v_bonus_enabled := FALSE;
  END;
  IF v_bonus_enabled IS NULL THEN v_bonus_enabled := FALSE; END IF;

  v_bonus_amount := 0;
  IF v_bonus_enabled THEN
    SELECT value::INTEGER INTO v_bonus_amount
    FROM system_settings WHERE key = 'bonus_credits_amount';
    IF v_bonus_amount IS NULL OR v_bonus_amount < 0 THEN
      v_bonus_amount := 0;
    END IF;
  END IF;

  -- IMPORTANTE: preserva integralmente a lógica ON CONFLICT (id) DO UPDATE
  -- da migration_v16/v21 — credits/credits_expires_at continuam a NÃO
  -- entrar no DO UPDATE (só interessam na criação inicial da conta).
  INSERT INTO public.profiles (
    id, full_name, phone, email, is_admin,
    credits, welcome_bonus_given, account_type,
    credits_expires_at, plan, created_at
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), ''),
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
    COALESCE((NEW.raw_app_meta_data->>'is_admin')::boolean, false),
    v_credits + v_bonus_amount,                      -- NOVO: grátis + bónus (se activo)
    TRUE,
    'normal',
    NOW() + (v_expiry_days || ' days')::INTERVAL,
    'free',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN profiles.full_name = '' OR profiles.full_name IS NULL
      THEN COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name, '')
      ELSE profiles.full_name
    END,
    phone = CASE
      WHEN profiles.phone = '' OR profiles.phone IS NULL
      THEN COALESCE(NULLIF(EXCLUDED.phone, ''), profiles.phone, '')
      ELSE profiles.phone
    END,
    email = CASE
      WHEN profiles.email IS NULL
      THEN EXCLUDED.email
      ELSE profiles.email
    END;

  RETURN NEW;
EXCEPTION
  -- Mesma rede de segurança da migration_v21: qualquer erro inesperado
  -- (incluindo na leitura dos novos campos de bónus) cai para os valores
  -- antigos hard-coded, para nunca bloquear a criação de conta.
  WHEN OTHERS THEN
    INSERT INTO public.profiles (
      id, full_name, phone, email, is_admin,
      credits, welcome_bonus_given, account_type,
      credits_expires_at, plan, created_at
    )
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), ''),
      COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''),
      COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
      COALESCE((NEW.raw_app_meta_data->>'is_admin')::boolean, false),
      1, TRUE, 'normal', NOW() + INTERVAL '30 days', 'free', NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = CASE
        WHEN profiles.full_name = '' OR profiles.full_name IS NULL
        THEN COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name, '')
        ELSE profiles.full_name
      END,
      phone = CASE
        WHEN profiles.phone = '' OR profiles.phone IS NULL
        THEN COALESCE(NULLIF(EXCLUDED.phone, ''), profiles.phone, '')
        ELSE profiles.phone
      END;
    RETURN NEW;
END;
$$;

-- Garantir que o trigger está associado a esta função.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Confirmação (correr manualmente para verificar):
-- SELECT key, value FROM system_settings
-- WHERE key IN ('free_credits_normal','free_credits_expiry_days','bonus_credits_enabled','bonus_credits_amount');
