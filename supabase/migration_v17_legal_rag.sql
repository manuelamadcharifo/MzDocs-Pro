-- supabase/migration_v17_legal_rag.sql
-- ──────────────────────────────────────────────────────────────────────────
-- FASE 2 — Motor Jurídico (RAG): base vectorial de artigos de lei
-- moçambicanos, para substituir as citações estáticas (e por vezes erradas
-- — ver docs/legal/VERIFICACAO-LEGAL.md) nos prompts de IA por artigos
-- REAIS recuperados do texto oficial, com indicação clara quando não há
-- correspondência suficientemente confiante.
--
-- NÃO remove nem altera nenhuma tabela existente. Esta migração é
-- inteiramente aditiva.
--
-- Pré-requisito: a extensão "vector" (pgvector) tem de estar disponível
-- no projecto Supabase. Confirmar em Database → Extensions antes de correr.
-- ──────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ──────────────────────────────────────────────────────────────────────────
-- TABELA: legal_diplomas
-- Um registo por diploma legal (lei, decreto, código). Serve para guardar
-- a proveniência e o estado de verificação de cada fonte, em sintonia com
-- docs/legal/VERIFICACAO-LEGAL.md — NÃO é uma duplicação: este é o registo
-- "vivo" que o código consulta; o .md é o registo humano/legível do porquê.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_diplomas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,        -- ex: 'codigo-civil', 'codigo-penal'
    nome            TEXT NOT NULL,                -- ex: 'Código Civil de Moçambique'
    numero_diploma  TEXT,                         -- ex: 'Decreto-Lei n.º 47.344'
    data_diploma    TEXT,                         -- ex: '25 de Novembro de 1966'
    fonte_descricao TEXT,                         -- de onde veio o PDF/texto usado na ingestão
    -- 'confirmado'  : verificado contra Boletim da República ou fonte equivalente
    -- 'parcial'     : confirmado mas o texto disponível está incompleto
    -- 'nao_usar'    : foi avaliado e rejeitado (ex: era de outra jurisdição)
    estado_verificacao TEXT NOT NULL DEFAULT 'confirmado'
        CHECK (estado_verificacao IN ('confirmado', 'parcial', 'nao_usar')),
    observacoes     TEXT,                         -- notas livres (ex: "falta capítulo 2 em diante")
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────
-- TABELA: legal_chunks
-- Um registo por artigo (ou, em diplomas sem articulado claro, por secção
-- pequena de texto). Granularidade por artigo é deliberada: permite citar
-- com precisão ("artigo 271.º") em vez de devolver um capítulo inteiro.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diploma_id      UUID NOT NULL REFERENCES legal_diplomas(id) ON DELETE CASCADE,
    capitulo        TEXT,             -- ex: 'CAPÍTULO IV — Locação', pode ser NULL
    seccao          TEXT,             -- ex: 'SECÇÃO VI — Falso testemunho...', pode ser NULL
    artigo_numero   TEXT NOT NULL,    -- ex: '271', '1143' — guardado como texto (há "120-A" etc.)
    artigo_titulo   TEXT,             -- ex: '(Falso testemunho em inquirição não contenciosa...)'
    texto           TEXT NOT NULL,    -- texto do artigo, limpo (sem cabeçalhos de página/OCR noise)
    texto_tokens    INTEGER,          -- aproximação de tamanho, para controlo de orçamento no prompt
    embedding       vector(768),      -- gemini-embedding-001, outputDimensionality=768
    -- Página/posição no PDF de origem, só para depuração e re-ingestão futura
    fonte_pagina    INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_chunks_diploma ON legal_chunks (diploma_id);
CREATE INDEX IF NOT EXISTS idx_legal_chunks_artigo  ON legal_chunks (diploma_id, artigo_numero);

