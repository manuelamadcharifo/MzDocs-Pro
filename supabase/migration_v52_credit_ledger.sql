-- supabase/migration_v52_credit_ledger.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P2 (prioridade técnica, Agosto/2026) — EXPIRAÇÃO REAL DE CRÉDITOS.
--
-- REGRA DE NEGÓCIO (definida pelo fundador): créditos NORMAIS — grátis de
-- boas-vindas, comprados, de referência/afiliado, ou devolvidos por
-- reembolso automático — expiram, por definição, 30 dias a contar da DATA
-- DE AQUISIÇÃO de CADA lote, não de uma única data por conta. Créditos
-- "bónus"/promocionais continuam a usar o prazo configurável no admin
-- (bonus_credits_expiry_days em system_settings, com 30 dias de fallback).
--
-- O QUE HAVIA ANTES (limitação real, não só "documentada mas nunca
-- aplicada" como o comentário da v51 dizia — ver nota abaixo):
--   profiles.credits_expires_at é uma ÚNICA data por conta, escrita apenas
--   no registo (signup). api/cleanup-temp-accounts.js (Regra 3, já activa
--   em produção) ZERA profiles.credits por completo quando essa única data
--   passa — mas add_credits() (créditos comprados) nunca actualiza essa
--   data. Resultado: créditos comprados DEPOIS da janela grátis de 30 dias
--   herdam a data antiga (podem expirar em poucos dias, ou já expirados);
--   créditos comprados quando credits_expires_at já foi zerado (NULL) para
--   nunca mais expiram. Nos dois casos, não é "30 dias a partir da compra".
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   1. Nova tabela credit_ledger — um registo por LOTE de créditos
--      concedido (grátis, bónus, compra, referência, reembolso), cada um
--      com a sua própria expires_at e o seu próprio saldo (remaining).
--   2. profiles.credits CONTINUA a ser o saldo rápido/autoritativo para
--      dedução em tempo real (deduct_credit/deduct_credits, já atómicos
--      com FOR UPDATE) — não se torna uma SUM() calculada em cada pedido,
--      para não reescrever todos os pontos do código que já leem
--      profiles.credits directamente. O ledger é a camada de CONTABILIDADE
--      que sabe QUANDO cada lote deve deixar de valer.
--   3. deduct_credit/deduct_credits passam a consumir o ledger em paralelo
--      (FIFO por expires_at), best-effort — se o ledger falhar por
--      qualquer razão, a dedução real em profiles.credits não é afectada
--      (degradação segura, tal como pedido).
--   4. add_credits/refund_credit passam a abrir um novo lote no ledger.
--   5. Nova função expire_credit_batches() — chamada pelo cron diário já
--      existente (api/cleanup-temp-accounts.js, 00:00) em vez de criar uma
--      nova Serverless Function (o limite de 12 do Vercel Hobby já está
--      esgotado). Para cada conta com lotes vencidos, remove de
--      profiles.credits exactamente o que ainda estava por gastar nesses
--      lotes (nunca mais do que o saldo actual) e regista em credit_logs.
--   6. Backfill: contas já existentes com credits > 0 ganham um lote
--      inicial no ledger (melhor esforço — não há como reconstruir a
--      mistura exacta grátis/comprado de créditos anteriores a esta
--      migração), usando a credits_expires_at antiga se existir, senão
--      30 dias a partir de agora.
--
-- Idempotente — pode ser executada novamente sem duplicar o backfill nem
-- partir as funções (todas via CREATE OR REPLACE com a MESMA assinatura
-- das versões actuais, confirmada em migration_fix_credits.sql e
-- migration_v12_refund_credit.sql — não é preciso nenhum DROP FUNCTION).
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela credit_ledger ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0),   -- quantidade original concedida no lote
  remaining   INTEGER NOT NULL CHECK (remaining >= 0), -- por gastar E por expirar, neste lote
  source      TEXT NOT NULL CHECK (source IN ('free', 'bonus', 'purchase', 'referral', 'affiliate', 'refund', 'admin')),
  expires_at  TIMESTAMPTZ,             -- NULL = este lote nunca expira
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expired_at  TIMESTAMPTZ              -- preenchido por expire_credit_batches() quando o lote vence
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_active
  ON credit_ledger(profile_id, expires_at)
  WHERE remaining > 0 AND expired_at IS NULL;

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_ledger_own_select" ON credit_ledger;
CREATE POLICY "credit_ledger_own_select" ON credit_ledger
  FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "credit_ledger_admin_select" ON credit_ledger;
