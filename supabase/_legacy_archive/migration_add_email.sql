-- supabase/migration_add_email.sql
-- Migração v3.3 → adicionar coluna email à tabela profiles
-- Execute este script se já tiver o schema anterior (v3.1/v3.2) aplicado

-- 1. Adicionar coluna email se não existir
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Índice único no email (ignora NULL — permite múltiplos perfis sem email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email
    ON profiles (email) WHERE email IS NOT NULL;

-- 3. Índice único no phone se não existir
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone
    ON profiles (phone) WHERE phone IS NOT NULL;

-- 4. Actualizar trigger para incluir email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, email, credits)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
        3
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Popular email a partir de auth.users para utilizadores existentes
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

-- Verificar resultado
SELECT COUNT(*) AS total, COUNT(email) AS com_email FROM profiles;
