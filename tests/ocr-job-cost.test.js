// tests/ocr-job-cost.test.js
// P20 residual (Master Hardening & Release Gate v2, Set/2026, resolvido) —
// "transcricao" (Digitalizar Documento) deixa de confiar apenas no `cost`
// enviado pelo cliente.
//
// PROBLEMA CONFIRMADO (ver comentário completo em
// api/_lib/pricingRegistry.js e api/_services/ocr.js): "transcricao" cobra
// por página fotografada, um valor que só existia no cliente
// (docModel.ocrPageCount) — o servidor não tinha forma independente de o
// confirmar, por isso continuava a confiar em `body.cost`, dentro de um
// intervalo de sanidade 1-10, mas sem qualquer ligação ao nº real de
// páginas. Um cliente malicioso podia fotografar 10 páginas (OCR completo,
// grátis, sem dedução nenhuma nessa chamada) e declarar `cost:1` na
// cobrança seguinte.
//
// Corrigido reaproveitando a infra-estrutura de "job" da P1.1
// (generation_jobs, migration_v68): api/_services/ocr.js cria um job com
// o nº REAL de páginas processadas (`images.length`) sempre que o pedido
// de OCR tem sessão válida; api/_services/account.js valida esse job
// (mesma RPC validate_generation_job) e usa `credits_reserved` como custo
// oficial — nunca o `cost` do corpo do pedido.
//
// Estes testes cobrem directamente resolveOfficialCost() (a peça central
// da correcção) com o job presente/ausente/inválido/doutro utilizador.

const { resolveOfficialCost } = require('../api/_lib/pricingRegistry');

function makeMocks({ validateResult, jobRow }) {
  return {
    selectOne: jest.fn(async (table) => {
      if (table === 'generation_jobs') return jobRow;
      return null;
    }),
    rpc: jest.fn(async (fn) => {
      if (fn === 'validate_generation_job') return validateResult;
      return null;
    }),
  };
}

describe('P20 residual — resolveOfficialCost() para "transcricao" com job de OCR', () => {
  test('COM job válido → usa credits_reserved do job, ignora body.cost', async () => {
    const { selectOne, rpc } = makeMocks({
      validateResult: true,
      jobRow: { credits_reserved: 7, service: 'ocr:transcricao' },
    });

    const cost = await resolveOfficialCost({
      documentType: 'transcricao',
      chargeType:   'initial',
      selectOne, rpc,
      userId:  'user-1',
      ocrJobId: '11111111-2222-3333-4444-555555555555',
    });

    expect(cost).toBe(7);
    expect(rpc).toHaveBeenCalledWith('validate_generation_job', {
      p_job_id:  '11111111-2222-3333-4444-555555555555',
      p_user_id: 'user-1',
    });
  });

  test('SEM ocrJobId (cliente não enviou nenhum) → cai no custo de catálogo (1), nunca falha', async () => {
    const { selectOne, rpc } = makeMocks({ validateResult: false, jobRow: null });

    const cost = await resolveOfficialCost({
      documentType: 'transcricao', chargeType: 'initial', selectOne, rpc,
      userId: 'user-1', ocrJobId: null,
    });

    expect(cost).toBe(1);
    expect(rpc).not.toHaveBeenCalled(); // nem tenta validar um job que não existe
  });

  test('job INVÁLIDO (pertence a outro utilizador, ou expirado) → NUNCA usa credits_reserved, cai no catálogo', async () => {
    const { selectOne, rpc } = makeMocks({
      validateResult: false, // validate_generation_job devolve false
      jobRow: { credits_reserved: 10, service: 'ocr:transcricao' }, // existe mas não é válido para este user
    });

    const cost = await resolveOfficialCost({
      documentType: 'transcricao', chargeType: 'initial', selectOne, rpc,
      userId: 'user-atacante', ocrJobId: '11111111-2222-3333-4444-555555555555',
    });

    // NUNCA 10 — a validação falhou, por isso cai no custo de catálogo.
    expect(cost).toBe(1);
  });

  test('job pertence a outro tipo de operação (service não começa por "ocr:") → rejeitado, cai no catálogo', async () => {
    // Defesa extra: um _ocrJobId reaproveitado de um job de GERAÇÃO EM
    // CADEIA (P1.1, service:'trabalho') não deve poder ser usado aqui para
    // inflar o custo de uma "transcricao".
    const { selectOne, rpc } = makeMocks({
      validateResult: true, // o job É válido... mas para outra coisa
      jobRow: { credits_reserved: 9, service: 'trabalho' },
    });

    const cost = await resolveOfficialCost({
      documentType: 'transcricao', chargeType: 'initial', selectOne, rpc,
      userId: 'user-1', ocrJobId: '11111111-2222-3333-4444-555555555555',
    });

    expect(cost).toBe(1);
  });

  test('RPC de validação indisponível (erro) → nunca rebenta, cai no catálogo', async () => {
    const selectOne = jest.fn();
    const rpc = jest.fn().mockRejectedValue(new Error('RPC indisponível'));

    const cost = await resolveOfficialCost({
      documentType: 'transcricao', chargeType: 'initial', selectOne, rpc,
      userId: 'user-1', ocrJobId: '11111111-2222-3333-4444-555555555555',
    });

    expect(cost).toBe(1);
  });

  test('credits_reserved inválido no job (0, negativo, não-numérico) → nunca usado, cai no catálogo', async () => {
    for (const badValue of [0, -5, null, 'dez']) {
      const { selectOne, rpc } = makeMocks({
        validateResult: true,
        jobRow: { credits_reserved: badValue, service: 'ocr:transcricao' },
      });
      const cost = await resolveOfficialCost({
        documentType: 'transcricao', chargeType: 'initial', selectOne, rpc,
        userId: 'user-1', ocrJobId: '11111111-2222-3333-4444-555555555555',
      });
      expect(cost).toBe(1);
    }
  });

  test('outros serviços (não-"transcricao") ignoram ocrJobId por completo', async () => {
    const { selectOne, rpc } = makeMocks({
      validateResult: true,
      jobRow: { credits_reserved: 99, service: 'ocr:transcricao' },
    });

    const cost = await resolveOfficialCost({
      documentType: 'cv', chargeType: 'initial', selectOne, rpc,
      userId: 'user-1', ocrJobId: '11111111-2222-3333-4444-555555555555',
    });

    expect(cost).toBe(2); // preço de catálogo real de "cv", nunca 99
    expect(rpc).not.toHaveBeenCalled();
  });
});