-- Índice vectorial (HNSW) para pesquisa por similaridade — cosine distance,
-- consistente com vectores normalizados do Gemini Embedding.
CREATE INDEX IF NOT EXISTS idx_legal_chunks_embedding
    ON legal_chunks USING hnsw (embedding vector_cosine_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS: leitura pública (é legislação publicada oficialmente — não há
-- segredo a proteger), escrita só via service role (ingestão é sempre
-- feita pelo script administrativo, nunca pelo cliente).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE legal_diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_chunks   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_diplomas_public_read" ON legal_diplomas
    FOR SELECT USING (true);

CREATE POLICY "legal_chunks_public_read" ON legal_chunks
    FOR SELECT USING (true);

-- Nenhuma policy de INSERT/UPDATE/DELETE para utilizadores anónimos/autenticados:
-- só a service role (que ignora RLS) pode escrever, via script de ingestão.

-- ──────────────────────────────────────────────────────────────────────────
-- FUNÇÃO: match_legal_chunks
-- Pesquisa por similaridade semântica (cosine) com filtro opcional por
-- diploma. Devolve os top N artigos mais relevantes, com a distância
-- (para podermos aplicar um limiar de confiança no lado do Node e dizer
-- "não encontrado com confiança suficiente" em vez de citar na mesma).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_legal_chunks(
    query_embedding vector(768),
    match_count     INTEGER DEFAULT 4,
    diploma_slugs   TEXT[] DEFAULT NULL  -- opcional: restringir a certos diplomas
)
RETURNS TABLE (
    chunk_id        UUID,
    diploma_slug    TEXT,
    diploma_nome    TEXT,
    capitulo        TEXT,
    artigo_numero   TEXT,
    artigo_titulo   TEXT,
    texto           TEXT,
    similarity      FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        lc.id,
        ld.slug,
        ld.nome,
        lc.capitulo,
        lc.artigo_numero,
        lc.artigo_titulo,
        lc.texto,
        1 - (lc.embedding <=> query_embedding) AS similarity
    FROM legal_chunks lc
    JOIN legal_diplomas ld ON ld.id = lc.diploma_id
    WHERE ld.estado_verificacao IN ('confirmado', 'parcial')
      AND (diploma_slugs IS NULL OR ld.slug = ANY(diploma_slugs))
      AND lc.embedding IS NOT NULL
    ORDER BY lc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Seed dos diplomas confirmados na auditoria (Junho/2026).
-- Os chunks (artigos + embeddings) são inseridos pelo script de ingestão
-- (scripts/legal-ingest.js), não aqui — este INSERT só cria os registos
-- "cabeçalho" de cada diploma para os chunks poderem referenciar via FK.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO legal_diplomas (slug, nome, numero_diploma, data_diploma, fonte_descricao, estado_verificacao, observacoes) VALUES
    ('codigo-civil',        'Código Civil de Moçambique',                  'Decreto-Lei n.º 47.344',  '25 de Novembro de 1966 (posto em vigor pela Portaria n.º 22.869, de 4/9/1967)', 'PDF académico (StudoCu/UCM), confirmado pela ausência de alterações portuguesas pós-1975 e pela nota de alteração do art. 1143.º pelo DL 3/2006', 'confirmado', 'Distinto da versão portuguesa actualizada — NÃO confundir com Código Civil Português'),
    ('codigo-penal',        'Código Penal de Moçambique',                  NULL,                       NULL,                                          'PDF "Revisto e Renumerado", 140 artigos',  'confirmado', NULL),
    ('codigo-notariado',    'Código do Notariado de Moçambique',           'Decreto-Lei n.º 4/2006',  '23 de Agosto de 2006',                       'Boletim da República, I Série, n.º 34, de 23/8/2006',           'confirmado', NULL),
    ('lei-proteccao-social','Lei da Protecção Social',                     'Lei n.º 4/2007',          '7 de Fevereiro de 2007',                     'Boletim da República dedicado',                                  'confirmado', NULL),
    ('lei-registos',        'Lei dos Registos e Identificação Civil',      'Lei n.º 8/2004',          '21 de Julho de 2004',                        'Boletim da República dedicado',                                  'confirmado', NULL),
    ('lei-estrangeiros',    'Regime jurídico do cidadão estrangeiro',      'Lei n.º 5/93',            '28 de Dezembro de 1993',                     'Boletim da República dedicado',                                  'confirmado', NULL),
    ('lei-orgaos-locais',   'Lei dos Órgãos Locais do Estado',             'Lei n.º 2/97',            '18 de Fevereiro de 1997',                    'Boletim da República (via OCR — PDF escaneado)',                  'confirmado', 'Texto obtido por OCR; pode conter pequenos erros de reconhecimento'),
    ('lei-ambiente',        'Lei do Ambiente',                             'Lei n.º 20/97',           '1 de Outubro de 1997',                       'Boletim da República (via OCR — PDF escaneado e incompleto)',     'parcial',    'PDF disponível só cobre o Capítulo I (Definições); resto do articulado não verificado'),
    ('lei-actividades-comerciais', 'Lei das Actividades Comerciais',       'Lei n.º 3/93',            '24 de Junho de 1993',                        'Boletim da República dedicado',                                  'confirmado', NULL),
    ('lei-sistema-tributario', 'Lei de Bases do Sistema Tributário',       'Lei n.º 15/2002',         '26 de Junho de 2002',                        'Versão consolidada com alteração pela Lei n.º 21/2022',           'confirmado', NULL),
    ('codigo-iva',          'Código do IVA',                                'Lei n.º 32/2007',         '31 de Dezembro de 2007',                     'Versão consolidada com alterações até 2025 (taxa actual: 16%)',   'confirmado', NULL),
    ('lei-ordenamento-territorio', 'Lei do Ordenamento do Território',     'Lei n.º 19/2007',         '18 de Julho de 2007',                        'Boletim da República dedicado',                                  'confirmado', NULL),
    ('estatuto-oam',        'Estatuto da Ordem dos Advogados de Moçambique','Lei n.º 7/94',            '14 de Setembro de 1994',                     'Boletim da República dedicado',                                  'confirmado', NULL)
ON CONFLICT (slug) DO NOTHING;
