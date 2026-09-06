-- ============================================================
-- MIGRAÇÃO v32 — Fase 3 do Marketing Analytics (Dashboard QR Codes)
-- Execute no SQL Editor do Supabase (depois da v30 e v31).
--
-- Cada QR code criado no admin fica registado aqui E como uma linha em
-- marketing_sources (type='qr') — assim reaproveita toda a agregação já
-- construída na Fase 1/2 (marketing_source_daily) sem duplicar lógica.
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_qrcodes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT        NOT NULL UNIQUE,   -- mesmo valor usado em ?src=... e em marketing_sources.code
  name         TEXT        NOT NULL,          -- ex: "Panfleto Campus UEM"
  location     TEXT,                          -- ex: "Campus UEM, Maputo"
  target_path  TEXT        NOT NULL DEFAULT '/',  -- página de destino (ex: '/', '/templates.html')
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_qrcodes_code ON marketing_qrcodes(code);

ALTER TABLE marketing_qrcodes ENABLE ROW LEVEL SECURITY;
-- Mesma política das outras tabelas de marketing: zero políticas para
-- anon/authenticated — só o service_role (backend admin) lê/escreve.
