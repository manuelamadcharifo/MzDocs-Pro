// tests/generate-document.test.js
// Testes para api/generate-document.js — cobre o ponto P5 do plano técnico
// (formato da resposta, tiers respeitados) e serve também de teste de
// regressão para a correcção P0 (raceAllProviders só corre generoso+médio
// por omissão, e só cai para reserva_ativa se o grupo primário falhar
// por completo).
//
// ATUALIZADO (P1.1 — Master Hardening, Set/2026): antes, o modo de cadeia
// (_sectionMode: true) SALTAVA por completo a verificação de JWT — este
// próprio comentário documentava isso como "estratégia" para testar a
// corrida de providers sem mockar autenticação. Essa lacuna era, na
// verdade, a vulnerabilidade P1.1 (geração de IA ilimitada e gratuita, sem
// sessão válida). Corrigida em generate-document.js — auth (JWT) e um
// "generation job" válido (ver migration_v68_generation_jobs.sql) passam a
// ser obrigatórios também em modo de cadeia. Os testes abaixo que usam
// `_sectionMode`/`_planMode` mockam agora `/auth/v1/user` e
// `/rpc/validate_generation_job` via `global.fetch`, tal como já se fazia
// no último teste do ficheiro para o caminho normal — ver
// `tests/generation-chain-security.test.js` para os testes dedicados de
// autorização (rejeição sem token, sem job, com job de outro utilizador,
// job expirado).

const handler = require('../api/generate-document');

const FAKE_JOB_ID = '11111111-2222-3333-4444-555555555555';

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

// Mock padrão de /auth/v1/user + /rpc/validate_generation_job — usado por
// todos os testes que exercitam _sectionMode/_planMode desde a correcção
// P1.1. `extraFetch(url)` permite a cada teste continuar a decidir a
// resposta dos providers de IA (Groq/Gemini/etc.) sem repetir este bloco.
function withChainAuthMocks(extraFetch) {
  return jest.fn(async (url, ...rest) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
    }
    if (u.includes('/rpc/validate_generation_job')) {
      return { ok: true, status: 200, text: async () => 'true', json: async () => true };
    }
    if (u.includes('/rpc/create_generation_job')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(FAKE_JOB_ID), json: async () => FAKE_JOB_ID };
    }
    return extraFetch(u, ...rest);
  });
}


describe('POST /api/generate-document', () => {
  // NOTA (Ago/2026): NVIDIA_API_KEY foi substituída por SAMBANOVA_API_KEY
  // como exemplo de provider de reserva (tier "reserva_ativa") nestes
  // testes — a NVIDIA NIM foi removida da lista real de providers (ver
  // api/_lib/aiProviderRegistry.js, secção "AUDITORIA Ago/2026": bloqueio
  // de conta do lado da NVIDIA, sem solução por código). Qualquer provider
  // do tier reserva_ativa serve igualmente bem para testar a lógica de
  // fallback em si — o que importa aqui é o COMPORTAMENTO (grupo primário
  // primeiro, reserva só se tudo falhar), não QUAL provider especificamente.
  const ENV_KEYS = ['GROQ_API_KEY', 'CEREBRAS_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'SAMBANOVA_API_KEY'];

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
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    global.fetch = withChainAuthMocks(() => ({ ok: false, status: 404, json: async () => ({}) }));

    const { req, res } = mockReqRes(
      { prompt: 'gera um recibo', serviceType: 'recibo', _sectionMode: true, _jobId: FAKE_JOB_ID },
      { authorization: 'Bearer fake-jwt-token' },
    );
    await handler(req, res);
    expect(res._status).toBe(503);

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test('grupo primário (generoso+médio) responde: formato da resposta mantém-se e nenhum provider de reserva é chamado', async () => {
    process.env.GROQ_API_KEY   = 'fake-groq';
    process.env.GEMINI_API_KEY = 'fake-gemini';
    process.env.SAMBANOVA_API_KEY = 'fake-sambanova'; // reserva_ativa — não deve ser tocado

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';

    const calledUrls = [];
    global.fetch = withChainAuthMocks((url) => {
      calledUrls.push(url);
      // Nota: as URLs de chat da Gemini também contêm "/models/" no path
      // (ex: .../v1beta/models/gemini-2.5-flash:generateContent) — por isso
      // os padrões mais específicos (chamada de chat) têm de ser verificados
      // ANTES do padrão genérico de descoberta de modelos.
      if (url.includes(':generateContent') || url.includes('/chat/completions')) {
        // tratado mais abaixo pelos ramos por provider
      } else if (url.endsWith('/models')) {
        return { ok: false, status: 404, json: async () => ({}) }; // descoberta falha -> usa lista curada
      }
      if (url.includes('api.groq.com')) {
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

    const { req, res } = mockReqRes(
      {
        prompt: 'Gera um recibo simples para João.',
        serviceType: 'recibo',
        _sectionMode: true,
        _jobId: FAKE_JOB_ID,
      },
      { authorization: 'Bearer fake-jwt-token' },
    );

    await handler(req, res);

    expect(res._status).toBe(200);
    // Formato da resposta ao utilizador não muda (ver P0 no plano técnico).
    expect(res._json).toEqual(expect.objectContaining({
      document: expect.any(String),
      model: expect.stringContaining('Groq'),
    }));
    expect(res._json.document).toContain('Documento gerado com sucesso.');

    // Nenhum pedido foi feito à SambaNova (reserva_ativa) — o grupo primário
    // já tinha um vencedor, o fallback nunca deveria ser accionado.
    const reserveCalled = calledUrls.some(u => u.includes('api.sambanova.ai'));
    expect(reserveCalled).toBe(false);

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test('fallback: se generoso+médio falharem por completo, usa reserva_ativa (e reporta o provider correcto)', async () => {
    process.env.GROQ_API_KEY   = 'fake-groq';
    process.env.CEREBRAS_API_KEY = 'fake-cerebras';
    process.env.GEMINI_API_KEY = 'fake-gemini';
    process.env.SAMBANOVA_API_KEY = 'fake-sambanova';

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';

    const calledUrls = [];
    global.fetch = withChainAuthMocks((url) => {
      calledUrls.push(url);
      const isChatCall = url.includes(':generateContent') || url.includes('/chat/completions');
      if (!isChatCall && url.endsWith('/models')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes('api.sambanova.ai')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            model: 'Meta-Llama-3.3-70B-Instruct',
            choices: [{ message: { content: 'Recibo gerado pela reserva.' } }],
            usage: { prompt_tokens: 5, completion_tokens: 15 },
          }),
        };
      }
      // Todos os providers do grupo primário (groq, cerebras, gemini) falham.
      return { ok: false, status: 500, json: async () => ({ error: { message: 'esgotado' } }) };
    });

    const { req, res } = mockReqRes(
      {
        prompt: 'Gera uma procuração.',
        serviceType: 'procuracao',
        _sectionMode: true,
        _jobId: FAKE_JOB_ID,
      },
      { authorization: 'Bearer fake-jwt-token' },
    );

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.model).toContain('SambaNova');
    expect(res._json.document).toContain('Recibo gerado pela reserva.');

    // Confirma que o grupo primário FOI tentado antes do fallback (não se
    // salta directamente para a reserva).
    expect(calledUrls.some(u => u.includes('api.groq.com'))).toBe(true);
    expect(calledUrls.some(u => u.includes('generativelanguage.googleapis.com'))).toBe(true);

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
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
