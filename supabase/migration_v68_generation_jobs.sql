-- supabase/migration_v68_generation_jobs.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P1.1 (Master Hardening & Release Gate v2, Set/2026) —
-- AUTORIZAÇÃO DA GERAÇÃO EM CADEIA (_planMode / _sectionMode).
--
-- PROBLEMA CONFIRMADO (por leitura directa do código actual):
-- em api/generate-document.js, o bloco de autenticação tinha a forma:
--
--   if (!isChainCall && !isPreview) { ...exigir JWT... }
--   else if (isPreview) { ...JWT opcional... }
--
-- Ou seja: quando `_planMode` ou `_sectionMode` era `true` (a geração em
-- cadeia usada por "Trabalho Escolar"/"Plano de Negócios"), NENHUM dos dois
-- ramos corria. `verifiedUserId` ficava igual a `userId`, um valor lido do
-- CORPO do pedido — nunca verificado por JWT. Qualquer chamada directa a
-- /api/generate-document com `_planMode:true` ou `_sectionMode:true`
-- gerava conteúdo de IA real, ilimitado e gratuito, sem sessão válida e
-- sem qualquer dedução de crédito — o "rate limit" existente nunca foi
-- pensado como mecanismo de autorização.
--
-- Esta migração cria a componente de base de dados do mecanismo de
-- autorização por "job de geração" pedido no ponto 5 do Master Hardening:
--
--   JWT → user_id → generation_job → plan → sections → finalização
--
-- api/generate-document.js (ver esse ficheiro) passa a:
--   1. Exigir sempre JWT válido (mesmo em chamadas de cadeia) — a 1ª metade
--      do problema, corrigida directamente no handler, sem depender desta
--      migração.
--   2. Em `_planMode`: chamar create_generation_job() e devolver `jobId`
--      ao cliente.
--   3. Em `_sectionMode`: exigir esse `jobId` e chamar
--      validate_generation_job() antes de gastar qualquer token de IA —
--      confirma que o job pertence ao utilizador autenticado, não expirou
--      e está num estado válido.
--
-- Falha fechada por desenho: se estas RPCs não existirem (migração ainda
-- não aplicada nesse ambiente), o servidor responde 503 em vez de deixar a
-- geração em cadeia continuar sem controlo (ver bloco try/catch em
-- generate-document.js).
--
-- Idempotente — seguro correr múltiplas vezes.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mesmo operationId (UUID) já gerado pelo cliente para ligar o plano ao
  -- débito de crédito correspondente (ver Services.js/_callBackend) —
  -- opcional porque chamadas antigas do cliente, antes deste deploy, não o
  -- enviam; NULL é aceite de propósito.
  operation_id     UUID,
  service          TEXT NOT NULL DEFAULT 'unknown',
  credits_reserved INTEGER NOT NULL DEFAULT 0 CHECK (credits_reserved >= 0),
  status           TEXT NOT NULL DEFAULT 'planning'
                     CHECK (status IN ('planning', 'active', 'completed', 'expired', 'cancelled')),
  sections_done    INTEGER NOT NULL DEFAULT 0 CHECK (sections_done >= 0),
  -- Janela generosa (documentos de 30 páginas com vários providers e
  -- retries podem legitimamente demorar vários minutos) mas limitada —
  -- um job nunca pode ser reutilizado indefinidamente.
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 minutes'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_expires ON public.generation_jobs (status, expires_at);

