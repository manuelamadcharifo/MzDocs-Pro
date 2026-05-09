-- ============================================================
-- MIGRAÇÃO: Corrigir RLS para admin ver TODOS os utilizadores
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- PROBLEMA: A política "admin_all_profiles" usa FOR ALL mas o PostgREST
-- às vezes aplica a política de SELECT dos utilizadores normais em vez da admin.
-- Solução: criar políticas separadas e explícitas para SELECT e UPDATE de admin.

-- 1. Remover políticas existentes que possam conflituar
DROP POLICY IF EXISTS "admin_all_profiles"      ON public.profiles;
DROP POLICY IF EXISTS "admin_update_any_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile_update" ON public.profiles;

-- 2. Política SELECT: utilizador vê o seu próprio perfil
CREATE POLICY "users_select_own_profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- 3. Política SELECT: admin vê TODOS os perfis (sem excepção)
CREATE POLICY "admin_select_all_profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = TRUE
        )
    );

-- 4. Política UPDATE: utilizador actualiza o seu próprio perfil
CREATE POLICY "users_update_own_profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 5. Política UPDATE: admin actualiza qualquer perfil (para créditos, bloqueio, etc.)
CREATE POLICY "admin_update_all_profiles"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = TRUE
        )
    );

-- 6. Política DELETE: só admin pode eliminar perfis
DROP POLICY IF EXISTS "admin_delete_profiles" ON public.profiles;
CREATE POLICY "admin_delete_profiles"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = TRUE
        )
    );

-- 7. Verificar quantos perfis o admin consegue ver agora
-- (Execute separadamente para testar — deve mostrar TODOS os utilizadores)
-- SELECT COUNT(*) FROM public.profiles;
