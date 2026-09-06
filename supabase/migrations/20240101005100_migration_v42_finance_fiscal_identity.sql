-- migration_v42_finance_fiscal_identity.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adiciona a identidade fiscal da empresa (nome legal, NUIT, morada,
-- regime fiscal, início do exercício) usada no novo cartão
-- "🧾 Contabilidade / Dados Fiscais" do separador Finanças do admin.
--
-- Estes valores são impressos no cabeçalho de:
--   • /api/admin?action=finance&sub=period-report (relatório de período,
--     para IVA mensal ou declaração anual)
--   • Exportações CSV do livro de receita/despesas/levantamentos
--
-- Nenhum valor por omissão fica preenchido a não ser um NUIT ou nome real
-- — o admin preenche isto uma vez no separador Finanças. Reutiliza a
-- mesma tabela genérica system_settings já usada pelos custos
-- recorrentes (ver migration_v37_finance_expenses.sql).
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO system_settings (key, value, description, updated_at) VALUES
  ('fiscal_company_name', '', 'Nome legal/comercial da empresa, para o cabeçalho dos relatórios fiscais', NOW()),
  ('fiscal_nuit',          '', 'NUIT (Número Único de Identificação Tributária) da empresa', NOW()),
  ('fiscal_address',       '', 'Morada fiscal da empresa', NOW()),
  ('fiscal_regime',        '', 'Regime fiscal (ex: Regime Simplificado, Regime Normal de IVA)', NOW()),
  ('fiscal_year_start',    '', 'Mês de início do exercício fiscal (AAAA-MM-DD, tipicamente 1 de Janeiro)', NOW())
ON CONFLICT (key) DO NOTHING;
