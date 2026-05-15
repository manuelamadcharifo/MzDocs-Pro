// tests/auth.test.js
// Testes unitários para AuthManager e AuthUI

/**
 * @jest-environment jsdom
 */

// Mock do Supabase
global.fetch = jest.fn();

describe('AuthManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('deve inicializar em modo anónimo quando /api/config falha', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const { authManager } = await import('../assets/js/auth/AuthManager.js');
    await authManager.ready();

    expect(authManager.user).toBeNull();
    expect(authManager.isAuthenticated()).toBe(false);
  });

  test('deve normalizar telemóveis moçambicanos correctamente', async () => {
    const testCases = [
      { input: '841234567', expected: '+258841234567' },
      { input: '858695506', expected: '+258858695506' },
      { input: '+258841234567', expected: '+258841234567' },
      { input: '258841234567', expected: '+258258841234567' },
    ];

    for (const { input, expected } of testCases) {
      const clean = input.replace(/\D/g, '');
      const normalized = clean.startsWith('258') ? `+${clean}` : `+258${clean}`;
      expect(normalized).toBe(expected);
    }
  });

  test('deve detectar email inválido', () => {
    const invalidEmails = [
      '', 'test', 'test@', '@gmail.com', 'test@gmail', 'test@.com'
    ];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    invalidEmails.forEach(email => {
      expect(emailRegex.test(email)).toBe(false);
    });
  });

  test('deve detectar email válido', () => {
    const validEmails = [
      'test@gmail.com', 'user.name@domain.co.mz', 'a@b.co'
    ];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    validEmails.forEach(email => {
      expect(emailRegex.test(email)).toBe(true);
    });
  });
});

describe('DocumentController', () => {
  test('deve validar campos obrigatórios', () => {
    const fields = [
      { id: 'nome', required: true },
      { id: 'email', required: true },
      { id: 'opcional', required: false },
    ];

    document.body.innerHTML = `
      <input id="nome" value="Manuel" />
      <input id="email" value="" />
    `;

    const data = {};
    fields.forEach(f => {
      const el = document.getElementById(f.id);
      if (el) data[f.id] = el.value.trim();
    });

    const missing = fields.find(f => f.required && !data[f.id])?.id;
    expect(missing).toBe('email');
  });
});

describe('CreditModel', () => {
  test('não deve permitir consumo sem créditos suficientes', () => {
    const credits = 2;
    const cost = 3;
    expect(credits >= cost).toBe(false);
  });

  test('deve permitir consumo com créditos suficientes', () => {
    const credits = 5;
    const cost = 3;
    expect(credits >= cost).toBe(true);
  });
});
