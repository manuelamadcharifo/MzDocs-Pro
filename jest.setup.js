// jest.setup.js
// ──────────────────────────────────────────────────────────────────────────
// CORRIGIDO: o ambiente de testes (`testEnvironment: 'jsdom'`, ver
// package.json) usa a implementação de AbortController/AbortSignal do
// próprio jsdom, que — ao contrário do Node.js real usado no deploy
// (Vercel, Node 24.x) — não inclui os métodos estáticos `AbortSignal.timeout()`
// nem `AbortSignal.any()` (adições mais recentes ao standard, ainda em falta
// em várias versões do jsdom). Isto fazia com que QUALQUER teste que
// exercitasse código com `signal: AbortSignal.timeout(...)` falhasse com
// "AbortSignal.timeout is not a function" — não porque o código da app
// estivesse errado (funciona perfeitamente em produção), mas porque o
// ambiente de simulação dos testes não tinha essa API.
//
// Este ficheiro só corre nos testes (ver "setupFiles" em package.json) —
// nunca é incluído no código servido à aplicação real.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}

if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = function any(signals) {
    const controller = new AbortController();
    for (const s of signals) {
      if (s.aborted) { controller.abort(s.reason); break; }
      s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
    }
    return controller.signal;
  };
}
