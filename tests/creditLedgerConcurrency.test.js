// tests/creditLedgerConcurrency.test.js
// ──────────────────────────────────────────────────────────────────────────
// P1-09 (auditoria Ago/2026) — "Ledger de créditos precisa de teste de
// concorrência."
//
// LEIA ISTO ANTES DE CONFIAR CEGAMENTE NESTE FICHEIRO: um teste Jest com
// api/_lib/supabaseAdmin mockado NÃO PODE provar que o `SELECT ... FOR
// UPDATE` dentro de deduct_credit/deduct_credits/confirm_payment_and_credit
// (Postgres real) impede uma corrida de facto — não há nenhum Postgres por
// trás do mock. Essa prova só existe correndo scripts/test-credit-
// concurrency.js contra uma base de dados de STAGING real (ver esse
// ficheiro para o "porquê" completo).
//
// O QUE ESTE FICHEIRO TESTA (e que É útil correr em CI, sem rede):
//   O CONTRATO do lado da aplicação — api/_services/payments.js
//   (verifyReceiptInternal) — quando duas chamadas concorrentes chegam com
//   o MESMO transactionId (ex.: o utilizador clicou 2x no botão de upload,
//   ou um retry de rede reenviou o mesmo pedido), e a RPC atómica
//   (confirm_payment_and_credit, migration_v57) devolve `already_confirmed:
//   true` na segunda chamada — o código só deve creditar/criar conta UMA
//   vez, nunca duas, independentemente da ordem de resolução das Promises.
//
// Isto simula o comportamento correcto da RPC atómica (que é responsável
// por decidir quem "ganha" a corrida) e verifica que o código à volta dela
// reage correctamente aos dois resultados possíveis — não testa o lock em
// si, testa que a aplicação não teria bugs SE o lock funcionar como
// documentado.
// ──────────────────────────────────────────────────────────────────────────

jest.mock('../api/_lib/visionAI', () => ({
  analyzeImage: jest.fn(),
  parseJSON:    jest.fn(),
}));
jest.mock('../api/_lib/notifyTelegram', () => ({
  notifyPaymentNeedsReview: jest.fn(),
}));
jest.mock('../api/_lib/supabaseAdmin', () => ({
  restRequest:      jest.fn(),
  rpc:              jest.fn(),
  insert:           jest.fn(),
  update:           jest.fn(),
  adminCreateUser:  jest.fn(),
}));
jest.mock('../api/_lib/rateLimit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));
jest.mock('../api/_lib/packages', () => ({
  loadPackagesFromSettings: jest.fn(),
  estimateMznPerCredit:     jest.fn(),
}));
jest.mock('../api/_lib/observability', () => ({
  logEvent:   jest.fn(),
  withTiming: jest.fn((cat, ev, fn) => fn()),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const { analyzeImage, parseJSON: parseVisionJSON } = require('../api/_lib/visionAI');
const { loadPackagesFromSettings } = require('../api/_lib/packages');
const { verifyReceiptInternal } = require('../api/_services/payments');

const PKG = { avulso: { credits: 3, price: 50, name: 'Avulso' } };

function baseParams(overrides = {}) {
  return {
    imageBase64:   'ZmFrZS1pbWFnZS1kYXRh',
    mimeType:      'image/jpeg',
    reference:     'MZ-TEST-1',
    phone:         '+258841234567',
    amount:        50,
    wallet:        'M-Pesa (Vodacom)',
    userId:        'user-123',
    transactionId: 'tx-abc',
    packageId:     'avulso',
    ...overrides,
  };
}

describe('verifyReceiptInternal — contrato de idempotência sob concorrência simulada (P1-09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadPackagesFromSettings.mockResolvedValue(PKG);
    analyzeImage.mockResolvedValue('{}');
    parseVisionJSON.mockReturnValue({
      confidence: 0.95, amount: 50, status: 'SUCESSO',
      reference: 'REF-999', transaction_date: new Date().toISOString(),
    });
    // Sem hash duplicado, sem referência já confirmada.
    supabaseAdmin.restRequest.mockResolvedValue([]);
    supabaseAdmin.insert.mockResolvedValue({});
    supabaseAdmin.update.mockResolvedValue({});
  });

  test('duas chamadas concorrentes com o mesmo transactionId só creditam UMA vez', async () => {
    // Simula a RPC atómica: a PRIMEIRA chamada a "ganhar" confirma e
    // credita; qualquer chamada seguinte, para a MESMA transacção, recebe
    // already_confirmed=true — exactamente o que
    // migration_v57_atomic_payment_confirmation.sql garante através do
    // "SELECT ... FOR UPDATE" + verificação de status dentro da mesma
    // transacção SQL.
    let resolved = false;
    supabaseAdmin.rpc.mockImplementation(async (fn, params) => {
      if (fn === 'confirm_payment_and_credit') {
        if (!resolved) {
          resolved = true;
          return { ok: true, already_confirmed: false, credited: true, new_balance: 3 };
        }
        return { ok: true, already_confirmed: true, credited: false };
      }
      if (fn === 'process_affiliate_commission_v2') return {};
      if (fn === 'add_credits') return 3;
      return {};
    });

    const [r1, r2] = await Promise.all([
      verifyReceiptInternal(baseParams()),
      verifyReceiptInternal(baseParams()),
    ]);

    const outcomes = [r1, r2];
    const creditedCount   = outcomes.filter(r => r.autoApproved && r.nextStep === 'completed').length;
    const alreadyConfirmed = outcomes.filter(r => r.nextStep === 'already_confirmed').length;

    expect(creditedCount).toBe(1);
    expect(alreadyConfirmed).toBe(1);

    // A RPC de crédito real (confirm_payment_and_credit) só deve ter sido
    // invocada duas vezes (uma por chamada) — mas add_credits/insert de
    // credit_logs feitos MANUALMENTE pelo lado da aplicação (fora da RPC,
    // caminho avulso) não devem ter corrido, porque userId já estava
    // presente neste cenário (não é o caminho avulso).
    const confirmCalls = supabaseAdmin.rpc.mock.calls.filter(c => c[0] === 'confirm_payment_and_credit');
    expect(confirmCalls).toHaveLength(2);
  });

  test('caminho avulso (sem userId): duplo call não cria duas contas', async () => {
    let resolved = false;
    supabaseAdmin.rpc.mockImplementation(async (fn) => {
      if (fn === 'confirm_payment_and_credit') {
        if (!resolved) { resolved = true; return { ok: true, already_confirmed: false, credited: false, reason: 'no_user_or_zero_credits' }; }
        return { ok: true, already_confirmed: true, credited: false };
      }
      if (fn === 'add_credits') return 3;
      if (fn === 'process_affiliate_commission_v2') return {};
      return {};
    });
    supabaseAdmin.adminCreateUser.mockResolvedValue({ id: 'temp-user-1' });

    const params = baseParams({ userId: null, transactionId: 'tx-avulso-1' });
    const [r1, r2] = await Promise.all([
      verifyReceiptInternal(params),
      verifyReceiptInternal(params),
    ]);

    // Só a chamada que "ganhou" a confirmação deve ter tentado criar conta.
    expect(supabaseAdmin.adminCreateUser).toHaveBeenCalledTimes(1);

    const alreadyConfirmed = [r1, r2].filter(r => r.nextStep === 'already_confirmed').length;
    expect(alreadyConfirmed).toBe(1);
  });
});
