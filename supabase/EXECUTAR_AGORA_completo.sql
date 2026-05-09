-- ============================================================
-- EXECUTAR AGORA — Resolve TODOS os erros pendentes
-- Supabase Dashboard → SQL Editor → Cole tudo → Run
-- ============================================================

-- ── 1. Colunas em falta na tabela profiles ───────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked     BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_temp        BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temp_ref       TEXT,
  ADD COLUMN IF NOT EXISTS temp_password  TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked
  ON public.profiles (is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_temp_ref
  ON public.profiles (temp_ref)   WHERE temp_ref IS NOT NULL;

-- ── 2. Parar RLS, limpar TODAS as políticas (incluindo a recursiva) ──
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
    RAISE NOTICE 'Dropped: %', r.policyname;
  END LOOP;
END $$;

-- ── 3. Função is_admin_jwt — lê JWT, NUNCA acede a profiles ──
CREATE OR REPLACE FUNCTION public.is_admin_jwt()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ── 4. Reactivar RLS com políticas limpas ────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin_jwt());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin_jwt()) WITH CHECK (public.is_admin_jwt());

CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin_jwt());

-- ── 5. Sincronizar is_admin no JWT dos admins existentes ─────
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE id IN (SELECT id FROM public.profiles WHERE is_admin = TRUE);

-- ── 6. Corrigir função deduct_credit (sem política recursiva) ─
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_credits INTEGER;
  is_temporary    BOOLEAN;
BEGIN
  SELECT credits, is_temp
    INTO current_credits, is_temporary
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND OR current_credits < 1 THEN RETURN -1; END IF;

  UPDATE public.profiles
     SET credits = credits - 1, updated_at = NOW()
   WHERE id = p_user_id;

  IF (current_credits - 1) = 0 AND is_temporary THEN
    DELETE FROM auth.users WHERE id = p_user_id;
    RETURN 0;
  END IF;

  RETURN current_credits - 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credit(UUID) TO authenticated;

-- ── 7. Verificar resultado ────────────────────────────────────
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='profiles'
ORDER BY cmd, policyname;
-- Esperado: 5 políticas, nenhuma com subquery em profiles

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN ('is_blocked','is_temp','temp_ref','temp_password')
ORDER BY column_name;
-- Esperado: 4 linhas
