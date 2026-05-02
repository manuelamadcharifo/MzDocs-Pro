-- supabase/schema.sql — SCHEMA COMPLETO v3.1 (auth por telemóvel)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────────────────
-- TABELA: profiles
-- Criada automaticamente pelo trigger on_auth_user_created
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name    TEXT,
    phone        TEXT,                          -- número normalizado +258XXXXXXXXX
    avatar_url   TEXT,
    credits      INTEGER     DEFAULT 3,         -- 3 créditos grátis no registo
    total_documents INTEGER  DEFAULT 0,
    is_admin     BOOLEAN     DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: criar perfil após registo via telemóvel
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, credits)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
        3
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────
-- TABELA: documents
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
    service_type TEXT        NOT NULL,
    title        TEXT,
    content      TEXT        NOT NULL,
    model_used   TEXT,
    format       TEXT        DEFAULT 'markdown',
    is_favorite  BOOLEAN     DEFAULT FALSE,
    tags         TEXT[],
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id    ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- TABELA: transactions
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES profiles(id),
    package_id      TEXT        NOT NULL,             -- starter, basico, pro
    amount          INTEGER     NOT NULL,              -- MZN
    credits         INTEGER     NOT NULL,
    status          TEXT        DEFAULT 'pending',     -- pending | completed | failed | refunded
    payment_method  TEXT        DEFAULT 'manual',      -- manual | mpesa
    mpesa_receipt   TEXT,
    phone_number    TEXT,
    reference_id    TEXT        UNIQUE,                -- MANxxxxxxx
    confirmed_by    UUID        REFERENCES profiles(id),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id   ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status    ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- FUNÇÃO: Dedução atómica de crédito
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID)
RETURNS INTEGER AS $$
DECLARE current_credits INTEGER;
BEGIN
    SELECT credits INTO current_credits FROM profiles WHERE id = user_id FOR UPDATE;
    IF current_credits IS NULL OR current_credits < 1 THEN RETURN -1; END IF;
    UPDATE profiles SET credits = credits - 1, updated_at = NOW() WHERE id = user_id;
    RETURN current_credits - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────────────────
-- FUNÇÃO: Adição de créditos (admin)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INTEGER)
RETURNS INTEGER AS $$
DECLARE new_credits INTEGER;
BEGIN
    UPDATE profiles
    SET credits = credits + amount, updated_at = NOW()
    WHERE id = user_id
    RETURNING credits INTO new_credits;
    RETURN new_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "users_own_profile_select" ON profiles;
CREATE POLICY "users_own_profile_select" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_own_profile_update" ON profiles;
CREATE POLICY "users_own_profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE));

-- Documents
DROP POLICY IF EXISTS "users_own_documents" ON documents;
CREATE POLICY "users_own_documents" ON documents FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_all_documents" ON documents;
CREATE POLICY "admin_all_documents" ON documents FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE));

-- Transactions
DROP POLICY IF EXISTS "users_own_transactions" ON transactions;
CREATE POLICY "users_own_transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_all_transactions" ON transactions;
CREATE POLICY "admin_all_transactions" ON transactions FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE));
