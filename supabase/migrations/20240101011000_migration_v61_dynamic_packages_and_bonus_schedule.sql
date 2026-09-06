-- supabase/migration_v61_dynamic_packages_and_bonus_schedule.sql
-- ──────────────────────────────────────────────────────────────────────────
-- NOVO (pedido do fundador, Agosto/2026) — duas funcionalidades:
--
-- 1) PACOTES DINÂMICOS: até agora só existiam 5 IDs de pacote fixos no
--    código (avulso/starter/basico/pro/empresa) — api/_lib/packages.js
--    lia preço/créditos/bónus de system_settings, mas a LISTA de pacotes
--    em si estava hard-coded (Object.entries(FALLBACK_PACKAGES)), pelo
--    que o admin nunca conseguia criar um 6º pacote, só editar os 5.
--    Esta migração "des-obsoleta" a tabela `credit_packages` (criada na
--    v8, fechada por RLS na v24 por estar órfã) e passa a ser ELA a
--    fonte de verdade — qualquer linha activa nesta tabela vira um
--    pacote real no checkout, com o id que o admin escolher.
--
--    Migra os 5 pacotes existentes para dentro da tabela, lendo os
--    valores REAIS que já estavam configurados em system_settings (não
--    os valores de fábrica) — para ninguém perder um preço/bónus que já
--    tinha sido ajustado no admin antes desta migração.
--
-- 2) AGENDAMENTO DA PROMOÇÃO DE CRÉDITOS BÓNUS: bonus_credits_enabled
--    (system_settings) era um interruptor manual — o admin tinha de se
--    lembrar de desligar a promoção manualmente. Passa a aceitar duas
--    chaves novas, opcionais: bonus_promo_starts_at / bonus_promo_ends_at
--    (timestamps ISO). Quando definidas, a promoção só se aplica dentro
--    dessa janela, mesmo que "bonus_credits_enabled" continue = true —
--    ou seja, o admin liga a promoção UMA VEZ com as datas já definidas
--    e não precisa de voltar a mexer. Se as datas ficarem vazias, o
--    comportamento é exactamente o mesmo de antes (interruptor manual).
--    A DURAÇÃO de cada crédito bónus já concedido (bonus_credits_expiry_
--    days) já era aplicada de forma real desde a migration_v52_credit_
--    ledger.sql (ver credit_ledger, source='bonus') — isso não muda aqui.
--
-- Idempotente — pode ser executada novamente sem duplicar dados nem
-- partir a função (CREATE OR REPLACE, mesma assinatura de sempre).
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Novas colunas em credit_packages ───────────────────────────────────

ALTER TABLE credit_packages
  ADD COLUMN IF NOT EXISTS bonus       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_popular  BOOLEAN NOT NULL DEFAULT FALSE;

-- price_mzn/credits podiam ter ficado NOT NULL sem default de uma migração
-- antiga — sem alterações aqui, mantém-se a validação feita em aplicação
-- (api/admin/index.js) antes de qualquer INSERT/UPDATE.

-- ── 2. Migrar os 5 pacotes existentes, lendo os valores REAIS de ─────────
--       system_settings (fallback só se a chave nunca tiver sido gravada)

DO $$
DECLARE
  v_price   NUMERIC;
  v_credits INTEGER;
  v_bonus   INTEGER;
  rec RECORD;
  defaults JSONB := '[
    {"id":"avulso",  "name":"Avulso",  "price":50,   "credits":3,   "bonus":0,  "sort_order":1, "description":"3 documentos, sem conta permanente"},
    {"id":"starter", "name":"Starter", "price":120,  "credits":10,  "bonus":2,  "sort_order":2, "description":null},
    {"id":"basico",  "name":"Básico",  "price":280,  "credits":25,  "bonus":5,  "sort_order":3, "description":null},
    {"id":"pro",     "name":"Pro",     "price":600,  "credits":60,  "bonus":15, "sort_order":4, "description":null},
    {"id":"empresa", "name":"Empresa", "price":1500, "credits":150, "bonus":40, "sort_order":5, "description":null}
  ]'::JSONB;
BEGIN
  -- "AS d" aqui rebatiza a expressão FROM, não a coluna devolvida — o
  -- valor de cada elemento continua acessível pela coluna default de
  -- jsonb_array_elements(), que se chama "value". Corrigido para
  -- renomear a COLUNA em vez da tabela (SELECT value AS d), que é o que
  -- torna rec.d válido a seguir.
  FOR rec IN SELECT value AS d FROM jsonb_array_elements(defaults) LOOP
    SELECT value::NUMERIC INTO v_price
      FROM system_settings WHERE key = 'pkg_' || (rec.d->>'id') || '_price';
    SELECT value::INTEGER INTO v_credits
      FROM system_settings WHERE key = 'pkg_' || (rec.d->>'id') || '_credits';
    SELECT value::INTEGER INTO v_bonus
      FROM system_settings WHERE key = 'pkg_' || (rec.d->>'id') || '_bonus';

    INSERT INTO credit_packages (id, name, credits, price_mzn, bonus, description, sort_order, is_active)
    VALUES (
      rec.d->>'id',
      rec.d->>'name',
      COALESCE(v_credits, (rec.d->>'credits')::INTEGER),
      COALESCE(v_price,   (rec.d->>'price')::NUMERIC),
      COALESCE(v_bonus,   (rec.d->>'bonus')::INTEGER),
      rec.d->>'description',
      (rec.d->>'sort_order')::INTEGER,
      TRUE
    )
    ON CONFLICT (id) DO UPDATE SET
      -- Só preenche o que ainda estiver a zero/omisso — nunca pisa um
      -- pacote que o admin já tenha editado directamente nesta tabela
      -- (ex.: se esta migração for corrida mais que uma vez).
      credits     = COALESCE(NULLIF(credit_packages.credits, 0), EXCLUDED.credits),
      price_mzn   = COALESCE(NULLIF(credit_packages.price_mzn, 0), EXCLUDED.price_mzn),
      bonus       = credit_packages.bonus, -- nunca sobrescreve bónus já existente na tabela
      description = COALESCE(credit_packages.description, EXCLUDED.description);
  END LOOP;
