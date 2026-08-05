// tests/generate-document.test.js
// Testes para api/generate-document.js — cobre o ponto P5 do plano técnico
// (formato da resposta, tiers respeitados) e serve também de teste de
// regressão para a correcção P0 (raceAllProviders só corre generoso+médio
// por omissão, e só cai para reserva_ativa se o grupo primário falhar
// por completo).
//
// Estratégia: usa modo de cadeia (_sectionMode: true), que no código real
// SALTA a verificação de JWT (ver generate-document.js: o bloco de auth só
// corre quando `!isChainCall && !isPreview`) — isto permite testar a
// corrida de providers sem precisar de configurar SUPABASE_URL/SERVICE_KEY
// nem mockar getUserFromToken. global.fetch é mockado para simular os
// providers reais (chat/completions e endpoints /models de descoberta).

const handler = require('../api/generate-document');

function mockReqRes(body, headers = {}) {
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  };
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; },
    end() { return this; },
  };
  return { req, res };
}

describe('POST /api/generate-document', () => {
  const ENV_KEYS = ['GROQ_API_KEY', 'CEREBRAS_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY'];

  beforeEach(() => {
    jest.resetAllMocks();
    ENV_KEYS.forEach(k => delete process.env[k]);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  test('devolve 400 quando falta o prompt', async () => {
    process.env.GROQ_API_KEY = 'fake';
    const { req, res } = mockReqRes({ serviceType: 'recibo', _sectionMode: true });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('devolve 503 quando nenhuma API key de provider está configurada', async () => {
    const { req, res } = mockReqRes({ prompt: 'gera um recibo', _sectionMode: true });
    await handler(req, res);
    expect(res._status).toBe(503);
  });

  test('grupo primário (generoso+médio) responde: formato da resposta mantém-se e nenhum provider de reserva é chamado', async () => {
    process.env.GROQ_API_KEY   = 'fake-groq';
    process.env.GEMINI_API_KEY = 'fake-gemini';
    process.env.NVIDIA_API_KEY = 'fake-nvidia'; // reserva_ativa — não deve ser tocado

    const calledUrls = [];
    global.fetch = jest.fn(async (url) => {
      calledUrls.push(String(url));
      // Nota: as URLs de chat da Gemini também contêm "/models/" no path
      // (ex: .../v1beta/models/gemini-2.5-flash:generateContent) — por isso
      // os padrões mais específicos (chamada de chat) têm de ser verificados
      // ANTES do padrão genérico de descoberta de modelos.
      if (String(url).includes(':generateContent') || String(url).includes('/chat/completions')) {
        // tratado mais abaixo pelos ramos por provider
      } else if (String(url).endsWith('/models')) {
        return { ok: false, status: 404, json: async () => ({}) }; // descoberta falha -> usa lista curada
      }
      if (String(url).includes('api.groq.com')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            model: 'openai/gpt-oss-120b',
            choices: [{ message: { content: 'Documento gerado com sucesso.' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        };
      }
      // Gemini não deveria sequer vencer a corrida se o Groq responder primeiro,
      // mas mantém-se disponível para não rebentar caso a ordem varie.
      return { ok: false, status: 500, json: async () => ({ error: { message: 'indisponível' } }) };
    });

    const { req, res } = mockReqRes({
      prompt: 'Gera um recibo simples para João.',
      serviceType: 'recibo',
      _sectionMode: true,
    });

    await handler(req, res);

    expect(res._status).toBe(200);
    // Formato da resposta ao utilizador não muda (ver P0 no plano técnico).
    expect(res._json).toEqual(expect.objectContaining({
      document: expect.any(String),
      model: expect.stringContaining('Groq'),
    }));
    expect(res._json.document).toContain('Documento gerado com sucesso.');

    // Nenhum pedido foi feito à NVIDIA (reserva_ativa) — o grupo primário
    // já tinha um vencedor, o fallback nunca deveria ser accionado.
    const nvidiaCalled = calledUrls.some(u => u.includes('integrate.api.nvidia.com'));
    expect(nvidiaCalled).toBe(false);
  });

  test('fallback: se generoso+médio falharem por completo, usa reserva_ativa (e reporta o provider correcto)', async () => {
    process.env.GROQ_API_KEY   = 'fake-groq';
    process.env.CEREBRAS_API_KEY = 'fake-cerebras';
    process.env.GEMINI_API_KEY = 'fake-gemini';
    process.env.NVIDIA_API_KEY = 'fake-nvidia';

    const calledUrls = [];
    global.fetch = jest.fn(async (url) => {
      calledUrls.push(String(url));
      const isChatCall = String(url).includes(':generateContent') || String(url).includes('/chat/completions');
      if (!isChatCall && String(url).endsWith('/models')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (String(url).includes('integrate.api.nvidia.com')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            model: 'meta/llama-3.3-70b-instruct',
            choices: [{ message: { content: 'Recibo gerado pela reserva.' } }],
            usage: { prompt_tokens: 5, completion_tokens: 15 },
          }),
        };
      }
      // Todos os providers do grupo primário (groq, cerebras, gemini) falham.
      return { ok: false, status: 500, json: async () => ({ error: { message: 'esgotado' } }) };
    });

    const { req, res } = mockReqRes({
      prompt: 'Gera uma procuração.',
      serviceType: 'procuracao',
      _sectionMode: true,
    });

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.model).toContain('NVIDIA');
    expect(res._json.document).toContain('Recibo gerado pela reserva.');

    // Confirma que o grupo primário FOI tentado antes do fallback (não se
    // salta directamente para a reserva).
    expect(calledUrls.some(u => u.includes('api.groq.com'))).toBe(true);
    expect(calledUrls.some(u => u.includes('generativelanguage.googleapis.com'))).toBe(true);
  });

  test('reembolsa o crédito automaticamente quando TODOS os providers falham (fora de modo cadeia/preview)', async () => {
    process.env.GROQ_API_KEY = 'fake-groq';

    // getUserFromToken() lê a resposta via res.json(), mas rpc()/restRequest()
    // lêem via res.text() — os dois mocks abaixo têm de dar as duas formas.
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/models')) return { ok: false, status: 404, json: async () => ({}) };
      if (String(url).includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
      }
      if (String(url).includes('rpc/refund_credit')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(7) };
      }
      return { ok: false, status: 500, json: async () => ({ error: { message: 'falha' } }) };
    });

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';

    const { req, res } = mockReqRes(
      { prompt: 'Gera um contrato de arrendamento.', serviceType: 'arrendamento', cost: 1, creditsRemaining: 6 },
      { authorization: 'Bearer fake-jwt-token' },
    );

    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._json.refunded).toBe(true);
    expect(res._json.creditsRemaining).toBe(7);

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});
