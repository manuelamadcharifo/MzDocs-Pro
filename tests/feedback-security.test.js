// tests/feedback-security.test.js
// P1.8 (Master Hardening & Release Gate v2, Set/2026) — SANITIZAÇÃO
// BACKEND DE FEEDBACK / XSS.
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual, antes desta
// correcção): handleFeedback() (api/admin/index.js) só fazia
// `.trim().slice(0, 500)` ao comentário antes de gravar — nenhuma remoção
// de HTML/scripts. Pior: assets/js/admin/AdminApp.js tinha DOIS pontos que
// mostravam esse comentário sem escaping nenhum (`${f.comment || '...'}`)
// ou com escaping incompleto (só `<` → `&lt;`) — um comentário malicioso
// executava directamente na sessão do PRÓPRIO ADMIN ao rever feedback
// pendente.
//
// Estes testes cobrem os dois lados da correcção:
//   1. api/_lib/textSanitize.js (sanitizePlainText) — unidade pura, sem
//      dependências, testada directamente contra os payloads exactos
//      pedidos no plano de hardening.
//   2. handleFeedback() (api/admin/index.js) — confirma que o valor
//      REALMENTE GRAVADO na base de dados (via insert('user_feedback', ...))
//      já vem sanitizado, não confiando em nenhum consumidor futuro para
//      escapar correctamente.

const { sanitizePlainText } = require('../api/_lib/textSanitize');

describe('P1.8 — sanitizePlainText() remove marcação perigosa (unidade)', () => {
  test('<script>alert(1)</script> — tag E conteúdo removidos por completo', () => {
    const out = sanitizePlainText('Óptimo serviço! <script>alert(1)</script> recomendo.');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('alert(1)');
    expect(out).toBe('Óptimo serviço! recomendo.');
  });

  test('<img src=x onerror=alert(1)> — tag auto-fechada removida por completo', () => {
    const out = sanitizePlainText('Gostei muito <img src=x onerror=alert(1)> obrigado');
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).toBe('Gostei muito obrigado');
  });

  test('SVG malicioso (<svg onload=...>) — removido por completo', () => {
    const out = sanitizePlainText('<svg onload=alert(document.cookie)>texto</svg> fim');
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toMatch(/onload/i);
  });

  test('event handlers soltos (sem tag reconhecida à volta) são removidos', () => {
    const out = sanitizePlainText('bom serviço onmouseover=alert(1) mesmo');
    expect(out).not.toMatch(/onmouseover\s*=/i);
  });

  test('URLs javascript: são neutralizadas mesmo sem tag <a> à volta', () => {
    const out = sanitizePlainText('vejam javascript:alert(document.cookie) aqui');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  test('link <a href="javascript:...">clique aqui</a> — tag removida, texto interno preservado', () => {
    const out = sanitizePlainText('<a href="javascript:alert(1)">clique aqui</a> para ganhar prémio');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).not.toMatch(/<a\b/i);
  });

  test('payload duplamente codificado (&lt;script&gt;) também é neutralizado', () => {
    const out = sanitizePlainText('teste &lt;script&gt;alert(1)&lt;/script&gt; fim');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('alert(1)');
  });

  test('texto normal, sem marcação, sobrevive intacto (não é demasiado agressivo)', () => {
    const out = sanitizePlainText('Serviço excelente! Recomendo a todos. 5 estrelas <3');
    expect(out).toContain('Serviço excelente');
    expect(out).toContain('Recomendo a todos');
  });

  test('respeita o limite de tamanho DEPOIS de sanitizar', () => {
    const longText = 'a'.repeat(600);
    expect(sanitizePlainText(longText, 500).length).toBe(500);
  });

  test('input não-string (null/undefined/número) nunca rebenta, devolve string vazia', () => {
    expect(sanitizePlainText(null)).toBe('');
    expect(sanitizePlainText(undefined)).toBe('');
    expect(sanitizePlainText(123)).toBe('');
  });
});

describe('P1.8 — handleFeedback() grava sempre texto sanitizado (integração)', () => {
  jest.mock('../api/_lib/supabaseAdmin', () => ({
    restRequest:      jest.fn(),
    getUserFromToken: jest.fn().mockResolvedValue({ user: null }),
    insert:           jest.fn().mockResolvedValue({}),
    update:           jest.fn(),
    rpc:              jest.fn(),
  }), { virtual: false });
  jest.mock('../api/_lib/rateLimit', () => ({ checkRateLimit: jest.fn().mockResolvedValue(true) }));

  let handler;
  let supabaseAdmin;

  beforeAll(() => {
    handler = require('../api/admin/index');
    supabaseAdmin = require('../api/_lib/supabaseAdmin');
  });

  function mockReqRes(body) {
    const req = {
      method: 'POST',
      url: '/api/admin?action=feedback',
      query: { action: 'feedback' },
      headers: { 'content-type': 'application/json' },
      body,
    };
    const res = {
      _status: 200, _json: null,
      setHeader() {}, status(c) { this._status = c; return this; },
      json(p) { this._json = p; return this; }, end() { return this; },
    };
    return { req, res };
  }

  beforeEach(() => jest.clearAllMocks());

  test('comentário com <script> chega a insert() já sem a tag/script', async () => {
    const { req, res } = mockReqRes({
      service: 'cv', rating: 5,
      comment: 'Muito bom <script>alert(1)</script> obrigado',
    });
    await handler(req, res);

    expect(res._status).toBe(200);
    const insertedPayload = supabaseAdmin.insert.mock.calls.find(c => c[0] === 'user_feedback')?.[1];
    expect(insertedPayload).toBeDefined();
    expect(insertedPayload.comment).not.toMatch(/<script/i);
    expect(insertedPayload.comment).not.toContain('alert(1)');
  });

  test('display_name com handler de evento chega a insert() já sanitizado', async () => {
    const { req, res } = mockReqRes({
      service: 'cv', rating: 5, comment: 'bom',
      display_name: 'Sofia" onmouseover="alert(1)',
    });
    await handler(req, res);

    const insertedPayload = supabaseAdmin.insert.mock.calls.find(c => c[0] === 'user_feedback')?.[1];
    expect(insertedPayload.display_name).not.toMatch(/onmouseover/i);
  });
});
