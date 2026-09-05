// tests/finance-unit-economics.test.js
// P1.11 (Master Hardening & Release Gate v2, Set/2026, Fase 6) — economia
// unitária ("quanto ganho por cada 1000 documentos?").
//
// Prova a matemática de api/admin/index.js → handleFinance(sub=unit-economics)
// com dados controlados: 1 transacção (1000 MZN, 60 créditos), 500 créditos
// consumidos, 250 documentos gerados, 1 comissão de afiliado acumulada
// (100 MZN), orçamento de IA de 20 USD/mês (câmbio mockado a 64 MZN/USD),
// taxa de pagamento 6.5% e taxa de imposto 0% (por defeito).

jest.mock('../api/_lib/supabaseAdmin', () => ({
  getUserFromToken: jest.fn(),
  selectOne:        jest.fn(),
  update:           jest.fn(),
  insert:           jest.fn(),
  del:              jest.fn(),
  upsert:           jest.fn(),
  rpc:              jest.fn(),
  countRows:        jest.fn(),
  restRequest:      jest.fn(),
  adminGetUserById:      jest.fn(),
  adminUpdateUserById:   jest.fn(),
  adminCreateUser:       jest.fn(),
  adminDeleteUser:       jest.fn(),
  storageUpload:         jest.fn(),
  storageGetPublicUrl:   jest.fn(),
  storageCreateSignedUrl:  jest.fn(),
  storageCreateSignedUrls: jest.fn(),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const handler = require('../api/admin/index.js');

function mockReqRes(query) {
  const req = {
    method:  'GET',
    url:     '/api/admin?action=finance',
    query:   { action: 'finance', sub: 'unit-economics', ...query },
    headers: { authorization: 'Bearer admin-token' },
  };
  const res = {
    _status: 200,
    _json:   null,
    setHeader() {},
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; },
    end() { return this; },
  };
  return { req, res };
}

describe('P1.11 — GET /api/admin?action=finance&sub=unit-economics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabaseAdmin.getUserFromToken.mockResolvedValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } },
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { MZN: 64 } }),
    });

    supabaseAdmin.restRequest.mockImplementation(async (path) => {
      if (path.startsWith('transactions?')) {
        return [{ amount: 1000, credits: 60 }];
      }
      if (path.startsWith('credit_logs?')) {
        return [
          { credits: -400, document_type: 'cv' },
          { credits: -100, document_type: 'carta' },
        ];
      }
      if (path.startsWith('affiliate_commissions?')) {
        return [{ commission_mzn: 100 }];
      }
      if (path.startsWith('template_sales?')) {
        return [{ amount_mzn: 50, author_share_mzn: 35 }];
      }
      if (path.includes('key=in.') && path.includes('finance_')) {
        return [
          { key: 'finance_ai_monthly_usd',    value: '20' },
          { key: 'finance_payment_fee_pct',   value: '6.5' },
        ];
      }
      if (path.includes('key=in.') && path.includes('fiscal_')) {
        return [];
      }
      return [];
    });

    supabaseAdmin.countRows.mockResolvedValue(250);
  });

  test('calcula receita, custos e margem por documento correctamente', async () => {
    const { req, res } = mockReqRes({ start: '2026-09-01', end: '2026-09-30' });
    await handler(req, res);

    expect(res._status).toBe(200);
    const body = res._json;
    expect(body.success).toBe(true);

    expect(body.revenue.total_mzn).toBe(1000);
    expect(body.credits.sold).toBe(60);
    expect(body.credits.consumed).toBe(500);
    expect(body.credits.consumed_by_service).toEqual({ cv: 400, carta: 100 });
    expect(body.documents_generated).toBe(250);

    // IA: 20 USD/mês * 64 MZN/USD = 1280 MZN/mês, prorateado por 30/30 dias
    // (Set/2026 tem 30 dias completos no intervalo pedido) = 1280 MZN.
    expect(body.costs.ai_mzn).toBeCloseTo(1280, 0);
    // Pagamento: 1000 * 6.5% = 65 MZN.
    expect(body.costs.payment_processing_mzn).toBeCloseTo(65, 2);
    // Afiliados: soma directa da tabela de acumulação = 100 MZN.
    expect(body.costs.affiliate_mzn).toBe(100);
    // Imposto: 0% por defeito (nenhuma linha fiscal_tax_rate_pct configurada).
    expect(body.costs.tax_mzn).toBe(0);

    const expectedTotalCosts = 1280 + 65 + 100 + 0;
    expect(body.costs.total_mzn).toBeCloseTo(expectedTotalCosts, 0);

    const expectedMargin = 1000 - expectedTotalCosts;
    expect(body.margin.gross_margin_mzn).toBeCloseTo(expectedMargin, 0);
    expect(body.margin.per_document_mzn).toBeCloseTo(expectedMargin / 250, 2);
    expect(body.margin.per_1000_documents_mzn).toBeCloseTo((expectedMargin / 250) * 1000, 1);

    // Marketplace de templates fica fora da margem principal.
    expect(body.template_marketplace.sales_mzn).toBe(50);
    expect(body.template_marketplace.author_share_mzn).toBe(35);
    expect(body.template_marketplace.platform_share_mzn).toBe(15);

    // Honestidade das assumptions — nunca finge precisão que não existe.
    expect(body.assumptions.tax_rate_confirmed).toBe(false);
    expect(body.assumptions.affiliate_cost_basis).toMatch(/accrual/);
  });

  test('rejeita pedido sem start/end', async () => {
    const { req, res } = mockReqRes({});
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejeita admin não autenticado', async () => {
    supabaseAdmin.getUserFromToken.mockResolvedValue({ user: null, error: { message: 'no token' } });
    const { req, res } = mockReqRes({ start: '2026-09-01', end: '2026-09-30' });
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('nunca divide por zero quando não há documentos gerados no período', async () => {
    supabaseAdmin.countRows.mockResolvedValue(0);
    const { req, res } = mockReqRes({ start: '2026-09-01', end: '2026-09-30' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.margin.per_document_mzn).toBe(0);
    expect(res._json.margin.per_1000_documents_mzn).toBe(0);
  });
});
