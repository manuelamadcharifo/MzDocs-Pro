-- ============================================================
-- MIGRAÇÃO: Adicionar coluna is_blocked à tabela profiles
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Adicionar coluna (seguro mesmo se já existir)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Índice para filtrar utilizadores bloqueados eficientemente
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked
    ON public.profiles (is_blocked)
    WHERE is_blocked = TRUE;

-- 3. Política RLS: admin pode actualizar qualquer perfil (inclui is_blocked)
--    (A política "admin_all_profiles" genérica já deve cobrir isto,
--     mas adicionamos uma explícita para UPDATE como garantia)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'profiles'
          AND policyname = 'admin_update_any_profile'
    ) THEN
        CREATE POLICY "admin_update_any_profile"
            ON public.profiles
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.is_admin = TRUE
                )
            );
    END IF;
END $$;

-- 4. Verificar resultado
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  = 'is_blocked';
-- Deve retornar: is_blocked | boolean | false | NO
