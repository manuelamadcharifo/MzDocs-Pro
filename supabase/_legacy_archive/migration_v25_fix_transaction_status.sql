-- migration_v25_fix_transaction_status.sql
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLEMA: duas partes do código (verificação automática por IA em
-- api/misc.js, e a aprovação manual de comprovativos em revisão em
-- api/admin/index.js::handleApproveReceipt) gravavam o status da transação
-- como 'confirmed', enquanto TODO o resto do sistema usa 'completed':
--   - api/admin/index.js::handleStats  → .eq('status','completed')  (receita do dashboard)
--   - api/admin/index.js::handleConfirmPayment / handleConfirmAvulso → 'completed'
--   - assets/js/admin/AdminTransactions.js → só mapeia 'completed' para o badge "✅ Confirmado"
--
-- CONSEQUÊNCIA: pagamentos avulso confirmados automaticamente pela IA
-- ficavam com um status que o dashboard não reconhece — "Receita
-- Confirmada (30d)" mostrava 0 MZN mesmo havendo pagamentos reais
-- confirmados, e essas transações também não apareciam com o badge verde
-- correcto na lista de Transações.
--
-- Este script apenas normaliza os dados já existentes. A partir de agora
-- (após o deploy dos ficheiros corrigidos), tanto o fluxo automático (IA)
-- como o manual (admin) gravam sempre 'completed'.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE transactions
SET status = 'completed'
WHERE status = 'confirmed';

-- Verificação pós-migração (deve devolver 0 linhas):
-- SELECT count(*) FROM transactions WHERE status = 'confirmed';