END $$;

COMMENT ON TABLE credit_packages IS
  'Fonte de verdade dos pacotes de créditos (desde v61) — lida por '
  'api/_lib/packages.js. Qualquer linha com is_active=true aparece no '
  'checkout com o id definido aqui (já não está limitado a avulso/'
  'starter/basico/pro/empresa). Antes da v61 estava obsoleta a favor de '
  'chaves fixas pkg_<id>_* em system_settings — essas chaves continuam a '
  'ser lidas como fallback de compatibilidade se esta tabela estiver '
  'vazia ou inacessível (ver api/_lib/packages.js).';

-- ── 3. handle_new_user — adiciona janela de agendamento da promoção ──────
-- Preserva INTEGRALMENTE a lógica da migration_v52_credit_ledger.sql
-- (abertura de lotes no ledger, fallback em caso de erro); o único
-- acrescento é a verificação da janela bonus_promo_starts_at/ends_at.

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
  v_bonus_expiry   INTEGER;
  v_promo_starts   TIMESTAMPTZ;
  v_promo_ends     TIMESTAMPTZ;
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

  -- Créditos bónus/promocionais — somados por cima dos créditos grátis
  -- normais, só se a promoção estiver activa no admin.
  v_bonus_enabled := FALSE;
  BEGIN
    SELECT (value = 'true') INTO v_bonus_enabled
    FROM system_settings WHERE key = 'bonus_credits_enabled';
  EXCEPTION WHEN OTHERS THEN
    v_bonus_enabled := FALSE;
  END;
  IF v_bonus_enabled IS NULL THEN v_bonus_enabled := FALSE; END IF;

  -- NOVO (v61): janela opcional de agendamento. Se qualquer uma das duas
  -- datas estiver definida, a promoção só é aplicada dentro da janela —
  -- mesmo com bonus_credits_enabled = true. Datas vazias/inválidas são
  -- ignoradas (comportamento igual ao de antes: só o interruptor manual).
  IF v_bonus_enabled THEN
    BEGIN
      SELECT value::TIMESTAMPTZ INTO v_promo_starts
      FROM system_settings WHERE key = 'bonus_promo_starts_at';
    EXCEPTION WHEN OTHERS THEN v_promo_starts := NULL; END;
    BEGIN
      SELECT value::TIMESTAMPTZ INTO v_promo_ends
      FROM system_settings WHERE key = 'bonus_promo_ends_at';
    EXCEPTION WHEN OTHERS THEN v_promo_ends := NULL; END;

    IF v_promo_starts IS NOT NULL AND NOW() < v_promo_starts THEN
      v_bonus_enabled := FALSE;
    END IF;
    IF v_promo_ends IS NOT NULL AND NOW() > v_promo_ends THEN
      v_bonus_enabled := FALSE;
    END IF;
  END IF;

  v_bonus_amount := 0;
  v_bonus_expiry := 30;
  IF v_bonus_enabled THEN
    SELECT value::INTEGER INTO v_bonus_amount
    FROM system_settings WHERE key = 'bonus_credits_amount';
    IF v_bonus_amount IS NULL OR v_bonus_amount < 0 THEN
      v_bonus_amount := 0;
    END IF;

    SELECT value::INTEGER INTO v_bonus_expiry
    FROM system_settings WHERE key = 'bonus_credits_expiry_days';
    IF v_bonus_expiry IS NULL OR v_bonus_expiry <= 0 THEN
      v_bonus_expiry := 30; -- fallback
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
    v_credits + v_bonus_amount,                      -- grátis + bónus (se activo e dentro da janela)
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

  -- Abre os lotes correspondentes no ledger, cada um com a sua própria
  -- validade. Best-effort — nunca pode impedir a criação da conta.
  BEGIN
    INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
    VALUES (NEW.id, v_credits, v_credits, 'free', NOW() + (v_expiry_days || ' days')::INTERVAL);

    IF v_bonus_amount > 0 THEN
      INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
      VALUES (NEW.id, v_bonus_amount, v_bonus_amount, 'bonus', NOW() + (v_bonus_expiry || ' days')::INTERVAL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
EXCEPTION
  -- Mesma rede de segurança da migration_v21/v51/v52: qualquer erro
  -- inesperado cai para os valores antigos hard-coded, para nunca
  -- bloquear a criação de conta.
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

    BEGIN
      INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
      VALUES (NEW.id, 1, 1, 'free', NOW() + INTERVAL '30 days');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Confirmação (correr manualmente para verificar):
-- SELECT id, name, credits, price_mzn, bonus, is_active, sort_order FROM credit_packages ORDER BY sort_order;
-- SELECT key, value FROM system_settings WHERE key IN ('bonus_credits_enabled','bonus_credits_amount','bonus_credits_expiry_days','bonus_promo_starts_at','bonus_promo_ends_at');
