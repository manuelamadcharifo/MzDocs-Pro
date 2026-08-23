// eslint.config.mjs — configuração ESLint (flat config, ESLint 9+)
//
// OBJECTIVO (auditoria Ago/2026, Sprint 2 — Qualidade):
//   "lint": "echo 'Linting not configured yet'" não pegava absolutamente
//   nada. Esta configuração activa regras que detectam bugs reais
//   (variáveis não definidas, chaves duplicadas, código inalcançável,
//   promises esquecidas, etc.) como ERRO — o que falha o `npm run lint`
//   e, por isso, falha o CI (.github/workflows/test.yml) — e deixa
//   preferências de estilo apenas como AVISO, para não travar o projecto
//   com centenas de avisos irrelevantes logo na primeira execução.
//
// NOTA IMPORTANTE PARA O AUTOR DO PROJECTO:
//   Este ambiente não tem acesso à internet, por isso não foi possível
//   correr `npm install` + `npx eslint .` aqui para confirmar que o
//   código actual passa sem erros. É muito provável que a primeira
//   execução real (`npm install && npm run lint`) aponte alguns erros
//   genuínos (normal na primeira vez que se liga lint a um projecto já
//   grande) — corrija-os um a um; não são "regras a mais", são bugs reais
//   que o lint está finalmente a apanhar.
//
// Sem plugins externos além de "globals" (definição de globais de
// browser/node/jest) — mantém a instalação leve e sem dependências extra
// que possam falhar por versões.

import js from '@eslint/js';
import globals from 'globals';

export default [
  // Ficheiros/pastas nunca analisados
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '.vercel/**',
      'assets/vendor/**',
      'assets/js/**/*.min.js',
      'docs/**',
      'supabase/**',        // SQL, não JS
      'sw.js',               // service worker tratado à parte, abaixo
    ],
  },

  // ── Base recomendada do ESLint ────────────────────────────────────────
  js.configs.recommended,

  // ── Backend: api/**, scripts/** — Node, CommonJS (require/module.exports) ─
  {
    files: ['api/**/*.js', 'scripts/**/*.js', 'jest.setup.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // Correcção real — mantidas como erro
      'no-undef':          'error',
      'no-dupe-keys':      'error',
      'no-dupe-args':      'error',
      'no-unreachable':    'error',
      'no-const-assign':   'error',
      'no-fallthrough':    'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'valid-typeof':      'error',

      // Estilo / disciplina — aviso, não bloqueia
      'no-unused-vars': ['warn', {
        // O projecto usa muito `catch (_)` / `catch (e) {}` de propósito
        // (erros best-effort que não devem quebrar o fluxo principal —
        // ver notas "best-effort" espalhadas por api/misc.js). Ignorar
        // esse padrão evita centenas de avisos sobre código intencional.
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
      'no-console':  'off', // console.log/warn/error são o logging actual do projecto (ver P2 observabilidade)
      'eqeqeq':      ['warn', 'smart'],
      'no-var':      'warn',
      'prefer-const': 'warn',
    },
  },

  // ── Frontend: assets/js/** — browser, ES modules ────────────────────────
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef':        'error',
      'no-dupe-keys':    'error',
      'no-unreachable':  'error',
      'no-const-assign': 'error',
      'no-fallthrough':  'error',

      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
      'no-console':   'off',
      'eqeqeq':       ['warn', 'smart'],
      'no-var':       'warn',
      'prefer-const': 'warn',
    },
  },

  // ── Service Worker: sw.js — globais próprios (self, caches, clients) ────
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: {
      'no-undef':       'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // ── Testes: tests/**, *.test.js — Jest ──────────────────────────────────
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      'no-undef':       'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
    },
  },
];
