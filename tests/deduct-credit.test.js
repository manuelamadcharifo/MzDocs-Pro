// tests/deduct-credit.test.js
// Testes para api/deduct-credit.js — cobre o ponto P5 do plano técnico
// ("atribuição de créditos, reembolso automático por falha técnica").
// api/_lib/supabaseAdmin é mockado por completo (jest.mock) para que estes
// testes corram sem rede e sem Supabase real — só a lógica de negócio do
// próprio handler é exercitada.

jest.mock('../api/_lib/supabaseAdmin', () => ({
  getUserFromToken: jest.fn(),
  selectOne:        jest.fn(),
  update:           jest.fn(),
  insert:           jest.fn(),
  rpc:              jest.fn(),
  restRequest:      jest.fn(),
  adminDeleteUser:  jest.fn(),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const handler = require('../api/deduct-credit');

function mockReqRes(body, headers = {}) {
  const req = { method: 'POST', headers: { authorization: 'Bearer fake-jwt', ...headers }, body };
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

describe('POST /api/deduct-credit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    supabaseAdmin.getUserFromToken.mockResolvedValue({ user: { id: 'user-1' }, error: null });
    supabaseAdmin.selectOne.mockResolvedValue({
      is_blocked: false, credits_expires_at: null, account_type: 'normal', free_credit_used: true,
    });
    supabaseAdmin.restRequest.mockResolvedValue([]); // nenhuma transacção anterior -> creditSource='paid'
    supabaseAdmin.insert.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test('devolve 401 sem token de autenticação', async () => {
    const { req, res } = mockReqRes({ cost: 1 }, { authorization: '' });
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('deduz créditos com sucesso via RPC deduct_credits', async () => {
    supabaseAdmin.rpc.mockResolvedValue(4); // saldo restante após dedução

    const { req, res } = mockReqRes({ cost: 1, documentType: 'recibo' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(expect.objectContaining({ success: true, credits: 4 }));
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', { p_user_id: 'user-1', p_amount: 1 });
  });

  test('devolve 402 (créditos insuficientes) quando o RPC devolve -1', async () => {
    supabaseAdmin.rpc.mockResolvedValue(-1);

    const { req, res } = mockReqRes({ cost: 2 });
    await handler(req, res);

    expect(res._status).toBe(402);
    expect(res._json.code).toBe('INSUFFICIENT_CREDITS');
  });

  test('ignora custos fora do intervalo válido (1-10) e usa 1 por omissão', async () => {
    supabaseAdmin.rpc.mockResolvedValue(9);

    const { req, res } = mockReqRes({ cost: 999 });
    await handler(req, res);

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', { p_user_id: 'user-1', p_amount: 1 });
  });

  test('bloqueia contas marcadas como is_blocked antes de tentar deduzir', async () => {
    supabaseAdmin.selectOne.mockResolvedValue({ is_blocked: true });

    const { req, res } = mockReqRes({ cost: 1 });
    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json.code).toBe('ACCOUNT_BLOCKED');
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  test('usa fallback com optimistic locking quando o RPC deduct_credits falha', async () => {
    supabaseAdmin.rpc.mockRejectedValue(new Error('função RPC indisponível'));
    supabaseAdmin.selectOne
      .mockResolvedValueOnce({ is_blocked: false, credits_expires_at: null, account_type: 'normal', free_credit_used: true })
      .mockResolvedValueOnce({ credits: 5, is_temp: false, account_type: 'normal' });
    supabaseAdmin.update.mockResolvedValue([{ id: 'user-1', credits: 4 }]); // 1 linha afectada = sucesso

    const { req, res } = mockReqRes({ cost: 1 });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(expect.objectContaining({ success: true, credits: 4, source: 'supabase_fallback' }));
  });

  test('fallback devolve 409 (conflito) quando o optimistic lock não afecta nenhuma linha', async () => {
    supabaseAdmin.rpc.mockRejectedValue(new Error('função RPC indisponível'));
    supabaseAdmin.selectOne
      .mockResolvedValueOnce({ is_blocked: false, credits_expires_at: null, account_type: 'normal', free_credit_used: true })
      .mockResolvedValueOnce({ credits: 5, is_temp: false, account_type: 'normal' });
    supabaseAdmin.update.mockResolvedValue([]); // 0 linhas afectadas = outra escrita concorrente ganhou

    const { req, res } = mockReqRes({ cost: 1 });
    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.code).toBe('RACE_CONDITION');
  });

  // ── Modo reembolso (chamado automaticamente por generate-document.js) ────
  test('reembolso: devolve créditos ao utilizador via RPC refund_credit', async () => {
    supabaseAdmin.rpc.mockResolvedValue(8); // saldo depois de devolver o crédito

    const { req, res } = mockReqRes({ refund: true, cost: 1, documentType: 'recibo' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(expect.objectContaining({ success: true, refunded: true, credits: 8 }));
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('refund_credit', { p_user_id: 'user-1', p_amount: 1 });
  });

  test('reembolso cai em fallback manual (ler + somar) quando o RPC refund_credit falha', async () => {
    supabaseAdmin.rpc.mockRejectedValue(new Error('RPC indisponível'));
    supabaseAdmin.selectOne.mockResolvedValue({ credits: 3 });
    supabaseAdmin.update.mockResolvedValue({});

    const { req, res } = mockReqRes({ refund: true, cost: 2 });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(expect.objectContaining({ success: true, refunded: true, credits: 5 }));
  });
});
