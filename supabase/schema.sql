-- =====================================================================
-- MZDOCS PRO - SCHEMA FINAL (SUPABASE SAFE)
-- =====================================================================

-- =========================
-- EXTENSIONS (SAFE)
-- =========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================
-- TABELA: PERFIS
-- =========================
CREATE TABLE IF NOT EXISTS perfis_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  nome_completo TEXT,
  telefone TEXT,

  creditos INTEGER DEFAULT 3,
  creditos_gratis INTEGER DEFAULT 3,
  creditos_gastos INTEGER DEFAULT 0,
  documentos_gerados INTEGER DEFAULT 0,

  admin BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================
-- PAGAMENTOS
-- =========================
CREATE TABLE IF NOT EXISTS pagamentos_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES perfis_usuarios(id) ON DELETE CASCADE,

  email_usuario TEXT NOT NULL,
  nome_usuario TEXT,
  telefone TEXT NOT NULL,

  montante INTEGER NOT NULL,
  creditos_comprados INTEGER NOT NULL,

  referencia TEXT UNIQUE NOT NULL,

  status TEXT DEFAULT 'pending',
  motivo_rejeicao TEXT,

  admin_revisado_por UUID REFERENCES perfis_usuarios(id),
  nota_admin TEXT,
  revisado_em TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================
-- TRANSAÇÕES
-- =========================
CREATE TABLE IF NOT EXISTS transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES perfis_usuarios(id) ON DELETE CASCADE,

  tipo TEXT CHECK(tipo IN ('compra','consumo','reembolso','revogacao')),
  creditos INTEGER NOT NULL,

  descricao TEXT,
  referencia_mpesa TEXT,
  pagamento_id UUID REFERENCES pagamentos_pendentes(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_pagamentos_user ON pagamentos_pendentes(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos_pendentes(status);
CREATE INDEX IF NOT EXISTS idx_transacoes_user ON transacoes(user_id);

-- =========================
-- TRIGGERS
-- =========================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_perfis ON perfis_usuarios;
CREATE TRIGGER trg_update_perfis
BEFORE UPDATE ON perfis_usuarios
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_update_pagamentos ON pagamentos_pendentes;
CREATE TRIGGER trg_update_pagamentos
BEFORE UPDATE ON pagamentos_pendentes
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =========================
-- RLS
-- =========================
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

-- PERFIS
CREATE POLICY "user_read_own_profile"
ON perfis_usuarios FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "user_update_own_profile"
ON perfis_usuarios FOR UPDATE
USING (auth.uid() = id);

-- PAGAMENTOS
CREATE POLICY "user_read_own_payments"
ON pagamentos_pendentes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "user_insert_payment"
ON pagamentos_pendentes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- TRANSAÇÕES
CREATE POLICY "user_read_transactions"
ON transacoes FOR SELECT
USING (auth.uid() = user_id);

-- =========================
-- RPC: CONSUMIR CRÉDITOS
-- =========================
CREATE OR REPLACE FUNCTION consumir_creditos(qtd INTEGER)
RETURNS JSON AS $$
DECLARE
  saldo INTEGER;
BEGIN
  SELECT creditos INTO saldo
  FROM perfis_usuarios
  WHERE id = auth.uid()
  FOR UPDATE;

  IF saldo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  IF saldo < qtd THEN
    RETURN json_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;

  UPDATE perfis_usuarios
  SET creditos = creditos - qtd
  WHERE id = auth.uid();

  INSERT INTO transacoes (user_id, tipo, creditos, descricao)
  VALUES (auth.uid(), 'consumo', qtd, 'Uso de créditos');

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION consumir_creditos TO authenticated;