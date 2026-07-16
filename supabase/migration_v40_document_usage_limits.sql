-- ============================================================
-- MIGRAÇÃO v40 — Limites de utilização por documento (downloads + edições)
-- Execute no SQL Editor do Supabase, DEPOIS das migrações v37/v38/v39.
--
-- IDEIA DE NEGÓCIO (conforme pedido):
-- Cada documento gerado — grátis ou pago — passa a ter um número limitado
-- de "tentativas": downloads do ficheiro final (PDF/Word/Excel) e edições
-- manuais guardadas no editor integrado. O documento em si continua
-- completo e sem marca de água desde o primeiro momento — o que é
-- limitado é quantas vezes se pode voltar a mexer NAQUELE documento depois
-- de gerado, não a qualidade da primeira entrega.
--
--   Plano Grátis (1º crédito, oferecido no registo): 3 downloads, 2 edições
--   Planos pagos (starter/básico/pro/avulso):        5 downloads, 5 edições
--   Plano Empresa:                                    ilimitado (NULL)
--
-- Quando os limites de um documento se esgotam, o utilizador pode gastar
-- 1 crédito da sua conta para desbloquear mais tentativas NAQUELE
-- documento específico (+3 downloads ou +2 edições, o mesmo valor-base do
-- plano grátis, independentemente do plano original).
--
-- SEGURANÇA: os limites são calculados e aplicados inteiramente no
-- servidor (trigger + funções SECURITY DEFINER) a partir do histórico
-- real de créditos (credit_logs) — nunca a partir de valores enviados
-- pelo browser. Um UPDATE directo à tabela `documents` feito pelo cliente
-- (ex: ao gravar o conteúdo editado) nunca consegue alterar os contadores
-- de uso; só as funções abaixo o conseguem fazer.
-- ============================================================

-- ── 1. Rastreio de origem do crédito gasto (para saber o plano do documento) ──
-- Adicionado a credit_logs (tabela já existente em produção): quando um
-- crédito é debitado (api/deduct-credit.js), regista-se também se veio do
-- crédito grátis de registo ou de um pacote pago, e qual — e, mais tarde,
-- a que documento essa dedução deu origem (ligado pela trigger abaixo).
ALTER TABLE credit_logs
  ADD COLUMN IF NOT EXISTS credit_source TEXT,   -- 'free' | 'paid' | 'enterprise'
  ADD COLUMN IF NOT EXISTS document_id   UUID REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_logs_unclaimed_consume
  ON credit_logs(user_id, created_at DESC)
  WHERE action = 'consume' AND document_id IS NULL;

-- ── 2. Colunas de limite/uso em cada documento ─────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS downloads_used        INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloads_limit        INT  DEFAULT 3,   -- NULL = ilimitado
  ADD COLUMN IF NOT EXISTS edits_used              INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edits_limit              INT  DEFAULT 2,   -- NULL = ilimitado
  ADD COLUMN IF NOT EXISTS plan_tier_at_creation TEXT DEFAULT 'free';

COMMENT ON COLUMN documents.downloads_limit IS 'Nº máximo de downloads (PDF/Word/Excel) deste documento. NULL = ilimitado (plano Empresa).';
COMMENT ON COLUMN documents.edits_limit      IS 'Nº máximo de edições manuais gravadas no editor para este documento. NULL = ilimitado (plano Empresa).';
COMMENT ON COLUMN documents.plan_tier_at_creation IS 'Plano do utilizador no momento em que este documento foi gerado — free | paid | enterprise. Só informativo/auditoria; os limites reais são downloads_limit/edits_limit.';

