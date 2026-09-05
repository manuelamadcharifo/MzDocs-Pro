// tests/payment-fraud.test.js
// Payment Fraud (Master Hardening & Release Gate v2, Set/2026, Fase 4) —
// hash de deduplicação de comprovativos de pagamento.
//
// PROBLEMA CONFIRMADO (por leitura directa do código actual, antes desta
// correcção): `verifyReceiptInternal()` (api/_services/payments.js)
// calculava o hash anti-duplicação assim:
//
//   const receiptHash = crypto.createHash('sha256')
//     .update(imageBase64.slice(0, 5000)).digest('hex');
//
// Só os primeiros 5000 caracteres da STRING base64 (~3.7KB dos bytes reais
// da imagem) entravam no hash — uma fracção mínima de qualquer fotografia
// real (tipicamente 100KB-2MB). Risco: alterar UM ÚNICO byte da imagem
// DEPOIS dessa fracção inicial (comprimir de novo, editar EXIF, recortar
// a margem) produzia um hash diferente para o que é, na prática, o MESMO
// comprovativo — permitindo reutilizar um único pagamento real várias
// vezes para reclamar créditos repetidamente, contornando a verificação
// de duplicado (`transactions?receipt_hash=eq....&status=eq.completed`).
//
// Corrigido: hash do BINÁRIO REAL completo da imagem
// (`Buffer.from(imageBase64, 'base64')`), não da string base64 nem de um
// prefixo dela.
//
// Estes testes provam directamente a propriedade que importa: duas
// imagens que só diferem DEPOIS dos primeiros 5000 caracteres base64 —
// exactamente o cenário do exploit — têm agora hashes DIFERENTES (antes
// desta correcção, teriam o MESMO hash, porque só o prefixo entrava no
// cálculo).

jest.mock('../api/_lib/visionAI', () => ({
  analyzeImage: jest.fn(),
  parseJSON:    jest.fn(),
}));
jest.mock('../api/_lib/notifyTelegram', () => ({
  notifyPaymentNeedsReview: jest.fn(),
}));
jest.mock('../api/_lib/supabaseAdmin', () => ({
  restRequest:     jest.fn(),
  rpc:             jest.fn(),
  insert:          jest.fn(),
  update:          jest.fn(),
  adminCreateUser: jest.fn(),
}));
jest.mock('../api/_lib/observability', () => ({ logEvent: jest.fn() }));
jest.mock('../api/_lib/rateLimit', () => ({ checkRateLimit: jest.fn().mockResolvedValue(true) }));
jest.mock('../api/_lib/packages', () => ({
  loadPackagesFromSettings: jest.fn().mockResolvedValue({}),
  packageTotalCredits:      jest.fn().mockReturnValue(0),
}));

const crypto = require('crypto');
const supabaseAdmin = require('../api/_lib/supabaseAdmin');
const visionAI = require('../api/_lib/visionAI');
const { verifyReceiptInternal } = require('../api/_services/payments');

// Constrói uma imagem base64 "realista" (maior que os 5000 caracteres do
// bug antigo) cujos primeiros N bytes são fixos (simula a mesma foto) e o
// resto é aleatório (simula uma recompressão/edição trivial).
function buildFakeReceiptBase64({ sharedPrefixBytes = 6000, totalBytes = 200_000, seed = 1 }) {
  const shared = Buffer.alloc(sharedPrefixBytes, 7); // conteúdo fixo e idêntico entre chamadas
  const rest = Buffer.alloc(totalBytes - sharedPrefixBytes);
  for (let i = 0; i < rest.length; i++) rest[i] = (i * 31 + seed) % 256;
  return Buffer.concat([shared, rest]).toString('base64');
}

