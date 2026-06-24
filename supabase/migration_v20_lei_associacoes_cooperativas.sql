-- supabase/migration_v20_lei_associacoes_cooperativas.sql
-- ──────────────────────────────────────────────────────────────────────────
-- ACHADO (Fase 2, Junho/2026): ao adicionar suporte de RAG a acta.js,
-- descobriu-se que este ficheiro nunca tinha sido coberto pela auditoria
-- da Fase 1 (não tinha sido detectado como "categoria jurídico" na
-- primeira passagem) e continha DOIS diplomas nunca verificados:
--   - "Lei n.º 8/2008, de 15 de Julho (Lei das Associações)" — errado;
--     8/2008 é a Lei da Organização Tutelar de Menores. A Lei das
--     Associações é a Lei n.º 8/91, de 18 de Julho (confirmado por
--     múltiplas fontes, incluindo o Boletim da República original).
--   - "Lei n.º 23/1992, de 31 de Dezembro (Lei das Cooperativas)" —
--     errado; não há confirmação desse diploma. A Lei Geral sobre as
--     Cooperativas é a Lei n.º 23/2009, de 8 de Setembro.
--
-- Os dois diplomas corrigidos foram já actualizados directamente no
-- ficheiro assets/js/services/prompts/acta.js. Esta migração adiciona-os
-- a legal_diplomas para que possam também ser usados pelo RAG.
--
-- Texto-fonte:
--   - lei-associacoes: obtido via web_fetch de joint.org.mz (texto nativo,
--     limpo, completo — já ingerido com sucesso em dry-run, 20 artigos)
--   - lei-cooperativas: AINDA NÃO obtido — a única fonte encontrada até
--     agora (ampcm.coop) é um PDF escaneado sem OCR (mesma "Pandora Box
--     Lda." já confirmada como problemática noutro diploma na Fase 1).
--     Marcado 'nao_usar' até se conseguir um texto extraível.
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO legal_diplomas (slug, nome, numero_diploma, data_diploma, fonte_descricao, estado_verificacao, observacoes) VALUES
    ('lei-associacoes',  'Lei das Associações',                  'Lei n.º 8/91',   '18 de Julho de 1991',     'Texto obtido via web_fetch de joint.org.mz — texto nativo, limpo, completo (Boletim da República n.º 29, I série, Suplemento)', 'confirmado', 'Confirmado durante a Fase 2 ao corrigir acta.js, que citava erradamente "Lei n.º 8/2008" (na realidade, a Lei da Organização Tutelar de Menores).'),
    ('lei-cooperativas', 'Lei Geral sobre as Cooperativas',      'Lei n.º 23/2009', '8 de Setembro de 2009',   'AINDA NÃO INGERIDO — única fonte encontrada (ampcm.coop) é PDF escaneado sem OCR', 'nao_usar',   'Confirmado durante a Fase 2 ao corrigir acta.js, que citava erradamente "Lei n.º 23/1992" (sem confirmação em nenhuma fonte). Número e data correctos (23/2009, 8/9) confirmados por múltiplas fontes secundárias, mas o texto integral ainda não foi obtido em formato utilizável — marcado nao_usar até se conseguir um PDF com texto extraível ou se processar via OCR.')
ON CONFLICT (slug) DO NOTHING;
