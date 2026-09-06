-- migration_v49_secure_affiliate_receipts.sql
-- ─────────────────────────────────────────────────────────────────────────
-- CORRECÇÃO DE SEGURANÇA: o bucket "affiliate-receipts" (comprovativos de
-- pagamento M-Pesa a afiliados: nomes, valores, números de telefone) foi
-- criado como PÚBLICO na migration_v43, assumindo que nomes de ficheiro
-- não adivináveis seriam protecção suficiente. Não são: qualquer pessoa
-- que alguma vez veja o link (histórico do browser, print de ecrã, log
-- de servidor, partilha acidental) consegue aceder ao ficheiro para
-- sempre, sem sessão iniciada.
--
-- Esta migration:
--   1. Adiciona uma coluna própria para guardar só o CAMINHO do ficheiro
--      (não o URL completo) — o URL passa a ser gerado sob pedido, com
--      validade curta, pelo servidor (ver storageCreateSignedUrl em
--      api/_lib/supabaseAdmin.js).
--   2. Migra o caminho a partir do URL público antigo já guardado.
--   3. Torna o bucket privado. Isto invalida imediatamente qualquer URL
--      público antigo que possa já ter sido partilhado/exposto.
--
-- Executar uma única vez no SQL Editor do Supabase, DEPOIS de fazer o
-- deploy do código actualizado (api/_lib/supabaseAdmin.js,
-- api/admin/index.js, api/misc.js).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Nova coluna: só o caminho dentro do bucket (ex: "<uuid>.jpg")
ALTER TABLE affiliate_withdrawals
  ADD COLUMN IF NOT EXISTS receipt_screenshot_path TEXT;

-- 2. Backfill: extrai o caminho do URL público antigo, se existir
UPDATE affiliate_withdrawals
SET receipt_screenshot_path = regexp_replace(
  receipt_screenshot_url, '^.*affiliate-receipts/', ''
)
WHERE receipt_screenshot_url IS NOT NULL
  AND receipt_screenshot_path IS NULL;

-- 3. Bucket passa a privado — isto invalida qualquer URL público antigo
--    de imediato (deixa de responder em /object/public/...).
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'affiliate-receipts';

-- Nota: não é preciso criar políticas de SELECT em storage.objects para
-- este bucket. O servidor gera os URLs assinados usando a service_role
-- key (api/_lib/supabaseAdmin.js → storageCreateSignedUrl), que ignora
-- RLS por definição. Ninguém deve conseguir ler este bucket directamente
-- com a chave anónima — isso é o comportamento correcto e pretendido.

-- 4. (Opcional, recomendado) Depois de confirmar que tudo funciona com
--    o campo novo, podes limpar a coluna antiga para não guardares URLs
--    públicos mortos:
-- UPDATE affiliate_withdrawals SET receipt_screenshot_url = NULL;
