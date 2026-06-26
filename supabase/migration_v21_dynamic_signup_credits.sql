-- supabase/migration_v21_dynamic_signup_credits.sql
-- ──────────────────────────────────────────────────────────────────────────
-- CORRIGIDO (Junho/2026): handle_new_user() (trigger de criação de conta)
-- tinha `credits = 1` e `NOW() + INTERVAL '30 days'` hard-coded — apesar de
-- o painel de admin já ter campos "Créditos Grátis (conta normal)" e
-- "Validade créditos grátis (dias)" que escrevem em
-- system_settings.free_credits_normal / free_credits_expiry_days. Alterar
-- esses campos no admin nunca tinha qualquer efeito real: o trigger SQL
-- nunca os lia.
--
-- Esta migração redefine handle_new_user() para ler esses dois valores de
-- system_settings em tempo de execução, com fallback para os valores
-- actuais (1 crédito, 30 dias) se as chaves estiverem ausentes, vazias,
-- ou não numéricas — para nunca deixar o signup falhar por causa de uma
-- configuração inválida no admin.
--
-- IMPORTANTE: esta função tem de partir da versão da
-- migration_v16_fix_signup_name_phone.sql (ON CONFLICT DO UPDATE para
-- nome/telefone), não da migration_v13 (ON CONFLICT DO NOTHING) — a v13
-- é mais antiga que a v16 e tinha um bug de timing já corrigido depois.
-- Esta migração preserva a lógica da v16 integralmente, adicionando só a
-- leitura dinâmica de créditos/validade por cima.
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
  v_credits      INTEGER;
  v_expiry_days  INTEGER;
BEGIN
  -- Ler configuração dinâmica do admin (system_settings), com fallback
  -- seguro se a chave não existir, estiver vazia, ou não for um número
  -- válido — nunca deixar isto bloquear a criação da conta.
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

  -- IMPORTANTE: preserva a lógica ON CONFLICT (id) DO UPDATE introduzida
  -- na migration_v16_fix_signup_name_phone.sql (correcção de timing entre
  -- este trigger e api/auth/index.js — usar DO NOTHING aqui reintroduziria
  -- esse bug). credits/credits_expires_at NÃO entram no DO UPDATE: só
  -- interessam na criação inicial da conta, nunca devem ser sobrepostos
  -- num conflito (evitaria re-conceder créditos grátis a uma conta já
  -- existente que por algum motivo disparasse este trigger de novo).
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
    v_credits,                                      -- CORRIGIDO: lido de system_settings
    TRUE,                                           -- bónus de boas-vindas já concedido — nunca repetir
    'normal',
    NOW() + (v_expiry_days || ' days')::INTERVAL,    -- CORRIGIDO: idem
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
  -- Em caso de qualquer erro inesperado na leitura de system_settings
  -- (ex: coluna 'value' com formato inválido), cair para os valores
  -- antigos hard-coded em vez de impedir a criação da conta — criar uma
  -- conta sem créditos é recuperável; falhar o signup por completo não é.
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
-- SELECT key, value FROM system_settings WHERE key IN ('free_credits_normal','free_credits_expiry_days');
