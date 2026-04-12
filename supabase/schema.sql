-- supabase/schema.sql — MzDocs Pro v3
-- Complete database schema with security policies and RPC functions
-- Execute in Supabase SQL Editor: Copy all → Paste in SQL Editor → Run

-- ============================================================================
-- 1. ENABLE REQUIRED EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgtrgm";  -- for text search

-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================

-- Perfis de Utilizadores (User Profiles)
CREATE TABLE IF NOT EXISTS perfis_usuarios (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  nome_completo   TEXT,
  telefone        TEXT,
  creditos        INTEGER DEFAULT 3,           -- Current credit balance
  creditos_gratis INTEGER DEFAULT 3,           -- Free tier allocation
  creditos_gastos INTEGER DEFAULT 0,           -- Total spent
  documentos_gerados INTEGER DEFAULT 0,        -- Total generated
  admin           BOOLEAN DEFAULT FALSE,        -- Admin flag (for approval)
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'::jsonb    -- Extra user data
);

-- Pagamentos Pendentes (Payment Management)
CREATE TABLE IF NOT EXISTS pagamentos_pendentes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES perfis_usuarios(id) ON DELETE CASCADE,
  email_usuario   TEXT NOT NULL,
  nome_usuario    TEXT,
  telefone        TEXT NOT NULL,               -- M-Pesa phone number
  montante        INTEGER NOT NULL,            -- Amount in MZN (100 = 1 MTn)
  creditos_comprados INTEGER NOT NULL,         -- Credits purchased
  referencia      TEXT NOT NULL UNIQUE,        -- M-Pesa reference number (track requests)
  status          TEXT DEFAULT 'pending',      -- pending | approved | rejected
  motivo_rejeicao TEXT,                        -- Rejection reason if applicable
  conforme_documento TEXT,                     -- Document hash/ID for verification
  admin_revisado_por UUID REFERENCES perfis_usuarios(id) ON DELETE SET NULL,
  nota_admin      TEXT,
  revisado_em     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'::jsonb
);

-- Transações (Audit Trail)
CREATE TABLE IF NOT EXISTS transacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES perfis_usuarios(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK(tipo IN ('compra','consumo','reembolso','revogacao')),
  creditos        INTEGER NOT NULL,
  descricao       TEXT,
  referencia_mpesa TEXT,
  pagamento_id    UUID REFERENCES pagamentos_pendentes(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_perfis_admin ON perfis_usuarios(admin) WHERE admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_pagamentos_user_id ON pagamentos_pendentes(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos_pendentes(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_referencia ON pagamentos_pendentes(referencia);
CREATE INDEX IF NOT EXISTS idx_pagamentos_created ON pagamentos_pendentes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_user_id ON transacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo ON transacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_transacoes_created ON transacoes(created_at DESC);

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- Trigger: Update perfis_usuarios.updated_at on change
CREATE OR REPLACE FUNCTION trigger_update_perfis_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_perfis_updated_at
BEFORE UPDATE ON perfis_usuarios
FOR EACH ROW
EXECUTE FUNCTION trigger_update_perfis_timestamp();

-- Trigger: Update pagamentos_pendentes.updated_at on change
CREATE OR REPLACE FUNCTION trigger_update_pagamentos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pagamentos_updated_at
BEFORE UPDATE ON pagamentos_pendentes
FOR EACH ROW
EXECUTE FUNCTION trigger_update_pagamentos_timestamp();

-- Trigger: Log transaction when payment is approved
CREATE OR REPLACE FUNCTION trigger_log_pagamento_aprovado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    INSERT INTO transacoes (user_id, tipo, creditos, descricao, referencia_mpesa, pagamento_id)
    VALUES (
      NEW.user_id,
      'compra',
      NEW.creditos_comprados,
      'Créditos adicionados após aprovação de pagamento',
      NEW.referencia,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pagamentos_aprovado
AFTER UPDATE ON pagamentos_pendentes
FOR EACH ROW
EXECUTE FUNCTION trigger_log_pagamento_aprovado();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

-- perfis_usuarios RLS Policies
CREATE POLICY "Users can view own profile"
  ON perfis_usuarios FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON perfis_usuarios FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON perfis_usuarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM perfis_usuarios
      WHERE id = auth.uid() AND admin = TRUE
    )
  );

CREATE POLICY "Admins can update profiles"
  ON perfis_usuarios FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM perfis_usuarios
      WHERE id = auth.uid() AND admin = TRUE
    )
  );

-- pagamentos_pendentes RLS Policies
CREATE POLICY "Users can view own payments"
  ON pagamentos_pendentes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all payments"
  ON pagamentos_pendentes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM perfis_usuarios
      WHERE id = auth.uid() AND admin = TRUE
    )
  );

