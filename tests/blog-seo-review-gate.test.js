// tests/blog-seo-review-gate.test.js
// P1.9 (Master Hardening & Release Gate v2, Set/2026, Fase 6) — fact-check
// do SEO automático.
//
// Prova _detectSensitiveTopic() (api/_services/blog.js): tópicos
// legal/fiscal/administrativos são detectados (independentemente de
// maiúsculas/acentos) e tópicos normais do produto (CV, cartas, etc.) NÃO
// são falsamente marcados — a auditoria original recomendou explicitamente
// não desligar o SEO automático para o resto do catálogo, só ganhar uma
// revisão extra onde o risco de um erro factual é real.

const { _detectSensitiveTopic } = require('../api/_services/blog.js');

describe('P1.9 — _detectSensitiveTopic()', () => {
  test.each([
    ['Como calcular o ISPC em Moçambique 2026', null],
    ['Guia completo de IRPS para trabalhadores independentes', null],
    ['O que é uma procuração e quando precisa de uma', null],
    ['Requisitos para abrir um NUIT em Moçambique', null],
    ['Como registar uma licença comercial', null],
    ['Direitos do trabalhador em caso de despedimento', null],
    ['Guia de contrato de arrendamento em Maputo', null],
  ])('marca "%s" como tópico sensível', (title) => {
    expect(_detectSensitiveTopic(title, '')).not.toBeNull();
  });

  test.each([
    'Como fazer um CV profissional em Moçambique',
    'Dicas para uma carta de recomendação forte',
    'Como escrever um trabalho escolar bem estruturado',
    'Modelo de orçamento de construção',
    'Como criar um currículo para o primeiro emprego',
  ])('NÃO marca "%s" como tópico sensível', (title) => {
    expect(_detectSensitiveTopic(title, '')).toBeNull();
  });

  test('também verifica as palavras-chave, não só o título', () => {
    expect(_detectSensitiveTopic('Dicas úteis para o dia a dia', 'imposto, fiscal, ISPC')).not.toBeNull();
  });

  test('não é sensível a maiúsculas/minúsculas', () => {
    expect(_detectSensitiveTopic('COMO CALCULAR O IMPOSTO ISPC', '')).not.toBeNull();
  });

  test('devolve null para título/keywords vazios', () => {
    expect(_detectSensitiveTopic('', '')).toBeNull();
    expect(_detectSensitiveTopic(undefined, undefined)).toBeNull();
  });
});
