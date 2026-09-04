// tests/confirm-avulso-race.test.js
// P19 (Master Hardening & Release Gate v2, Set/2026) — condição de corrida
// em handleConfirmAvulso (modo normal, api/admin/index.js).
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual, antes desta
// correcção): a transição de estado da transacção (pending → completed)
// só acontecia DEPOIS de já ter criado a conta temporária e atribuído
// créditos — ao contrário do endpoint irmão (handleConfirmPayment, mesmo
// ficheiro), que já reivindicava a transacção ATOMICAMENTE
// (`UPDATE ... WHERE status='pending'`) antes de fazer qualquer coisa.
// Dois pedidos de confirmação quase simultâneos (duplo clique do admin, ou
// um retry de rede) liam ambos `status === 'pending'` antes de qualquer um
// escrever, e cada um criava a SUA PRÓPRIA conta temporária + creditava
// tx.credits — resultado: 2 contas, créditos em dobro, para um único
// pagamento avulso.
//
// Este teste prova que, depois da correcção, quando a reivindicação
// atómica da transacção devolve 0 linhas (porque outro pedido já a
// reivindicou primeiro), o pedido é recusado com 409 e NENHUMA conta é
// criada nem crédito nenhum é atribuído.

jest.mock('qrcode', () => ({}));
jest.mock('../api/_lib/aiProvidersCatalog', () => ({ ACTIVE_PROVIDERS: [], RESERVE_PROVIDERS: [], TIER_LABELS: {} }));
jest.mock('../api/_lib/aiProviderRegistry', () => ({ PROVIDERS: {}, isProviderConfigured: () => false }));
jest.mock('../api/_lib/modelDiscovery', () => ({ getAvailableModels: jest.fn() }));
jest.mock('../api/_lib/modelHealth', () => ({ resetProviderHealth: jest.fn() }));
jest.mock('../api/_lib/webpush', () => ({ sendPushToSubscriptions: jest.fn() }));
jest.mock('../api/_lib/packages', () => ({ loadPackagesFromSettings: jest.fn(), estimateMznPerCredit: jest.fn() }));
jest.mock('../api/_lib/contentModeration', () => ({ moderateComment: jest.fn(), approvalStatusFor: jest.fn() }));
jest.mock('../api/_lib/rateLimit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) }));

jest.mock('../api/_lib/supabaseAdmin', () => ({
  restRequest:            jest.fn(),
  getUserFromToken:       jest.fn(),
  selectOne:              jest.fn(),
  insert:                 jest.fn(),
  update:                 jest.fn(),
  del:                    jest.fn(),
  upsert:                 jest.fn(),
  rpc:                    jest.fn(),
  countRows:              jest.fn(),
  adminGetUserById:       jest.fn(),
  adminUpdateUserById:    jest.fn(),
  adminCreateUser:        jest.fn(),
  adminDeleteUser:        jest.fn(),
  storageUpload:          jest.fn(),
  storageGetPublicUrl:    jest.fn(),
  storageCreateSignedUrl: jest.fn(),
  storageCreateSignedUrls: jest.fn(),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const handler = require('../api/admin/index');

function mockReqRes(body, extra = {}) {
  const req = {
    method:  'POST',
    url:     '/api/admin?action=confirm-avulso',
    query:   { action: 'confirm-avulso' },
    headers: { authorization: 'Bearer fake-admin-jwt' },
    body,
    ...extra,
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

describe('P19 — handleConfirmAvulso (modo normal) reivindica a transacção atomicamente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabaseAdmin.getUserFromToken.mockResolvedValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } }, error: null,
    });
    supabaseAdmin.selectOne.mockResolvedValue({
      id: 'tx-1', status: 'pending', package_id: 'avulso', credits: 10,
      reference_id: 'MZ-RACE', phone_number: '+258841234567',
    });
  });

  test('quando a reivindicação atómica falha (0 linhas) → 409, NENHUMA conta é criada', async () => {
    // Simula: outro pedido já reivindicou a transacção entre o SELECT e
    // este UPDATE — o WHERE status=eq.pending já não encontra a linha.
    supabaseAdmin.update.mockResolvedValue([]);

    const { req, res } = mockReqRes({ transactionId: 'tx-1' });
    await handler(req, res);

    expect(res._status).toBe(409);
    expect(supabaseAdmin.adminCreateUser).not.toHaveBeenCalled();
  });

  test('quando a reivindicação atómica é bem-sucedida → cria exactamente 1 conta, com tx.credits', async () => {
    supabaseAdmin.update.mockImplementation(async (table) => {
      if (table === 'transactions') return [{ id: 'tx-1', status: 'completed' }];
      if (table === 'profiles')     return [{ id: 'temp-user-1' }];
      return [];
    });
    supabaseAdmin.adminCreateUser.mockResolvedValue({ id: 'temp-user-1' });
    supabaseAdmin.insert.mockResolvedValue({});

    const { req, res } = mockReqRes({ transactionId: 'tx-1' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(supabaseAdmin.adminCreateUser).toHaveBeenCalledTimes(1);

    // O perfil é criado com o valor exacto da transacção, uma única vez.
    const profileUpdateCall = supabaseAdmin.update.mock.calls.find(c => c[0] === 'profiles');
    expect(profileUpdateCall[3].credits).toBe(10);
  });

  test('a reivindicação da transacção acontece ANTES de criar a conta (ordem correcta)', async () => {
    const callOrder = [];
    supabaseAdmin.update.mockImplementation(async (table) => {
      callOrder.push(`update:${table}`);
      if (table === 'transactions') return [{ id: 'tx-1', status: 'completed' }];
      if (table === 'profiles')     return [{ id: 'temp-user-1' }];
      return [];
    });
    supabaseAdmin.adminCreateUser.mockImplementation(async () => {
      callOrder.push('adminCreateUser');
      return { id: 'temp-user-1' };
    });
    supabaseAdmin.insert.mockResolvedValue({});

    const { req, res } = mockReqRes({ transactionId: 'tx-1' });
    await handler(req, res);

    expect(res._status).toBe(200);
    // A PRIMEIRA escrita em 'transactions' (a reivindicação atómica) tem de
    // acontecer antes de adminCreateUser — nunca o contrário.
    expect(callOrder.indexOf('update:transactions')).toBeLessThan(callOrder.indexOf('adminCreateUser'));
  });
});
