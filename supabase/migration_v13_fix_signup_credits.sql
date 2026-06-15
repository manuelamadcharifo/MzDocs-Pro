-- supabase/migration_v13_fix_signup_credits.sql
-- ──────────────────────────────────────────────────────────────────────────
-- BUG: novas contas recebem 3 créditos em vez de 1 ("⚡ 3" no registo).
--
-- CAUSA RAIZ:
-- A função `public.handle_new_user()` (trigger executado automaticamente
-- quando o Supabase cria uma linha em `auth.users`) foi redefinida em
-- 5 ficheiros diferentes ao longo do tempo:
--   schema.sql, polices.sql, migration_add_email.sql,
--   migration_monthly_credits.sql, migration_fix_rls_admin.sql
-- TODAS as 5 versões fazem `INSERT INTO public.profiles (..., credits) VALUES (..., 3)`.
--
-- Como `CREATE OR REPLACE FUNCTION` substitui a definição anterior, a versão
-- realmente activa na base de dados hoje é a do último ficheiro executado —
-- e todas elas dão 3 créditos. O texto "1 crédito grátis" só existe no
-- código da app (api/auth/index.js), que tenta corrigir isto com um
-- `upsert` em background — mas o trigger já correu primeiro (de forma
-- síncrona, dentro do próprio `auth.signUp()`), e nem sempre esse upsert
-- consegue sobrepor o valor a tempo/com sucesso.
--
-- SOLUÇÃO: redefinir `handle_new_user()` UMA ÚLTIMA VEZ, com `credits = 1`,
-- e marcar todos os campos relevantes directamente no trigger — para que o
-- perfil já fique correcto mesmo que o upsert em background do
-- api/auth/index.js nunca chegue a executar (ex: SUPABASE_SERVICE_ROLE_KEY
-- em falta na Vercel, RLS, timeout, etc).
--
-- Esta é a definição "vencedora" — execute este script por último, depois
-- de quaisquer outros. É idempotente (pode ser executado novamente sem
-- problemas).
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
    COALESCE((NEW.raw_app_meta_data->>'is_admin')::boolean, false),
    1,                                  -- ✅ CORRIGIDO: 1 crédito grátis (não 3)
    TRUE,                               -- bónus de boas-vindas já concedido — nunca repetir
    'normal',
    NOW() + INTERVAL '30 days',         -- créditos grátis válidos por 30 dias
    'free',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;          -- não sobrepor se outro processo já criou o perfil
  RETURN NEW;
END;
$$;

-- Garantir que o trigger está associado a esta função (caso algum script
-- antigo o tenha removido/recriado com outro nome).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────
-- CORRECÇÃO OPCIONAL para contas já afectadas por este bug:
--
-- Revê manualmente antes de executar! Este UPDATE só deve apanhar contas
-- criadas pelo trigger com o bug (3 créditos, bónus nunca usado, sem
-- documentos gerados, sem compras) — NUNCA contas que já compraram pacotes
-- (essas podem legitimamente ter credits > 1).
--
-- UPDATE public.profiles
-- SET credits = 1
-- WHERE credits = 3
--   AND total_documents = 0
--   AND free_credit_used IS NOT TRUE
--   AND account_type = 'normal'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.transactions t
--     WHERE t.user_id = profiles.id AND t.status = 'completed'
--   );
-- ──────────────────────────────────────────────────────────────────────────
