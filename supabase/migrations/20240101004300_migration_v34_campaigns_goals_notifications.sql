-- ============================================================================
-- migration_v34_campaigns_goals_notifications.sql — Fase 5
-- Campanhas · Metas · Notificações administrativas
-- (Ranking já existe desde a Fase de Afiliados — "Top Parceiros do Mês" em
-- afiliado.html; exportação CSV/Excel/PDF é só front-end, não precisa de
-- tabelas novas.)
-- Aplicar no Supabase SQL Editor DEPOIS da v30/v31/v32/v33.
-- ============================================================================

-- ── 1. CAMPANHAS DE MARKETING ───────────────────────────────────────────────
-- Uma campanha é uma etiqueta com nome + período + meta, reaproveitando a
-- MESMA infra-estrutura de "origem" já construída na Fase 1/2 — o
-- source_tag de uma campanha É o valor usado em ?src=<source_tag> (tal como
-- já acontece com os QR Codes). Por isso as estatísticas de uma campanha
-- vêm directamente de marketing_source_daily, sem duplicar nada.
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  source_tag    TEXT NOT NULL UNIQUE,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE,                    -- NULL = campanha contínua, sem fim definido
  goal_revenue  NUMERIC DEFAULT 0,        -- meta de receita em MZN (0 = sem meta)
  goal_signups  INTEGER DEFAULT 0,        -- meta de novos registos (0 = sem meta)
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_active ON marketing_campaigns(active, start_date);
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- ── 2. METAS MENSAIS (Receita / Registos) ───────────────────────────────────
-- Uma meta por métrica+mês. period_month é sempre o dia 1 do mês (ex:
-- '2026-07-01'), para ficar fácil de indexar/comparar sem lidar com
-- strings "2026-07". O progresso é calculado on-the-fly a partir de
-- marketing_funnel_daily (Fase 4) — não há nenhuma tabela de "progresso",
-- só a meta em si; o valor actual é sempre a verdade da tabela de eventos.
CREATE TABLE IF NOT EXISTS admin_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric        TEXT NOT NULL CHECK (metric IN ('revenue', 'signups')),
  period_month  DATE NOT NULL,
  target_value  NUMERIC NOT NULL CHECK (target_value > 0),
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (metric, period_month)
);
ALTER TABLE admin_goals ENABLE ROW LEVEL SECURITY;

-- ── 3. NOTIFICAÇÕES ADMINISTRATIVAS ─────────────────────────────────────────
-- Central de avisos para o ADMIN (diferente de affiliate_notifications, que
-- já existe e é para o AFILIADO). Alimentada por vários pontos do código:
-- comprovativo a precisar de revisão manual, pedido de levantamento de
-- afiliado, candidatura a afiliado, falha ao publicar artigo, e meta
-- atingida — ver comentários nos ficheiros .js correspondentes.
CREATE TABLE IF NOT EXISTS admin_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,   -- 'pending_receipt' | 'withdrawal_request' | 'affiliate_application' | 'blog_publish_failed' | 'goal_reached' | 'campaign_ended'
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,            -- secção do admin para onde saltar ao clicar (ex: '#transactions')
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(read, created_at DESC);
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Nenhuma destas 3 tabelas tem policy de leitura pública — tal como todas
-- as outras tabelas administrativas deste projecto, só o service_role (via
-- /api/admin, que já valida is_admin) lê ou escreve. Zero acesso directo
-- do browser com a chave anónima.
