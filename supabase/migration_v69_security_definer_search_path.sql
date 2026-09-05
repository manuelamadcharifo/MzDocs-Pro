-- supabase/migration_v69_security_definer_search_path.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P1.4 (Master Hardening & Release Gate v2, Set/2026) — INVENTÁRIO E
-- HARDENING de todas as funções SECURITY DEFINER.
--
-- MÉTODO: inventário completo feito por leitura directa de todas as 78
-- migrações (`grep`/parsing de todo `supabase/*.sql`, deduplicado por nome
-- de função, mantendo só a definição MAIS RECENTE de cada uma — é essa que
-- está realmente activa na base de dados, já que `CREATE OR REPLACE`
-- substitui as anteriores). Resultado: 20 funções SECURITY DEFINER únicas.
-- A migration_v67_security_hardening_rpc.sql já tinha revogado EXECUTE de
-- PUBLIC/anon/authenticated em 10 delas (as financeiras/admin mais óbvias).
-- Esta migração cobre as 6 que sobravam sem tratamento, com o cuidado de
-- NÃO aplicar a mesma correcção cegamente a todas — cada uma tem um
-- veredicto próprio, justificado abaixo, exactamente como pedido.
--
-- Verificação de referência (correr manualmente para confirmar o estado
-- real numa base de dados específica — a análise acima foi feita sobre o
-- código-fonte, não sobre uma ligação viva):
--   SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
--          p.prosecdef, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.prosecdef = true AND n.nspname = 'public';
--
-- ── VEREDICTO POR FUNÇÃO ────────────────────────────────────────────────
--
-- 1. is_admin_jwt() — usada DIRECTAMENTE dentro das políticas RLS de
--    `profiles` (migration_fix_rls_admin.sql: `USING (public.is_admin_jwt())`
--    em profiles_select_admin/profiles_update_admin/profiles_delete_admin).
--    RLS corre no contexto da role que faz a query (`authenticated`), que
--    por isso PRECISA de manter EXECUTE nesta função — revogar quebraria
--    o acesso admin ao painel inteiro. NÃO revogar. Só lê `auth.jwt()`
--    (já totalmente qualificado, schema `auth`), por isso é seguro fixar
--    `search_path = ''` (vazio) sem qualquer referência por qualificar —
--    o valor mais estrito possível, sem risco de quebrar nada.
--
-- 2. cleanup_old_sessions() — usada só por manutenção interna
--    (online_sessions, presença "utilizadores online"); confirmado por
--    grep a todo api/ e assets/js/: NUNCA chamada pelo browser nem pelo
--    servidor. Nasceu com o GRANT EXECUTE PUBLIC por omissão do Postgres,
--    nunca revogado — qualquer pedido autenticado (ou mesmo anónimo,
--    conforme a configuração do projecto) podia chamar
--    `/rest/v1/rpc/cleanup_old_sessions` e apagar sessões de outras
--    pessoas à vontade. Impacto baixo (só dados de presença, não
--    créditos/dinheiro) mas ainda uma escrita não autorizada na BD.
--    REVOGAR de PUBLIC/anon/authenticated, conceder só a service_role;
--    fixar `search_path = public` (a tabela `online_sessions` é referida
--    sem qualificação no corpo da função).
--
-- 3. _consume_credit_ledger(p_user_id, p_amount) — ACHADO NÃO LISTADO
--    EXPLICITAMENTE NO PLANO, ENCONTRADO NESTA AUDITORIA (ver secção 24
--    do plano de hardening: "se encontrares uma vulnerabilidade nova,
--    não a ignores"). `migration_v52_credit_ledger.sql` já tinha
--    `SET search_path = public`, mas também tinha
--    `GRANT EXECUTE ... TO authenticated` — ou seja, QUALQUER utilizador
--    autenticado podia chamar `_consume_credit_ledger(<user_id_de_outra_
--    pessoa>, 999999)` directamente via RPC e esvaziar os lotes de
--    créditos ainda por gastar de QUALQUER OUTRA conta no `credit_ledger`
--    (não mexe em `profiles.credits` directamente, mas corrompe
--    irreversivelmente a contabilidade/auditoria desse ledger para a
--    vítima — sem que `p_user_id` seja alguma vez confirmado contra
--    `auth.uid()`). Confirmado por grep a todo `api/`/`assets/js/`: esta
--    função só é chamada INTERNAMENTE, a partir de `deduct_credits()`
--    (mesmo ficheiro) — nunca pelo browser nem por nenhum endpoint da
--    API. Dentro de uma função SECURITY DEFINER, uma chamada a outra
--    função corre com os privilégios do DONO da função chamadora, não
--    do utilizador original — por isso revogar o EXECUTE de
--    "authenticated" não quebra `deduct_credits()`. REVOGAR de
--    PUBLIC/anon/authenticated, conceder só a service_role.
--
-- 4. expire_credit_batches() — chamada pelo servidor
--    (api/_services/account.js, via service_role) e já só tinha
--    `GRANT EXECUTE ... TO service_role` explícito — mas SEM nenhum
--    `REVOKE EXECUTE FROM PUBLIC` antes disso. GRANT é aditivo, nunca
--    remove o EXECUTE de PUBLIC que o Postgres concede por omissão a
--    QUALQUER função nova — ou seja, mesmo só com o GRANT a
--    service_role, continuava reversamente acessível por
--    PUBLIC/anon/authenticated. Expira lotes de créditos de TODOS os
--    utilizadores de uma vez — chamável por qualquer pessoa, é uma forma
--    barata de negação de serviço/corrupção de dados em massa. REVOGAR
--    de PUBLIC/anon/authenticated (já tinha search_path correcto).
--
-- 5. cleanup_old_metrics_events() — mesmo padrão exacto do nº 4: só
--    `GRANT ... TO service_role`, sem `REVOKE ... FROM PUBLIC` antes.
--    Impacto mais baixo (só apaga eventos de telemetria com mais de 90
--    dias), mas mesma classe de problema. REVOGAR de
--    PUBLIC/anon/authenticated (já tinha search_path correcto).
--
-- 6. approve_template(uuid) / reject_template(uuid, text) /
--    increment_page_view(text, date) / increment_page_views(text) /
--    increment_template_downloads(uuid) — já tinham
--    `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` +
--    `GRANT ... TO service_role` aplicados pela migration_v67
--    (`_v67_lock_if_exists`), mas nunca tinham tido `search_path`
--    definido explicitamente — reescritas aqui só para acrescentar
--    `SET search_path = public`, sem qualquer mudança de lógica
--    (confirmado corpo a corpo com a última versão de cada uma,
--    migration_v9/v8_1/v11/v12). `CREATE OR REPLACE FUNCTION` preserva
--    os GRANTs/REVOKEs já aplicados — não é preciso repetir esse passo.
--
-- 7. handle_new_user() — trigger de `auth.users` (RETURNS TRIGGER), já
--    tinha `search_path = public`. Funções TRIGGER não podem ser
--    invocadas directamente via RPC (o Postgres recusa: "trigger
--    functions can only be called as triggers" quando NEW/OLD não estão
--    ligados) — protecção estrutural do próprio motor, independente de
--    GRANT/REVOKE. NÃO precisa de alteração nesta migração.
--
-- Idempotente — seguro correr múltiplas vezes.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 0. Helper _v67_lock_if_exists() — definido aqui também ─────────────────
-- CORRIGIDO (relatado ao correr esta migração numa base de dados onde a
-- migration_v67_security_hardening_rpc.sql nunca tinha sido aplicada com
-- sucesso, ou foi aplicada antes de o helper existir): "42883: function
-- public._v67_lock_if_exists(unknown) does not exist". Esta migração NÃO
-- deve depender de outra já ter corrido primeiro — por isso o mesmo helper
-- (idêntico ao de migration_v67_security_hardening_rpc.sql) é redefinido
-- aqui via CREATE OR REPLACE: se a v67 já o tiver criado, isto só o
-- substitui por uma cópia idêntica (inofensivo); se nunca tiver corrido,
-- passa a existir agora. Tranca uma função existente (REVOKE de
-- PUBLIC/anon/authenticated + GRANT só a service_role) SE ela existir com
-- exactamente essa assinatura nesta base de dados — se não existir, regista
-- um NOTICE e continua sem erro, em vez de abortar toda a migração.
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
    RAISE NOTICE 'v69: função % não existe nesta base de dados — ignorada.', p_signature;
    RETURN;
  END IF;

  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn_oid);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_oid);
  RAISE NOTICE 'v69: função % trancada a service_role.', p_signature;
