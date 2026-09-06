-- supabase/migrations/<timestamp>_EXECUTAR_promote_admin_structural.sql
--
-- NOTA DE REORGANIZAÇÃO (dívida técnica P2, Set/2026):
-- Este ficheiro é a PARTE ESTRUTURAL, extraída de
-- supabase/_legacy_archive/EXECUTAR_promote_admin.sql (PASSO 3 do original).
--
-- O ficheiro original misturava duas coisas muito diferentes no mesmo
-- script "cole e corra":
--   (a) estrutura (função is_admin_jwt() + policies) — pertence a uma
--       base de dados nova, sempre;
--   (b) uma operação de dados MUITO específica — promover UM email/
--       telemóvel pessoal a admin — que não pertence a `supabase db
--       reset`. Um developer novo não tem essa conta, e gravar um email
--       pessoal real dentro de uma migração versionada não é boa prática.
--
-- A parte (b) foi movida para supabase/ops/promote_admin.sql (não é
-- executada pelo `db reset`; é um script avulso, com placeholder em vez
-- do email/telemóvel reais, para quem precisar de promover um admin).
--
-- Note-se que esta mesma função/policies são recriadas outra vez, de
-- forma idêntica, por EMERGENCIA_fix_recursion.sql (antes) e por
-- EXECUTAR_AGORA_completo.sql (depois) — isso é intencional e inofensivo
-- (CREATE OR REPLACE / DROP POLICY IF EXISTS), reflectindo o histórico
-- real de tentativas sucessivas até à versão final. Mantido aqui para
-- preservar o histórico exacto, sem reescrever a lógica de ninguém.

DROP POLICY IF EXISTS "admin_all_profiles"       ON public.profiles;
DROP POLICY IF EXISTS "admin_all_documents"      ON public.documents;
DROP POLICY IF EXISTS "admin_all_transactions"   ON public.transactions;

CREATE OR REPLACE FUNCTION public.is_admin_jwt()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

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