-- ── 3. Trigger: calcula os limites no INSERT e bloqueia alterações directas ─
-- No INSERT: ignora QUALQUER valor de limite/uso enviado pelo cliente e
-- calcula tudo de novo a partir de credit_logs (a dedução de crédito que
-- gerou este documento já tem de existir, feita por api/deduct-credit.js
-- ANTES da geração). No UPDATE: reverte downloads_used/limit/edits_used/
-- limit/plan_tier_at_creation para o valor anterior, a não ser que a
-- alteração venha de uma das funções abaixo (que activam um "guard" de
-- sessão só válido dentro da própria transacção).
CREATE OR REPLACE FUNCTION compute_document_usage_limits()
RETURNS TRIGGER AS $$
DECLARE
  v_log_id  UUID;
  v_source  TEXT;
  v_tier    TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF current_setting('app.usage_rpc', true) IS DISTINCT FROM 'true' THEN
      NEW.downloads_used        := OLD.downloads_used;
      NEW.downloads_limit        := OLD.downloads_limit;
      NEW.edits_used              := OLD.edits_used;
      NEW.edits_limit              := OLD.edits_limit;
      NEW.plan_tier_at_creation := OLD.plan_tier_at_creation;
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'INSERT' — associar à dedução de crédito mais recente ainda
  -- não associada a nenhum documento (FOR UPDATE SKIP LOCKED evita
  -- condições de corrida entre gerações simultâneas do mesmo utilizador).
  SELECT id, credit_source INTO v_log_id, v_source
    FROM credit_logs
    WHERE user_id = NEW.user_id AND action = 'consume' AND document_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF v_log_id IS NOT NULL THEN
    UPDATE credit_logs SET document_id = NEW.id WHERE id = v_log_id;
  END IF;

  v_tier := CASE WHEN v_source IN ('free','paid','enterprise') THEN v_source ELSE 'paid' END;
  -- Reserva: se por algum motivo não houver nenhuma dedução por reclamar
  -- (ex: documento de teste criado manualmente), assume-se 'paid' (5/5) em
  -- vez de 'free' (3/2) — mais generoso, nunca penaliza injustamente.

  NEW.plan_tier_at_creation := v_tier;
  NEW.downloads_used := 0;
  NEW.edits_used       := 0;

  IF v_tier = 'enterprise' THEN
    NEW.downloads_limit := NULL;
    NEW.edits_limit       := NULL;
  ELSIF v_tier = 'paid' THEN
    NEW.downloads_limit := 5;
    NEW.edits_limit       := 5;
  ELSE
    NEW.downloads_limit := 3;
    NEW.edits_limit       := 2;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_compute_document_usage_limits ON documents;
CREATE TRIGGER trg_compute_document_usage_limits
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION compute_document_usage_limits();

