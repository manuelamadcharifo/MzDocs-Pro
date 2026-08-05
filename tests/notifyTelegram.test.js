// tests/notifyTelegram.test.js
const { notifyTelegram, notifyPaymentNeedsReview } = require('../api/_lib/notifyTelegram');

describe('notifyTelegram', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('não envia (e não rebenta) quando as variáveis de ambiente não estão configuradas', async () => {
    global.fetch = jest.fn();
    const result = await notifyTelegram('teste');
    expect(result).toEqual({ sent: false, reason: 'not_configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('envia a mensagem para a API do Telegram quando configurado', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await notifyTelegram('Olá');

    expect(result).toEqual({ sent: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botfake-token/sendMessage',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual(expect.objectContaining({ chat_id: '12345', text: 'Olá' }));
  });

  test('nunca lança excepção, mesmo que o fetch rebente (fire-and-forget)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    global.fetch = jest.fn().mockRejectedValue(new Error('rede em baixo'));

    await expect(notifyTelegram('teste')).resolves.toEqual(
      expect.objectContaining({ sent: false })
    );
  });

  test('notifyPaymentNeedsReview formata os dados da transacção na mensagem', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await notifyPaymentNeedsReview({
      transactionId: 'tx-1', packageId: 'starter', amount: 120, phone: '841234567',
      reason: 'confidence baixa (0.60)', confidence: 0.6,
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.text).toContain('starter');
    expect(body.text).toContain('120');
    expect(body.text).toContain('841234567');
    expect(body.text).toContain('tx-1');
  });
});
