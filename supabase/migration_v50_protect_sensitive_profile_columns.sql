-- migration_v50_protect_sensitive_profile_columns.sql
-- ─────────────────────────────────────────────────────────────────────────
-- CORRECÇÃO DE SEGURANÇA (defesa em profundidade): a política de UPDATE em
-- "profiles" para utilizadores normais ("Users can update own profile") só
-- verifica a LINHA (auth.uid() = id), não as COLUNAS. Um utilizador normal
-- podia, em teoria, tentar alterar campos sensíveis da própria linha —
-- is_admin, credits, aff_balance, account_type, etc.
--
-- IMPORTANTE (corrigido nesta versão): confirmei que o painel admin
-- (assets/js/admin/AdminApp.js) actualiza estas MESMAS colunas
-- DIRECTAMENTE a partir do browser, usando o cliente Supabase (não passa
-- por /api/*), amparado pela política "Admins can update all profiles"
-- (polices.sql). A primeira versão deste trigger só deixava passar
-- alterações vindas do service_role — isso teria BLOQUEADO o painel admin
-- em produção. Corrigido: o trigger agora também permite quando o próprio
-- chamador (auth.uid()) é admin, replicando exactamente a mesma condição
-- já usada nas políticas RLS de admin.
--
-- Quem continua bloqueado: um utilizador NORMAL (não admin) a tentar
-- alterar estas colunas na própria linha — que é exactamente o que se
-- quer impedir.
--
-- Executar uma única vez no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS TRIGGER AS $$
DECLARE
  caller_is_admin BOOLEAN;
BEGIN
  -- O backend (Vercel, via service_role) continua a poder alterar tudo.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Administradores autenticados via browser (painel /admin.html) também
  -- podem alterar estas colunas — mesma condição usada em
  -- "Admins can update all profiles" (polices.sql), para não quebrar
  -- funcionalidade já existente do painel.
  SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(caller_is_admin, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Para qualquer outro caso (utilizador normal a tentar alterar a própria
  -- linha): impedir alteração directa de colunas sensíveis.
  IF NEW.is_admin                 IS DISTINCT FROM OLD.is_admin
     OR NEW.credits                IS DISTINCT FROM OLD.credits
     OR NEW.aff_balance            IS DISTINCT FROM OLD.aff_balance
     OR NEW.aff_is_blocked         IS DISTINCT FROM OLD.aff_is_blocked
     OR NEW.is_blocked             IS DISTINCT FROM OLD.is_blocked
     OR NEW.account_type           IS DISTINCT FROM OLD.account_type
     OR NEW.ref_code                IS DISTINCT FROM OLD.ref_code
     OR NEW.template_author_balance IS DISTINCT FROM OLD.template_author_balance
     OR NEW.referral_bonus_given    IS DISTINCT FROM OLD.referral_bonus_given
     OR NEW.welcome_bonus_given     IS DISTINCT FROM OLD.welcome_bonus_given
  THEN
    RAISE EXCEPTION 'Não autorizado a alterar estes campos directamente.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_sensitive_profile_columns ON profiles;
CREATE TRIGGER trg_protect_sensitive_profile_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_sensitive_profile_columns();

-- Nota: se no futuro precisares que o PRÓPRIO utilizador possa alterar
-- alguma destas colunas de forma legítima e directa (sem passar por
-- /api/* nem ser admin), remove-a desta lista — mas confirma primeiro
-- que a mudança é mesmo assim válida vinda directamente do cliente.

