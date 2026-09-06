-- SQL para criar tabela de transações no Supabase
-- Executar no SQL Editor do Supabase antes de activar pagamentos reais

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_phone TEXT NOT NULL,
  package_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'mpesa',
  mpesa_receipt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION complete_transaction(
  p_transaction_id TEXT,
  p_mpesa_receipt TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_user_id UUID;
  v_credits INTEGER;
  v_status TEXT;
BEGIN
  SELECT user_id, credits, status INTO v_user_id, v_credits, v_status
  FROM transactions WHERE id = p_transaction_id;

  IF v_status = 'completed' THEN
    RETURN -1;
  END IF;

  IF v_status != 'pending' THEN
    RETURN -2;
  END IF;

  UPDATE transactions SET
    status = 'completed',
    completed_at = NOW(),
    mpesa_receipt = COALESCE(p_mpesa_receipt, mpesa_receipt)
  WHERE id = p_transaction_id;

  UPDATE profiles SET
    credits = credits + v_credits,
    updated_at = NOW()
  WHERE id = v_user_id;

  RETURN v_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