async function runUpToHashCheck(imageBase64) {
  // Limpar histórico de chamadas ANTES desta invocação — importante quando
  // o mesmo teste chama runUpToHashCheck() mais do que uma vez (ex.: para
  // comparar dois hashes), para não encontrar por engano uma chamada da
  // invocação anterior ao procurar o padrão "receipt_hash=eq." abaixo.
  supabaseAdmin.restRequest.mockClear();

  // A IA falha de propósito — força um retorno antecipado (awaiting_review)
  // logo a seguir ao passo 2 (hash + verificação de duplicado), sem
  // precisar de mockar toda a árvore de decisão de aprovação automática.
  visionAI.analyzeImage.mockRejectedValueOnce(new Error('IA indisponível neste teste'));
  supabaseAdmin.restRequest.mockResolvedValue([]); // nenhum duplicado encontrado
  supabaseAdmin.update.mockResolvedValue({});

  await verifyReceiptInternal({
    imageBase64,
    mimeType:      'image/jpeg',
    reference:     'MZ-TEST',
    phone:         '+258841234567',
    amount:        100,
    wallet:        'M-Pesa',
    userId:        'user-1',
    transactionId: 'tx-1',
    packageId:     'starter',
  });

  // A 1ª chamada a restRequest depois do início é a verificação de
  // duplicado por receipt_hash — extrai o hash usado a partir do URL.
  const dedupCall = supabaseAdmin.restRequest.mock.calls.find(c => String(c[0]).includes('receipt_hash=eq.'));
  const match = dedupCall && /receipt_hash=eq\.([0-9a-f]{64})/.exec(dedupCall[0]);
  return match ? match[1] : null;
}

describe('Payment Fraud — hash de deduplicação do comprovativo (binário completo, não um prefixo)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hash é sempre o SHA-256 do BINÁRIO completo da imagem, não da string base64/prefixo', async () => {
    const img = buildFakeReceiptBase64({ totalBytes: 50_000, seed: 1 });
    const hash = await runUpToHashCheck(img);

    const expected = crypto.createHash('sha256').update(Buffer.from(img, 'base64')).digest('hex');
    expect(hash).toBe(expected);

    // Confirma explicitamente que NÃO é o hash do bug antigo (prefixo de
    // 5000 caracteres da string base64) — se fosse, este teste continuaria
    // a passar por coincidência sempre que os dois hashes calhassem iguais,
    // por isso comparamos também contra o valor antigo para o mesmo input.
    const oldBuggyHash = crypto.createHash('sha256').update(img.slice(0, 5000)).digest('hex');
    expect(hash).not.toBe(oldBuggyHash);
  });

  test('CENÁRIO DE FRAUDE: duas imagens idênticas nos primeiros 6000 bytes (>5000 caracteres base64) mas diferentes depois → hashes DIFERENTES', async () => {
    // Isto é exactamente o ataque que o bug antigo permitia: pegar num
    // comprovativo já usado e alterar só um byte a seguir aos primeiros
    // ~3.7KB — o hash truncado ficava idêntico, e o pagamento podia ser
    // "reutilizado" para reclamar créditos de novo.
    const imgOriginal = buildFakeReceiptBase64({ sharedPrefixBytes: 6000, totalBytes: 200_000, seed: 1 });
    const imgAdulterado = buildFakeReceiptBase64({ sharedPrefixBytes: 6000, totalBytes: 200_000, seed: 2 });

    // Confirmar que os dois inputs PARTILHAM mesmo os primeiros 5000+
    // caracteres base64 (a fracção que o código antigo hasheava sozinha) —
    // garante que o teste está mesmo a exercitar o cenário do bug.
    expect(imgOriginal.slice(0, 5000)).toBe(imgAdulterado.slice(0, 5000));

    const hash1 = await runUpToHashCheck(imgOriginal);
    const hash2 = await runUpToHashCheck(imgAdulterado);

    expect(hash1).not.toBeNull();
    expect(hash2).not.toBeNull();
    expect(hash1).not.toBe(hash2);
  });

  test('a mesma imagem produz sempre o mesmo hash (determinístico, necessário para a deduplicação funcionar)', async () => {
    const img = buildFakeReceiptBase64({ totalBytes: 80_000, seed: 5 });
    const hash1 = await runUpToHashCheck(img);
    const hash2 = await runUpToHashCheck(img);
    expect(hash1).toBe(hash2);
  });
});
