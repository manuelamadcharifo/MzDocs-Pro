-- ============================================================
-- MIGRAÇÃO v46 — Corrige violação de FK ao gravar documentos
-- Execute no SQL Editor do Supabase.
--
-- BUG (produção, desde a migration_v40): compute_document_usage_limits()
-- é um trigger BEFORE INSERT em `documents` que faz
--   UPDATE credit_logs SET document_id = NEW.id WHERE id = v_log_id;
-- Num trigger BEFORE INSERT, NEW.id ainda não existe fisicamente na
-- tabela `documents` — a linha só fica lá depois do trigger devolver e o
-- INSERT continuar. Por isso este UPDATE viola sempre
-- credit_logs_document_id_fkey (erro 23503) em qualquer documento gerado
-- por um utilizador autenticado que tenha gastado 1 crédito — ou seja,
-- praticamente todos. Resultado: o INSERT em `documents` falhava sempre
-- no Supabase, o documento nunca saía do IndexedDB local, e
-- /api/document-usage devolvia 404 a seguir (o documento nunca chegou a
-- existir na tabela para ser consultado).
--
-- FIX: dividir a função em duas —
--   1. compute_document_usage_limits() (continua BEFORE INSERT/UPDATE):
--      só calcula as colunas NEW.* (downloads_limit, edits_limit, etc.),
--      sem escrever em credit_logs.
--   2. link_document_credit_log() (novo trigger AFTER INSERT): agora que
--      o documento já existe mesmo na tabela, reclama a linha de
--      credit_logs por associar e grava document_id = NEW.id sem violar
--      a FK.
-- ============================================================

CREATE OR REPLACE FUNCTION compute_document_usage_limits()
RETURNS TRIGGER AS $$
DECLARE
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

  -- TG_OP = 'INSERT' — apenas LER (sem UPDATE, sem lock) qual seria o
  -- crédito mais recente ainda por reclamar, só para estimar o tier deste
  -- documento. A reclamação real (marcar credit_logs.document_id) fica
  -- para o trigger AFTER, quando este documento já existir de facto.
  SELECT credit_source INTO v_source
    FROM credit_logs
    WHERE user_id = NEW.user_id AND action = 'consume' AND document_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

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

-- NOVO: trigger AFTER INSERT — o documento já existe fisicamente na
-- tabela neste ponto, por isso associar credit_logs.document_id = NEW.id
-- já não viola a foreign key.
CREATE OR REPLACE FUNCTION link_document_credit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_log_id UUID;
BEGIN
  SELECT id INTO v_log_id
    FROM credit_logs
    WHERE user_id = NEW.user_id AND action = 'consume' AND document_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF v_log_id IS NOT NULL THEN
    UPDATE credit_logs SET document_id = NEW.id WHERE id = v_log_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_compute_document_usage_limits ON documents;
CREATE TRIGGER trg_compute_document_usage_limits
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION compute_document_usage_limits();

DROP TRIGGER IF EXISTS trg_link_document_credit_log ON documents;
CREATE TRIGGER trg_link_document_credit_log
  AFTER INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION link_document_credit_log();
