// tests/credit-expiry.test.js
// Testes para api/cleanup-temp-accounts.js — cobre o ponto P5 do plano
// técnico ("expiração do ledger, se P2 feita"). A expiração REAL do lote
// de créditos vive em SQL (supabase/migration_v52_credit_ledger.sql,
// função expire_credit_batches()) e não pode ser testada aqui sem uma
// base de dados Postgres real — o que este teste cobre é o lado do
// servidor Node que CHAMA essa função pelo cron diário: autenticação do
// cron, contagem de contas afectadas devolvida ao chamador, e a
// degradação segura, que a migração v52 promete (se a expiração falhar,
// as restantes regras de limpeza continuam a correr).

jest.mock('../api/_lib/supabaseAdmin', () => ({
  restRequest:     jest.fn(),
  adminDeleteUser: jest.fn(),
  rpc:             jest.fn(),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
// CORRIGIDO (consolidação de Serverless Functions, Ago/2026): api/cleanup-
// temp-accounts.js foi absorvido por api/_services/account.js (rota pública
// /api/cleanup-temp-accounts continua igual, chamada agora via
// /api/account?_op=cleanup-temp-accounts — ver vercel.json). O teste passa
// a importar o handler nomeado do novo local; nenhuma asserção mudou.
const { handleCleanupTempAccounts: handler } = require('../api/_services/account');

function mockReqRes(headers = {}) {
  const req = { method: 'POST', headers: { 'x-cron-secret': 'test-secret', ...headers } };
  const res = {
    _status: 200,
    _json: null,
    setHeader() {},
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; },
    end() { return this; },
  };
  return { req, res };
}

describe('POST /api/cleanup-temp-accounts (expiração de créditos por lote — P2/v52)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    supabaseAdmin.restRequest.mockResolvedValue([]); // sem contas avulso a limpar, por omissão
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test('rejeita pedidos sem o segredo de cron correcto', async () => {
    const { req, res } = mockReqRes({ 'x-cron-secret': 'errado' });
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  test('chama expire_credit_batches() e devolve o número de contas afectadas', async () => {
    supabaseAdmin.rpc.mockResolvedValue(3); // 3 contas tinham lotes vencidos

    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('expire_credit_batches', {});
    expect(res._json.results.accounts_credits_expired).toBe(3);
    expect(res._json.results.errors).toEqual([]);
  });

  test('devolve 0 contas afectadas quando nenhum lote está vencido (nada a expirar hoje)', async () => {
    supabaseAdmin.rpc.mockResolvedValue(0);

    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res._json.results.accounts_credits_expired).toBe(0);
  });

  test('degradação segura: se expire_credit_batches() falhar, o cron não rebenta e regista o erro em vez de bloquear as outras regras', async () => {
    supabaseAdmin.rpc.mockRejectedValue(new Error('função expire_credit_batches indisponível'));

    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res._status).toBe(200); // o pedido continua a ter sucesso global
    expect(res._json.results.accounts_credits_expired).toBe(0);
    expect(res._json.results.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'expire_credit_batches' })])
    );
  });

  test('regra 1 (contas Avulso com 0 créditos há mais de 24h) continua a correr independentemente da expiração de créditos', async () => {
    supabaseAdmin.restRequest.mockImplementation(async (path) => {
      if (path.includes('account_type=eq.avulso&credits=eq.0')) return [{ id: 'acc-zero' }];
      return [];
    });
    supabaseAdmin.adminDeleteUser.mockResolvedValue(true);
    supabaseAdmin.rpc.mockResolvedValue(1);

    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res._json.results.deleted_zero_credits).toBe(1);
    expect(supabaseAdmin.adminDeleteUser).toHaveBeenCalledWith('acc-zero');
  });
});
