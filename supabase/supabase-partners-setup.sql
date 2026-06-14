-- ============================================================
-- MzDocs Pro — Setup da tabela de Parceiros (idempotente)
-- Pode executar múltiplas vezes sem erros
-- ============================================================

-- Tabela principal de parceiras
CREATE TABLE IF NOT EXISTS partners (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  owner_name    text        NOT NULL,
  phone         text        NOT NULL UNIQUE,
  whatsapp      text        NOT NULL,
  city          text        NOT NULL,
  address       text        NOT NULL,
  lat           float8      NOT NULL,
  lng           float8      NOT NULL,
  services      text[]      NOT NULL DEFAULT '{}',
  hours         text,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected')),
  active        boolean     NOT NULL DEFAULT false,
  rating_sum    int         NOT NULL DEFAULT 0,
  rating_count  int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices (ignorados se já existem)
CREATE INDEX IF NOT EXISTS partners_lat           ON partners (lat);
CREATE INDEX IF NOT EXISTS partners_lng           ON partners (lng);
CREATE INDEX IF NOT EXISTS partners_status_active ON partners (status, active);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS partners_updated_at ON partners;
CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS — activar (idempotente)
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- Política: remover se já existir, depois recriar
DROP POLICY IF EXISTS "API_only" ON partners;
CREATE POLICY "API_only" ON partners USING (false);

-- ============================================================
-- CORRECÇÃO: 1 crédito no registo (não 3)
-- ============================================================
-- Verificar o default actual:
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name = 'credits';
--
-- Corrigir o DEFAULT da coluna:
ALTER TABLE profiles ALTER COLUMN credits SET DEFAULT 1;

-- ============================================================
-- VARIÁVEIS DE AMBIENTE a definir no Vercel / .env
-- ============================================================
-- SUPABASE_URL=https://xxxx.supabase.co
-- SUPABASE_SERVICE_ROLE_KEY=eyJ...
-- SUPABASE_ANON_KEY=eyJ...
-- CLOUDCONVERT_API_KEY=eyJ...   (sandbox: 25 conversões/dia grátis)
-- LIBREOFFICE=true              (apenas se tiver VPS própria com LibreOffice)
-- ============================================================
