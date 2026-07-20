-- migration_v29_blog_limits.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adiciona duas definições novas ao sistema de agendamento do blog
-- (introduzido na migration_v26_blog_scheduling.sql):
--
--   • blog_monthly_limit      — número máximo de artigos (agendados +
--     publicados) permitido por mês civil. Existe para não ultrapassar
--     um ritmo de publicação que o Google possa considerar excessivo
--     para um site deste porte (conteúdo em massa gerado por IA é um
--     sinal vigiado pelas políticas de spam / conteúdo útil da Pesquisa
--     Google). É só um limite interno nosso — o Google não publica um
--     número oficial — mas mantém a cadência num nível seguro e permite
--     ajustar depois pela UI sem nova migração.
--   • blog_min_interval_days  — intervalo mínimo (dias) que tem de existir
--     entre dois artigos agendados, aplicado tanto ao agendamento manual
--     em massa como ao reagendamento automático.
--
-- Nenhuma alteração de esquema é necessária — system_settings já é uma
-- tabela chave/valor genérica (ver migration_v26_blog_scheduling.sql).
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO system_settings (key, value, description) VALUES
  ('blog_monthly_limit',     '12', 'Máximo de artigos de blog (agendados + publicados) por mês civil'),
  ('blog_min_interval_days', '2',  'Intervalo mínimo (dias) entre artigos agendados, manual ou automaticamente')
ON CONFLICT (key) DO NOTHING;