END;
$$ LANGUAGE plpgsql;

-- ── 1. is_admin_jwt() — search_path vazio, GRANT a "authenticated" preservado ──
CREATE OR REPLACE FUNCTION public.is_admin_jwt()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;
-- Sem REVOKE aqui de propósito — ver veredicto 1 acima. Mantém-se
-- executável por "authenticated" (necessário para as políticas RLS de
-- profiles continuarem a funcionar).

-- ── 2. cleanup_old_sessions() — search_path + trancada a service_role ──────
CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM online_sessions WHERE updated_at < NOW() - INTERVAL '10 minutes';
END;
$$;
SELECT public._v67_lock_if_exists('cleanup_old_sessions()');

-- ── 3. _consume_credit_ledger() — remove o GRANT indevido a "authenticated" ──
CREATE OR REPLACE FUNCTION public._consume_credit_ledger(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_left  INTEGER := p_amount;
  v_take  INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;

  FOR v_batch IN
    SELECT id, remaining
    FROM credit_ledger
    WHERE profile_id = p_user_id
      AND remaining > 0
      AND expired_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_batch.remaining, v_left);
    UPDATE credit_ledger SET remaining = remaining - v_take WHERE id = v_batch.id;
    v_left := v_left - v_take;
  END LOOP;
END;
$$;
-- CORRIGIDO: migration_v52_credit_ledger.sql tinha
-- "GRANT EXECUTE ... TO authenticated" aqui — removido (nunca chamada pelo
-- browser, só internamente por deduct_credits()).
SELECT public._v67_lock_if_exists('_consume_credit_ledger(uuid, integer)');

