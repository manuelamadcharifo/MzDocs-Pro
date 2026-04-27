-- supabase/schema.sql — SCHEMA COMPLETO ATUALIZADO

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: profiles (perfil do utilizador)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    credits INTEGER DEFAULT 3,           -- 3 créditos grátis no registo
    total_documents INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para criar perfil automaticamente após registo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, credits)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone', 3);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- TABELA: documents (histórico de documentos)
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    model_used TEXT,
    format TEXT DEFAULT 'markdown',      -- markdown, pdf, docx
    file_size INTEGER,
    is_favorite BOOLEAN DEFAULT FALSE,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para pesquisa rápida por utilizador
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ============================================
-- TABELA: transactions (pagamentos)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    package_id TEXT NOT NULL,            -- starter, basico, pro
    amount INTEGER NOT NULL,             -- MZN
    credits INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',       -- pending, completed, failed, refunded
    payment_method TEXT DEFAULT 'manual', -- manual, mpesa, card
    mpesa_receipt TEXT,
    phone_number TEXT,
    reference_id TEXT UNIQUE,            -- MANxxxxxxx
    confirmed_by UUID REFERENCES profiles(id),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_reference ON transactions(reference_id);

-- ============================================
-- FUNÇÃO: Dedução atómica de créditos
-- ============================================
CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    current_credits INTEGER;
BEGIN
    SELECT credits INTO current_credits FROM profiles WHERE id = user_id FOR UPDATE;
    
    IF current_credits IS NULL OR current_credits < 1 THEN
        RETURN -1;
    END IF;
    
    UPDATE profiles SET credits = credits - 1, updated_at = NOW() WHERE id = user_id;
    
    RETURN current_credits - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: Adicionar créditos (admin)
-- ============================================
CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
    new_credits INTEGER;
BEGIN
    UPDATE profiles 
    SET credits = credits + amount, updated_at = NOW() 
    WHERE id = user_id
    RETURNING credits INTO new_credits;
    
    RETURN new_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES (Row Level Security)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: utilizador vê apenas o seu próprio perfil
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Admin pode ver todos os perfis
CREATE POLICY "Admin can view all profiles"
    ON profiles FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Documents: utilizador vê apenas os seus documentos
CREATE POLICY "Users can CRUD own documents"
    ON documents FOR ALL
    USING (auth.uid() = user_id);

-- Transactions: utilizador vê apenas as suas transações
CREATE POLICY "Users can view own transactions"
    ON transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Admin pode ver todas as transações
CREATE POLICY "Admin can view all transactions"
    ON transactions FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));