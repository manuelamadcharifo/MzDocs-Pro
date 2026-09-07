-- ============================================================
-- MIGRAÇÃO v73 — Minutas de parceiro (marketplace de conteúdo jurídico)
-- Execute no SQL Editor do Supabase.
--
-- PEDIDO DO CLIENTE (Set/2026): parceiros/afiliados associados ao projecto
-- passam a poder submeter as SUAS PRÓPRIAS minutas (o texto/clausulado de
-- um documento — não só a aparência, que já era possível via
-- templates_custom/template_html/template_css) para os tipos de documento
-- que usam "minuta fixa" (recibo, procuração, requerimento, declaração de
-- residência, pedido de licença, prestação de serviços, arrendamento — ver
-- assets/js/services/minutas/index.js).
--
-- REQUISITO EXPLÍCITO DO CLIENTE: quem submete uma minuta tem de aceitar,
-- de forma expressa e registada, que É O ÚNICO RESPONSÁVEL pelo conteúdo
-- jurídico que escreveu — incluindo em caso de acção judicial decorrente
-- desse conteúdo. Por isso `liability_accepted` é NOT NULL + CHECK(=true)
-- (não é possível gravar uma submissão sem aceitar), e
-- `liability_accepted_text` guarda uma CÓPIA EXACTA do texto do disclaimer
-- tal como existia no momento da aceitação (não uma referência a um texto
-- que podia mudar depois) — para servir de prova em caso de litígio.
--
-- NOTA IMPORTANTE (não jurídica): o texto do disclaimer usado pela API
-- (api/_lib/minutaLiabilityDisclaimer.js) foi escrito com bom senso, mas
-- NÃO foi revisto por um advogado. Antes de activar esta funcionalidade
-- para parceiros reais, recomenda-se revisão jurídica desse texto.
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_minutas (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_type             TEXT        NOT NULL,
  minuta_name              TEXT        NOT NULL,
  description              TEXT,
  -- Corpo da minuta com placeholders {{CAMPO}} — nunca HTML/JS executável;
  -- a substituição é sempre texto-por-texto (ver api/_lib/minutaEngine.js
  -- e assets/js/services/minutas/partnerEngine.js), nunca eval().
  minuta_text              TEXT        NOT NULL CHECK (char_length(minuta_text) BETWEEN 50 AND 20000),
  placeholders_used        TEXT[]      NOT NULL DEFAULT '{}',

  status                   TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','approved','rejected')),
  rejection_reason         TEXT,
  -- Autor pode desactivar a sua própria minuta sem a apagar (ex.: quer
  -- corrigir algo) — enquanto inactiva, nunca aparece como opção a
  -- utilizadores finais, mesmo que status continue 'approved'.
  is_active                BOOLEAN     NOT NULL DEFAULT true,
  use_count                INT         NOT NULL DEFAULT 0,

  -- ── Responsabilidade legal (obrigatório) ──────────────────────────────
  liability_accepted       BOOLEAN     NOT NULL,
  liability_accepted_text  TEXT        NOT NULL,
  liability_accepted_ip    TEXT,
  liability_accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_minutas_liability_must_accept CHECK (liability_accepted = true),

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by               UUID REFERENCES profiles(id),
  reviewed_at                TIMESTAMPTZ
);

COMMENT ON TABLE partner_minutas IS
  'Minutas (texto/clausulado) submetidas por parceiros/afiliados para tipos de documento de minuta fixa. O autor aceita responsabilidade legal exclusiva pelo conteúdo — ver liability_accepted_text.';
COMMENT ON COLUMN partner_minutas.minuta_text IS
  'Texto da minuta com placeholders {{CAMPO}}. Renderizado sempre por substituição de texto simples — nunca HTML/JS executado.';
COMMENT ON COLUMN partner_minutas.liability_accepted_text IS
  'Cópia EXACTA do texto do disclaimer de responsabilidade aceite pelo autor no momento da submissão — prova em caso de litígio, mesmo que o texto oficial mude depois.';

CREATE INDEX IF NOT EXISTS idx_partner_minutas_service_approved
  ON partner_minutas(service_type)
  WHERE status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_partner_minutas_user
  ON partner_minutas(user_id);

CREATE INDEX IF NOT EXISTS idx_partner_minutas_pending
  ON partner_minutas(created_at)
  WHERE status = 'pending';

-- updated_at automático em qualquer alteração (mesmo padrão já usado
-- noutras tabelas do projecto).
CREATE OR REPLACE FUNCTION partner_minutas_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_minutas_updated_at ON partner_minutas;
CREATE TRIGGER trg_partner_minutas_updated_at
  BEFORE UPDATE ON partner_minutas
  FOR EACH ROW EXECUTE FUNCTION partner_minutas_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE partner_minutas ENABLE ROW LEVEL SECURITY;

-- Leitura pública só de minutas aprovadas e activas — é o que a Galeria
-- mostra a qualquer utilizador final para escolher entre a minuta padrão
-- da plataforma e as minutas de parceiros.
DROP POLICY IF EXISTS "partner_minutas_read_approved" ON partner_minutas;
CREATE POLICY "partner_minutas_read_approved" ON partner_minutas
  FOR SELECT USING (status = 'approved' AND is_active = true);

-- Autor pode sempre ver as suas próprias submissões (incluindo pending/
-- rejected, para acompanhar o estado).
DROP POLICY IF EXISTS "partner_minutas_read_own" ON partner_minutas;
CREATE POLICY "partner_minutas_read_own" ON partner_minutas
  FOR SELECT USING (auth.uid() = user_id);

-- Inserção/actualização/aprovação só através da API com service_role
-- (api/_services/partnerMinutas.js) — nunca directamente do browser, para
-- que a validação de elegibilidade (afiliado/parceiro aprovado) e de
-- placeholders permitidos nunca possa ser contornada.
