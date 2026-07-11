-- ============================================================================
-- migration_v35_push_notifications.sql
-- Notificações PUSH reais (Android/Chrome — aparecem no telemóvel do sistema
-- operativo, mesmo com a app fechada, depois de instalada como PWA).
--
-- Diferente de admin_notifications (v34), que é só um feed DENTRO do painel
-- de admin: esta tabela guarda as subscrições de push do browser (endpoint +
-- chaves de encriptação), tanto de CLIENTES como de ADMINS, distinguidos
-- pela coluna `target`. O envio real usa a lib 'web-push' a partir de
-- api/_lib/webpush.js (ver api/misc.js e api/admin/index.js).
--
-- Aplicar no Supabase SQL Editor DEPOIS da v34.
--
-- Variáveis de ambiente necessárias na Vercel (gerar com
-- `npx web-push generate-vapid-keys` ou usar o par já gerado — ver README):
--   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = subscrição de convidado
  endpoint      TEXT NOT NULL UNIQUE,   -- URL única do push service do browser (chave natural da subscrição)
  p256dh        TEXT NOT NULL,          -- chave pública de encriptação (parte do PushSubscription.keys)
  auth          TEXT NOT NULL,          -- segredo de autenticação (parte do PushSubscription.keys)
  target        TEXT NOT NULL DEFAULT 'client' CHECK (target IN ('client', 'admin')),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_target  ON push_subscriptions(target);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Tal como todas as outras tabelas administrativas deste projecto: sem
-- policy de leitura/escrita pública — só o service_role (via /api/misc e
-- /api/admin, que já validam autenticação) lê ou escreve. Zero acesso
-- directo do browser com a chave anónima.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
