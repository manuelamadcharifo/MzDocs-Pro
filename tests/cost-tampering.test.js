// tests/cost-tampering.test.js
// P20 (Master Hardening & Release Gate v2, Set/2026) — "cost" NÃO PODE SER
// CONTROLADO PELO CLIENTE.
//
// PROBLEMA (ver comentário completo em api/_lib/pricingRegistry.js):
// api/_services/account.js (handleDeductCredit) tinha:
//
//   const rawCost = parseInt(body?.cost);
//   const cost    = VALID_COSTS.includes(rawCost) ? rawCost : 1;
//
// `VALID_COSTS` era só um intervalo (1-10), sem qualquer ligação ao
// `documentType` real — um cliente podia pedir um documento caro
// (ex.: "procuracao", 3 créditos) e enviar `cost: 1`, pagando muito menos
// do que o preço de catálogo. O mesmo valia para templates pagos do
// marketplace. Estes testes provam que, depois da correcção, o valor
// realmente debitado (RPC `p_amount`) vem SEMPRE do registo de preços do
// servidor (api/_lib/pricingRegistry.js), nunca de `body.cost`.

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
const { handleDeductCredit: handler } = require('../api/_services/account');

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

describe('P20 — custo oficial nunca vem do cliente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    supabaseAdmin.getUserFromToken.mockResolvedValue({ user: { id: 'user-1' }, error: null });
    // Perfil "normal": já usou o crédito grátis de boas-vindas antigo,
    // não bloqueado, sem expiração — cai sempre no caminho pago normal.
    supabaseAdmin.selectOne.mockImplementation(async (table) => {
      if (table === 'profiles') {
        return { is_blocked: false, credits_expires_at: null, account_type: 'normal', free_credit_used: true };
      }
      return null;
    });
    supabaseAdmin.restRequest.mockResolvedValue([]); // sem transacção anterior -> creditSource='paid'
    supabaseAdmin.insert.mockResolvedValue({});
    // grant_free_document() indisponível/negado nestes testes — sempre cai
    // para a dedução paga normal, que é o que queremos exercitar aqui.
    supabaseAdmin.rpc.mockImplementation(async (fn) => {
      if (fn === 'grant_free_document') return false;
      if (fn === 'deduct_credits') return 999; // saldo "após dedução" — irrelevante para estes testes
      return null;
    });
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test.each([
    ['procuracao', 3, 1],        // custo real 3, cliente tenta pagar 1
    ['cv', 2, 999999],           // custo real 2, cliente tenta pagar quase 1 milhão de créditos... a menos
    ['recibo', 1, -1],           // custo real 1, cliente tenta pagar -1
    ['acta', 3, 0],              // custo real 3, cliente tenta pagar 0
    ['prestacao', 3, NaN],       // custo real 3, cliente envia NaN
  ])('documentType=%s → cobra sempre o custo oficial (%d), ignorando body.cost=%p', async (documentType, officialCost, fakeCost) => {
    const { req, res } = mockReqRes({ cost: fakeCost, documentType });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount:  officialCost,
    });
  });

  test('documentType=cv com cost=null → cobra o custo oficial (2), não o custo por omissão (1)', async () => {
    const { req, res } = mockReqRes({ cost: null, documentType: 'cv' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount:  2,
    });
  });

  test('documentType desconhecido → usa o custo por omissão (1), nunca o cost do cliente', async () => {
    const { req, res } = mockReqRes({ cost: 7, documentType: 'servico-inexistente' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount:  1,
    });
  });

  test('chargeType=extra_page em serviço de geração longa → sempre 1 crédito fixo, mesmo se body.cost pedir mais', async () => {
    const { req, res } = mockReqRes({ cost: 5, documentType: 'trabalho', chargeType: 'extra_page' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount:  1,
    });
  });

  test('chargeType=extra_page num serviço QUE NÃO é de geração longa → 400, rejeitado (não é forma de pagar menos)', async () => {
    // Ataque: usar chargeType=extra_page para forçar o custo fixo de 1
    // crédito num serviço cujo preço de catálogo é maior (ex.: procuracao
    // custa 3). Sem esta validação, isto seria uma forma alternativa de
    // contornar o registo de preços.
    const { req, res } = mockReqRes({ cost: 1, documentType: 'procuracao', chargeType: 'extra_page' });
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.code).toBe('INVALID_CHARGE_TYPE');
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith('deduct_credits', expect.anything());
  });

  test('compra de template pago → custo vem de templates_custom.credit_cost, nunca de body.cost', async () => {
    supabaseAdmin.selectOne.mockImplementation(async (table, col, val, fields) => {
      if (table === 'profiles') {
        return { is_blocked: false, credits_expires_at: null, account_type: 'normal', free_credit_used: true };
      }
      if (table === 'templates_custom') {
        return { credit_cost: 8 }; // preço real do template no servidor
      }
      return null;
    });

    const templateId = '11111111-2222-3333-4444-555555555555';
    const { req, res } = mockReqRes({ cost: 1, documentType: `template_${templateId}` });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount:  8,
    });
  });

  test('transcricao (custo por página OCR) continua a aceitar body.cost dentro de 1-10 — limitação pré-existente, documentada, não uma regressão', async () => {
    // NOTA: ao contrário dos outros serviços, "transcricao" cobra por
    // página FOTOGRAFADA (OCR) — um valor que só existe no cliente
    // (docModel.ocrPageCount). O servidor não tem hoje forma independente
    // de o verificar, por isso continua a confiar em body.cost, dentro do
    // intervalo de sanidade 1-10 (exactamente como antes desta ronda) — ver
    // CLIENT_ESTIMATED_SERVICES em api/_lib/pricingRegistry.js.
    const { req, res } = mockReqRes({ cost: 4, documentType: 'transcricao' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount:  4,
    });
  });

  test('reembolso (refund=true) continua a aceitar o cost do cliente dentro de 1-10 (comportamento inalterado, fora do âmbito do P20)', async () => {
    supabaseAdmin.rpc.mockImplementation(async (fn) => {
      if (fn === 'refund_credit') return 5;
      return null;
    });

    const { req, res } = mockReqRes({ refund: true, cost: 3, documentType: 'cv' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('refund_credit', {
      p_user_id: 'user-1',
      p_amount:  3,
    });
  });
});
