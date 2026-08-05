// tests/rag.test.js
// Testes para api/_lib/legalSearch.js — o motor RAG (Fase 2 — Motor
// Jurídico). Cobre o ponto P5 do plano técnico ("motor RAG responde com
// fonte citada"). api/_lib/supabaseAdmin é mockado (só o helper `rpc` é
// usado por este módulo) e global.fetch é mockado para simular a resposta
// de embeddings do Gemini — sem rede real.

jest.mock('../api/_lib/supabaseAdmin', () => ({
  rpc: jest.fn(),
}));

const { rpc } = require('../api/_lib/supabaseAdmin');
const { buscarArtigosRelevantes, SIMILARITY_THRESHOLD } = require('../api/_lib/legalSearch');

function mockEmbeddingFetch() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ embedding: { values: new Array(768).fill(0.01) } }),
  }));
}

describe('buscarArtigosRelevantes (motor RAG jurídico)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'fake-gemini-key';
    mockEmbeddingFetch();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  test('lança erro claro quando GEMINI_API_KEY não está configurada', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(buscarArtigosRelevantes('procuração para venda de imóvel')).rejects.toThrow(/GEMINI_API_KEY/);
  });

  test('devolve os artigos com a sua fonte (diploma + número do artigo) citada — nunca texto sem proveniência', async () => {
    rpc.mockResolvedValue([
      {
        diploma_nome: 'Código Civil', diploma_slug: 'codigo-civil',
        artigo_numero: '262', artigo_titulo: 'Procuração', texto: 'A procuração é o acto...',
        similarity: 0.81, estado_verificacao: 'verificado',
      },
    ]);

    const { resultados, avisoQualidade } = await buscarArtigosRelevantes('procuração para venda de imóvel');

    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toEqual(expect.objectContaining({
      diploma: 'Código Civil', diplomaSlug: 'codigo-civil', artigo: '262',
    }));
    expect(avisoQualidade).toBe(false);
    expect(rpc).toHaveBeenCalledWith('match_legal_chunks', expect.objectContaining({
      match_count: 4, diploma_slugs: null,
    }));
  });

  test('filtra resultados abaixo do limiar de confiança (não cita artigos pouco relacionados)', async () => {
    rpc.mockResolvedValue([
      { diploma_nome: 'A', diploma_slug: 'a', artigo_numero: '1', artigo_titulo: 't', texto: 'x', similarity: 0.9, estado_verificacao: 'verificado' },
      { diploma_nome: 'B', diploma_slug: 'b', artigo_numero: '2', artigo_titulo: 't', texto: 'y', similarity: SIMILARITY_THRESHOLD - 0.01, estado_verificacao: 'verificado' },
    ]);

    const { resultados } = await buscarArtigosRelevantes('falsas declarações em declaração de residência');

    expect(resultados).toHaveLength(1);
    expect(resultados[0].diploma).toBe('A');
  });

  test('sinaliza avisoQualidade quando algum resultado vem de um diploma com verificação parcial', async () => {
    rpc.mockResolvedValue([
      { diploma_nome: 'C', diploma_slug: 'c', artigo_numero: '5', artigo_titulo: 't', texto: 'z', similarity: 0.7, estado_verificacao: 'parcial' },
    ]);

    const { resultados, avisoQualidade } = await buscarArtigosRelevantes('arrendamento de terreno');

    expect(avisoQualidade).toBe(true);
    expect(resultados[0].qualidadeReduzida).toBe(true);
  });

  test('devolve lista vazia (sem inventar artigos) quando nada ultrapassa o limiar', async () => {
    rpc.mockResolvedValue([
      { diploma_nome: 'D', diploma_slug: 'd', artigo_numero: '9', artigo_titulo: 't', texto: 'w', similarity: 0.1, estado_verificacao: 'verificado' },
    ]);

    const { resultados, avisoQualidade } = await buscarArtigosRelevantes('assunto sem correspondência na base legal');

    expect(resultados).toEqual([]);
    expect(avisoQualidade).toBe(false);
  });

  test('respeita opts.diplomaSlugs e opts.matchCount ao chamar match_legal_chunks', async () => {
    rpc.mockResolvedValue([]);
    await buscarArtigosRelevantes('lei das cooperativas', { diplomaSlugs: ['lei-cooperativas'], matchCount: 2 });

    expect(rpc).toHaveBeenCalledWith('match_legal_chunks', expect.objectContaining({
      match_count: 2, diploma_slugs: ['lei-cooperativas'],
    }));
  });

  test('lança erro claro quando match_legal_chunks devolve um formato inesperado (ex.: migração v19 em falta)', async () => {
    rpc.mockResolvedValue({ not: 'an array' });
    await expect(buscarArtigosRelevantes('teste')).rejects.toThrow(/match_legal_chunks/);
  });
});