CREATE POLICY "Users can insert own payment requests"
  ON pagamentos_pendentes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update payments"
  ON pagamentos_pendentes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM perfis_usuarios
      WHERE id = auth.uid() AND admin = TRUE
    )
  );

-- transacoes RLS Policies
CREATE POLICY "Users can view own transactions"
  ON transacoes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON transacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM perfis_usuarios
      WHERE id = auth.uid() AND admin = TRUE
    )
  );

-- ============================================================================
-- 6. RPC FUNCTIONS (CALLABLE PROCEDURES)
-- ============================================================================

-- RPC: consumir_creditos
-- Atomically deduct credits from user's balance
CREATE OR REPLACE FUNCTION consumir_creditos(
  p_quantidade INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_usuario_id UUID;
  v_saldo_atual INTEGER;
  v_novo_saldo INTEGER;
BEGIN
  -- Get current user ID from auth
  v_usuario_id := auth.uid();

  IF v_usuario_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Not authenticated',
      'novo_saldo', 0
    );
  END IF;

  -- Lock row for atomic operation
  SELECT creditos INTO v_saldo_atual
  FROM perfis_usuarios
  WHERE id = v_usuario_id
  FOR UPDATE;

  -- Check if user has enough credits
  IF v_saldo_atual IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'User profile not found',
      'novo_saldo', 0
    );
  END IF;

  IF v_saldo_atual < p_quantidade THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Insufficient credits',
      'novo_saldo', v_saldo_atual
    );
  END IF;

  -- Deduct credits
  UPDATE perfis_usuarios
  SET
    creditos = creditos - p_quantidade,
    creditos_gastos = creditos_gastos + p_quantidade,
    updated_at = NOW()
  WHERE id = v_usuario_id
  RETURNING creditos INTO v_novo_saldo;

  -- Log transaction
  INSERT INTO transacoes (user_id, tipo, creditos, descricao)
  VALUES (v_usuario_id, 'consumo', p_quantidade, 'Créditos consumidos para geração de documento');

  RETURN json_build_object(
    'success', TRUE,
    'novo_saldo', v_novo_saldo,
    'consumido', p_quantidade
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION consumir_creditos(INTEGER) TO anon, authenticated;

-- RPC: aprovar_pagamento_admin
-- Admin approval: move credits from pagamento to user
CREATE OR REPLACE FUNCTION aprovar_pagamento_admin(
  p_pagamento_id UUID,
  p_nota TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_pagamento RECORD;
  v_admin_id UUID;
  v_novo_saldo INTEGER;
BEGIN
  -- Verify admin status
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE id = v_admin_id AND admin = TRUE
  ) THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Unauthorized: admin access required'
    );
  END IF;

  -- Fetch payment record with lock
  SELECT * INTO v_pagamento
  FROM pagamentos_pendentes
  WHERE id = p_pagamento_id
  FOR UPDATE;

  IF v_pagamento IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Payment not found'
    );
  END IF;

  IF v_pagamento.status != 'pending' THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Payment is not pending (already processed)',
      'status', v_pagamento.status
    );
  END IF;

  -- Update payment status
  UPDATE pagamentos_pendentes
  SET
    status = 'approved',
    admin_revisado_por = v_admin_id,
    nota_admin = p_nota,
    revisado_em = NOW()
  WHERE id = p_pagamento_id;

  -- Add credits to user
  UPDATE perfis_usuarios
  SET
    creditos = creditos + v_pagamento.creditos_comprados,
    updated_at = NOW()
  WHERE id = v_pagamento.user_id
  RETURNING creditos INTO v_novo_saldo;

  -- Log transaction (duplicate check - trigger also logs)
  INSERT INTO transacoes (user_id, tipo, creditos, descricao, referencia_mpesa, pagamento_id)
  VALUES (
    v_pagamento.user_id,
    'compra',
    v_pagamento.creditos_comprados,
    'Créditos adicionados após aprovação de pagamento',
    v_pagamento.referencia,
    p_pagamento_id
  )
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', TRUE,
    'mensagem', 'Pagamento aprovado com sucesso',
    'pagamento_id', p_pagamento_id,
    'usuario_id', v_pagamento.user_id,
    'creditos_adicionados', v_pagamento.creditos_comprados,
    'novo_saldo_usuario', v_novo_saldo,
    'aprovado_em', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION aprovar_pagamento_admin(UUID, TEXT) TO authenticated;

