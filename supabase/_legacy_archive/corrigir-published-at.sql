-- Corrige published_at em falta para artigos já publicados através do
-- caminho do admin (POST/PUT /api/admin/pages), que nunca o gravava.
-- Usa created_at como melhor aproximação disponível da data real de
-- publicação (é o timestamp mais próximo que temos do momento em que a
-- página foi criada/publicada).
UPDATE blog_pages
SET published_at = created_at
WHERE published = TRUE AND published_at IS NULL;

-- Confirmar o resultado
SELECT slug, published, published_at, updated_at, created_at
FROM blog_pages
ORDER BY published_at DESC NULLS LAST;