-- ── 4. RPC: consumir 1 download ────────────────────────────────────────────
-- Chamada pela API antes de qualquer exportação (PDF/Word/Excel) ser
-- efectivamente gerada no browser.
--
-- NOTA IMPORTANTE: este projecto chama sempre as RPCs através da service
-- role (api/_lib/supabaseAdmin.js → rpc()), nunca com o JWT do utilizador
-- directamente — por isso auth.uid() seria sempre NULL aqui dentro. Por
-- isso o utilizador é passado explicitamente (p_user_id) e já vem
-- validado pelo endpoint (getUserFromToken), exactamente como
-- deduct_credits(p_user_id, p_amount) já faz neste mesmo projecto.
CREATE OR REPLACE FUNCTION consume_document_download(p_document_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_doc RECORD;
BEGIN
  SELECT id, user_id, downloads_used, downloads_limit
    INTO v_doc
    FROM documents
    WHERE id = p_document_id
    FOR UPDATE;

  IF NOT FOUND OR v_doc.user_id IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Documento não encontrado');
  END IF;

  IF v_doc.downloads_limit IS NULL THEN
    RETURN json_build_object('success', true, 'allowed', true, 'unlimited', true);
  END IF;

  IF v_doc.downloads_used >= v_doc.downloads_limit THEN
    RETURN json_build_object(
      'success', true, 'allowed', false, 'unlimited', false,
      'used', v_doc.downloads_used, 'limit', v_doc.downloads_limit
    );
  END IF;

  PERFORM set_config('app.usage_rpc', 'true', true);
  UPDATE documents SET downloads_used = downloads_used + 1 WHERE id = p_document_id;

  RETURN json_build_object(
    'success', true, 'allowed', true, 'unlimited', false,
    'used', v_doc.downloads_used + 1, 'limit', v_doc.downloads_limit,
    'remaining', v_doc.downloads_limit - v_doc.downloads_used - 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RPC: consumir 1 edição ───────────────────────────────────────────────
-- Chamada SÓ quando o utilizador grava uma alteração real no editor (o
-- front-end compara o conteúdo final com o original ao abrir — ver
-- DocumentEditor.js). Abrir e fechar sem alterar nada nunca chama isto.
CREATE OR REPLACE FUNCTION consume_document_edit(p_document_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_doc RECORD;
BEGIN
  SELECT id, user_id, edits_used, edits_limit
    INTO v_doc
    FROM documents
    WHERE id = p_document_id
    FOR UPDATE;

  IF NOT FOUND OR v_doc.user_id IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Documento não encontrado');
  END IF;

  IF v_doc.edits_limit IS NULL THEN
    PERFORM set_config('app.usage_rpc', 'true', true);
    UPDATE documents SET edits_used = edits_used + 1 WHERE id = p_document_id;
    RETURN json_build_object('success', true, 'allowed', true, 'unlimited', true);
  END IF;

  IF v_doc.edits_used >= v_doc.edits_limit THEN
    RETURN json_build_object(
      'success', true, 'allowed', false, 'unlimited', false,
      'used', v_doc.edits_used, 'limit', v_doc.edits_limit
    );
  END IF;

  PERFORM set_config('app.usage_rpc', 'true', true);
  UPDATE documents SET edits_used = edits_used + 1 WHERE id = p_document_id;

  RETURN json_build_object(
    'success', true, 'allowed', true, 'unlimited', false,
    'used', v_doc.edits_used + 1, 'limit', v_doc.edits_limit,
    'remaining', v_doc.edits_limit - v_doc.edits_used - 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. RPC: desbloquear mais tentativas gastando 1 crédito ────────────────
-- +3 downloads ou +2 edições — o mesmo valor-base do plano grátis,
-- independentemente do plano original do documento. Simples e previsível
-- de comunicar ao utilizador ("1 crédito = mais 3 downloads").
CREATE OR REPLACE FUNCTION unlock_document_extra(p_document_id UUID, p_user_id UUID, p_kind TEXT)
RETURNS JSON AS $$
DECLARE
  v_doc RECORD;
  v_new_credits INT;
BEGIN
  IF p_kind NOT IN ('download', 'edit') THEN
    RETURN json_build_object('success', false, 'error', 'kind inválido');
  END IF;

  SELECT id, user_id, downloads_limit, edits_limit
    INTO v_doc
    FROM documents
    WHERE id = p_document_id
    FOR UPDATE;

  IF NOT FOUND OR v_doc.user_id IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Documento não encontrado');
  END IF;

  -- Documentos ilimitados (plano Empresa) nunca precisam de desbloqueio.
  IF (p_kind = 'download' AND v_doc.downloads_limit IS NULL)
     OR (p_kind = 'edit' AND v_doc.edits_limit IS NULL) THEN
    RETURN json_build_object('success', true, 'already_unlimited', true);
  END IF;

  v_new_credits := deduct_credits(p_user_id, 1);
  IF v_new_credits < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Créditos insuficientes');
  END IF;

  PERFORM set_config('app.usage_rpc', 'true', true);
  IF p_kind = 'download' THEN
    UPDATE documents SET downloads_limit = downloads_limit + 3 WHERE id = p_document_id;
  ELSE
    UPDATE documents SET edits_limit = edits_limit + 2 WHERE id = p_document_id;
  END IF;

  INSERT INTO credit_logs (user_id, action, credits, document_type, note, document_id)
  VALUES (p_user_id, 'consume', -1, 'unlock_' || p_kind,
          'Desbloqueio de mais ' || CASE WHEN p_kind = 'download' THEN '3 downloads' ELSE '2 edições' END
            || ' para um documento', p_document_id);

  RETURN json_build_object('success', true, 'credits_remaining', v_new_credits, 'kind', p_kind);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
