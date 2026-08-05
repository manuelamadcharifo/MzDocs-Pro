// tests/parseMpesaSms.test.js
const { parseMpesaConfirmationSms } = require('../api/_lib/parseMpesaSms');

describe('parseMpesaConfirmationSms', () => {
  const SMS_REAL =
    'Confirmado DH43L30JTID. Recebeste 7,000.00MT de 258841234567 - ANTENIO AMADO CHARIFEIO aos 4/8/26 as 9:25 PM. ' +
    'O teu novo saldo M-Pesa e de 7,117.54MT. Em caso de duvida, liga 100. M-Pesa e facil!';

  test('extrai correctamente todos os campos do SMS real da Vodacom', () => {
    const result = parseMpesaConfirmationSms(SMS_REAL);
    expect(result).toEqual({
      reference: 'DH43L30JTID',
      amount: 7000,
      senderPhone: '841234567',
      senderName: 'ANTENIO AMADO CHARIFEIO',
      newBalance: 7117.54,
      confirmedAt: '2026-08-04T21:25:00+02:00',
    });
  });

  test('trata correctamente valores com milhares e horário da manhã (AM)', () => {
    const sms = 'Confirmado ABC123. Recebeste 1,250.00MT de 258861112222 - MARIA JOSE aos 15/3/26 as 8:05 AM. O teu novo saldo M-Pesa e de 2,000.00MT.';
    const result = parseMpesaConfirmationSms(sms);
    expect(result.amount).toBe(1250);
    expect(result.confirmedAt).toBe('2026-03-15T08:05:00+02:00');
  });

  test('trata meio-dia (12 PM) e meia-noite (12 AM) correctamente', () => {
    const meioDia = parseMpesaConfirmationSms(
      'Confirmado X1. Recebeste 50.00MT de 258821112222 - JOSE aos 1/1/26 as 12:00 PM. O teu novo saldo M-Pesa e de 100.00MT.'
    );
    expect(meioDia.confirmedAt).toBe('2026-01-01T12:00:00+02:00');

    const meiaNoite = parseMpesaConfirmationSms(
      'Confirmado X2. Recebeste 50.00MT de 258821112222 - JOSE aos 1/1/26 as 12:00 AM. O teu novo saldo M-Pesa e de 100.00MT.'
    );
    expect(meiaNoite.confirmedAt).toBe('2026-01-01T00:00:00+02:00');
  });

  test('devolve null (não inventa dados) para um SMS que não corresponde ao formato', () => {
    expect(parseMpesaConfirmationSms('A tua encomenda foi enviada.')).toBeNull();
    expect(parseMpesaConfirmationSms('')).toBeNull();
    expect(parseMpesaConfirmationSms(null)).toBeNull();
  });

  test('devolve null para um SMS de M-Pesa que não é uma confirmação de recebimento (ex: envio, não recepção)', () => {
    const smsEnvio = 'Confirmado XYZ. Enviaste 500.00MT para 258841234567 - JOAO aos 4/8/26 as 9:25 PM. O teu novo saldo M-Pesa e de 1,000.00MT.';
    expect(parseMpesaConfirmationSms(smsEnvio)).toBeNull();
  });
});
