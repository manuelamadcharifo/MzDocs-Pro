-- ============================================================
-- MIGRAÇÃO v27 — Monitorização dos Providers de IA (painel admin)
-- Execute no SQL Editor do Supabase.
--
-- Cria a tabela ai_provider_daily_usage (1 linha por provider/dia) e a
-- função record_ai_provider_usage(), chamada (fire-and-forget) por
-- api/generate-document.js sempre que um provider responde com sucesso
-- ou falha, permitindo ao painel /admin.html (aba "IA Providers") mostrar:
--   - tokens usados hoje / histórico 7 dias
--   - pedidos com sucesso vs falha
--   - último sucesso / último erro (para inferir online/offline)
-- ============================================================

-- ── 1. Tabela de uso diário por provider ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_provider_daily_usage (
  day                 DATE        NOT NULL,
  provider            TEXT        NOT NULL,
  requests_ok         INTEGER     NOT NULL DEFAULT 0,
  requests_fail       INTEGER     NOT NULL DEFAULT 0,
  tokens_prompt       BIGINT      NOT NULL DEFAULT 0,
  tokens_completion   BIGINT      NOT NULL DEFAULT 0,
  last_model          TEXT,
  last_success_at     TIMESTAMPTZ,
  last_error_at       TIMESTAMPTZ,
  last_error_message  TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, provider)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_day
  ON ai_provider_daily_usage(day DESC);

-- RLS activo, sem políticas para anon/authenticated — apenas o
-- service_role (usado pelas funções serverless em /api) acede a esta
-- tabela, tal como admin_logs e as restantes tabelas só-admin do projecto.
ALTER TABLE ai_provider_daily_usage ENABLE ROW LEVEL SECURITY;

-- ── 2. RPC de registo (upsert incremental) ─────────────────────────────────
-- Chamada assim a partir do Node (fire-and-forget, nunca bloqueia a resposta
-- ao utilizador nem faz o pedido falhar se o registo em si falhar):
--   rpc('record_ai_provider_usage', { p_provider, p_success, p_model,
--        p_tokens_prompt, p_tokens_completion, p_error_message })
CREATE OR REPLACE FUNCTION record_ai_provider_usage(
  p_provider           TEXT,
  p_success            BOOLEAN,
  p_model              TEXT DEFAULT NULL,
  p_tokens_prompt      INTEGER DEFAULT 0,
  p_tokens_completion  INTEGER DEFAULT 0,
  p_error_message      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := (NOW() AT TIME ZONE 'Africa/Maputo')::DATE;
BEGIN
  INSERT INTO ai_provider_daily_usage (
    day, provider, requests_ok, requests_fail,
    tokens_prompt, tokens_completion,
    last_model, last_success_at, last_error_at, last_error_message, updated_at
  ) VALUES (
    v_day, p_provider,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0),
    CASE WHEN p_success THEN p_model ELSE NULL END,
    CASE WHEN p_success THEN NOW() ELSE NULL END,
    CASE WHEN p_success THEN NULL ELSE NOW() END,
    CASE WHEN p_success THEN NULL ELSE p_error_message END,
    NOW()
  )
  ON CONFLICT (day, provider) DO UPDATE SET
    requests_ok        = ai_provider_daily_usage.requests_ok + (CASE WHEN p_success THEN 1 ELSE 0 END),
    requests_fail       = ai_provider_daily_usage.requests_fail + (CASE WHEN p_success THEN 0 ELSE 1 END),
    tokens_prompt       = ai_provider_daily_usage.tokens_prompt + COALESCE(p_tokens_prompt, 0),
    tokens_completion   = ai_provider_daily_usage.tokens_completion + COALESCE(p_tokens_completion, 0),
    last_model          = CASE WHEN p_success THEN p_model ELSE ai_provider_daily_usage.last_model END,
    last_success_at     = CASE WHEN p_success THEN NOW() ELSE ai_provider_daily_usage.last_success_at END,
    last_error_at        = CASE WHEN p_success THEN ai_provider_daily_usage.last_error_at ELSE NOW() END,
    last_error_message   = CASE WHEN p_success THEN ai_provider_daily_usage.last_error_message ELSE p_error_message END,
    updated_at           = NOW();
END;
$$;

-- ── 3. Chave de configuração para os providers "de reserva" activados ──────
-- Guarda um array JSON (ex: ["sambanova","mistral"]) com os IDs dos
-- providers de reserva que o admin já marcou como "em processo/activado"
-- no painel, mesmo antes de estarem ligados ao código em produção.
INSERT INTO system_settings (key, value, description) VALUES
  ('ai_reserve_activated', '[]', 'IDs (JSON array) dos providers de reserva de IA marcados como activados no painel admin')
ON CONFLICT (key) DO NOTHING;
