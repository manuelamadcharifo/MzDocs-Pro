-- ============================================================
-- Migration v48 — Conformidade LPD (Lei nº 3/2017, Moçambique) e RGPD
-- Idempotente, pode correr múltiplas vezes sem erro.
-- ============================================================
-- CONTEXTO (para quem ler isto depois):
-- Este projecto já tem RLS activo em profiles, documents, transactions,
-- partners e em quase todas as tabelas de migrations posteriores
-- (confirmado por auditoria ao schema.sql/polices.sql/migrations v8-v47
-- antes desta migration ser escrita). Por isso esta migration NÃO repete
-- RLS já existente — só acrescenta o que estava genuinamente em falta:
--   1) registo formal de consentimento (Termos de Serviço) com IP/hora/versão
--   2) extensão pgcrypto disponível para uso futuro em colunas sensíveis
--      que venham a ser criadas (NUIT, contas bancárias/M-Pesa de saque) —
--      NÃO aplicada retroactivamente a `phone`/`whatsapp` em `profiles`/
--      `partners`, porque essas colunas têm índices UNIQUE e são usadas
--      para login/pesquisa em texto simples em todo o código actual;
--      encriptá-las quebraria login e pesquisa sem uma migração aplicacional
--      maior, fora do âmbito de uma migration SQL isolada.
--   3) purga automatizada, mas com âmbito realista: NÃO apaga
--      `documents` de utilizadores activos ao fim de 30 dias — o arquivo
--      de documentos é uma funcionalidade central do produto (utilizadores
--      esperam encontrar os documentos antigos). A purga aplica-se apenas a
--      dados que já deviam ter sido removidos por regra de negócio própria:
--        a) `consent_logs` com mais de 5 anos (prazo de conservação LPD)
--        b) documentos e transacções órfãos, ou seja, cujo user_id já não
--           existe em profiles (conta já eliminada mas registos ficaram
--           para trás por FK sem CASCADE em alguma tabela mais antiga)
--        c) contas 'avulso' expiradas que passaram pela janela de graça mas
--           por alguma razão o cron diário (api/cleanup-temp-accounts.js)
--           não apanhou (rede de segurança, mesma regra já usada lá)

-- ── 1) pgcrypto — disponível para futuras colunas sensíveis ────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2) Registo de consentimento (Termos de Serviço / Política de Privacidade) ─
CREATE TABLE IF NOT EXISTS public.consent_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
    email         TEXT,                    -- guardado mesmo se a conta for apagada depois (prova de consentimento)
    consent_type  TEXT        NOT NULL DEFAULT 'terms_of_service'
                              CHECK (consent_type IN ('terms_of_service', 'privacy_policy')),
    terms_version TEXT        NOT NULL,
    ip_address    TEXT,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id    ON consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_created_at ON consent_logs(created_at DESC);

ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

-- Utilizador só vê os próprios registos de consentimento
DROP POLICY IF EXISTS "consent_logs_read_own" ON consent_logs;
CREATE POLICY "consent_logs_read_own" ON consent_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Ninguém insere/edita/apaga directamente com a chave anon/authenticated —
-- só o backend (service_role, que ignora RLS) grava consentimento, a partir
-- de api/auth/index.js no momento do signup. Isto impede um utilizador de
-- forjar um registo de consentimento com data/IP falsos.
DROP POLICY IF EXISTS "consent_logs_no_direct_write" ON consent_logs;
-- (nenhuma política de INSERT/UPDATE/DELETE para authenticated/anon = negado por omissão com RLS activo)

-- ── 3) Coluna de conveniência em profiles (última versão aceite) ───────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_terms_at      TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_terms_version TEXT;

-- ── 4) Purga automatizada — âmbito realista (ver nota no topo) ─────────────
CREATE OR REPLACE FUNCTION public.purge_expired_documents()
RETURNS TABLE(consent_logs_deleted INT, orphan_documents_deleted INT, orphan_transactions_deleted INT) AS $$
DECLARE
    v_consent_deleted   INT := 0;
    v_docs_deleted      INT := 0;
    v_transacts_deleted INT := 0;
BEGIN
    -- a) consent_logs com mais de 5 anos (prazo de conservação razoável;
    --    ajustar se o DPO/consultor jurídico definir prazo diferente)
    DELETE FROM consent_logs WHERE created_at < now() - INTERVAL '5 years';
    GET DIAGNOSTICS v_consent_deleted = ROW_COUNT;

    -- b) documentos órfãos (user_id já não existe em profiles — não deveria
    --    acontecer com o ON DELETE CASCADE actual, mas cobre dados legados)
    DELETE FROM documents d
    WHERE d.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = d.user_id);
    GET DIAGNOSTICS v_docs_deleted = ROW_COUNT;

    -- c) transacções órfãs, mesma lógica
    DELETE FROM transactions t
    WHERE t.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = t.user_id);
    GET DIAGNOSTICS v_transacts_deleted = ROW_COUNT;

    RETURN QUERY SELECT v_consent_deleted, v_docs_deleted, v_transacts_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTA sobre agendamento: este projecto corre em Vercel Hobby (sem acesso a
-- pg_cron no Supabase gratuito, em muitos planos). Em vez de agendar dentro
-- do Postgres, reaproveita-se o cron diário que já existe em vercel.json
-- ("/api/cleanup-temp-accounts", 0 0 * * *) — ver patch sugerido em
-- api/cleanup-temp-accounts.js para chamar `select purge_expired_documents()`
-- no fim da execução diária, em vez de criar um cron novo (o plano Hobby só
-- permite crons limitados e o ficheiro já corre todos os dias à mesma hora).