-- RPC: rejeitar_pagamento_admin (bonus function)
CREATE OR REPLACE FUNCTION rejeitar_pagamento_admin(
  p_pagamento_id UUID,
  p_motivo TEXT
)
RETURNS JSON AS $$
DECLARE
  v_pagamento RECORD;
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Not authenticated'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE id = v_admin_id AND admin = TRUE
  ) THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Unauthorized: admin access required'
    );
  END IF;

  SELECT * INTO v_pagamento
  FROM pagamentos_pendentes
  WHERE id = p_pagamento_id
  FOR UPDATE;

  IF v_pagamento IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Payment not found'
    );
  END IF;

  IF v_pagamento.status != 'pending' THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Payment is not pending'
    );
  END IF;

  UPDATE pagamentos_pendentes
  SET
    status = 'rejected',
    motivo_rejeicao = p_motivo,
    admin_revisado_por = v_admin_id,
    revisado_em = NOW()
  WHERE id = p_pagamento_id;

  INSERT INTO transacoes (user_id, tipo, creditos, descricao, pagamento_id)
  VALUES (
    v_pagamento.user_id,
    'revogacao',
    v_pagamento.creditos_comprados,
    'Pagamento rejeitado: ' || p_motivo,
    p_pagamento_id
  )
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', TRUE,
    'mensagem', 'Pagamento rejeitado com sucesso',
    'motivo', p_motivo,
    'rejeitado_em', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rejeitar_pagamento_admin(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 7. UTILITY FUNCTIONS
-- ============================================================================

-- Get user profile and current credits (safe for frontend)
CREATE OR REPLACE FUNCTION obter_perfil_usuario()
RETURNS TABLE (
  id UUID,
  email TEXT,
  nome_completo TEXT,
  telefone TEXT,
  creditos INTEGER,
  creditos_gastos INTEGER,
  documentos_gerados INTEGER,
  admin BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    perfis_usuarios.id,
    perfis_usuarios.email,
    perfis_usuarios.nome_completo,
    perfis_usuarios.telefone,
    perfis_usuarios.creditos,
    perfis_usuarios.creditos_gastos,
    perfis_usuarios.documentos_gerados,
    perfis_usuarios.admin,
    perfis_usuarios.created_at
  FROM perfis_usuarios
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION obter_perfil_usuario() TO authenticated;

-- Get payment stats (for admin dashboard)
CREATE OR REPLACE FUNCTION obter_estatisticas_pagamentos()
RETURNS TABLE (
  pendentes BIGINT,
  aprovados BIGINT,
  rejeitados BIGINT,
  montante_total INTEGER,
  creditos_vendidos INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COALESCE(SUM(montante), 0) FILTER (WHERE status = 'approved'),
    COALESCE(SUM(creditos_comprados), 0) FILTER (WHERE status = 'approved')
  FROM pagamentos_pendentes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION obter_estatisticas_pagamentos() TO authenticated;
CREATE INDEX IF NOT EXISTS idx_users_last_sync   ON users(last_sync);

-- RLS (Row Level Security) — opcional mas recomendado
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
