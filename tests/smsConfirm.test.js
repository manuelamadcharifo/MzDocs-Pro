// tests/smsConfirm.test.js
// Testes para api/_services/smsConfirm.js — confirmação automática de
// pagamento via SMS M-Pesa reencaminhado (Telegram webhook ou HTTP
// directo). api/_lib/supabaseAdmin, notifyTelegram, rateLimit, packages e
// payments (_createAvulsoAccount) são mockados — parseMpesaSms.js corre
// com a implementação REAL (é lógica pura de regex, vale a pena testar
// a integração completa com um SMS real, o mesmo usado nos comentários
// desse ficheiro).

jest.mock('../api/_lib/supabaseAdmin', () => ({
  restRequest: jest.fn(),
  rpc:         jest.fn(),
}));
jest.mock('../api/_lib/notifyTelegram', () => ({
  notifyTelegram: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.mock('../api/_lib/rateLimit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));
jest.mock('../api/_lib/packages', () => ({
  loadPackagesFromSettings: jest.fn(),
  packageTotalCredits:      jest.fn(pkg => (pkg?.credits || 0) + (pkg?.bonus || 0)),
}));
jest.mock('../api/_lib/observability', () => ({
  logEvent: jest.fn(),
}));
jest.mock('../api/_services/payments', () => ({
  _createAvulsoAccount: jest.fn(),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const { notifyTelegram } = require('../api/_lib/notifyTelegram');
const { checkRateLimit } = require('../api/_lib/rateLimit');
const { loadPackagesFromSettings } = require('../api/_lib/packages');
const { _createAvulsoAccount } = require('../api/_services/payments');
const { handleSmsMpesaWebhook } = require('../api/_services/smsConfirm');

// SMS real usado como referência em api/_lib/parseMpesaSms.js.
const REAL_SMS =
  'Confirmado DH43L30JTID. Recebeste 7,000.00MT de 258841234567 - ' +
  'ANTENIO AMADO CHARIFEIO aos 4/8/26 as 9:25 PM. O teu novo saldo ' +
  'M-Pesa e de 7,117.54MT. Em caso de duvida, liga 100. M-Pesa e facil!';

function mockReqRes({ body, headers = {}, method = 'POST' } = {}) {
  const req = { method, headers, body };
  const res = {
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(payload) { this._json = payload; return this; },
    end() { this._ended = true; return this; },
  };
  return { req, res };
}

const TELEGRAM_HEADERS = { 'x-telegram-bot-api-secret-token': 'tg-secret-123' };
const HTTP_HEADERS     = { 'x-sms-secret': 'http-secret-456' };

describe('POST /api/misc?action=sms-mpesa (handleSmsMpesaWebhook)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'tg-secret-123';
    process.env.SMS_FORWARD_SECRET      = 'http-secret-456';
    process.env.TELEGRAM_CHAT_ID        = '999888777';
    checkRateLimit.mockResolvedValue(true);
    loadPackagesFromSettings.mockResolvedValue({
      starter: { credits: 10, price: 120, name: 'Starter', bonus: 2 },
      avulso:  { credits: 3,  price: 50,  name: 'Avulso',  bonus: 0 },
    });
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.SMS_FORWARD_SECRET;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('rejeita métodos que não sejam POST', async () => {
    const { req, res } = mockReqRes({ method: 'GET' });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(405);
  });

  test('rejeita pedido sem credencial válida (nem Telegram nem HTTP secret)', async () => {
    const { req, res } = mockReqRes({ body: {}, headers: { 'x-telegram-bot-api-secret-token': 'errado' } });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(403);
  });

  test('respeita o rate limit (429)', async () => {
    checkRateLimit.mockResolvedValue(false);
    const { req, res } = mockReqRes({ body: {}, headers: TELEGRAM_HEADERS });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(429);
  });

  test('ignora update do Telegram de um chat_id diferente do configurado', async () => {
    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 111 } } },
    });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, ignored: 'chat_id_mismatch' });
    expect(supabaseAdmin.restRequest).not.toHaveBeenCalled();
  });

  test('ignora mensagens vazias/sem texto (ex: stickers) sem rebentar', async () => {
    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, ignored: 'empty' });
  });

  test('ignora texto que não bate com o formato de confirmação M-Pesa', async () => {
    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: 'Olá, tudo bem?', chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, ignored: 'not_a_confirmation' });
  });

  test('SMS válido sem transacção pendente correspondente → avisa Telegram, matched:false', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([]);
    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, matched: false });
    expect(notifyTelegram).toHaveBeenCalledWith(expect.stringContaining('sem transacção correspondente'));
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  test('SMS válido com transacção pendente correspondente: credita base + bónus via RPC atómica', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{
      id: 'tx-1', user_id: 'user-1', package_id: 'starter', amount: 7000,
      credits: 12, visitor_id: null, reference_id: 'MZ-XYZ',
    }]);
    supabaseAdmin.rpc.mockResolvedValue({ ok: true, already_confirmed: false, credited: true });

    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, matched: true, transactionId: 'tx-1' });
    // starter: credits 10 + bonus 2 = 12 (packageTotalCredits mockado acima)
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('confirm_payment_and_credit', expect.objectContaining({
      p_transaction_id: 'tx-1',
      p_credits:        12,
      p_user_id:        'user-1',
      p_confidence:      1.0,
      p_receipt_hash:   'sms:DH43L30JTID',
    }));
  });

  test('transacção já confirmada por outra via (ex: IA de imagem) → already_confirmed, não duplica crédito', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{
      id: 'tx-2', user_id: 'user-2', package_id: 'starter', amount: 7000,
      credits: 12, visitor_id: null, reference_id: 'MZ-ABC',
    }]);
    supabaseAdmin.rpc.mockResolvedValue({ ok: true, already_confirmed: true });

    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, already_confirmed: true });
    expect(_createAvulsoAccount).not.toHaveBeenCalled();
  });

  test('caminho avulso sem conta: cria conta temporária automaticamente após confirmação', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{
      id: 'tx-3', user_id: null, package_id: 'avulso', amount: 7000,
      credits: 3, visitor_id: 'v-1', reference_id: 'MZ-AVULSO',
    }]);
    supabaseAdmin.rpc.mockResolvedValue({ ok: true, already_confirmed: false, credited: false });
    _createAvulsoAccount.mockResolvedValue({ tempUserId: 'temp-1', tempEmail: 'temp@mzdocs.temp' });

    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);

    expect(res._status).toBe(200);
    // avulso não tem user_id → p_credits enviado à RPC de confirmação é 0
    // (RPC só confirma; quem credita é o passo de criação de conta abaixo).
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('confirm_payment_and_credit', expect.objectContaining({
      p_credits: 0, p_user_id: null,
    }));
    expect(_createAvulsoAccount).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'MZ-AVULSO', phone: '+258841234567', credits: 3, transactionId: 'tx-3',
    }));
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_credits', { user_id: 'temp-1', amount: 3 });
  });

  test('aceita também o formato de forward HTTP directo (X-Sms-Secret, sem Telegram)', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{
      id: 'tx-4', user_id: 'user-4', package_id: 'starter', amount: 7000,
      credits: 12, visitor_id: null, reference_id: 'MZ-HTTP',
    }]);
    supabaseAdmin.rpc.mockResolvedValue({ ok: true, already_confirmed: false, credited: true });

    const { req, res } = mockReqRes({
      headers: HTTP_HEADERS,
      body: { text: REAL_SMS },
    });
    await handleSmsMpesaWebhook(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, matched: true, transactionId: 'tx-4' });
  });

  test('valor do SMS fora da tolerância de 1 MZN não é considerado correspondência', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{
      id: 'tx-5', user_id: 'user-5', package_id: 'starter', amount: 6000, // diferente de 7000
      credits: 12, visitor_id: null, reference_id: 'MZ-DIFF',
    }]);

    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);

    expect(res._json.matched).toBe(false);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  test('falha na RPC não rebenta o pedido — devolve 200 com erro registado e avisa Telegram', async () => {
    supabaseAdmin.restRequest.mockResolvedValue([{
      id: 'tx-6', user_id: 'user-6', package_id: 'starter', amount: 7000,
      credits: 12, visitor_id: null, reference_id: 'MZ-FAIL',
    }]);
    supabaseAdmin.rpc.mockRejectedValue(new Error('timeout'));

    const { req, res } = mockReqRes({
      headers: TELEGRAM_HEADERS,
      body: { message: { text: REAL_SMS, chat: { id: 999888777 } } },
    });
    await handleSmsMpesaWebhook(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ ok: true, error: 'rpc_failed' });
    expect(notifyTelegram).toHaveBeenCalledWith(expect.stringContaining('Falha ao confirmar via SMS'));
  });
});
