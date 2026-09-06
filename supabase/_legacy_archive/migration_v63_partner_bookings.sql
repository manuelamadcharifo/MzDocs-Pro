-- supabase/migration_v63_partner_bookings.sql
-- ─────────────────────────────────────────────────────────────────────────
-- NOVO (pedido do fundador, Ago/2026) — AGENDAMENTO REAL com a papelaria/
-- gráfica parceira, em vez do fluxo antigo em que o pedido só existia
-- dentro de uma conversa de WhatsApp (sem nenhum registo no sistema, sem a
-- parceira poder "ver" os seus pedidos pendentes num único sítio, e sem o
-- cliente saber se o pedido foi sequer visto).
--
-- Esta tabela é o registo estruturado de cada pedido de FOTO ou de
-- IMPRESSÃO feito a partir do formulário do cliente (ver
-- ServiceDefinitions.js → foto/impressao, DocumentController.sendDirect())
-- depois de escolher uma papelaria em "Parceiras próximas"
-- (NearbyPartners.js). O envio por WhatsApp CONTINUA a acontecer (é o
-- canal onde o cliente entrega a foto/o ficheiro) — esta tabela é o que
-- permite à parceira, no Portal da Parceira (parceiro-portal.html),
-- ver a lista de pedidos e marcar cada um como agendado / em andamento /
-- concluído / cancelado, tal como pedido.
--
-- Idempotente — pode ser executada novamente sem duplicar dados nem
-- partir a função (CREATE OR REPLACE, mesma assinatura de sempre).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  -- 'foto'      → pedido de "Foto para Documentos"
  -- 'documento' → pedido de impressão/plastificação/encadernação, etc.
  type           text        NOT NULL DEFAULT 'documento'
                             CHECK (type IN ('foto','documento')),
  -- Chave do serviço em ServiceDefinitions.js (ex.: 'foto', 'impressao') —
  -- guardado à parte de `type` porque no futuro podem existir vários
  -- serviços dentro do mesmo `type` (ex.: plastificação/encadernação
  -- também são 'documento').
  service        text,
  client_name    text        NOT NULL,
  client_phone   text        NOT NULL,
  -- Cópia dos dados do formulário no momento do pedido (finalidade,
  -- quantidade, cor de fundo, tipo de impressão, páginas, etc.) — para a
  -- parceira ver tudo no Portal sem depender de reabrir o WhatsApp.
  details        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  preferred_date date,
  preferred_time time,
  status         text        NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente','agendado','em_andamento','concluido','cancelado')),
  -- Nota curta da parceira (ex.: "venha depois das 14h", "falta 1 foto") —
  -- só visível a ela própria no Portal, não é enviada ao cliente.
  partner_notes  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_partner_status ON bookings (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at     ON bookings (created_at DESC);

-- Reaproveita a função já criada em supabase-partners-setup.sql; CREATE OR
-- REPLACE aqui também, de forma defensiva, caso esta migração seja alguma
-- vez aplicada isoladamente numa base de dados nova.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Só a API (service_role, via api/partners.js) lê/escreve — mesmo padrão
-- "API_only" já usado em partners / partner_ratings. O cliente nunca lê
-- esta tabela directamente; recebe apenas o "ok" da criação do pedido.
DROP POLICY IF EXISTS "API_only" ON bookings;
CREATE POLICY "API_only" ON bookings USING (false);