CREATE POLICY "credit_ledger_admin_select" ON credit_ledger
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );
-- Escrita apenas pelo backend via Service Role Key (ignora RLS) — tal como
-- credit_logs; nenhuma política de INSERT/UPDATE para "authenticated".


-- ── 2. Backfill — contas já existentes com créditos por atribuir a um lote ─

INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at, created_at)
SELECT
  p.id,
  p.credits,
  p.credits,
  'purchase', -- origem real desconhecida para saldo pré-existente; tratado como "normal"
  COALESCE(p.credits_expires_at, NOW() + INTERVAL '30 days'),
  COALESCE(p.created_at, NOW())
FROM profiles p
WHERE p.credits > 0
  AND NOT EXISTS (SELECT 1 FROM credit_ledger cl WHERE cl.profile_id = p.id);


-- ── 3. Helper interno — consome o ledger em FIFO por expires_at ──────────
-- Nunca lança excepção para fora nem bloqueia o chamador: se o ledger não
-- tiver saldo suficiente registado (ex.: créditos anteriores à v52 nalgum
-- caso não coberto pelo backfill), simplesmente pára — profiles.credits
-- continua a ser a fonte de verdade do saldo em tempo real.

CREATE OR REPLACE FUNCTION _consume_credit_ledger(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_left  INTEGER := p_amount;
  v_take  INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;

  FOR v_batch IN
    SELECT id, remaining
    FROM credit_ledger
    WHERE profile_id = p_user_id
      AND remaining > 0
      AND expired_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_batch.remaining, v_left);
    UPDATE credit_ledger SET remaining = remaining - v_take WHERE id = v_batch.id;
    v_left := v_left - v_take;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION _consume_credit_ledger(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION _consume_credit_ledger(UUID, INTEGER) TO authenticated;


-- ── 4. deduct_credits / deduct_credit — passam a alimentar o ledger ──────
-- Mesma assinatura e mesmo contrato de retorno de migration_fix_credits.sql
-- (>=0 = saldo restante, -1 = insuficiente/utilizador não encontrado).
-- Único acrescento: consumo best-effort do ledger, nunca bloqueante.

CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits
    INTO current_credits
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF current_credits < p_amount THEN RETURN -1; END IF;

  UPDATE profiles
     SET credits    = credits - p_amount,
         updated_at = NOW()
   WHERE id = p_user_id;

  BEGIN
    PERFORM _consume_credit_ledger(p_user_id, p_amount);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- degradação segura (P2): o ledger nunca bloqueia a dedução real
  END;

  RETURN current_credits - p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credits(UUID, INTEGER) TO service_role;


CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits
    INTO current_credits
    FROM profiles
   WHERE id = user_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF current_credits < 1 THEN RETURN -1; END IF;

  UPDATE profiles
     SET credits    = credits - 1,
         updated_at = NOW()
   WHERE id = user_id;

  BEGIN
    PERFORM _consume_credit_ledger(user_id, 1);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- degradação segura (P2)
  END;

  RETURN current_credits - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO service_role;


-- ── 5. add_credits — compra/atribuição admin abre um lote novo, 30 dias ──

CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INTEGER)
RETURNS INTEGER AS $$
DECLARE new_credits INTEGER;
BEGIN
  UPDATE profiles
    SET credits = credits + amount, updated_at = NOW()
  WHERE id = user_id
  RETURNING credits INTO new_credits;

  BEGIN
    INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
    VALUES (user_id, amount, amount, 'purchase', NOW() + INTERVAL '30 days');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- degradação segura (P2)
  END;

  RETURN COALESCE(new_credits, amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION add_credits(UUID, INTEGER) TO service_role;


-- ── 6. refund_credit — reembolso automático abre um lote novo, 30 dias ───
-- Mesma assinatura de migration_v12_refund_credit.sql — sem DROP necessário.

CREATE OR REPLACE FUNCTION refund_credit(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'refund_credit: p_amount deve ser positivo (recebido: %)', p_amount;
  END IF;

  UPDATE profiles
  SET    credits    = credits + p_amount,
         updated_at = NOW()
  WHERE  id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    RAISE EXCEPTION 'refund_credit: utilizador % não encontrado', p_user_id;
  END IF;

  INSERT INTO credit_logs (user_id, action, credits, note)
  VALUES (
    p_user_id,
    'refund',
    p_amount,
    'Reembolso automático — geração de IA falhou após dedução'
  );

  BEGIN
    INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
    VALUES (p_user_id, p_amount, p_amount, 'refund', NOW() + INTERVAL '30 days');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- degradação segura (P2)
  END;

  RETURN v_new_credits;
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER) TO service_role;


-- ── 7. handle_new_user — abre os lotes grátis/bónus do registo no ledger ─
-- Preserva INTEGRALMENTE a lógica da migration_v51_bonus_credits.sql
-- (mesma assinatura de trigger function, mesmo fallback em caso de erro);
-- o único acrescento é abrir os lotes correspondentes no ledger, também
-- com degradação segura própria (não pode nunca bloquear a criação da conta).

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
    v_credits + v_bonus_amount,                      -- grátis + bónus (se activo)
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

  -- NOVO (P2): abre os lotes correspondentes no ledger, cada um com a sua
  -- própria validade. Best-effort — nunca pode impedir a criação da conta.
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
  -- Mesma rede de segurança da migration_v21/v51: qualquer erro inesperado
  -- cai para os valores antigos hard-coded, para nunca bloquear a criação
  -- de conta.
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


-- ── 8. expire_credit_batches() — chamada pelo cron diário existente ──────
-- Não cria nenhuma Serverless Function nova (limite de 12 já esgotado —
-- ver secção 10 do README). Para cada conta com um ou mais lotes vencidos,
-- remove de profiles.credits exactamente a soma do que ainda estava por
-- gastar nesses lotes — nunca mais do que o saldo actual (GREATEST 0) — e
-- fecha os lotes. Devolve o número de CONTAS afectadas nesta corrida.

CREATE OR REPLACE FUNCTION expire_credit_batches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row              RECORD;
  v_accounts_expired INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT profile_id, SUM(remaining) AS total_remaining
    FROM credit_ledger
    WHERE remaining > 0
      AND expired_at IS NULL
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    GROUP BY profile_id
  LOOP
    UPDATE profiles
       SET credits    = GREATEST(0, credits - v_row.total_remaining),
           updated_at = NOW()
     WHERE id = v_row.profile_id;

    INSERT INTO credit_logs (user_id, action, credits, note)
    VALUES (
      v_row.profile_id,
      'expire',
      -v_row.total_remaining,
      'Expiração automática — lote(s) de créditos com mais de 30 dias'
    );

    UPDATE credit_ledger
       SET remaining  = 0,
           expired_at = NOW()
     WHERE profile_id = v_row.profile_id
       AND remaining > 0
       AND expired_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at < NOW();

    v_accounts_expired := v_accounts_expired + 1;
  END LOOP;

  RETURN v_accounts_expired;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_credit_batches() TO service_role;

-- Confirmação (correr manualmente para verificar após o deploy):
-- SELECT * FROM credit_ledger ORDER BY created_at DESC LIMIT 20;
-- SELECT expire_credit_batches(); -- deve devolver 0 se nada estiver vencido ainda
