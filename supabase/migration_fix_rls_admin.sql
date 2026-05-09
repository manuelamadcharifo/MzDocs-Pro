-- ============================================================
-- MIGRAÇÃO: Corrigir RLS profiles SEM recursão infinita
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================
-- PROBLEMA DA VERSÃO ANTERIOR:
--   As políticas admin faziam EXISTS(SELECT FROM profiles WHERE is_admin=TRUE)
--   o que disparava a própria RLS de profiles → loop infinito (erro 42P17)
--
-- SOLUÇÃO: ler is_admin do JWT (auth.jwt()) em vez de subquery na tabela.
--   O JWT é populado pelo trigger handle_new_user via app_metadata.
--   Isto quebra o loop completamente.
-- ============================================================

-- ── 0. Limpar TODAS as políticas existentes na tabela profiles ──────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- ── 1. Função auxiliar (SECURITY DEFINER, sem acesso a profiles) ─────────
-- Lê is_admin do JWT — zero recursão garantida.
CREATE OR REPLACE FUNCTION public.is_admin_jwt()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ── 2. Políticas SELECT ──────────────────────────────────────────────────
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin_jwt());

-- ── 3. Políticas UPDATE ──────────────────────────────────────────────────
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin_jwt()) WITH CHECK (public.is_admin_jwt());

-- ── 4. Política DELETE ───────────────────────────────────────────────────
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin_jwt());

-- ── 5. Sincronizar is_admin existentes no app_metadata do JWT ───────────
-- Necessário para que is_admin_jwt() funcione para admins já criados.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE id IN (SELECT id FROM public.profiles WHERE is_admin = TRUE)
  AND (raw_app_meta_data ->> 'is_admin') IS DISTINCT FROM 'true';

-- ── 6. Actualizar trigger handle_new_user ────────────────────────────────
-- Propaga is_admin do app_metadata para a tabela profiles no registo.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, is_admin, credits)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
    COALESCE((NEW.raw_app_meta_data->>'is_admin')::boolean, false),
    3
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 7. Verificar resultado ───────────────────────────────────────────────
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY cmd, policyname;
-- Esperado: profiles_select_own, profiles_select_admin,
--           profiles_update_own, profiles_update_admin, profiles_delete_admin