-- Um mesmo operation_id não pode gerar dois jobs em paralelo (permite,
-- no entanto, reutilizar o mesmo job em retries da MESMA tentativa — ver
-- create_generation_job() abaixo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_jobs_operation_id
  ON public.generation_jobs (operation_id)
  WHERE operation_id IS NOT NULL;

COMMENT ON TABLE public.generation_jobs IS
  'P1.1 — job de autorização para a geração em cadeia (_planMode/_sectionMode). '
  'Cada _sectionMode tem de apresentar um job válido, pertencente ao próprio '
  'utilizador autenticado e ainda não expirado. Nunca acedida directamente '
  'pelo browser — só via service_role, a partir de api/generate-document.js.';

-- ── 2. RLS ───────────────────────────────────────────────────────────────
-- Sem policies de INSERT/UPDATE/DELETE para "anon"/"authenticated": só o
-- service_role (usado pelo backend, que ignora RLS) pode escrever. Mantém-se
-- uma policy de SELECT para o próprio dono só por transparência/depuração
-- futura (ex.: um painel "as minhas gerações em curso") — não é usada hoje.
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generation_jobs_owner_select ON public.generation_jobs;
CREATE POLICY generation_jobs_owner_select
  ON public.generation_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- ── 3. RPCs (SECURITY DEFINER, search_path vazio — ver P1.4 nesta mesma
--    ronda) ──────────────────────────────────────────────────────────────

-- create_generation_job(): chamada em _planMode, DEPOIS do JWT verificado
-- no servidor. p_user_id vem do JWT (nunca do corpo do pedido). Se já
-- existir um job válido para o mesmo (user_id, operation_id) — caso de
-- retry da mesma tentativa de planeamento — devolve o job existente em vez
-- de criar um duplicado.
CREATE OR REPLACE FUNCTION public.create_generation_job(
  p_user_id          UUID,
  p_operation_id     UUID,
  p_service          TEXT,
  p_credits_reserved INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id é obrigatório';
  END IF;

  IF p_operation_id IS NOT NULL THEN
    SELECT id INTO v_job_id
      FROM public.generation_jobs
     WHERE operation_id = p_operation_id
       AND user_id      = p_user_id
       AND status IN ('planning', 'active')
       AND expires_at > now();
    IF v_job_id IS NOT NULL THEN
      RETURN v_job_id;
    END IF;
  END IF;

  INSERT INTO public.generation_jobs (user_id, operation_id, service, credits_reserved, status)
  VALUES (p_user_id, p_operation_id, COALESCE(NULLIF(p_service, ''), 'unknown'),
          GREATEST(COALESCE(p_credits_reserved, 0), 0), 'planning')
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_generation_job(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_generation_job(UUID, UUID, TEXT, INTEGER) TO service_role;

-- validate_generation_job(): chamada em CADA _sectionMode, antes de gastar
-- qualquer token de IA. Confirma posse + validade e, em caso de sucesso,
-- promove o job para 'active' e incrementa sections_done (rasto de quantas
-- secções já foram autorizadas para este job — útil em auditoria/abuso).
CREATE OR REPLACE FUNCTION public.validate_generation_job(
  p_job_id  UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated UUID;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.generation_jobs
     SET status        = 'active',
         sections_done = sections_done + 1,
         updated_at    = now()
   WHERE id         = p_job_id
     AND user_id    = p_user_id
     AND status IN ('planning', 'active')
     AND expires_at > now()
  RETURNING id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_generation_job(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_generation_job(UUID, UUID) TO service_role;

-- complete_generation_job(): opcional — marca o job como concluído assim
-- que o documento é finalizado com sucesso. Não é estritamente necessário
-- por segurança (o job expira sozinho ao fim de 45 min), mas evita que um
-- job já terminado apareça como "planning"/"active" em auditorias futuras.
CREATE OR REPLACE FUNCTION public.complete_generation_job(
  p_job_id  UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated UUID;
BEGIN
  UPDATE public.generation_jobs
     SET status = 'completed', updated_at = now()
   WHERE id = p_job_id AND user_id = p_user_id
  RETURNING id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_generation_job(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_generation_job(UUID, UUID) TO service_role;

-- expire_stale_generation_jobs(): manutenção — pode ser chamada por um cron
-- (ex.: scripts/ já existentes para outras limpezas periódicas) para marcar
-- como 'expired' jobs cujo expires_at já passou e que ainda estejam em
-- 'planning'/'active'. Puramente de arrumação — validate_generation_job()
-- já rejeita jobs expirados mesmo sem isto correr.
CREATE OR REPLACE FUNCTION public.expire_stale_generation_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.generation_jobs
     SET status = 'expired', updated_at = now()
   WHERE status IN ('planning', 'active')
     AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_generation_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_generation_jobs() TO service_role;

-- ── 4. Verificação pós-migração (executar manualmente) ─────────────────
-- SELECT proname, prosecdef FROM pg_proc WHERE proname IN
--   ('create_generation_job','validate_generation_job',
--    'complete_generation_job','expire_stale_generation_jobs');
-- → todas devem ter prosecdef = true e nenhum grant para PUBIC/anon/authenticated.
