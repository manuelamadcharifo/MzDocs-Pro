-- ============================================================
-- MIGRATION v24 — Corrige exposição de credit_packages (auditoria, ponto 7)
-- ============================================================
-- PROBLEMA: a tabela credit_packages (criada em migration_v8_pricing_
-- temp_accounts.sql) nunca teve nenhuma política de RLS. Por padrão no
-- Postgres/Supabase, uma tabela sem RLS habilitado é livremente legível
-- E ESCREVÍVEL por qualquer chave, incluindo a chave pública "anon" usada
-- pelo frontend — ou seja, teoricamente qualquer visitante anónimo do
-- site poderia ter alterado os preços/créditos desta tabela via API REST
-- directa do Supabase.
--
-- CONTEXTO: esta tabela está ÓRFÃ desde que a lógica de preços migrou
-- para a tabela system_settings (ver api/_lib/packages.js, que já
-- documenta esta decisão) — nenhum código JS, backend ou frontend, lê ou
-- escreve nesta tabela hoje. Por segurança e clareza, não a removemos
-- nesta migration (DROP TABLE é uma decisão deliberada, fora do escopo de
-- uma correção de auditoria), mas fechamos o acesso e deixamos a
-- documentação explícita para quem encontrar esta tabela no futuro.
-- ============================================================

ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;

-- Apenas o service_role (backend, nunca exposto ao frontend) pode
-- ler/escrever. Nenhuma política para 'anon'/'authenticated' é criada
-- deliberadamente — a tabela não deve ser usada pelo frontend.
-- CORRIGIDO: DROP POLICY IF EXISTS antes do CREATE — sem isso, re-executar
-- esta migration (ex.: ao reaplicar todas as migrations num ambiente novo,
-- ou por engano) falha com "policy already exists" se já tiver corrido
-- antes. Mesmo padrão idempotente já usado noutras migrations do projecto
-- (ver EXECUTAR_promote_admin.sql).
DROP POLICY IF EXISTS "credit_packages_service_only" ON credit_packages;
CREATE POLICY "credit_packages_service_only" ON credit_packages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE credit_packages IS
  'OBSOLETA desde a introdução de system_settings como fonte de verdade '
  'para preços/créditos (ver api/_lib/packages.js). Mantida apenas por '
  'segurança histórica de dados — nenhum código actual a lê ou escreve. '
  'Considerar DROP TABLE numa limpeza futura, após confirmar que '
  'nenhuma integração externa depende dela.';
