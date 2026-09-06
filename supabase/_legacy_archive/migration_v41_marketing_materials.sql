-- ============================================================
-- MIGRAÇÃO v41 — Kit de Marketing para Afiliados (QR dinâmico por afiliado)
-- Execute no SQL Editor do Supabase.
--
-- Contexto: o admin passa a poder enviar materiais de marketing
-- (panfletos/banners para já; vídeo/áudio/PDF ficam previstos no esquema
-- para mais tarde) a partir do painel admin. Cada material do tipo imagem
-- pode ter uma "zona de QR Code" marcada (posição/tamanho em percentagem,
-- para funcionar em qualquer resolução) — quando um afiliado abre a sua
-- área de Marketing, cada peça é composta no browser (canvas) com O SEU
-- PRÓPRIO QR code (e opcionalmente o seu nome/código) colado exactamente
-- nessa zona, pronta a descarregar. Nenhuma cópia por afiliado fica
-- gravada na base de dados — a composição acontece em tempo real no
-- dispositivo do afiliado a partir do material original + os seus dados.
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_materials (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  category      TEXT        NOT NULL DEFAULT 'panfleto'
                  CHECK (category IN ('panfleto','banner','post','video','audio','outro')),
  media_type    TEXT        NOT NULL DEFAULT 'image'
                  CHECK (media_type IN ('image','video','audio','pdf')),
  -- Imagens pequenas (panfletos/banners) ficam gravadas directamente aqui
  -- em base64 (o projecto não tem ainda um bucket de storage próprio).
  -- Para vídeo/áudio/PDF ou imagens maiores, usa-se antes external_url
  -- (ex: um link do YouTube, Google Drive, ou qualquer alojamento próprio).
  file_data     TEXT,
  external_url  TEXT,
  width_px      INT,
  height_px     INT,
  -- Zona onde o QR code pessoal do afiliado é desenhado por cima da
  -- imagem, em percentagem (0-100) da largura/altura da imagem original
  -- — assim funciona em qualquer tamanho de ecrã sem perder a posição.
  qr_zone       JSONB,      -- { "x":.., "y":.., "w":.., "h":.. }
  -- Zona opcional de texto dinâmico (nome ou código do afiliado).
  text_zone     JSONB,      -- { "x":.., "y":.., "w":.., "h":.., "field":"ref_code"|"full_name", "font_size":.., "color":"#..", "align":"left"|"center"|"right" }
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_materials_active
  ON marketing_materials(is_active, sort_order);

-- RLS activo, sem políticas para anon/authenticated — tal como
-- admin_logs/finance_expenses/etc., só o backend (service role, usado
-- tanto pelo admin como pela área de Marketing do afiliado) lê/escreve
-- esta tabela.
ALTER TABLE marketing_materials ENABLE ROW LEVEL SECURITY;
