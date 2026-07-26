-- migration_v46_partner_access_code.sql
-- ─────────────────────────────────────────────────────────────────────────
-- NOVO: Portal de self-service para parceiras (papelarias/gráficas).
-- Até agora, depois de aprovada, uma parceira não tinha NENHUMA forma de
-- entrar em lado nenhum para corrigir o seu próprio horário, morada,
-- serviços activos, ou pausar/reactivar a sua visibilidade no mapa — só a
-- equipa MzDocs, via admin-parceiros.html, podia mexer nesses dados.
--
-- Esta coluna guarda um código numérico de 6 dígitos, gerado no momento da
-- aprovação (ver handleApprove em api/partners.js), que a parceira usa
-- junto com o seu número de telefone para entrar em /parceiro-portal.html.
-- Não é uma password escolhida por ela — é mais simples de comunicar por
-- WhatsApp (o canal que já usam) e mais fácil de regenerar se perderem.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE partners ADD COLUMN IF NOT EXISTS access_code text;

CREATE INDEX IF NOT EXISTS idx_partners_phone_code ON partners (phone, access_code);
