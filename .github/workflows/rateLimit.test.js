// tests/rateLimit.test.js
// Testes para api/_lib/rateLimit.js — extraído na auditoria (ponto 5) para
// substituir os Maps locais frágeis de verify-receipt/legal-search por um
// mecanismo com persistência via Redis (com fallback gracioso para Map
// local quando Redis não está configurado, que é o que estes testes
// exercitam — sem mockar Redis, correm sempre pelo caminho de fallback).

const { checkRateLimit } = require('../api/_lib/rateLimit');

describe('checkRateLimit (fallback local, sem Redis configurado)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  test('permite pedidos dentro do limite', async () => {
    const ns = `test-${Date.now()}-a`;
    for (let i = 0; i < 3; i++) {
      const allowed = await checkRateLimit(ns, '1.1.1.1', { limit: 3, windowSec: 60 });
      expect(allowed).toBe(true);
    }
  });

  test('bloqueia o pedido que excede o limite', async () => {
    const ns = `test-${Date.now()}-b`;
    await checkRateLimit(ns, '1.1.1.1', { limit: 2, windowSec: 60 });
    await checkRateLimit(ns, '1.1.1.1', { limit: 2, windowSec: 60 });
    const thirdAttempt = await checkRateLimit(ns, '1.1.1.1', { limit: 2, windowSec: 60 });
    expect(thirdAttempt).toBe(false);
  });

  test('identidades (IPs) diferentes têm contadores independentes', async () => {
    const ns = `test-${Date.now()}-c`;
    await checkRateLimit(ns, '2.2.2.2', { limit: 1, windowSec: 60 });
    // '2.2.2.2' já esgotou o seu limite de 1 — mas '3.3.3.3' não deve ser afectado
    const otherIdentity = await checkRateLimit(ns, '3.3.3.3', { limit: 1, windowSec: 60 });
    expect(otherIdentity).toBe(true);
  });

  test('namespaces diferentes não compartilham contador (ex.: receipt vs legal-search)', async () => {
    const sharedIp = '4.4.4.4';
    const nsA = `receipt-${Date.now()}`;
    const nsB = `legal-search-${Date.now()}`;
    await checkRateLimit(nsA, sharedIp, { limit: 1, windowSec: 60 });
    // nsA já esgotou para este IP — nsB com o mesmo IP deve continuar livre
    const otherNamespace = await checkRateLimit(nsB, sharedIp, { limit: 1, windowSec: 60 });
    expect(otherNamespace).toBe(true);
  });

  test('usa limite/janela por defeito quando não especificados', async () => {
    const ns = `test-default-${Date.now()}`;
    const allowed = await checkRateLimit(ns, '5.5.5.5');
    expect(allowed).toBe(true);
  });

  test('identidade ausente/undefined não rebenta (cai em "unknown")', async () => {
    const ns = `test-unknown-${Date.now()}`;
    const allowed = await checkRateLimit(ns, undefined, { limit: 1, windowSec: 60 });
    expect(allowed).toBe(true);
  });
});
