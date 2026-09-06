-- supabase/ops/promote_admin.sql
--
-- Script AVULSO (não faz parte de `supabase db reset`, não vive em
-- supabase/migrations/). Corre manualmente no SQL Editor do Supabase
-- sempre que precisares de promover uma conta a administrador.
--
-- Extraído de supabase/_legacy_archive/EXECUTAR_promote_admin.sql
-- (PASSO 1, 2 e 4 do original) — a parte estrutural (função is_admin_jwt
-- + policies) já vive permanentemente em supabase/migrations/, ver
-- ..._EXECUTAR_promote_admin_structural.sql.
--
-- Porquê separado: promover um admin é uma OPERAÇÃO, não uma migração —
-- depende de uma conta real já existente, e o original tinha um e-mail
-- pessoal gravado directamente no ficheiro (substituído abaixo por um
-- placeholder).

-- PASSO 1: marcar a conta como admin (troca o e-mail/telemóvel abaixo)
UPDATE public.profiles
SET is_admin = TRUE, updated_at = NOW()
WHERE email = 'SUBSTITUIR_PELO_EMAIL@exemplo.com'
   OR phone = '+258SUBSTITUIR_PELO_TELEMOVEL';

-- PASSO 2: sincronizar app_metadata em auth.users para TODOS os admins
-- (permite validar admin via JWT, sem query a profiles — ver is_admin_jwt())
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE id IN (
  SELECT id FROM public.profiles WHERE is_admin = TRUE
);

-- PASSO 3: confirmar
SELECT
  p.id, p.full_name, p.email, p.phone, p.is_admin,
  u.raw_app_meta_data ->> 'is_admin' AS jwt_is_admin
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = TRUE;

-- Depois de correr isto: logout e login novamente no admin.html, para
-- que o Supabase emita um novo JWT já com o app_metadata actualizado.
