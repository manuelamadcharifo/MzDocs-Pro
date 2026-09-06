-- supabase/migration_v16_fix_signup_name_phone.sql
-- ──────────────────────────────────────────────────────────────────────────
-- PROBLEMA: novos utilizadores ficam sem nome e sem número de telemóvel.
--
-- CAUSA RAIZ (auditoria 20/06/2026):
-- O trigger handle_new_user usa ON CONFLICT (id) DO NOTHING.
-- O Supabase executa o trigger ANTES de o api/auth/index.js ter a
-- oportunidade de gravar o perfil via PATCH. Como o trigger cria o perfil
-- com full_name='' e phone='' (os valores de raw_user_meta_data podem ainda
-- não estar disponíveis no momento exacto do trigger em alguns edge cases),
-- e depois faz DO NOTHING se o perfil já existir, o PATCH posterior do
-- api/auth/index.js não consegue sobrepor porque recebe 0 rows affected.
--
-- SOLUÇÃO:
-- 1. Mudar o trigger para DO UPDATE SET, sobrepondo os valores quando o
--    perfil já existe mas tem full_name ou phone vazios.
-- 2. O api/auth/index.js já foi corrigido para usar PATCH em vez de upsert.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    1,
    TRUE,
    'normal',
    NOW() + INTERVAL '30 days',
    'free',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- Sobrepor nome e telefone APENAS se estiverem vazios no perfil existente
    -- (protege contas que já têm dados correctos)
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
END;
$$;

-- Recriar o trigger (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Correcção de contas já afectadas ────────────────────────────────────
-- Actualiza perfis existentes que ficaram sem nome/telefone,
-- buscando os valores de auth.users.raw_user_meta_data.
-- SEGURO: só toca em contas com full_name vazio.
UPDATE public.profiles p
SET
  full_name = COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    p.full_name
  ),
  phone = COALESCE(
    NULLIF(u.phone, ''),
    NULLIF(u.raw_user_meta_data->>'phone', ''),
    p.phone
  ),
  updated_at = NOW()
FROM auth.users u
WHERE u.id = p.id
  AND (p.full_name = '' OR p.full_name IS NULL OR p.phone = '' OR p.phone IS NULL)
  AND (
    NULLIF(u.raw_user_meta_data->>'full_name', '') IS NOT NULL
    OR NULLIF(u.phone, '') IS NOT NULL
    OR NULLIF(u.raw_user_meta_data->>'phone', '') IS NOT NULL
  );

-- Ver resultado
SELECT COUNT(*) AS perfis_sem_nome
FROM public.profiles
WHERE full_name = '' OR full_name IS NULL;
