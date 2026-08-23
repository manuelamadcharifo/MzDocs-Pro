#!/usr/bin/env node
// scripts/ocr-golden-eval.js
// ──────────────────────────────────────────────────────────────────────────
// P1-04 / P2-03 (auditoria Ago/2026) — "OCR deveria ter golden dataset" /
// "estabilização necessária" para um componente que mudou muito
// rapidamente (16-18/08: refactor SmartOCRService, troca de modelo Gemini,
// suporte multi-página, etc.).
//
// Corre CADA fixture em tests/fixtures/ocr/ através do handleOcrAnalyze
// REAL (mesma função usada em produção — chamado directamente, sem HTTP,
// para não precisar de deploy) e compara o resultado com expected.json.
//
// NÃO corre em CI automático (custa dinheiro real em chamadas de IA e
// precisa de chaves de API) — corra manualmente ANTES e DEPOIS de mexer no
// OCR (trocar modelo, mudar prompt, mudar compressão de imagem) e compare
// os dois relatórios. Ver tests/fixtures/ocr/README.md para como adicionar
// fixtures reais.
//
// USO:
//   GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/ocr-golden-eval.js
//   node scripts/ocr-golden-eval.js --fixture=manuscrito_carta_1   (só um)
//
// SAÍDA: relatório por fixture + pontuação agregada (0-100%). Grava também
// um JSON com os resultados brutos em tests/fixtures/ocr/_last-run.json
// para permitir diff programático entre execuções.
// ──────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'ocr');

function arg(name) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.split('=').slice(1).join('=') : null;
}

function loadFixtures() {
  const only = arg('fixture');
  return fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .filter(d => !only || d.name === only)
    .map(d => {
      const dir = path.join(FIXTURES_DIR, d.name);
      const metaPath     = path.join(dir, 'meta.json');
      const expectedPath = path.join(dir, 'expected.json');
      const imagePath    = ['image.jpg', 'image.jpeg', 'image.png'].map(f => path.join(dir, f)).find(fs.existsSync);
      if (!fs.existsSync(metaPath) || !fs.existsSync(expectedPath) || !imagePath) return null;
      return {
        name:     d.name,
        meta:     JSON.parse(fs.readFileSync(metaPath, 'utf8')),
        expected: JSON.parse(fs.readFileSync(expectedPath, 'utf8')),
        imagePath,
      };
    })
    .filter(Boolean);
}

function scoreFixture(expected, actual) {
  const notes = [];
  let checks = 0, passed = 0;

  // 1. Campos esperados presentes e com valor não-vazio.
  for (const [fieldId, expectedVal] of Object.entries(expected.fields || {})) {
    checks++;
    const got = actual?.fields?.[fieldId]?.value;
    if (got && String(got).trim()) {
      passed++;
    } else {
      notes.push(`❌ campo "${fieldId}" ausente (esperado algo como "${expectedVal}")`);
    }
  }

  // 2. Frases-âncora da transcrição.
  const transcript = (actual?.transcript || '').toLowerCase();
  for (const phrase of expected.transcript_contains || []) {
    checks++;
    if (transcript.includes(String(phrase).toLowerCase())) {
      passed++;
    } else {
      notes.push(`❌ transcrição não contém a frase-âncora: "${phrase}"`);
    }
  }

  const pct = checks === 0 ? null : Math.round((passed / checks) * 100);
  return { checks, passed, pct, notes };
}

async function main() {
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    console.log('⚠️  Nenhum fixture real encontrado em tests/fixtures/ocr/.');
    console.log('   As pastas "_example_*" são só esqueletos (sem imagem) — ver README.md.');
    process.exit(0);
  }

  // handleOcrAnalyze é um handler HTTP (req, res) — simulamos um req/res
  // mínimo para o chamar directamente, sem precisar de um servidor.
  const { handleOcrAnalyze } = require('../api/_services/ocr');

  const results = [];
  for (const fx of fixtures) {
    console.log(`\n▶ ${fx.name}  (${fx.meta.category || 'sem categoria'})`);
    const imageBuffer = fs.readFileSync(fx.imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = fx.imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const schema = Object.keys(fx.expected.fields || {}).map(id => ({ id, label: id, type: 'text' }));
    // Sempre inclui pelo menos 1 campo no schema — handleOcrAnalyze exige-o.
    if (schema.length === 0) schema.push({ id: 'titulo', label: 'Título', type: 'text' });

    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: { imageBase64, mimeType, schema, serviceType: fx.meta.serviceType || 'transcricao' },
    };
    let statusCode = 200, jsonBody = null;
    const res = {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      json(body) { jsonBody = body; return this; },
      end() { return this; },
    };

    try {
      await handleOcrAnalyze(req, res);
    } catch (err) {
      console.log(`  💥 excepção: ${err.message}`);
      results.push({ name: fx.name, error: err.message });
      continue;
    }

    if (statusCode !== 200) {
      console.log(`  ❌ HTTP ${statusCode}`, jsonBody);
      results.push({ name: fx.name, error: `HTTP ${statusCode}` });
      continue;
    }

    const score = scoreFixture(fx.expected, jsonBody);
    console.log(`  → ${score.passed}/${score.checks} verificações (${score.pct ?? 'n/d'}%)`);
    score.notes.forEach(n => console.log(`    ${n}`));
    results.push({ name: fx.name, category: fx.meta.category, ...score, raw: jsonBody });
  }

  const scored = results.filter(r => r.pct !== null && r.pct !== undefined);
  const overall = scored.length
    ? Math.round(scored.reduce((s, r) => s + r.pct, 0) / scored.length)
    : null;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(` Pontuação agregada: ${overall === null ? 'n/d' : overall + '%'}  (${scored.length} fixtures avaliados)`);
  console.log('══════════════════════════════════════════════════════════');

  fs.writeFileSync(
    path.join(FIXTURES_DIR, '_last-run.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), overall, results }, null, 2)
  );
  console.log('\n📄 Resultado completo gravado em tests/fixtures/ocr/_last-run.json');
  console.log('   Guarde este ficheiro antes de mexer no OCR para comparar depois.');
}

main().catch(err => {
  console.error('💥 Erro inesperado:', err.message);
  process.exit(1);
});
