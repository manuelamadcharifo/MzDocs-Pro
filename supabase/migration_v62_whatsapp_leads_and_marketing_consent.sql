-- supabase/migration_v62_whatsapp_leads_and_marketing_consent.sql
-- ──────────────────────────────────────────────────────────────────────────
-- NOVO (pedido do fundador, Ago/2026) — duas funcionalidades no registo:
--
-- 1) CAMPO WHATSAPP EM profiles: até agora só `partners.whatsapp` existia
--    (contacto dos parceiros de impressão). Utilizadores/leads não tinham
--    nenhum campo de WhatsApp dedicado — só `phone` (usado para login) e
--    `email` (usado para recuperação de password). Esta coluna é opcional
--    (nem todos preenchem no registo) e serve dois propósitos:
--      a) Lead mais accionável para follow-up manual (WhatsApp tem taxa de
--         resposta muito mais alta em Moçambique do que e-mail/SMS).
--      b) Nova via de recuperação de conta: o utilizador pode agora indicar
--         o número de WhatsApp em vez do e-mail no ecrã "Esqueceu a
--         password?" — ver api/auth/index.js (handleResetPassword), que
--         resolve o e-mail associado via este campo (ou via `phone` como
--         fallback) e envia o link de recuperação por e-mail através do
--         Supabase (continua a ser a única via de ENVIO — não há gateway
--         de mensagens WhatsApp/OTP configurado neste projecto).
--    Índice não-único (o mesmo número pode em teoria repetir-se em leads
--    antigos/manuais; login continua a ser feito por `phone`, que já é
--    único) para acelerar a procura em handleResetPassword.
--
-- 2) CONSENTIMENTO DE MARKETING: novo toggle no registo (visualmente igual
--    ao checkbox de Termos de Serviço, mas OPCIONAL — nunca bloqueia a
--    criação de conta), para permitir o envio de mensagens promocionais/
--    relacionadas com a webapp. Guardado tanto como coluna de conveniência
--    em `profiles` (marketing_consent + marketing_consent_at, para
--    segmentação rápida em queries) como um registo formal e imutável em
--    `consent_logs` (auditoria LPD/RGPD — mesma tabela criada na v48 para
--    os Termos de Serviço), com o novo valor 'marketing' agora aceite pelo
--    CHECK de consent_type.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1) profiles.whatsapp — lead + via alternativa de recuperação ───────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp
  ON profiles(whatsapp) WHERE whatsapp IS NOT NULL;

COMMENT ON COLUMN public.profiles.whatsapp IS
  'Número de WhatsApp opcional, recolhido no registo. Usado (1) como lead '
  'mais accionável para follow-up manual e (2) como via alternativa de '
  'recuperação de password em api/auth/index.js — não substitui `phone` '
  '(login) nem `email` (envio real do link de recuperação).';

-- ── 2) profiles.marketing_consent — toggle opcional no registo ─────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_consent    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.marketing_consent IS
  'Consentimento opcional (LPD/RGPD) para receber mensagens promocionais ou '
  'relacionadas com o webapp. false por omissão — nunca assumido, sempre '
  'uma escolha explícita do utilizador no registo (ou mais tarde no perfil).';

-- ── 3) consent_logs — aceitar novo tipo 'marketing' ─────────────────────────
-- O CHECK original (migration_v48) só permitia 'terms_of_service' e
-- 'privacy_policy'. Recriamos a constraint (nome gerado automaticamente
-- pelo Postgres a partir da definição inline) para incluir 'marketing',
-- sem tocar nas linhas já existentes.
ALTER TABLE public.consent_logs DROP CONSTRAINT IF EXISTS consent_logs_consent_type_check;
ALTER TABLE public.consent_logs ADD CONSTRAINT consent_logs_consent_type_check
  CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'marketing'));
