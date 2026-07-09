-- ============================================================
-- MIGRAÇÃO v30 — Fundação de Marketing Analytics (Fase 1)
-- Execute no SQL Editor do Supabase.
--
-- CONTEXTO (para não duplicar o que já existe):
--   - page_views / online_sessions (migration_v9) já tratam de visitas por
--     página e "quem está online agora" — NÃO mexemos nisso.
--   - ai_provider_daily_usage (migration_v27) já trata do consumo/custo de
--     IA por provider — cobre a "Parte 12" do pedido original. NÃO mexemos.
--   - affiliate_clicks (migration_v10) já regista cliques de afiliados
--     específicos — continua a ser a fonte certa para comissões. As tabelas
--     abaixo são mais genéricas (qualquer origem: facebook, tiktok, qr, blog,
--     email, parceiro — não só afiliados) e não substituem affiliate_clicks.
--
-- O QUE ESTA MIGRAÇÃO ACRESCENTA (peça que realmente faltava):
--   1. marketing_sources — catálogo de origens de tráfego (?src=...)
--   2. marketing_visits  — 1 linha por visita atribuída a uma origem
--   3. marketing_events  — funil de eventos de negócio (registo, compra,
--      documento gerado, etc.), ligados à mesma visitor_id/origem
-- ============================================================

-- ── 1. Catálogo de origens ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL UNIQUE,   -- valor de ?src=... (ex: 'facebook', 'qr001')
  name        TEXT        NOT NULL,          -- nome legível (ex: 'Facebook Ads')
  type        TEXT        NOT NULL DEFAULT 'outro',
              -- 'social' | 'search' | 'qr' | 'parceiro' | 'papelaria' | 'cyber'
              -- | 'universidade' | 'email' | 'whatsapp' | 'blog' | 'afiliado' | 'outro'
  description TEXT,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semente com as origens mencionadas no pedido original — o admin pode
-- adicionar mais em qualquer altura (fica para a Fase 2, UI de gestão).
INSERT INTO marketing_sources (code, name, type) VALUES
  ('facebook',  'Facebook',             'social'),
  ('instagram', 'Instagram',            'social'),
  ('tiktok',    'TikTok',               'social'),
  ('whatsapp',  'WhatsApp',             'whatsapp'),
  ('google',    'Google / SEO',         'search'),
  ('blog',      'Blog MzDocs',          'blog'),
  ('email',     'E-mail',               'email'),
  ('uem',       'Universidade Eduardo Mondlane', 'universidade'),
  ('direct',    'Directo (sem origem)', 'outro')
ON CONFLICT (code) DO NOTHING;

-- ── 2. Visitas atribuídas a uma origem ──────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_visits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id      TEXT        NOT NULL,   -- UUID anónimo gerado no browser (localStorage), persiste entre sessões
  marketing_source TEXT       NOT NULL DEFAULT 'direct',  -- code de marketing_sources (sem FK rígida: nunca perder uma visita por causa de um src desconhecido)
  referrer        TEXT,
  landing_page    TEXT        NOT NULL DEFAULT '/',
  user_agent      TEXT,
  device          TEXT,       -- 'mobile' | 'tablet' | 'desktop'
  browser         TEXT,
  country         TEXT,       -- de req.headers['x-vercel-ip-country'] — sem custo extra, sem chamada a serviço de terceiros
  city            TEXT,       -- de req.headers['x-vercel-ip-city']
  language        TEXT,
  ip_hash         TEXT,       -- SHA-256 do IP (nunca o IP em bruto — mesma prática já usada em affiliate_clicks)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_visits_source_date ON marketing_visits(marketing_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_visits_visitor      ON marketing_visits(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_visits_created      ON marketing_visits(created_at DESC);

-- ── 3. Eventos de negócio (funil) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id    TEXT        NOT NULL,
  user_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  event         TEXT        NOT NULL,
              -- 'signup' | 'login' | 'document_generated' | 'pdf_download'
              -- | 'credit_purchase' | 'plan_purchase' | 'became_affiliate'
              -- | 'referred_friend' | 'commission_earned' | 'template_created'
              -- | 'template_purchased'
  document_type TEXT,
  value         NUMERIC,      -- valor monetário quando aplicável (MZN)
  metadata      JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_events_event_date ON marketing_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_events_visitor     ON marketing_events(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_events_user         ON marketing_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- ── RLS — mesma política das outras tabelas só-admin/só-backend do projecto
-- (ai_provider_daily_usage, admin_logs): RLS activo, ZERO políticas para
-- anon/authenticated. Só o service_role (usado pelas funções serverless em
-- /api, nunca exposto ao browser) pode ler/escrever. O browser nunca fala
-- directamente com estas tabelas — passa sempre por /api/misc?_ns=marketing.
ALTER TABLE marketing_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_visits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_events  ENABLE ROW LEVEL SECURITY;

-- ── View de apoio: resumo diário por origem (base pronta para os
-- dashboards da Fase 2 — evita repetir esta agregação em cada query admin) ─
CREATE OR REPLACE VIEW marketing_source_daily AS
SELECT
  v.marketing_source,
  DATE(v.created_at AT TIME ZONE 'Africa/Maputo')          AS day,
  COUNT(*)                                                  AS visits,
  COUNT(DISTINCT v.visitor_id)                              AS unique_visitors,
  COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.event = 'signup')            AS signups,
  COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.event = 'credit_purchase')   AS buyers,
  COALESCE(SUM(e.value) FILTER (WHERE e.event IN ('credit_purchase','plan_purchase')), 0) AS revenue
FROM marketing_visits v
LEFT JOIN marketing_events e
  ON e.visitor_id = v.visitor_id
  AND DATE(e.created_at AT TIME ZONE 'Africa/Maputo') = DATE(v.created_at AT TIME ZONE 'Africa/Maputo')
GROUP BY v.marketing_source, DATE(v.created_at AT TIME ZONE 'Africa/Maputo');

-- Nota: esta view faz JOIN por dia+visitor_id (aproximação razoável para um
-- dashboard, não para reconciliação financeira exacta — para isso, a Fase 2
-- deve cruzar via user_id quando disponível, que é mais fiável que visitor_id
-- sozinho depois do login).
