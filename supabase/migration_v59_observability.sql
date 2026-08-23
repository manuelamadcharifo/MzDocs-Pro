-- supabase/migration_v59_observability.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P2-04 (auditoria Ago/2026) — OBSERVABILIDADE ESTRUTURADA.
--
-- Complementa api/_lib/observability.js: cada chamada a logEvent() emite
-- sempre uma linha JSON em stdout (Vercel Logs) E tenta gravar aqui,
-- best-effort. Esta tabela existe para permitir dashboards SQL simples
-- (ex.: "taxa de auto-aprovação de pagamentos nos últimos 7 dias",
-- "latência média do OCR por dia") sem depender de um serviço de logs
-- externo pago.
--
-- Escrita pesada esperada (potencialmente vários eventos por pedido) —
-- por isso: sem RLS restritiva a bloquear o service role, índice mínimo
-- (category+created_at, que cobre a maioria das queries de dashboard), e
-- uma função de limpeza para não crescer indefinidamente (os logs do
-- Vercel já guardam o histórico completo; esta tabela é só para consultas
-- recentes/agregadas).
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS metrics_events (
  id          BIGSERIAL PRIMARY KEY,
  category    TEXT NOT NULL,   -- payment | ocr | ai | document | ledger | auth | partner | system
  event       TEXT NOT NULL,   -- ex: 'auto_approved', 'generation_failed'
  payload     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_events_category_time
  ON metrics_events(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_events_event_time
  ON metrics_events(event, created_at DESC);

ALTER TABLE metrics_events ENABLE ROW LEVEL SECURITY;

-- Só admins conseguem LER (dashboards internos); escrita exclusivamente
-- pelo backend via Service Role Key, que ignora RLS.
DROP POLICY IF EXISTS "metrics_events_admin_select" ON metrics_events;
CREATE POLICY "metrics_events_admin_select" ON metrics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ── Vistas de conveniência para os dashboards mais óbvios da auditoria ────

CREATE OR REPLACE VIEW v_payment_funnel_daily AS
SELECT
  date_trunc('day', created_at)                                   AS day,
  COUNT(*) FILTER (WHERE event = 'pending')                        AS pending,
  COUNT(*) FILTER (WHERE event = 'auto_approved')                  AS auto_approved,
  COUNT(*) FILTER (WHERE event = 'review_needed')                  AS review_needed,
  COUNT(*) FILTER (WHERE event = 'credited')                       AS credited,
  COUNT(*) FILTER (WHERE event = 'credit_failed')                  AS credit_failed,
  COUNT(*) FILTER (WHERE event = 'duplicate_receipt')              AS duplicate_receipt
FROM metrics_events
WHERE category = 'payment'
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW v_ocr_health_daily AS
SELECT
  date_trunc('day', created_at)                                    AS day,
  COUNT(*) FILTER (WHERE event = 'started')                        AS started,
  COUNT(*) FILTER (WHERE event = 'success')                        AS success,
  COUNT(*) FILTER (WHERE event = 'failed')                         AS failed,
  COUNT(*) FILTER (WHERE event = 'fallback_model')                 AS fallback_model,
  ROUND(AVG((payload->>'duration_ms')::NUMERIC), 0)                AS avg_duration_ms
FROM metrics_events
WHERE category = 'ocr'
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW v_document_generation_daily AS
SELECT
  date_trunc('day', created_at)                                    AS day,
  COUNT(*) FILTER (WHERE event = 'generation_success')              AS generation_success,
  COUNT(*) FILTER (WHERE event = 'generation_failed')                AS generation_failed,
  COUNT(*) FILTER (WHERE event = 'refund_success')                   AS refund_success,
  COUNT(*) FILTER (WHERE event = 'refund_failed')                    AS refund_failed
FROM metrics_events
WHERE category = 'document'
GROUP BY 1
ORDER BY 1 DESC;

-- ── Limpeza — chamável pelo mesmo cron diário que já existe (00:00,
-- cleanup-temp-accounts.js) para não deixar a tabela crescer sem limite.
-- Mantém 90 dias de detalhe — suficiente para qualquer análise mensal.

CREATE OR REPLACE FUNCTION cleanup_old_metrics_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM metrics_events WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_metrics_events() TO service_role;

COMMENT ON TABLE metrics_events IS
  'P2-04 (Ago/2026): eventos estruturados emitidos por api/_lib/observability.js. Ver docs/observability.md.';
