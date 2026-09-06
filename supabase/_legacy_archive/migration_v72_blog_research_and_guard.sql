-- supabase/migration_v72_blog_research_and_guard.sql
-- ──────────────────────────────────────────────────────────────────────────
-- P1.9 (Master Hardening & Release Gate v2, Set/2026, Fase 6) — EXTENSÃO à
-- migration_v71_blog_review_gate.sql, pedida pelo cliente:
--
--   1. Para tópicos legal/fiscal/administrativos, o artigo deve ser
--      escrito com base numa pesquisa real em fontes oficiais (governo,
--      AT, INSS, etc.), não só no conhecimento interno do modelo — ver
--      api/_lib/blogResearch.js (researchOfficialSources).
--   2. Nenhum artigo (sensível ou não) pode mencionar geração por
--      inteligência artificial, nem afirmar coisas que o MzDocs Pro não
--      faz (substituir advogado, garantir aprovação, etc.) — ver
--      api/_lib/blogContentGuard.js (guardBlogContent).
--
-- Esta migração só acrescenta colunas (tudo NULLABLE/DEFAULT seguro) para
-- guardar o resultado dessas duas verificações, para consulta/auditoria e
-- para o admin ver, no ecrã de revisão (tooltip de review_reason, já
-- existente), que fontes foram confirmadas — sem exigir nenhuma alteração
-- de UI nova, porque review_reason continua a ser o único campo mostrado
-- ao admin e passa a incluir esta informação em texto (ver blog.js).
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE blog_pages
  ADD COLUMN IF NOT EXISTS research_sources JSONB,
  ADD COLUMN IF NOT EXISTS content_flags    TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN blog_pages.research_sources IS
  'v72 (Set/2026, Fase 6): factos + fontes oficiais confirmados pela pesquisa automática (Google Search grounding via Gemini, ver api/_lib/blogResearch.js) ANTES de o artigo ser escrito. NULL quando o tópico não é sensível (pesquisa só corre para tópicos legal/fiscal/administrativos) ou quando a pesquisa não confirmou nenhuma fonte fiável. Formato: [{"facto":"...","fonte_nome":"...","fonte_url":"..."}].';
COMMENT ON COLUMN blog_pages.content_flags IS
  'v72 (Set/2026, Fase 6): identificadores dos avisos disparados pelo guard de conteúdo (api/_lib/blogContentGuard.js) — ex.: "ai_mention", "legal_advice_substitute", "company_registered". Array vazio quando o artigo passou os dois scanners sem avisos. Qualquer entrada aqui já implica needs_review=TRUE (ver blog.js), independentemente do tópico ser ou não legal/fiscal.';

-- Útil para o admin filtrar rapidamente "artigos com avisos de conteúdo"
-- sem depender de fazer parsing de review_reason em texto livre.
CREATE INDEX IF NOT EXISTS idx_blog_pages_content_flags
  ON blog_pages USING GIN (content_flags)
  WHERE content_flags <> '{}';
