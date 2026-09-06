// tests/documenttype-regression.test.js
// P20 residual (Master Hardening & Release Gate v2, Set/2026 — confirmado
// por revisão externa) — regressão grave encontrada ao investigar o ponto
// de "transcricao"/CLIENT_ESTIMATED_SERVICES.
//
// PROBLEMA CONFIRMADO (por leitura directa do código, seguindo a cadeia
// real desde o cliente): `Services.js::_callBackend()` — o caminho usado
// para PRATICAMENTE TODO o catálogo de serviços (cv, carta, arrendamento,
// requerimento, recibo, procuracao, orcamento, residencia, prestacao,
// recomendacao, licenca, acta, impressao, foto, conversao, transcricao) —
// enviava para /api/deduct-credit apenas `{ cost, operationId }`, SEM
// `documentType`. api/_services/account.js (resolveOfficialCost(), ver
// api/_lib/pricingRegistry.js) precisa de `documentType` para determinar o
// preço OFICIAL de catálogo; sem ele, `documentType` chegava `null` ao
// servidor e caía sempre no custo por omissão (1 crédito).
//
// Resultado real: desde a correcção do P20 (Fase 1 do Master Hardening),
// TODOS os documentos gerados por este caminho — incluindo os que custam
// oficialmente 2 ou 3 créditos (cv, carta, arrendamento, requerimento,
// procuracao, prestacao, acta, recomendacao) — estavam a ser cobrados
// apenas 1 crédito. Uma regressão de receita séria, introduzida sem ser
// detectada porque os testes anteriores (cost-tampering.test.js) testavam
// directamente a função do servidor com `documentType` já presente no
// corpo do pedido construído no próprio teste — nunca verificavam se o
// CLIENTE REAL o enviava.
//
// Este teste lê o ficheiro-fonte real e confirma, de forma estática mas
// directa, que o corpo do pedido a /api/deduct-credit em _callBackend()
// inclui `documentType` — a forma mais robusta de testar isto sem montar
// um sandbox completo de ES modules com todas as dependências de
// Services.js (Formatter, prompts/index, piiShield, AcademicEngine,
// AuthManager dinâmico).

const fs = require('fs');
const path = require('path');

describe('P20 residual — Services.js envia sempre documentType a /api/deduct-credit', () => {
  const src = fs.readFileSync(path.join(__dirname, '../assets/js/services/Services.js'), 'utf8');

  test('_callBackend() (caminho principal de geração) inclui documentType no corpo do pedido de dedução', () => {
    // Isola o corpo da função _callBackend para não apanhar por engano o
    // fetch de /api/generate-document (que usa "serviceType", nome
    // diferente, e é tratado à parte por generate-document.js).
    const fnMatch = /async _callBackend\([^)]*\)\s*\{([\s\S]*?)\n {2}\}\n\n {2}async /.exec(src);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch[1];

    const deductCallMatch = /fetch\('\/api\/deduct-credit',\s*\{[\s\S]*?\}\);/.exec(fnBody);
    expect(deductCallMatch).not.toBeNull();
    const deductCall = deductCallMatch[0];

    expect(deductCall).toMatch(/documentType\s*:\s*serviceType/);
  });

  test('_callBackend() também propaga _ocrJobId (prova de página do OCR) quando disponível', () => {
    const fnMatch = /async _callBackend\([^)]*\)\s*\{([\s\S]*?)\n {2}\}\n\n {2}async /.exec(src);
    const fnBody = fnMatch[1];
    const deductCallMatch = /fetch\('\/api\/deduct-credit',\s*\{[\s\S]*?\}\);/.exec(fnBody);
    expect(deductCallMatch[0]).toMatch(/_ocrJobId/);
  });

  test('generateRaw() (fluxo de reedição) continua a enviar documentType — não regrediu', () => {
    // Já enviava antes desta ronda — confirma que continua, para não
    // regredir ao "arrumar" este ficheiro no futuro.
    const fnMatch = /async generateRaw\([^)]*\)\s*\{([\s\S]*?)\n {2}\}\n\n {2}/.exec(src);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch[1]).toMatch(/documentType\s*:\s*reeditData\?\.serviceType/);
  });
});
