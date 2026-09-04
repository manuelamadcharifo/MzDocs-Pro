// tests/generation-chain-security.test.js
// P1.1 (Master Hardening & Release Gate v2, Set/2026) — testes dedicados de
// autorização da geração em cadeia (_planMode / _sectionMode).
//
// PROBLEMA (ver comentário completo em api/generate-document.js): antes
// desta correcção, qualquer pedido com `_planMode:true` ou
// `_sectionMode:true` escapava por completo à verificação de JWT — gerava
// conteúdo de IA real, ilimitado e gratuito, sem sessão válida. Estes
// testes provam que:
//   1. Nenhum modo de cadeia funciona sem um JWT válido.
//   2. `_sectionMode` exige um `_jobId` válido, criado antes por
//      `_planMode` para o MESMO utilizador autenticado.
//   3. Um job pertencente a outro utilizador, malformado, ou que a RPC
//      rejeite (expirado/concluído) é sempre recusado.
//   4. Se a infra-estrutura de jobs estiver indisponível (RPC falha), o
//      servidor falha FECHADO (503), nunca aberto.

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

// Cada teste usa um token distinto para não partilhar o mesmo balde de
// rate-limit local (chave = últimos 16 caracteres do header Authorization
// — ver checkRateLimit() em generate-document.js).
let _tokenSeq = 0;
function freshAuthHeaders() {
  _tokenSeq += 1;
  return { authorization: `Bearer fake-jwt-token-${'x'.repeat(16)}-${_tokenSeq}` };
}

describe('P1.1 — autorização da geração em cadeia', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GROQ_API_KEY = 'fake-groq';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test('_planMode SEM token de autenticação → 401 (nunca gera conteúdo)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('NENHUM pedido de rede deveria acontecer sem autenticação.');
    });

    const { req, res } = mockReqRes({
      serviceType: '__plan__',
      prompt:      'planeia um trabalho',
      _planMode:   true,
      _chainService: 'trabalho',
    });

    await handler(req, res);

    expect(res._status).toBe(401);
    expect(res._json.code).toBe('AUTH_REQUIRED');
  });

  test('_sectionMode SEM token de autenticação → 401 (nunca gera conteúdo)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('NENHUM pedido de rede deveria acontecer sem autenticação.');
    });

    const { req, res } = mockReqRes({
      serviceType:  '__section__',
      prompt:       'escreve a secção 1',
      _sectionMode: true,
      _jobId:       '11111111-2222-3333-4444-555555555555',
    });

    await handler(req, res);

    expect(res._status).toBe(401);
    expect(res._json.code).toBe('AUTH_REQUIRED');
  });

  test('_sectionMode COM token válido mas SEM _jobId → 403, nenhum provider é chamado', async () => {
    const providerCalls = [];
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
      }
      providerCalls.push(u);
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes(
      { serviceType: '__section__', prompt: 'escreve a secção 1', _sectionMode: true },
      freshAuthHeaders(),
    );

    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json.code).toBe('INVALID_GENERATION_JOB');
    expect(providerCalls.some(u => u.includes('groq'))).toBe(false);
  });

  test('_sectionMode com _jobId malformado (não-UUID) → 403', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes(
      { serviceType: '__section__', prompt: 'x', _sectionMode: true, _jobId: 'não-e-um-uuid' },
      freshAuthHeaders(),
    );

    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json.code).toBe('INVALID_GENERATION_JOB');
  });

  test('_sectionMode com _jobId de OUTRO utilizador (RPC devolve false) → 403', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-atacante' }) };
      }
      if (u.includes('/rpc/validate_generation_job')) {
        // Simula: job existe mas pertence a outro user_id, ou já expirou —
        // a RPC no servidor real faz este WHERE user_id=... AND expires_at>now().
        return { ok: true, status: 200, text: async () => 'false', json: async () => false };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes(
      {
        serviceType:  '__section__',
        prompt:       'escreve a secção 1',
        _sectionMode: true,
        _jobId:       '11111111-2222-3333-4444-555555555555', // job real, mas não deste utilizador
      },
      freshAuthHeaders(),
    );

    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json.code).toBe('INVALID_GENERATION_JOB');
  });

  test('_planMode com token válido → cria job e devolve jobId ao cliente', async () => {
    const FAKE_JOB_ID = '99999999-8888-7777-6666-555555555555';
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
      }
      if (u.includes('/rpc/create_generation_job')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(FAKE_JOB_ID), json: async () => FAKE_JOB_ID };
      }
      if (u.endsWith('/models')) return { ok: false, status: 404, json: async () => ({}) };
      if (u.includes('api.groq.com')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            model: 'openai/gpt-oss-120b',
            choices: [{ message: { content: '{"sections":[{"id":"intro","title":"Intro"}]}' } }],
            usage: { prompt_tokens: 5, completion_tokens: 5 },
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes(
      { serviceType: '__plan__', prompt: 'planeia um trabalho', _planMode: true, _chainService: 'trabalho' },
      freshAuthHeaders(),
    );

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.jobId).toBe(FAKE_JOB_ID);
  });

  test('_planMode falha FECHADO (503) quando create_generation_job está indisponível', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
      }
      if (u.includes('/rpc/create_generation_job')) {
        // Migração ainda não aplicada nesse ambiente — a RPC nem existe.
        return { ok: false, status: 404, text: async () => 'function not found' };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes(
      { serviceType: '__plan__', prompt: 'planeia um trabalho', _planMode: true, _chainService: 'trabalho' },
      freshAuthHeaders(),
    );

    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._json.code).toBe('GENERATION_JOB_UNAVAILABLE');
  });

  test('_sectionMode falha FECHADO (503) quando validate_generation_job está indisponível', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123' }) };
      }
      if (u.includes('/rpc/validate_generation_job')) {
        return { ok: false, status: 404, text: async () => 'function not found' };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes(
      {
        serviceType: '__section__', prompt: 'x', _sectionMode: true,
        _jobId: '11111111-2222-3333-4444-555555555555',
      },
      freshAuthHeaders(),
    );

    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._json.code).toBe('GENERATION_JOB_UNAVAILABLE');
  });

  test('_previewMode continua a funcionar sem sessão (comportamento intencional, inalterado)', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/models')) return { ok: false, status: 404, json: async () => ({}) };
      if (u.includes('api.groq.com')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            model: 'openai/gpt-oss-120b',
            choices: [{ message: { content: 'Amostra grátis.' } }],
            usage: { prompt_tokens: 5, completion_tokens: 5 },
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { req, res } = mockReqRes({
      serviceType: 'recibo', prompt: 'gera uma amostra', _previewMode: true,
    });

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.preview).toBe(true);
  });
});
