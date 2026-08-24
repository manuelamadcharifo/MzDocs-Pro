// tests/process-payment.test.js
// Testes para api/process-payment.js — cobre o ponto P5 do plano técnico
// ("validação do pagamento, atribuição de créditos"). api/misc.js e
// api/_lib/supabaseAdmin são mockados (jest.mock) para que o require de
// process-payment.js nunca carregue o ficheiro misc.js real (pesado, com
// muitas dependências) nem faça pedidos de rede reais.

jest.mock('../api/_lib/supabaseAdmin', () => ({
  insert:            jest.fn(),
  restRequest:       jest.fn(),
  getUserFromToken:  jest.fn(),
}));

jest.mock('../api/misc', () => ({
  verifyReceiptInternal: jest.fn(),
}));

jest.mock('../api/_lib/packages', () => ({
  loadPackagesFromSettings: jest.fn(),
  // NOVO (monetização — bónus escada): process-payment.js agora importa
  // packageTotalCredits() para incluir o bónus no total de créditos
  // gravado na transacção pendente — o mock precisa de a expor. Os pacotes
  // de teste (FAKE_PACKAGES) não têm `bonus`, por isso isto devolve
  // exactamente pkg.credits, mantendo os testes existentes válidos e sem
  // alteração de comportamento esperado.
  packageTotalCredits:      jest.fn(pkg => (pkg?.credits || 0) + (pkg?.bonus || 0)),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const { verifyReceiptInternal } = require('../api/misc');
const { loadPackagesFromSettings } = require('../api/_lib/packages');
const handler = require('../api/process-payment');

const FAKE_PACKAGES = {
  avulso:  { credits: 3,  price: 50,  name: 'Avulso'  },
  starter: { credits: 10, price: 120, name: 'Starter' },
};

// CORRIGIDO: o rate limiter de api/process-payment.js guarda os contadores
// num Map ao nível do módulo (`_paymentRateMap`), que persiste na memória
// durante TODA a execução deste ficheiro de testes (o `require('../api/
// process-payment')` só corre uma vez, no topo do ficheiro — o módulo não é
// recarregado entre testes). Como todos os testes usavam o mesmo IP fixo
// ('10.0.0.1'), a partir do 4º pedido o rate limiter (correctamente, é o
// comportamento esperado em produção) começava a devolver 429, fazendo
// falhar todos os testes seguintes por um motivo que nada tem a ver com o
// que cada um está realmente a verificar.
//
// A correcção NÃO enfraquece nem contorna o rate limiter em si (isso seria
// esconder um teste, não corrigi-lo) — simplesmente dá a cada chamada de
// mockReqRes() um IP simulado diferente por omissão, tal como aconteceria
// com pedidos reais de utilizadores diferentes. Um teste que precise
// especificamente de simular o MESMO IP em pedidos sucessivos (nenhum
// precisa disso aqui) pode sempre passar 'x-forwarded-for' explicitamente,
// que continua a ter prioridade sobre este valor por omissão.
let _testIpCounter = 0;
function mockReqRes(body, headers = {}) {
  _testIpCounter++;
  const req = { method: 'POST', headers: { 'x-forwarded-for': `10.0.${_testIpCounter}.1`, ...headers }, body };
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

describe('POST /api/process-payment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SITE_URL = 'https://mzdocs.co.mz';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    loadPackagesFromSettings.mockResolvedValue(FAKE_PACKAGES);
    supabaseAdmin.restRequest.mockResolvedValue([]); // sem transacção pendente duplicada
    supabaseAdmin.insert.mockResolvedValue({ id: 'tx-1' });
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  test('rejeita número de telemóvel inválido (fora do padrão moçambicano)', async () => {
    const { req, res } = mockReqRes({ packageId: 'starter', phone: '123456' });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/número inválido/i);
  });

  test('rejeita pacote inexistente', async () => {
    const { req, res } = mockReqRes({ packageId: 'inexistente', phone: '841234567' });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.available).toEqual(Object.keys(FAKE_PACKAGES));
  });

  test('rejeita pedido sem número de telemóvel', async () => {
    const { req, res } = mockReqRes({ packageId: 'starter' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('regista uma transacção pendente (modo manual, sem comprovativo) e devolve link do WhatsApp', async () => {
    const { req, res } = mockReqRes({ packageId: 'starter', phone: '841234567' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(expect.objectContaining({
      success: true, mode: 'manual', nextStep: 'upload_receipt',
      transactionId: 'tx-1',
    }));
    expect(res._json.whatsappLink).toContain('wa.me');
    expect(supabaseAdmin.insert).toHaveBeenCalledWith('transactions', expect.objectContaining({
      package_id: 'starter', credits: 10, amount: 120, status: 'pending', payment_method: 'manual',
      phone_number: '+258841234567',
    }));
  });

  test('detecta correctamente a carteira móvel pelo prefixo do número (M-Pesa 84/85, e-Mola 86/87, mKesh 82/83)', async () => {
    const cases = [
      { phone: '841234567', wallet: 'M-Pesa (Vodacom)' },
      { phone: '861234567', wallet: 'e-Mola (Movitel)' },
      { phone: '821234567', wallet: 'mKesh (mCel)' },
    ];
    for (const { phone, wallet } of cases) {
      const { req, res } = mockReqRes({ packageId: 'starter', phone });
      await handler(req, res);
      expect(res._json.wallet).toBe(wallet);
    }
  });

  test('devolve a transacção existente (409-like duplicate) em vez de criar outra, se já houver um pedido pendente recente', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{ id: 'tx-existente', reference_id: 'MZ-OLD' }]);

    const { req, res } = mockReqRes({ packageId: 'starter', phone: '841234567', userId: '11111111-1111-1111-1111-111111111111' });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.duplicate).toBe(true);
    expect(res._json.transactionId).toBe('tx-existente');
    expect(supabaseAdmin.insert).not.toHaveBeenCalledWith('transactions', expect.anything());
  });

  test('com comprovativo (receiptImage): delega a verificação automática a verifyReceiptInternal e propaga o resultado', async () => {
    verifyReceiptInternal.mockResolvedValue({
      success: true, verified: true, autoApproved: true, creditsAdded: 10, nextStep: 'completed',
      message: 'Pagamento confirmado automaticamente.',
    });

    const { req, res } = mockReqRes({
      packageId: 'starter', phone: '841234567', receiptImage: 'ZmFrZS1iYXNlNjQ=', receiptMimeType: 'image/jpeg',
    });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.mode).toBe('auto_verify');
    expect(res._json.autoVerified).toBe(true);
    expect(res._json.creditsAdded).toBe(10);
    expect(verifyReceiptInternal).toHaveBeenCalledWith(expect.objectContaining({
      reference: expect.any(String), amount: 120, wallet: 'M-Pesa (Vodacom)', packageId: 'starter',
    }));
  });

  test('se verifyReceiptInternal rebentar, cai em "awaiting_review" em vez de falhar o pedido', async () => {
    verifyReceiptInternal.mockRejectedValue(new Error('IA de visão indisponível'));

    const { req, res } = mockReqRes({
      packageId: 'starter', phone: '841234567', receiptImage: 'ZmFrZS1iYXNlNjQ=',
    });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.nextStep).toBe('awaiting_review');
  });

  test('modo mpesa automático devolve 503 (não configurado) e sugere o modo manual', async () => {
    const { req, res } = mockReqRes({ packageId: 'starter', phone: '841234567', mode: 'mpesa' });
    await handler(req, res);
    expect(res._status).toBe(503);
    expect(res._json.fallback).toMatch(/manual/i);
  });

  test('devolve 503 quando o Supabase não está configurado no servidor', async () => {
    delete process.env.SUPABASE_URL;
    const { req, res } = mockReqRes({ packageId: 'starter', phone: '841234567' });
    await handler(req, res);
    expect(res._status).toBe(503);
  });
});
