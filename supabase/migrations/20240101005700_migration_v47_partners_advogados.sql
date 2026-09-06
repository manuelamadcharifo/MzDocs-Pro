-- ============================================================
-- Migration v47 — Área Jurídica: advogados como parceiros
-- Idempotente, pode correr múltiplas vezes sem erro.
-- ============================================================
-- Reaproveita a tabela `partners` já existente (papelarias/gráficas) em vez
-- de criar uma tabela nova — mantém um único endpoint (api/partners.js) e
-- respeita o limite de 12 funções serverless do plano Vercel Hobby.

-- 1) Tipo de parceiro. Tudo o que já existe fica marcado como 'papelaria'
--    (comportamento actual, sem alterações).
ALTER TABLE partners ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'papelaria';
UPDATE partners SET type = 'papelaria' WHERE type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partners_type_check'
  ) THEN
    ALTER TABLE partners ADD CONSTRAINT partners_type_check
      CHECK (type IN ('papelaria','advogado'));
  END IF;
END $$;

-- 2) Campos exclusivos de advogado (ficam NULL para papelarias).
--    credential_number = nº de inscrição na Ordem dos Advogados de
--    Moçambique (OAM). Não existe API pública para validar automaticamente
--    — a conferência é sempre manual pelo admin antes de aprovar.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS credential_number text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bio text;

-- 3) Índice para filtrar rapidamente por tipo nas buscas "perto de si" e no
--    painel admin (mesmo padrão do índice já existente partners_status_active).
CREATE INDEX IF NOT EXISTS partners_type_status_active ON partners (type, status, active);

-- ============================================================
-- NOTA: `services` continua a ser text[]. Para type='advogado' passa a
-- guardar ÁREAS DE ATUAÇÃO jurídica em vez de tipos de impressão:
--   civil, laboral, comercial, familia, penal, imobiliario, fiscal, sucessorio
-- Validação da lista branca por tipo fica em api/partners.js (VALID_SERVICES).
-- ============================================================
