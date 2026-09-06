-- migration_v45_partner_ratings_antiabuso.sql
-- ─────────────────────────────────────────────────────────────────────────
-- CORRIGIDO (auditoria 1.4): POST /api/partners?action=rate não exigia
-- autenticação nem impedia votos repetidos — qualquer pessoa (ou a própria
-- papelaria, para se auto-promover, ou um concorrente, para prejudicar
-- outra) podia chamar o endpoint em ciclo e inflar/destruir a nota de
-- qualquer parceira à vontade, já que o código só somava directamente em
-- rating_sum/rating_count sem qualquer registo de quem já avaliou o quê.
--
-- Esta tabela regista 1 avaliação por (parceira, visitante) — identificado
-- pelo visitor_id anónimo que o MarketingTracker já grava em localStorage
-- (mzd_visitor_id). Não impede 100% da manipulação (um visitante pode
-- limpar o localStorage), mas eleva o custo de abuso de "um pedido HTTP"
-- para "um dispositivo/navegador novo por cada voto falso", e o endpoint
-- (ver api/partners.js) passa a bloquear reavaliação da mesma parceira
-- pelo mesmo visitante durante 30 dias.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_ratings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  visitor_id  text        NOT NULL,
  rating      int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_ratings_partner ON partner_ratings (partner_id);

ALTER TABLE partner_ratings ENABLE ROW LEVEL SECURITY;

-- Só a API (service_role, via api/partners.js) lê/escreve — mesmo padrão
-- de "API_only" já usado na tabela partners.
DROP POLICY IF EXISTS "API_only" ON partner_ratings;
CREATE POLICY "API_only" ON partner_ratings USING (false);
