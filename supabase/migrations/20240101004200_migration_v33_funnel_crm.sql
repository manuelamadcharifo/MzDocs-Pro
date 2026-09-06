-- ============================================================================
-- migration_v33_funnel_crm.sql — Fase 4: Funil de Conversão + CRM/Timeline
-- ============================================================================
-- Objectivo desta fase (ver roteiro): um dashboard de FUNIL (visitas →
-- registos → documentos gerados → compras, com taxa de conversão em cada
-- passo) e uma TIMELINE/CRM por utilizador (histórico completo de eventos
-- de um cliente específico, incluindo actividade anónima antes do registo).
--
-- PROBLEMA que esta migration resolve: marketing_events (Fase 1) já guarda
-- tudo por visitor_id, e por user_id quando disponível — mas os dois nunca
-- foram ligados de forma permanente. Ou seja, hoje é impossível reconstruir
-- "o que este utilizador fez ANTES de criar conta" (visitas, cliques em
-- anúncios, etc.), porque essa actividade só tem visitor_id, e não há
-- nenhum sítio a guardar qual visitor_id pertence a qual profiles.id depois
-- do login. A partir de agora, o signup grava essa ligação uma única vez.
--
-- Aplicar no Supabase SQL Editor DEPOIS da v30/v31/v32 já aplicadas.
-- ============================================================================

-- ── 1. Ligação permanente visitante-anónimo → utilizador registado ────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visitor_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_visitor_id
  ON profiles(visitor_id) WHERE visitor_id IS NOT NULL;

COMMENT ON COLUMN profiles.visitor_id IS
  'UUID anónimo (localStorage, mzd_visitor_id) capturado no momento do registo. '
  'Permite reconstruir a timeline completa do cliente, incluindo a actividade '
  'de antes de ter conta (visitas, cliques em QR/campanhas). Gravado uma única '
  'vez no signup — nunca reescrito depois, mesmo que o utilizador limpe o '
  'browser e gere um novo visitor_id mais tarde (esse novo id fica anónimo).';

-- ── 2. View de apoio: funil GLOBAL por dia (independente da origem) ───────
-- Diferente de marketing_source_daily (Fase 2, agrupada por origem — bom
-- para "de onde vêm os clientes"), esta view responde a uma pergunta
-- diferente: "de todos os que passam pelo site, quantos avançam em cada
-- passo do funil?" — por isso agrega tudo junto, sem GROUP BY origem.
CREATE OR REPLACE VIEW marketing_funnel_daily AS
SELECT
  DATE(v.created_at AT TIME ZONE 'Africa/Maputo')                          AS day,
  COUNT(*)                                                                  AS visits,
  COUNT(DISTINCT v.visitor_id)                                              AS unique_visitors,
  COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.event = 'signup')            AS signups,
  COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.event = 'document_generated') AS doc_generators,
  COUNT(DISTINCT e.visitor_id) FILTER (
    WHERE e.event IN ('credit_purchase','plan_purchase')
  )                                                                          AS buyers,
  COALESCE(SUM(e.value) FILTER (
    WHERE e.event IN ('credit_purchase','plan_purchase')
  ), 0)                                                                      AS revenue
FROM marketing_visits v
LEFT JOIN marketing_events e
  ON e.visitor_id = v.visitor_id
  AND DATE(e.created_at AT TIME ZONE 'Africa/Maputo') = DATE(v.created_at AT TIME ZONE 'Africa/Maputo')
GROUP BY DATE(v.created_at AT TIME ZONE 'Africa/Maputo');

-- Nota (mesma ressalva da marketing_source_daily): aproximação por dia +
-- visitor_id, adequada para o dashboard de funil, não para reconciliação
-- financeira. Um visitante que regressa dias depois para comprar aparece
-- como "buyer" apenas no dia da compra, não no dia da visita original —
-- é o comportamento esperado para um funil diário.

-- ── 3. RLS — mesma política restritiva de todas as tabelas de marketing:
-- zero acesso directo do browser, só o service_role via /api pode ler.
-- (profiles já tem RLS activo desde a v1 — esta ALTER é redundante mas
-- inofensiva, mantida por clareza/consistência do ficheiro.)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
