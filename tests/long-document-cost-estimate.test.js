// tests/long-document-cost-estimate.test.js
// P1.2 (Master Hardening & Release Gate v2, Set/2026) — previsibilidade do
// custo do Trabalho Escolar / Plano de Negócios.
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual, antes desta
// correcção): existiam DOIS mecanismos de custo independentes para
// "trabalho" — um cálculo por páginas (dynamicCostPerPage:5, "1 crédito a
// cada 5 páginas") usado para a cobrança INICIAL, mostrado ao utilizador
// no botão "Gerar com IA", e o modelo progressivo por caracteres
// (CHARS_PER_EXTRA_CREDIT=6000, em LongDocumentEngine.js) cobrado DURANTE
// a geração, conforme o texto realmente crescia. Um trabalho de 20 páginas
// mostrava/cobrava 4 créditos à partida (20÷5), mas o total real rondava
// as 20 (1 crédito inicial + ~19 progressivos) — o utilizador nunca via o
// custo verdadeiro com antecedência, e podia ficar com um documento
// truncado sem perceber porquê.
//
// Correcção: uma ÚNICA fonte de verdade — LongDocumentEngine.estimateCredits(),
// derivada da MESMA constante CHARS_PER_EXTRA_CREDIT que já determina a
// cobrança real, usada tanto para a cobrança como para a estimativa
// mostrada ao utilizador (ver Views.js/DocumentController.js).
//
// LongDocumentEngine.js é um módulo ES ("export class ...") sem
// dependências externas (confirmado: nenhum outro import no ficheiro) —
// este teste avalia-o num sandbox de vm, removendo só a palavra "export",
// para exercitar o CÓDIGO REAL em vez de reimplementar a fórmula à parte.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadLongDocumentEngine() {
  const filePath = path.join(__dirname, '../assets/js/services/LongDocumentEngine.js');
  const src = fs.readFileSync(filePath, 'utf8').replace('export class LongDocumentEngine', 'class LongDocumentEngine');
  const sandbox = { module: { exports: {} }, console, fetch: () => Promise.reject(new Error('not used in this test')) };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nmodule.exports = LongDocumentEngine;', sandbox, { filename: filePath });
  return sandbox.module.exports;
}

describe('P1.2 — LongDocumentEngine.estimateCredits() é a fonte única de verdade', () => {
  const LongDocumentEngine = loadLongDocumentEngine();

  test.each([
    [1, 1],
    [5, 5],
    [6, 6],
    [10, 10],
    [11, 11],
    [15, 15],
    [20, 20],
    [30, 30],
  ])('estimateCredits(%d páginas) → %d créditos (1 inicial + progressão por página, ~6000 caracteres/página)', (pages, expected) => {
    expect(LongDocumentEngine.estimateCredits(pages)).toBe(expected);
  });

  test('nunca devolve menos de 1 crédito, mesmo com 0 ou páginas inválidas', () => {
    expect(LongDocumentEngine.estimateCredits(0)).toBe(1);
    expect(LongDocumentEngine.estimateCredits(-5)).toBe(1);
    expect(LongDocumentEngine.estimateCredits(NaN)).toBe(1);
    expect(LongDocumentEngine.estimateCredits(undefined)).toBe(1);
  });

  test('é monotonamente crescente — mais páginas nunca custam menos', () => {
    let prev = LongDocumentEngine.estimateCredits(1);
    for (let p = 2; p <= 30; p++) {
      const cur = LongDocumentEngine.estimateCredits(p);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  test('PAGE_THRESHOLD (6 páginas) continua a ser o limite que activa o motor de cadeia', () => {
    expect(LongDocumentEngine.isLongDoc('trabalho', { paginas: 5 })).toBe(false);
    expect(LongDocumentEngine.isLongDoc('trabalho', { paginas: 6 })).toBe(true);
    // "planonegocio" é sempre geração em cadeia, independentemente de páginas
    // (não tem campo de páginas no formulário — ver ServiceDefinitions.js).
    expect(LongDocumentEngine.isLongDoc('planonegocio', {})).toBe(true);
  });
});
