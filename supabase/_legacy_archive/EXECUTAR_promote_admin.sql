-- ============================================================
-- EXECUTAR AGORA — Promover admin e sincronizar JWT metadata
-- Cole no Supabase → SQL Editor → Run
--
-- Este script resolve o 403 "Acesso negado — apenas admins"
-- ao sincronizar o is_admin para o app_metadata do JWT,
-- eliminando a dependência de query à tabela profiles
-- (que sofre de recursão RLS).
-- ============================================================

-- PASSO 1: Garantir que is_admin = TRUE na tabela profiles
--   (substitua o email pelo seu se necessário)
UPDATE public.profiles
SET is_admin = TRUE, updated_at = NOW()
WHERE email = 'manuelamadcharifo@gmail.com'   -- ← o seu email
   OR phone = '+258858695506';                 -- ← o seu telemóvel

-- PASSO 2: Sincronizar app_metadata em auth.users para TODOS os admins
--   Isto permite que o backend valide admin via JWT sem query à DB
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE id IN (
  SELECT id FROM public.profiles WHERE is_admin = TRUE
);

-- PASSO 3 (opcional mas recomendado): Corrigir RLS de profiles para evitar recursão
--   Apagar policies problemáticas e recriar com função JWT (sem subquery em profiles)

-- Apagar policies com recursão
DROP POLICY IF EXISTS "admin_all_profiles"       ON public.profiles;
DROP POLICY IF EXISTS "admin_all_documents"      ON public.documents;
DROP POLICY IF EXISTS "admin_all_transactions"   ON public.transactions;

-- Função helper: lê is_admin do JWT (zero query à DB)
CREATE OR REPLACE FUNCTION public.is_admin_jwt()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- Recriar policies sem recursão
DROP POLICY IF EXISTS "profiles_select_admin"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_admin"  ON public.profiles;

CREATE POLICY "profiles_select_admin"  ON public.profiles FOR SELECT    TO authenticated USING (public.is_admin_jwt());
CREATE POLICY "profiles_update_admin"  ON public.profiles FOR UPDATE    TO authenticated USING (public.is_admin_jwt()) WITH CHECK (public.is_admin_jwt());
CREATE POLICY "profiles_delete_admin"  ON public.profiles FOR DELETE    TO authenticated USING (public.is_admin_jwt());
CREATE POLICY "profiles_insert_admin"  ON public.profiles FOR INSERT    TO authenticated WITH CHECK (public.is_admin_jwt());

DROP POLICY IF EXISTS "documents_admin"      ON public.documents;
DROP POLICY IF EXISTS "transactions_admin"   ON public.transactions;
CREATE POLICY "documents_admin"    ON public.documents    FOR ALL TO authenticated USING (public.is_admin_jwt());
CREATE POLICY "transactions_admin" ON public.transactions FOR ALL TO authenticated USING (public.is_admin_jwt());

-- PASSO 4: Confirmar — deve mostrar o seu utilizador com is_admin = true
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.is_admin,
  u.raw_app_meta_data ->> 'is_admin' AS jwt_is_admin
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = TRUE;

-- ✅ Após executar este SQL, faça logout e login novamente no admin.html
--    para que o Supabase emita um novo JWT com o app_metadata actualizado.
