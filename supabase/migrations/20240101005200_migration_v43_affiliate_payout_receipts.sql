-- migration_v43_affiliate_payout_receipts.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Recibos de pagamento a afiliados.
--
-- Quando o admin marca um levantamento de afiliado como "✅ Pagar", passa a
-- ter de anexar o print/screenshot da transferência M-Pesa. O sistema:
--   1. Guarda esse screenshot no Storage (bucket "affiliate-receipts");
--   2. Gera um número de recibo (ex: REC-A1B2C3D4);
--   3. Guarda os dois na própria linha de affiliate_withdrawals;
--   4. Fica visível ao afiliado em afiliado.html (botão "📄 Recibo") e ao
--      admin/contabilista no separador Finanças ("📑 Pagamentos a
--      Afiliados"), sem duplicar a subtracção já feita pelo saldo
--      reservado (aff_balance) na fórmula do "Valor Levantável" — ver
--      comentário em api/admin/index.js → handleFinance.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE affiliate_withdrawals
  ADD COLUMN IF NOT EXISTS receipt_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS receipt_number         TEXT;

CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_receipt_number
  ON affiliate_withdrawals(receipt_number);

-- Bucket de Storage para os screenshots de comprovativo M-Pesa — público
-- (mesmo padrão já usado pelo bucket "avatars"), mas com nomes de ficheiro
-- não adivinháveis (UUID do levantamento), pelo que na prática só quem
-- tem o link directo (admin ou o próprio afiliado, via API autenticada)
-- consegue aceder à imagem.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('affiliate-receipts', 'affiliate-receipts', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
