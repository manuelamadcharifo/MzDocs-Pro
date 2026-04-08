-- supabase/schema.sql — MzDocs Pro v3
-- Execute no Supabase SQL Editor

-- Tabela de utilizadores
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  credits         INTEGER DEFAULT 3,
  total_generated INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_sync       TIMESTAMPTZ DEFAULT NOW()
);

-- Função atómica: deduzir 1 crédito (thread-safe)
CREATE OR REPLACE FUNCTION deduct_credit(user_id TEXT)
RETURNS INTEGER AS $$
DECLARE cur INTEGER;
BEGIN
  SELECT credits INTO cur FROM users WHERE id = user_id FOR UPDATE;
  IF cur IS NULL OR cur < 1 THEN RETURN -1; END IF;
  UPDATE users SET credits = credits - 1, total_generated = total_generated + 1, last_sync = NOW()
  WHERE id = user_id;
  RETURN cur - 1;
END;
$$ LANGUAGE plpgsql;

-- Função atómica: adicionar créditos após pagamento
CREATE OR REPLACE FUNCTION add_credits(user_id TEXT, amount INTEGER)
RETURNS INTEGER AS $$
DECLARE new_val INTEGER;
BEGIN
  INSERT INTO users(id, credits) VALUES(user_id, amount)
  ON CONFLICT(id) DO UPDATE SET credits = users.credits + amount, last_sync = NOW()
  RETURNING credits INTO new_val;
  RETURN new_val;
END;
$$ LANGUAGE plpgsql;

-- Tabela de transações (auditoria)
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  type        TEXT CHECK(type IN ('purchase','consumption','refund')),
  amount      INTEGER,
  description TEXT,
  mpesa_ref   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_last_sync   ON users(last_sync);

-- RLS (Row Level Security) — opcional mas recomendado
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
