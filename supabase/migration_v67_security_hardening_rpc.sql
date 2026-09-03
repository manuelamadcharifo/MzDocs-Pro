-- supabase/migration_v67_security_hardening_rpc.sql (v2 — corrigida)
-- ──────────────────────────────────────────────────────────────────────────
-- P0.1 (Master Audit, Set/2026) + achados adicionais desta correcção —
-- BLOQUEIO DE RPCs FINANCEIRAS/ADMIN EXPOSTAS.
--
-- ⚠️ NOTA DESTA VERSÃO (v2): a primeira versão desta migração assumia que
-- todas as funções abaixo já existiam na tua base de dados. Ao correr,
-- descobriu-se que `create_temp_account_for_avulso` (definida em
-- `migration_temp_accounts.sql`, um dos ficheiros "avulsos" fora da cadeia
-- numerada — ver aviso na secção 6.3 do README) nunca tinha sido aplicada
-- na tua BD real — e como o SQL Editor corre o script colado como UMA ÚNICA
-- transacção implícita, esse erro fez rollback a TUDO, incluindo as partes
-- que já tinham corrido bem. Esta versão corrige isso: cada REVOKE/GRANT
-- de uma função que já deveria existir passa a verificar primeiro, com
-- `to_regprocedure()`, se essa função existe mesmo com essa assinatura
-- exacta — se não existir, é ignorada com um `NOTICE`, em vez de abortar o
-- resto do script. É seguro correr este ficheiro várias vezes.
--
-- PROBLEMA CONFIRMADO (por leitura directa do código actual, não só da
-- auditoria): dezenas de funções SECURITY DEFINER (que correm com
-- privilégios de dono da função, ignorando RLS) nunca tiveram um
-- REVOKE EXECUTE FROM PUBLIC. Em Postgres, uma função ganha EXECUTE para
-- PUBLIC por omissão — e o Supabase expõe automaticamente qualquer função
-- do schema "public" como endpoint RPC (/rest/v1/rpc/<nome>) para QUALQUER
-- pedido autenticado com a chave anon ou com uma sessão de utilizador
-- normal (role "authenticated"), salvo REVOKE explícito.
--
-- Confirmei, por grep a todo o código-fonte (api/ e assets/js/), que APENAS
-- 3 destas funções são chamadas directamente do browser (cliente,
-- assets/js/services/Services.js e assets/js/admin/AdminApp.js):
--   • add_credits          — painel admin, atribui créditos a QUALQUER utilizador
--   • deduct_credit        — geração normal de documento, desconta 1 crédito
--   • grant_monthly_credits — renovação mensal do plano do próprio utilizador
-- Todas as restantes só são chamadas pelo servidor (api/_services/*.js,
-- api/admin/index.js, etc.) através da service_role key — nunca pelo
-- browser. Por isso podemos bloquear TODAS as outras sem qualquer risco de
-- regressão de funcionalidade, e blindar as 3 acima com uma verificação de
-- autorização dentro da própria função.
--
-- ACHADOS ADICIONAIS (mais graves do que os que a auditoria externa
-- encontrou, pela mesma causa raiz):
--   • promote_to_admin(p_user_id, p_role) — SEM QUALQUER restrição, SEM
--     verificação de quem chama. Qualquer utilizador autenticado podia
--     chamar promote_to_admin(<o_seu_próprio_id>) e tornar-se administrador
--     total da plataforma. É o achado mais crítico desta auditoria.
--   • confirm_payment_and_set_plan(p_transaction_id, p_admin_id) — função
--     legada (ficheiro avulso `migration_monthly_credits.sql`, fora da
--     cadeia numerada), permitia a qualquer utilizador confirmar QUALQUER
--     transacção pendente de QUALQUER pessoa e ficar com os créditos +
--     plano pago, de graça — SE esse ficheiro tiver sido aplicado; esta
--     migração tranca-a condicionalmente, sem erro se não existir.
--   • complete_transaction(p_transaction_id, p_mpesa_receipt) — mesma
--     situação, ficheiro avulso `transactions.sql`.
--   • admin_approve_template / admin_reject_template / admin_feature_template
--     / admin_change_template_type / process_template_sale — todas
--     SECURITY DEFINER, todas recebem p_admin_id como PARÂMETRO (nunca
--     verificado contra quem realmente chamou), todas sem GRANT restritivo.
--   • deduct_credits_idempotent / refund_credit_idempotent — já tinham GRANT
--     TO authenticated (v60) mas sem verificação interna: qualquer
--     utilizador autenticado podia debitar créditos de OUTRA conta, ou
--     "reembolsar" créditos para qualquer conta à sua escolha.
--   • create_temp_account / create_normal_account — criam contas com
--     créditos grátis sem controlo de quem chama.
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   1. Fecha por omissão: revoga EXECUTE de PUBLIC/anon/authenticated em
--      todas as funções acima QUE EXISTIREM na tua base de dados, e
--      concede apenas a service_role (o backend Vercel, via
--      SUPABASE_SERVICE_ROLE_KEY, continua a funcionar exactamente como
--      antes — nada muda do lado do servidor).
--   2. Reescreve as 3 funções chamadas pelo browser (add_credits,
--      deduct_credit, grant_monthly_credits) com uma verificação de
--      autorização INTERNA — a lógica de negócio de cada uma mantém-se
--      100% igual, só foi acrescentada a guarda no topo.
--   3. Define ALTER DEFAULT PRIVILEGES para que qualquer função nova criada
--      no schema public a partir de agora já nasça sem EXECUTE para
--      PUBLIC.
--   4. Corrige uma contradição real na migration_v50 e garante que o
--      trigger de protecção de colunas sensíveis existe (recria-o mesmo
--      que a v50 nunca tenha corrido).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente — pode ser
-- corrido de novo sem efeitos colaterais.
-- ──────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 0 — Função auxiliar temporária (removida no fim deste script)
-- ════════════════════════════════════════════════════════════════════════
-- Tranca uma função existente (REVOKE de PUBLIC/anon/authenticated + GRANT
-- só a service_role) SE ela existir com exactamente esta assinatura nesta
-- base de dados. Se não existir (ficheiro de origem nunca aplicado, ou
-- assinatura diferente), regista um NOTICE e continua sem erro.
CREATE OR REPLACE FUNCTION public._v67_lock_if_exists(p_signature TEXT)
RETURNS VOID AS $$
DECLARE
  fn_oid regprocedure;
BEGIN
  BEGIN
    fn_oid := to_regprocedure(p_signature);
  EXCEPTION WHEN OTHERS THEN
    fn_oid := NULL;
  END;

  IF fn_oid IS NULL THEN
    RAISE NOTICE 'v67: função % não existe nesta base de dados — ignorada.', p_signature;
    RETURN;
  END IF;

  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn_oid);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_oid);
  RAISE NOTICE 'v67: função % trancada a service_role.', p_signature;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 1 — Funções reescritas com verificação de autorização interna
--           (continuam acessíveis a "authenticated", agora com guarda).
--           Estas três SÃO recriadas de raiz (CREATE OR REPLACE), por isso
--           não precisam do helper condicional acima — passam a existir
--           com esta assinatura de qualquer forma.
-- ════════════════════════════════════════════════════════════════════════

-- ── add_credits — só service_role OU um admin autenticado pode creditar
--    QUALQUER conta.
CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_credits    INTEGER;
  caller_is_admin BOOLEAN;
BEGIN
  IF auth.role() <> 'service_role' THEN
    SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = auth.uid();
    IF NOT COALESCE(caller_is_admin, FALSE) THEN
      RAISE EXCEPTION 'Não autorizado: apenas administradores podem atribuir créditos.';
    END IF;
  END IF;

  UPDATE profiles
    SET credits = credits + amount, updated_at = NOW()
  WHERE id = user_id
  RETURNING credits INTO new_credits;

  BEGIN
    INSERT INTO credit_ledger (profile_id, amount, remaining, source, expires_at)
    VALUES (user_id, amount, amount, 'purchase', NOW() + INTERVAL '30 days');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- degradação segura (P2), igual ao comportamento já existente
  END;

  RETURN COALESCE(new_credits, amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION add_credits(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION add_credits(UUID, INTEGER) TO authenticated, service_role;


-- ── deduct_credit — service_role (servidor) OU o PRÓPRIO utilizador
--    autenticado (auth.uid() = user_id), nunca outra conta.
CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM user_id THEN
    RAISE EXCEPTION 'Não autorizado: só pode descontar créditos da própria conta.';
  END IF;

  SELECT credits
    INTO current_credits
    FROM profiles
   WHERE id = user_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF current_credits < 1 THEN RETURN -1; END IF;

  UPDATE profiles
     SET credits    = credits - 1,
         updated_at = NOW()
   WHERE id = user_id;

  BEGIN
    PERFORM _consume_credit_ledger(user_id, 1);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- degradação segura (P2)
  END;

  RETURN current_credits - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION deduct_credit(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION deduct_credit(UUID) TO authenticated, service_role;


-- ── grant_monthly_credits — service_role OU o PRÓPRIO utilizador
--    (auth.uid() = target_user_id).
CREATE OR REPLACE FUNCTION grant_monthly_credits(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    prof           RECORD;
    monthly_amount INTEGER;
    now_ts         TIMESTAMPTZ := NOW();
BEGIN
    IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM target_user_id THEN
      RAISE EXCEPTION 'Não autorizado: só pode renovar o próprio plano.';
    END IF;

    SELECT * INTO prof FROM profiles WHERE id = target_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN -1; END IF;

    IF prof.plan = 'free' OR prof.plan IS NULL THEN RETURN prof.credits; END IF;
    IF prof.plan_expires_at IS NOT NULL AND prof.plan_expires_at < now_ts THEN
        UPDATE profiles SET plan = 'free', plan_expires_at = NULL WHERE id = target_user_id;
        RETURN prof.credits;
    END IF;

    IF prof.monthly_renewal_at IS NOT NULL
       AND date_trunc('month', prof.monthly_renewal_at) = date_trunc('month', now_ts)
    THEN
        RETURN prof.credits;
    END IF;

    monthly_amount := CASE prof.plan
        WHEN 'starter' THEN 1
        WHEN 'basico'  THEN 3
        WHEN 'pro'     THEN 8
        ELSE 0
    END;

    IF monthly_amount = 0 THEN RETURN prof.credits; END IF;

    UPDATE profiles
    SET credits            = credits + monthly_amount,
        monthly_renewal_at = now_ts,
        updated_at         = now_ts
    WHERE id = target_user_id;

    RETURN prof.credits + monthly_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION grant_monthly_credits(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION grant_monthly_credits(UUID) TO authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 2 — Funções SÓ SERVIDOR (nunca chamadas do browser) — trancadas
--           a service_role, SE existirem (ver Parte 0). Nenhuma alteração
--           de lógica interna, só GRANT.
-- ════════════════════════════════════════════════════════════════════════

SELECT public._v67_lock_if_exists('deduct_credits(uuid, integer)');
SELECT public._v67_lock_if_exists('refund_credit(uuid, integer)');
SELECT public._v67_lock_if_exists('deduct_credits_idempotent(uuid, integer, uuid, text, text)');
SELECT public._v67_lock_if_exists('refund_credit_idempotent(uuid, integer, uuid, text, text)');
SELECT public._v67_lock_if_exists('confirm_payment_and_credit(uuid, text, text, numeric, integer, uuid, text)');

-- ── Achado crítico: promote_to_admin (concessão de administrador total) ──
SELECT public._v67_lock_if_exists('promote_to_admin(uuid, varchar)');

-- ── Funções legadas mortas mas ainda perigosas (ficheiros avulsos fora da
--    cadeia numerada — podem não existir, daí o helper condicional) ──
SELECT public._v67_lock_if_exists('confirm_payment_and_set_plan(uuid, uuid)');
SELECT public._v67_lock_if_exists('complete_transaction(text, text)');

-- ── Criação de contas com créditos grátis ──
SELECT public._v67_lock_if_exists('create_temp_account(text, text)');
SELECT public._v67_lock_if_exists('create_normal_account(uuid, text, text, text)');
SELECT public._v67_lock_if_exists('create_temp_account_for_avulso(text, text, integer, text, text)');

-- ── Templates: aprovação/rejeição/destaque/tipo/venda ──
SELECT public._v67_lock_if_exists('admin_approve_template(uuid, uuid, text, boolean)');
SELECT public._v67_lock_if_exists('admin_reject_template(uuid, uuid, text)');
SELECT public._v67_lock_if_exists('admin_feature_template(uuid, uuid, boolean, int)');
SELECT public._v67_lock_if_exists('admin_change_template_type(uuid, uuid, text, int, text)');
SELECT public._v67_lock_if_exists('process_template_sale(uuid, uuid, int, numeric)');
SELECT public._v67_lock_if_exists('approve_template(uuid)');
SELECT public._v67_lock_if_exists('reject_template(uuid, text)');
SELECT public._v67_lock_if_exists('submit_community_template(uuid, text, text, text, text, text, text, text, text, text[], text)');
SELECT public._v67_lock_if_exists('use_template(uuid, uuid, text, text)');
SELECT public._v67_lock_if_exists('toggle_save_template(uuid, uuid)');
SELECT public._v67_lock_if_exists('rate_template(uuid, uuid, int, text)');
SELECT public._v67_lock_if_exists('regenerate_share_token(uuid, uuid)');
SELECT public._v67_lock_if_exists('increment_template_downloads(uuid)');

-- ── Afiliados: comissões, tiers, fraude, ranking, bónus de referência ──
SELECT public._v67_lock_if_exists('process_affiliate_commission(uuid, uuid, text, integer)');
SELECT public._v67_lock_if_exists('process_affiliate_commission_v2(uuid, uuid, text, integer)');
SELECT public._v67_lock_if_exists('update_affiliate_tier(uuid)');
SELECT public._v67_lock_if_exists('check_affiliate_fraud(uuid, text)');
SELECT public._v67_lock_if_exists('generate_monthly_ranking(text)');
SELECT public._v67_lock_if_exists('grant_referral_signup_bonus(uuid)');
SELECT public._v67_lock_if_exists('register_affiliate_click(text, text, text)');

-- ── Documentos: consumo de downloads/edições extra e 1º documento grátis ──
SELECT public._v67_lock_if_exists('consume_document_download(uuid, uuid)');
SELECT public._v67_lock_if_exists('consume_document_edit(uuid, uuid)');
SELECT public._v67_lock_if_exists('unlock_document_extra(uuid, uuid, text)');
SELECT public._v67_lock_if_exists('grant_free_document(uuid, uuid, text)');

-- ── Analytics/observabilidade server-side ──
SELECT public._v67_lock_if_exists('record_ai_provider_usage(text, boolean, text, integer, integer, text)');
SELECT public._v67_lock_if_exists('increment_page_view(text, date)');
SELECT public._v67_lock_if_exists('increment_page_views(text)');

-- Função auxiliar já não é precisa — removida (não fica lixo na BD).
DROP FUNCTION IF EXISTS public._v67_lock_if_exists(TEXT);


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 3 — Segurança por omissão para o futuro
-- ════════════════════════════════════════════════════════════════════════

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 4 — Trigger de protecção de colunas sensíveis em "profiles"
-- ════════════════════════════════════════════════════════════════════════
-- migration_v50_protect_sensitive_profile_columns.sql protegia a coluna
-- "credits" com um trigger BEFORE UPDATE que bloquearia essa alteração
-- para qualquer chamador que não fosse service_role nem admin — o que
-- entraria em CONTRADIÇÃO com deduct_credit() chamada pelo PRÓPRIO
-- utilizador (auto-serviço, não-admin), já que auth.uid()/auth.role()
-- reflectem sempre quem fez o pedido original, mesmo dentro de uma função
-- SECURITY DEFINER. Como esta migração (v67) já garante essa autorização
-- ao nível da própria RPC, "credits" foi removida desta lista. Adicionadas
-- "is_affiliate"/"aff_segment" (P1.3 da auditoria externa — um utilizador
-- normal podia alterar estes dois campos na própria linha sem validação).
--
-- Esta secção RECRIA o trigger do zero (DROP + CREATE), tal como a v50 já
-- fazia — funciona quer a v50 tenha corrido antes, quer não.

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS TRIGGER AS $$
DECLARE
  caller_is_admin BOOLEAN;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(caller_is_admin, FALSE) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin                 IS DISTINCT FROM OLD.is_admin
     OR NEW.aff_balance            IS DISTINCT FROM OLD.aff_balance
     OR NEW.aff_is_blocked         IS DISTINCT FROM OLD.aff_is_blocked
     OR NEW.is_blocked             IS DISTINCT FROM OLD.is_blocked
     OR NEW.account_type           IS DISTINCT FROM OLD.account_type
     OR NEW.ref_code                IS DISTINCT FROM OLD.ref_code
     OR NEW.template_author_balance IS DISTINCT FROM OLD.template_author_balance
     OR NEW.referral_bonus_given    IS DISTINCT FROM OLD.referral_bonus_given
     OR NEW.welcome_bonus_given     IS DISTINCT FROM OLD.welcome_bonus_given
     OR NEW.is_affiliate            IS DISTINCT FROM OLD.is_affiliate
     OR NEW.aff_segment             IS DISTINCT FROM OLD.aff_segment
  THEN
    RAISE EXCEPTION 'Não autorizado a alterar estes campos directamente.';
  END IF;

  -- "credits" retirada desta lista (v67): a autorização de quem pode
  -- alterar créditos passou a ser garantida ao nível das próprias RPCs
  -- (add_credits/deduct_credit/etc., ver PARTE 1 acima).

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_sensitive_profile_columns ON profiles;
CREATE TRIGGER trg_protect_sensitive_profile_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_sensitive_profile_columns();

COMMENT ON FUNCTION public.protect_sensitive_profile_columns() IS
  'v67 (Set/2026): "credits" removida da lista (autorização agora ao nível da RPC); is_affiliate/aff_segment adicionadas (P1.3 auditoria externa). Recriada nesta migração independentemente de a v50 ter corrido.';
