-- ============================================================
-- EMERGÊNCIA — Corrigir 42P17 recursão infinita em profiles
-- Cole TODO este conteúdo no Supabase → SQL Editor → Run
-- ============================================================

-- PASSO 1: Desactivar RLS temporariamente para parar o erro imediato
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- PASSO 2: Apagar absolutamente TODAS as políticas de profiles
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
    RAISE NOTICE 'Dropped policy: %', r.policyname;
  END LOOP;
END $$;

-- PASSO 3: Criar função is_admin_jwt (sem tocar em profiles → zero recursão)
CREATE OR REPLACE FUNCTION public.is_admin_jwt()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- PASSO 4: Reactivar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- PASSO 5: Criar políticas LIMPAS (sem subquery em profiles)
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

-- PASSO 6: Sincronizar is_admin no JWT para admins existentes
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE id IN (
  SELECT id FROM public.profiles WHERE is_admin = TRUE
);

-- PASSO 7: Confirmar — deve mostrar 5 políticas, NENHUMA com subquery em profiles
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY cmd, policyname;
