-- ============================================================
-- MIGRAÇÃO v65 — Pacotes de créditos exclusivos por categoria
-- Execute no SQL Editor do Supabase, DEPOIS da migration_v64.
--
-- PEDIDO DO CLIENTE: "aplica o mesmo para todas as categorias de
-- afiliados mas com diferença entre preços ou créditos comprados...
-- os créditos e preço que aparecer para eles têm de ser diferentes de
-- acordo com a sua categoria."
--
-- DESENHO: cada pacote em credit_packages pode agora ser marcado como
-- exclusivo de UMA categoria (partner_segment). Um pacote sem
-- partner_segment (NULL) continua visível/comprável por qualquer pessoa,
-- exactamente como hoje — nenhum pacote existente é afectado. As
-- categorias usadas são as MESMAS já existentes no sistema de afiliados
-- (migration_v14_affiliates_pro.sql → aff_segment) mais 'advogado', que
-- só existe como tipo de parceiro (tabela partners), não de afiliado:
--   papelaria · cyber · universidade · explicacao · digitador ·
--   individual · advogado
--
-- A categoria de um utilizador é resolvida no servidor (nunca confiada
-- ao cliente) por api/_lib/packages.js → resolveUserPricingSegment():
--   1. profiles.is_affiliate = true + affiliates.aff_segment
--   2. OU partners.linked_user_id (parceiro aprovado e activo) + partners.type
--
-- SEGURANÇA: a validação real de "este utilizador pode mesmo comprar
-- este pacote" acontece em api/process-payment.js, no momento do
-- pagamento — nunca só no frontend (que apenas decide o que MOSTRAR).
-- Um pedido de compra de um pacote com partner_segment definido passa a
-- EXIGIR sessão autenticada válida (token), e o preço só é aceite se o
-- segmento resolvido no servidor coincidir com o do pacote.
-- ============================================================

ALTER TABLE credit_packages
  ADD COLUMN IF NOT EXISTS partner_segment TEXT;

COMMENT ON COLUMN credit_packages.partner_segment IS
  'NULL = pacote público, visível/comprável por qualquer pessoa (comportamento actual). Preenchido = exclusivo dessa categoria (papelaria, cyber, universidade, explicacao, digitador, individual, advogado) — só visível/comprável por quem for resolvido nessa categoria (ver resolveUserPricingSegment em api/_lib/packages.js). Nunca confiar no valor enviado pelo cliente: a validação real é sempre feita no servidor com o utilizador autenticado.';

CREATE INDEX IF NOT EXISTS idx_credit_packages_segment
  ON credit_packages(partner_segment) WHERE partner_segment IS NOT NULL;

-- ── Exemplos de pacotes exclusivos (o admin pode editar tudo depois em
--    /api/admin/packages — isto só semeia um ponto de partida por
--    categoria, todos desactivados por omissão para o cliente decidir
--    preços finais antes de os activar) ────────────────────────────────
INSERT INTO credit_packages (id, name, credits, price_mzn, sort_order, is_active, partner_segment) VALUES
  ('parc_papelaria',    'Papelaria — Revenda',        100, 800,  10, false, 'papelaria'),
  ('parc_cyber',        'Cyber Café — Revenda',       100, 800,  11, false, 'cyber'),
  ('parc_universidade', 'Universidade — Estudantes',  500, 3500, 12, false, 'universidade'),
  ('parc_explicacao',   'Centro de Explicações',      150, 1100, 13, false, 'explicacao'),
  ('parc_digitador',    'Digitador — Volume',         80,  600,  14, false, 'digitador'),
  ('parc_advogado',     'Advogado Parceiro',          60,  500,  15, false, 'advogado')
ON CONFLICT (id) DO NOTHING;