-- ── 4/5. Funções já correctas em GRANT/search_path, só lhes faltava o
--    REVOKE explícito de PUBLIC (o GRANT a service_role, sozinho, nunca
--    remove o EXECUTE que o Postgres concede a PUBLIC por omissão) ──────
SELECT public._v67_lock_if_exists('expire_credit_batches()');
SELECT public._v67_lock_if_exists('cleanup_old_metrics_events()');

-- ── 6. Funções já trancadas pela v67 — só acrescentar search_path ──────────
CREATE OR REPLACE FUNCTION public.approve_template(p_template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM admin_approve_template(p_template_id, NULL, '', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_template(p_template_id UUID, p_note TEXT DEFAULT '')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM admin_reject_template(p_template_id, NULL, p_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_page_view(p_page TEXT, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO page_views (page, date, views) VALUES (p_page, p_date, 1)
  ON CONFLICT (page, date) DO UPDATE SET views = page_views.views + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_page_views(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE blog_pages SET views = views + 1 WHERE slug = p_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_template_downloads(p_template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE templates_custom
    SET downloads = downloads + 1, updated_at = NOW()
    WHERE id = p_template_id;
END;
$$;

-- Re-aplicar o lock destas 5 por segurança — CREATE OR REPLACE preserva
-- GRANTs/REVOKEs já existentes, mas repetir aqui é inofensivo (idempotente)
-- e serve de confirmação explícita do estado esperado, sem depender de
-- assumir que nada mudou entretanto na base de dados.
SELECT public._v67_lock_if_exists('approve_template(uuid)');
SELECT public._v67_lock_if_exists('reject_template(uuid, text)');
SELECT public._v67_lock_if_exists('increment_page_view(text, date)');
SELECT public._v67_lock_if_exists('increment_page_views(text)');
SELECT public._v67_lock_if_exists('increment_template_downloads(uuid)');

-- ── Verificação pós-migração (executar manualmente) ────────────────────────
-- SELECT p.proname, p.prosecdef, p.proconfig,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode_chamar,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_pode_chamar
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef = true
--   AND p.proname IN ('is_admin_jwt','cleanup_old_sessions','_consume_credit_ledger',
--                      'expire_credit_batches','cleanup_old_metrics_events',
--                      'approve_template','reject_template','increment_page_view',
--                      'increment_page_views','increment_template_downloads')
-- ORDER BY p.proname;
-- → anon_pode_chamar deve ser FALSE em todas; authenticated_pode_chamar só
--   deve ser TRUE para is_admin_jwt (as restantes: FALSE).
