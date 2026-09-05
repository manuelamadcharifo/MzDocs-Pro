-- supabase/migration_v71_blog_review_gate.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P1.9 (Master Hardening & Release Gate v2, Set/2026, Fase 6) — fact-check
-- do SEO automático.
--
-- PROBLEMA CONFIRMADO (por leitura de api/_services/blog.js →
-- _generateAndPublishArticle): um artigo gerado por IA era gravado com
-- `published: true` e publicado como página estática no GitHub
-- IMEDIATAMENTE — sem revisão nenhuma, mesmo quando o tópico é legal,
-- fiscal ou administrativo (ex.: "Como calcular o ISPC em Moçambique",
-- "Requisitos para procuração"). A auditoria original avisou exactamente
-- disto: "conteúdo incorrecto gerado automaticamente pode ser indexado
-- como informação factual" — e o próprio projecto já teve um exemplo real
-- do risco inverso (P1.10, ver secção 15): a documentação interna sobre o
-- ISPC estava desactualizada/simplificada em excesso.
--
-- SOLUÇÃO (ver api/_services/blog.js para a lógica de detecção):
-- tópicos que batem com um conjunto de palavras-chave legal/fiscal/
-- administrativo passam a ser gravados com `published = FALSE` e
-- `needs_review = TRUE` (nunca publicados automaticamente, nem no site
-- estático), ficando à espera de aprovação manual do admin através do
-- ecrã que já existe para gerir páginas do blog (handleBlogPages, acção
-- PUT `published=true` já publica o ficheiro estático). Tópicos fora
-- desta lista continuam com o fluxo 100% automático de sempre — a
-- auditoria original recomendou explicitamente NÃO desligar o SEO
-- programático, só adicionar revisão onde o risco é real.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE blog_pages
  ADD COLUMN IF NOT EXISTS needs_review  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

COMMENT ON COLUMN blog_pages.needs_review IS
  'v71 (Set/2026, P1.9): TRUE quando o artigo foi gerado automaticamente sobre um tópico legal/fiscal/administrativo e está à espera de revisão humana antes de ser publicado (ver SENSITIVE_TOPIC_PATTERN em api/_services/blog.js). Nunca aparece no site enquanto published=FALSE (RLS blog_public_read exige published=TRUE).';
COMMENT ON COLUMN blog_pages.review_reason IS
  'v71 (Set/2026, P1.9): a(s) palavra(s)-chave que fizeram este artigo cair em needs_review — mostrado ao admin no painel para ele saber o que confirmar antes de aprovar.';

CREATE INDEX IF NOT EXISTS idx_blog_pages_needs_review
  ON blog_pages(needs_review, created_at DESC)
  WHERE needs_review = TRUE;

-- Fila de agendamento (blog_schedule_queue, migration_v26): o estado
-- 'published' deixa de ser o único resultado de sucesso possível — um item
-- cujo tópico caiu em needs_review fica correctamente marcado como tal em
-- vez de "published" (o que seria enganador: a página real fica com
-- published=FALSE em blog_pages até ser aprovada). Alarga o CHECK
-- existente para incluir o novo valor sem remover nenhum dos anteriores.
ALTER TABLE blog_schedule_queue DROP CONSTRAINT IF EXISTS blog_schedule_queue_status_check;
ALTER TABLE blog_schedule_queue
  ADD CONSTRAINT blog_schedule_queue_status_check
  CHECK (status IN ('pending', 'published', 'failed', 'needs_review'));
