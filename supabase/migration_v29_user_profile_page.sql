-- supabase/migration_v29_user_profile_page.sql
-- Suporte à nova página /perfil.html (painel de controlo do utilizador):
--   1. Garante que as colunas usadas pela página existem (avatar_url e
--      is_affiliate já existem no schema.sql / migration_v10, mas o
--      IF NOT EXISTS abaixo protege instalações mais antigas).
--   2. Cria o bucket de armazenamento público "avatars" para as fotos de
--      perfil, com políticas para que cada utilizador só possa
--      carregar/substituir/apagar a SUA PRÓPRIA pasta (uid/…).
--
-- Executar uma única vez no SQL Editor do Supabase.

-- ── 1. Colunas de perfil (idempotente) ─────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS is_affiliate BOOLEAN DEFAULT FALSE;

-- ── 2. Bucket de storage para avatares ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 3145728, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public             = TRUE,
  file_size_limit    = 3145728,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

-- Leitura pública (as fotos de perfil são visíveis no header/dropdown para
-- todos, tal como acontece em qualquer rede social).
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Upload: só autenticado, e só dentro da SUA PRÓPRIA pasta
-- (path esperado: {user_id}/avatar-*.ext)
DROP POLICY IF EXISTS "avatars_own_upload" ON storage.objects;
CREATE POLICY "avatars_own_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Substituir (upsert) a própria foto
DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Apagar a própria foto
DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
