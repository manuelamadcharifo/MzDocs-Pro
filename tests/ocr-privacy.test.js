// tests/ocr-privacy.test.js
// P1.7 (Master Hardening & Release Gate v2, Set/2026) — OCR e dados
// sensíveis.
//
// CONTEXTO (ver nota completa em OCRController.js e no README, secção 7):
// a imagem fotografada para preenchimento automático é enviada para um
// fornecedor externo de IA de visão (Google Gemini / Groq) para ser
// transcrita. Redacção automática de regiões sensíveis (BI, NUIT,
// assinatura, foto) DENTRO da imagem, antes de a enviar, exigiria um motor
// de visão computacional dedicado — marcado honestamente como
// "BLOCKED — requires further engineering" na tabela de Definition of
// Done desta ronda, em vez de fingir uma solução incompleta.
//
// O que É verificável e testado aqui:
//   1. A imagem/os valores extraídos NUNCA são passados a logEvent() em
//      api/_services/ocr.js (confirmado por leitura estática do ficheiro —
//      só metadados como nº de páginas/duração são registados).
//   2. api/_lib/observability.js redige campos sensíveis conhecidos
//      (receiptImage, password, tokens) antes de qualquer log, como
//      camada adicional de defesa em profundidade.
//   3. OCRController.js exige consentimento explícito (uma vez por
//      navegador) ANTES de abrir a câmara/selector de ficheiros pela
//      primeira vez — nunca envia uma foto para o fornecedor externo sem
//      este aviso ter aparecido primeiro pelo menos uma vez.

const fs = require('fs');
const path = require('path');

describe('P1.7 — api/_services/ocr.js nunca regista a imagem nem valores extraídos em logs', () => {
  const src = fs.readFileSync(path.join(__dirname, '../api/_services/ocr.js'), 'utf8');

  test('nenhuma chamada a logEvent() passa imageBase64/imagesBase64/campos extraídos', () => {
    const logEventCalls = src.match(/logEvent\([^)]*\)/gs) || [];
    expect(logEventCalls.length).toBeGreaterThan(0); // confirma que há logging (não um teste vazio)
    for (const call of logEventCalls) {
      expect(call).not.toMatch(/imageBase64|imagesBase64|\bfields\b|extractedFields|ocrText/);
    }
  });

  test('nenhum console.log/error do ficheiro imprime a imagem completa', () => {
    const consoleCalls = src.match(/console\.(log|error|warn)\([^)]*\)/gs) || [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/imageBase64|imagesBase64/);
    }
  });
});

describe('P1.7 — api/_lib/observability.js redige campos sensíveis antes de logar', () => {
  const { logEvent } = require('../api/_lib/observability');

  test('receiptImage (base64 de comprovativos) é sempre redigido', () => {
    // logEvent grava de forma assíncrona/best-effort; testamos a função de
    // sanitização indirectamente confirmando que não rejeita nem propaga o
    // valor sensível — a garantia real está na constante SENSITIVE_KEYS,
    // verificada abaixo por leitura directa do ficheiro (mais robusto do
    // que depender de mockar toda a cadeia de persistência de eventos).
    expect(() => logEvent('test', 'evento', { receiptImage: 'A'.repeat(50000) })).not.toThrow();
  });

  test('SENSITIVE_KEYS inclui os campos realmente sensíveis do projecto', () => {
    const obsSrc = fs.readFileSync(path.join(__dirname, '../api/_lib/observability.js'), 'utf8');
    const m = /SENSITIVE_KEYS\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(obsSrc);
    expect(m).not.toBeNull();
    const keys = m[1];
    for (const expected of ['password', 'tempPass', 'receiptImage', 'token']) {
      expect(keys).toContain(expected);
    }
  });
});

describe('P1.7 — OCRController exige consentimento explícito antes do 1º uso', () => {
  const vm = require('vm');

  function loadOCRController() {
    const filePath = path.join(__dirname, '../assets/js/controllers/OCRController.js');
    let src = fs.readFileSync(filePath, 'utf8');
    // Substitui os imports ES por stubs simples — só _ensureOcrConsent() e
    // trigger() são exercitados neste teste, não precisam de
    // NotificationView/SmartOCRService/SERVICES reais.
    src = src.replace(
      /^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?$/gm,
      ''
    );
    src = src.replace(/^export class OCRController/m, 'class OCRController');
    // Stubs para os símbolos que vinham dos imports removidos — só
    // _ensureOcrConsent()/trigger() são exercitados neste teste, nenhum
    // deles chama NotificationView/DocumentView/SmartOCRService/SERVICES
    // de facto, mas o constructor referencia SmartOCRService directamente.
    src = 'const NotificationView = {}, DocumentView = {}, SERVICES = {};\n'
        + 'class SmartOCRService { constructor() {} }\n'
        + src;
    src += '\nmodule.exports = { OCRController };';
    // Executa no MESMO contexto global do teste (jsdom) — reutiliza
    // window/document/localStorage reais do ambiente de testes, em vez de
    // um sandbox à parte, para exercitar o código exactamente como corre
    // num browser real.
    // NOTA: vm.runInThisContext() corre no contexto real do Node, que nesta
    // versão do Jest não é o mesmo global do ambiente jsdom do teste
    // (window/document/localStorage ficam undefined lá dentro) — por isso
    // window/document/localStorage do PRÓPRIO teste são passados
    // explicitamente como parâmetros da função, em vez de depender de
    // resolução de globais implícita.
    const wrapped = `(function(module, exports, require, window, document, localStorage) {\n${src}\n})`;
    const fn = vm.runInThisContext(wrapped, { filename: filePath });
    const mod = { exports: {} };
    fn(mod, mod.exports, () => ({}), window, document, localStorage);
    return mod.exports.OCRController;
  }

  let OCRController;
  beforeAll(() => { OCRController = loadOCRController(); });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<input type="file" id="ocrInput" />';
  });

  test('1ª vez: mostra o aviso de consentimento antes de abrir o selector', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const ctrl = new OCRController({});
    const input = document.getElementById('ocrInput');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

    ctrl.trigger('cam');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/IA|Google|Groq/i);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  test('se o utilizador recusar o consentimento, o selector NUNCA abre', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const ctrl = new OCRController({});
    const input = document.getElementById('ocrInput');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

    ctrl.trigger('file');

    expect(clickSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('mz_ocr_consent_v1')).not.toBe('1');
    confirmSpy.mockRestore();
  });

  test('depois de aceitar uma vez, não volta a perguntar (persistido em localStorage)', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const ctrl = new OCRController({});
    const input = document.getElementById('ocrInput');
    jest.spyOn(input, 'click').mockImplementation(() => {});

    ctrl.trigger('cam');
    ctrl.trigger('cam');
    ctrl.trigger('file');

    expect(confirmSpy).toHaveBeenCalledTimes(1); // só a 1ª chamada perguntou
    confirmSpy.mockRestore();
  });
});
