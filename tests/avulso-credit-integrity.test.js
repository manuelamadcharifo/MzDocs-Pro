// tests/avulso-credit-integrity.test.js
// P19 (Master Hardening & Release Gate v2, Set/2026) — possível dupla
// atribuição de créditos no fluxo "Avulso".
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual, antes desta
// correcção): `_createAvulsoAccount()` (api/_services/payments.js) escrevia
// `credits: X` directamente no perfil recém-criado via `update()`. Os DOIS
// chamadores desta função — `verifyReceiptInternal` (aprovação automática
// por IA de visão, mesmo ficheiro) e `smsConfirm.js` (confirmação
// automática por SMS M-Pesa reencaminhado) — chamavam DEPOIS
// `add_credits(tempUserId, X)`, que é ADITIVO
// (`credits = credits + amount`, ver migration_v52_credit_ledger.sql).
// Resultado: uma compra avulso de X créditos ficava creditada a 2X. Pior:
// o trigger `on_auth_user_created` (schema.sql) já insere qualquer conta
// nova com `credits = 3` por omissão — se `_createAvulsoAccount` alguma
// vez deixasse de escrever `credits` (em vez de o zerar explicitamente),
// o saldo final seria X+3, não X.
//
// Este teste chama `_createAvulsoAccount` a sério (só os efeitos
// secundários de rede — supabaseAdmin — são mockados) e confirma, ao nível
// da própria função, que ela nunca escreve nada além de 0 em `credits` —
// é o `add_credits()` do chamador, testado separadamente em
// tests/smsConfirm.test.js e tests/process-payment.test.js, que passa a
// ser a ÚNICA fonte de verdade do saldo final.

jest.mock('../api/_lib/supabaseAdmin', () => ({
  restRequest:      jest.fn(),
  rpc:               jest.fn(),
  insert:            jest.fn(),
  update:            jest.fn(),
  adminCreateUser:   jest.fn(),
  getUserFromToken:  jest.fn(),
  selectOne:         jest.fn(),
}));
jest.mock('../api/_lib/visionAI', () => ({
  analyzeImage: jest.fn(),
  parseJSON:    jest.fn(),
}));
jest.mock('../api/_lib/notifyTelegram', () => ({
  notifyPaymentNeedsReview: jest.fn(),
}));

const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const { _createAvulsoAccount } = require('../api/_services/payments');

describe('P19 — _createAvulsoAccount nunca pré-atribui créditos (evita 2X)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabaseAdmin.adminCreateUser.mockResolvedValue({ id: 'temp-user-1' });
    supabaseAdmin.update.mockResolvedValue([{ id: 'temp-user-1' }]);
    supabaseAdmin.restRequest.mockResolvedValue({});
  });

  test('escreve sempre credits:0 no perfil, independentemente do valor comprado', async () => {
    await _createAvulsoAccount({
      reference: 'MZ-TEST-1', phone: '+258841234567', credits: 10, transactionId: 'tx-1',
    });

    expect(supabaseAdmin.update).toHaveBeenCalledWith(
      'profiles', 'id', 'temp-user-1',
      expect.objectContaining({ credits: 0, account_type: 'avulso', is_temp: true }),
    );
    // Nunca deve escrever o valor comprado directamente — só o `add_credits()`
    // do chamador é que pode fazer isso, exactamente uma vez.
    const patchArg = supabaseAdmin.update.mock.calls[0][3];
    expect(patchArg.credits).not.toBe(10);
  });

  test('o mesmo vale para qualquer quantidade de créditos comprados (3, 10, 50)', async () => {
    for (const credits of [3, 10, 50]) {
      jest.clearAllMocks();
      supabaseAdmin.adminCreateUser.mockResolvedValue({ id: 'temp-user-x' });
      supabaseAdmin.update.mockResolvedValue([{ id: 'temp-user-x' }]);

      await _createAvulsoAccount({ reference: `MZ-${credits}`, phone: '+258840000000', credits, transactionId: `tx-${credits}` });

      const patchArg = supabaseAdmin.update.mock.calls[0][3];
      expect(patchArg.credits).toBe(0);
    }
  });

  test('liga a transacção à nova conta via user_id, sem tocar em status/créditos', async () => {
    await _createAvulsoAccount({
      reference: 'MZ-TEST-2', phone: '+258841234567', credits: 5, transactionId: 'tx-2',
    });

    expect(supabaseAdmin.restRequest).toHaveBeenCalledWith(
      expect.stringContaining('transactions?id=eq.tx-2'),
      expect.objectContaining({
        method: 'PATCH',
        body:   { user_id: 'temp-user-1' },
      }),
    );
  });
});

// ── Integração: fim-a-fim com o chamador real (smsConfirm.js) ─────────────
// Não duplica tests/smsConfirm.test.js (que já mocka _createAvulsoAccount
// por completo e confirma a CHAMADA a add_credits) — aqui confirmamos que,
// COM A IMPLEMENTAÇÃO REAL de _createAvulsoAccount (só supabaseAdmin
// mockado), o resultado matemático final é sempre créditos comprados =
// créditos creditados, nunca o dobro.
describe('P19 — integração: créditos finais = créditos comprados (nunca 2X)', () => {
  test('simula o fluxo completo: create (credits=0) + add_credits(X) = X, não 2X', async () => {
    jest.clearAllMocks();
    supabaseAdmin.adminCreateUser.mockResolvedValue({ id: 'temp-user-e2e' });

    // Simula profiles.credits como um valor em memória, tal como a BD real,
    // para verificar o SALDO FINAL depois das duas operações em sequência
    // (create + add_credits) — exactamente o que os chamadores reais fazem.
    let simulatedCredits = 3; // valor que o trigger on_auth_user_created atribuiria por omissão
    supabaseAdmin.update.mockImplementation(async (table, col, val, patch) => {
      if (table === 'profiles' && typeof patch.credits === 'number') {
        simulatedCredits = patch.credits;
      }
      return [{ id: val }];
    });
    supabaseAdmin.rpc.mockImplementation(async (fn, args) => {
      if (fn === 'add_credits') {
        simulatedCredits += args.amount;
        return simulatedCredits;
      }
      return null;
    });

    const PURCHASED = 10;
    const accountInfo = await _createAvulsoAccount({
      reference: 'MZ-E2E', phone: '+258841234567', credits: PURCHASED, transactionId: 'tx-e2e',
    });
    // Mesma sequência que verifyReceiptInternal/smsConfirm.js fazem a seguir:
    await supabaseAdmin.rpc('add_credits', { user_id: accountInfo.tempUserId, amount: PURCHASED });

    expect(simulatedCredits).toBe(PURCHASED); // 10, NUNCA 13 (3+10) nem 20 (10+10)
  });
});
