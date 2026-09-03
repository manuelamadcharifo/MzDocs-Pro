-- supabase/migration_v67_security_hardening_rpc.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P0.1 (Master Audit, Set/2026) + achados adicionais desta correcção —
-- BLOQUEIO DE RPCs FINANCEIRAS/ADMIN EXPOSTAS.
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
-- browser. Isto significa que podemos bloquear TODAS as outras sem
-- qualquer risco de regressão de funcionalidade, e blindar as 3 acima com
-- uma verificação de autorização dentro da própria função (o que a
-- auditoria pede explicitamente: "a função deve validar auth.uid()
-- internamente").
--
-- ACHADOS ADICIONAIS (mais graves do que os que a auditoria externa
-- encontrou, pela mesma causa raiz):
--   • promote_to_admin(p_user_id, p_role) — SEM QUALQUER restrição, SEM
--     verificação de quem chama. Qualquer utilizador autenticado podia
--     chamar promote_to_admin(<o_seu_próprio_id>) e tornar-se administrador
--     total da plataforma. É o achado mais crítico desta auditoria.
--   • confirm_payment_and_set_plan(p_transaction_id, p_admin_id) — função
--     legada (pré-Ago/2026), já não é chamada por nenhum código actual, mas
--     continua na base de dados e continua exposta: permitia a qualquer
--     utilizador confirmar QUALQUER transacção pendente de QUALQUER pessoa
--     e ficar com os créditos + plano pago, de graça.
--   • complete_transaction(p_transaction_id, p_mpesa_receipt) — função
--     legada de transactions.sql, mesmo problema: confirmava qualquer
--     transacção pendente e creditava a conta associada, sem verificar
--     quem chamou.
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
--      todas as funções acima e concede apenas a service_role (o backend
--      Vercel, via SUPABASE_SERVICE_ROLE_KEY, continua a funcionar
--      exactamente como antes — nada muda do lado do servidor).
--   2. Reescreve as 3 funções chamadas pelo browser (add_credits,
--      deduct_credit, grant_monthly_credits) com uma verificação de
--      autorização INTERNA — a lógica de negócio de cada uma mantém-se
--      100% igual, só foi acrescentada a guarda no topo. Continuam
--      GRANTed a "authenticated" (é preciso, o browser continua a chamá-las
--      tal como antes) mas já não a "anon" nem a PUBLIC.
--   3. Define ALTER DEFAULT PRIVILEGES para que qualquer função nova criada
--      no schema public a partir de agora já nasça sem EXECUTE para
--      PUBLIC — quem escrever a próxima migração tem de conceder acesso
--      explicitamente, em vez de ter de se lembrar de revogar.
--
-- NÃO ALTERA NENHUM COMPORTAMENTO VISÍVEL PARA UTILIZADORES LEGÍTIMOS.
-- Todas as chamadas legítimas (server-to-server com service_role, admin
-- autenticado a atribuir créditos, utilizador a descontar o seu próprio
-- crédito, utilizador a renovar o seu próprio plano) continuam a funcionar
-- sem qualquer alteração no código JavaScript (as assinaturas das funções
-- — nomes e parâmetros — não mudaram).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente (pode ser
-- corrido de novo sem efeitos colaterais — REVOKE/GRANT são sempre
-- absolutos, CREATE OR REPLACE substitui a função inteira).
-- ──────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 1 — Funções reescritas com verificação de autorização interna
--           (continuam acessíveis a "authenticated", agora com guarda)
-- ════════════════════════════════════════════════════════════════════════

-- ── add_credits — só service_role OU um admin autenticado pode creditar
--    QUALQUER conta. Um utilizador normal só pode chamar isto para... na
--    prática, nunca — não há nenhum caso de uso legítimo de um utilizador
--    normal creditar-se a si próprio via esta função (créditos vêm sempre
--    de pagamento confirmado no servidor, ou de acção de admin). Por isso
--    a guarda exige explicitamente is_admin = true, sem excepção de "self".
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
--           a service_role. Nenhuma alteração de lógica interna, só GRANT.
-- ════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, INTEGER)                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION refund_credit(UUID, INTEGER)                                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION deduct_credits_idempotent(UUID, INTEGER, UUID, TEXT, TEXT)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION refund_credit_idempotent(UUID, INTEGER, UUID, TEXT, TEXT)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION confirm_payment_and_credit(UUID, TEXT, TEXT, NUMERIC, INTEGER, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION deduct_credits(UUID, INTEGER)                                        TO service_role;
GRANT EXECUTE ON FUNCTION refund_credit(UUID, INTEGER)                                          TO service_role;
GRANT EXECUTE ON FUNCTION deduct_credits_idempotent(UUID, INTEGER, UUID, TEXT, TEXT)            TO service_role;
GRANT EXECUTE ON FUNCTION refund_credit_idempotent(UUID, INTEGER, UUID, TEXT, TEXT)             TO service_role;
GRANT EXECUTE ON FUNCTION confirm_payment_and_credit(UUID, TEXT, TEXT, NUMERIC, INTEGER, UUID, TEXT) TO service_role;

-- ── Achado crítico: promote_to_admin (concessão de administrador total) ──
REVOKE EXECUTE ON FUNCTION promote_to_admin(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION promote_to_admin(UUID, VARCHAR) TO service_role;
COMMENT ON FUNCTION promote_to_admin(UUID, VARCHAR) IS
  'v67 (Set/2026): ferramenta de bootstrap manual (correr no SQL Editor). NUNCA deve ser chamável via RPC público — antes desta migração não tinha NENHUMA restrição, permitindo auto-promoção a admin por qualquer utilizador autenticado.';

-- ── Funções legadas mortas mas ainda perigosas (nunca chamadas pelo
--    código actual, mas continuam a existir na base de dados e continuam
--    RPC-callable até serem trancadas) ──
REVOKE EXECUTE ON FUNCTION confirm_payment_and_set_plan(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION confirm_payment_and_set_plan(UUID, UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION complete_transaction(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_transaction(TEXT, TEXT) TO service_role;

-- ── Criação de contas com créditos grátis ──
REVOKE EXECUTE ON FUNCTION create_temp_account(TEXT, TEXT)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION create_normal_account(UUID, TEXT, TEXT, TEXT)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION create_temp_account_for_avulso(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION create_temp_account(TEXT, TEXT)                              TO service_role;
GRANT  EXECUTE ON FUNCTION create_normal_account(UUID, TEXT, TEXT, TEXT)                TO service_role;
GRANT  EXECUTE ON FUNCTION create_temp_account_for_avulso(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- ── Templates: aprovação/rejeição/destaque/tipo/venda — todas admin ou
--    dinheiro, todas com p_admin_id/p_buyer_id como parâmetro NUNCA
--    verificado contra o chamador real ──
REVOKE EXECUTE ON FUNCTION admin_approve_template(UUID, UUID, TEXT, BOOLEAN)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_reject_template(UUID, UUID, TEXT)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_feature_template(UUID, UUID, BOOLEAN, INT)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_change_template_type(UUID, UUID, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION process_template_sale(UUID, UUID, INT, NUMERIC)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION approve_template(UUID)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reject_template(UUID, TEXT)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION submit_community_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION use_template(UUID, UUID, TEXT, TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION toggle_save_template(UUID, UUID)                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate_template(UUID, UUID, INT, TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION regenerate_share_token(UUID, UUID)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_template_downloads(UUID)                     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_approve_template(UUID, UUID, TEXT, BOOLEAN)      TO service_role;
GRANT EXECUTE ON FUNCTION admin_reject_template(UUID, UUID, TEXT)                TO service_role;
GRANT EXECUTE ON FUNCTION admin_feature_template(UUID, UUID, BOOLEAN, INT)       TO service_role;
GRANT EXECUTE ON FUNCTION admin_change_template_type(UUID, UUID, TEXT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION process_template_sale(UUID, UUID, INT, NUMERIC)        TO service_role;
GRANT EXECUTE ON FUNCTION approve_template(UUID)                                 TO service_role;
GRANT EXECUTE ON FUNCTION reject_template(UUID, TEXT)                            TO service_role;
GRANT EXECUTE ON FUNCTION submit_community_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION use_template(UUID, UUID, TEXT, TEXT)                   TO service_role;
GRANT EXECUTE ON FUNCTION toggle_save_template(UUID, UUID)                       TO service_role;
GRANT EXECUTE ON FUNCTION rate_template(UUID, UUID, INT, TEXT)                   TO service_role;
GRANT EXECUTE ON FUNCTION regenerate_share_token(UUID, UUID)                     TO service_role;
GRANT EXECUTE ON FUNCTION increment_template_downloads(UUID)                     TO service_role;

-- ── Afiliados: comissões, tiers, fraude, ranking, bónus de referência ──
REVOKE EXECUTE ON FUNCTION process_affiliate_commission(UUID, UUID, TEXT, INTEGER)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION process_affiliate_commission_v2(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_affiliate_tier(UUID)                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_affiliate_fraud(UUID, TEXT)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION generate_monthly_ranking(TEXT)                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION grant_referral_signup_bonus(UUID)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION register_affiliate_click(TEXT, TEXT, TEXT)                 FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION process_affiliate_commission(UUID, UUID, TEXT, INTEGER)    TO service_role;
GRANT EXECUTE ON FUNCTION process_affiliate_commission_v2(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION update_affiliate_tier(UUID)                                TO service_role;
GRANT EXECUTE ON FUNCTION check_affiliate_fraud(UUID, TEXT)                          TO service_role;
GRANT EXECUTE ON FUNCTION generate_monthly_ranking(TEXT)                             TO service_role;
GRANT EXECUTE ON FUNCTION grant_referral_signup_bonus(UUID)                          TO service_role;
GRANT EXECUTE ON FUNCTION register_affiliate_click(TEXT, TEXT, TEXT)                 TO service_role;

-- ── Documentos: consumo de downloads/edições extra e 1º documento grátis ──
REVOKE EXECUTE ON FUNCTION consume_document_download(UUID, UUID)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION consume_document_edit(UUID, UUID)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION unlock_document_extra(UUID, UUID, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION grant_free_document(UUID, UUID, TEXT)     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION consume_document_download(UUID, UUID)     TO service_role;
GRANT EXECUTE ON FUNCTION consume_document_edit(UUID, UUID)         TO service_role;
GRANT EXECUTE ON FUNCTION unlock_document_extra(UUID, UUID, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION grant_free_document(UUID, UUID, TEXT)     TO service_role;

-- ── Analytics/observabilidade server-side (baixo risco financeiro directo,
--    mas sem razão nenhuma para ficar acessível ao público) ──
REVOKE EXECUTE ON FUNCTION record_ai_provider_usage(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_page_view(TEXT, DATE)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_page_views(TEXT)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_ai_provider_usage(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION increment_page_view(TEXT, DATE)  TO service_role;
GRANT EXECUTE ON FUNCTION increment_page_views(TEXT)       TO service_role;


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 3 — Segurança por omissão para o futuro
-- ════════════════════════════════════════════════════════════════════════

-- Qualquer função nova criada por um utilizador com privilégios normais no
-- schema "public" a partir de agora já nasce SEM EXECUTE para PUBLIC — tem
-- de ser concedido explicitamente na própria migração que a cria. Isto não
-- afecta nenhuma função já existente (essas foram tratadas explicitamente
-- acima); só se aplica a CREATE FUNCTION futuros.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ════════════════════════════════════════════════════════════════════════
-- PARTE 4 — Correcção de contradição real na migration_v50
-- ════════════════════════════════════════════════════════════════════════
-- migration_v50_protect_sensitive_profile_columns.sql protege a coluna
-- "credits" com um trigger BEFORE UPDATE que bloqueia a alteração dessa
-- coluna para qualquer chamador que não seja service_role nem admin. Isso
-- entra em CONTRADIÇÃO directa com o funcionamento normal de deduct_credit()
-- chamada pelo PRÓPRIO utilizador (Services.js, geração de documentos): o
-- UPDATE profiles SET credits=... feito DENTRO dessa função, mesmo sendo
-- SECURITY DEFINER, é avaliado pelo trigger com base em quem fez o PEDIDO
-- original (auth.uid()/auth.role() reflectem sempre o JWT do pedido, não o
-- dono da função) — ou seja, SE esse trigger estiver activo, uma geração de
-- documento normal (desconto do próprio crédito) seria REJEITADA para
-- qualquer utilizador que não seja admin.
--
-- Como esta migração (v67) já garante, ao nível da própria função, que só
-- service_role ou o próprio utilizador (deduct_credit) / só service_role ou
-- admin (add_credits) conseguem sequer chamar estas RPCs, a protecção
-- adicional do trigger sobre a coluna "credits" deixou de ser necessária
-- E estava a causar (ou estaria, assim que activada) uma contradição.
-- Removida da lista de colunas protegidas pelo trigger — as restantes
-- colunas sensíveis continuam totalmente protegidas.
--
-- Adicionadas ao mesmo trigger, por completude (achado adicional — auditoria
-- externa, P1.3): is_affiliate e aff_segment, que um utilizador normal podia
-- alterar directamente na própria linha via "profiles_update_own" para se
-- auto-promover a afiliado/segmento especial sem qualquer validação.

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

  -- "credits" retirada desta lista (v67): a autorização de quem pode alterar
  -- créditos é agora garantida ao nível das próprias RPCs
  -- (add_credits/deduct_credit/etc., ver PARTE 1/2 acima), evitando a
  -- contradição descrita no comentário desta migração.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nota: se "is_affiliate" ou "aff_segment" não existirem como colunas em
-- profiles no teu schema actual, remove essas duas linhas do IF acima antes
-- de correr esta migração (o CREATE OR REPLACE falha em bloco se alguma
-- coluna referida não existir).

COMMENT ON FUNCTION public.protect_sensitive_profile_columns() IS
  'v67 (Set/2026): "credits" removida da lista (autorização agora ao nível da RPC); is_affiliate/aff_segment adicionadas (P1.3 auditoria externa).';
