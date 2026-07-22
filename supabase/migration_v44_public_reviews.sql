-- migration_v44_public_reviews.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Transforma a tabela user_feedback (já existente, v9) num sistema de
-- avaliações públicas reais e moderadas:
--
--   • status         — 'pending' | 'approved' | 'rejected'. Só avaliações
--                       'approved' aparecem publicamente (hero + secção
--                       "O que dizem os utilizadores"). Comentários limpos
--                       são aprovados automaticamente pelo filtro em
--                       api/_lib/contentModeration.js; qualquer coisa
--                       duvidosa ou nota baixa com comentário fica
--                       'pending' para um admin decidir; conteúdo abusivo
--                       nunca chega a ser gravado.
--   • display_name   — nome curto opcional para mostrar publicamente (ex:
--                       "Sofia M." em vez do nome completo) — nunca o
--                       telefone nem o nome completo do perfil.
--   • reviewed_by     — admin que aprovou/rejeitou manualmente.
--   • reviewed_at     — quando foi revista.
--
-- Todas as avaliações já existentes na tabela (uso interno de analytics)
-- ficam 'approved' por omissão, para não fazer nenhuma desaparecer do
-- painel de analytics do admin que já as lê.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_feedback_status
  ON user_feedback(status, created_at DESC);

-- Leitura pública (anónima) apenas de avaliações aprovadas — usada pelo
-- endpoint GET /api/misc?action=public-reviews para alimentar o hero e a
-- secção de testemunhos sem depender de service role no browser.
-- (O Postgres não suporta "CREATE POLICY IF NOT EXISTS" — por isso apaga-se
-- primeiro, se já existir, e recria-se a seguir.)
DROP POLICY IF EXISTS "feedback_public_read_approved" ON user_feedback;
CREATE POLICY "feedback_public_read_approved" ON user_feedback
  FOR SELECT USING (status = 'approved');
