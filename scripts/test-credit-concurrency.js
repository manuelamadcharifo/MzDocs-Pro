#!/usr/bin/env node
// scripts/test-credit-concurrency.js
// ──────────────────────────────────────────────────────────────────────────
// P1-09 (auditoria Ago/2026) — "Ledger de créditos é uma melhoria muito boa,
// mas precisa de teste de concorrência."
//
// PORQUÊ UM SCRIPT E NÃO UM TESTE JEST MOCADO:
// A pergunta que a auditoria faz — "dois pedidos simultâneos com saldo=1
// nunca resultam em saldo=-1 ou em dois documentos gerados com 1 crédito
// só" — só tem resposta real testando o LOCK de linha do Postgres
// (`SELECT ... FOR UPDATE`, já presente em deduct_credit/deduct_credits
// desde migration_v52_credit_ledger.sql). Um teste Jest com
// supabaseAdmin/fetch mocado nunca exercita lock nenhum — teria sempre
// "sucesso", porque não existe Postgres nenhum por trás. Por isso este é
// um script standalone que corre contra uma base de dados REAL (staging,
// nunca produção) e reporta PASS/FAIL com números reais.
//
// O QUE FAZ:
//   1. Cria/reaproveita uma conta de teste (por profile_id fornecido) e
//      define o saldo inicial exacto para o teste (ex.: 1 crédito).
//   2. Dispara N chamadas concorrentes reais a rpc('deduct_credit', ...)
//      via fetch directo ao PostgREST (mesmo padrão do resto do projecto —
//      sem SDK), todas ao MESMO tempo (Promise.all).
//   3. Verifica:
//      a) exactamente `min(N, saldoInicial)` chamadas tiveram sucesso
//         (retorno >= 0);
//      b) o saldo final em profiles.credits é exactamente
//         saldoInicial - sucessos;
//      c) o saldo NUNCA ficou negativo (checagem best-effort, via os
//         valores de retorno de cada chamada).
//   4. Repete o mesmo teste para deduct_credits(amount=2) — dedução em lote.
//
// COMO USAR:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=xxxx \
//   node scripts/test-credit-concurrency.js --user-id=<uuid-de-teste> --concurrency=10
//
// REQUISITOS:
//   - Um utilizador de teste já existente (profiles.id) num projecto de
//     STAGING — nunca aponte isto a produção, o script força o saldo dessa
//     conta para valores arbitrários repetidamente.
//   - Node 18+ (fetch nativo).
//
// EXIT CODE: 0 se todos os cenários passarem, 1 caso contrário — pode ser
// ligado a um passo de CI manual (não corre no GitHub Actions automático
// porque exige uma base de dados real e credenciais de staging).
// ──────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name, fallback) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.split('=').slice(1).join('=') : fallback;
}

const USER_ID     = arg('user-id');
const CONCURRENCY = parseInt(arg('concurrency', '10'), 10);

#!/usr/bin/env node
// scripts/test-credit-concurrency.js
// ──────────────────────────────────────────────────────────────────────────
// P1-09 (auditoria Ago/2026) — "Ledger de créditos é uma melhoria muito boa,
// mas precisa de teste de concorrência."
//
// PORQUÊ UM SCRIPT E NÃO UM TESTE JEST MOCADO:
// A pergunta que a auditoria faz — "dois pedidos simultâneos com saldo=1
// nunca resultam em saldo=-1 ou em dois documentos gerados com 1 crédito
// só" — só tem resposta real testando o LOCK de linha do Postgres
// (`SELECT ... FOR UPDATE`, já presente em deduct_credit/deduct_credits
// desde migration_v52_credit_ledger.sql). Um teste Jest com
// supabaseAdmin/fetch mocado nunca exercita lock nenhum — teria sempre
// "sucesso", porque não existe Postgres nenhum por trás. Por isso este é
// um script standalone que corre contra uma base de dados REAL (staging,
// nunca produção) e reporta PASS/FAIL com números reais.
//
// O QUE FAZ:
//   1. Cria/reaproveita uma conta de teste (por profile_id fornecido) e
//      define o saldo inicial exacto para o teste (ex.: 1 crédito).
//   2. Dispara N chamadas concorrentes reais a rpc('deduct_credit', ...)
//      via fetch directo ao PostgREST (mesmo padrão do resto do projecto —
//      sem SDK), todas ao MESMO tempo (Promise.all).
//   3. Verifica:
//      a) exactamente `min(N, saldoInicial)` chamadas tiveram sucesso
//         (retorno >= 0);
//      b) o saldo final em profiles.credits é exactamente
//         saldoInicial - sucessos;
//      c) o saldo NUNCA ficou negativo (checagem best-effort, via os
//         valores de retorno de cada chamada).
//   4. Repete o mesmo teste para deduct_credits(amount=2) — dedução em lote.
//
// COMO USAR:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=xxxx \
//   node scripts/test-credit-concurrency.js --user-id=<uuid-de-teste> --concurrency=10
//
// REQUISITOS:
//   - Um utilizador de teste já existente (profiles.id) num projecto de
//     STAGING — nunca aponte isto a produção, o script força o saldo dessa
//     conta para valores arbitrários repetidamente.
//   - Node 18+ (fetch nativo).
//
// EXIT CODE: 0 se todos os cenários passarem, 1 caso contrário — pode ser
// ligado a um passo de CI manual (não corre no GitHub Actions automático
// porque exige uma base de dados real e credenciais de staging).
// ──────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name, fallback) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.split('=').slice(1).join('=') : fallback;
}

const USER_ID     = arg('user-id');
const CONCURRENCY = parseInt(arg('concurrency', '10'), 10);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (de um projecto de STAGING).');
  process.exit(1);
}
if (!USER_ID) {
  console.error('❌ Passe --user-id=<uuid> de um profile de TESTE existente em staging.');
  process.exit(1);
}

const HEADERS = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}), Prefer: opts.prefer || 'return=representation' },
  });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch (_) { json = text; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function rpc(fn, body) {
  return rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
}

async function setBalance(userId, credits) {
  await rest(`profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ credits, updated_at: new Date().toISOString() }),
    prefer: 'return=minimal',
  });
}

async function getBalance(userId) {
  const rows = await rest(`profiles?id=eq.${userId}&select=credits`);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Utilizador de teste não encontrado');
  return rows[0].credits;
}

async function runScenario({ label, startingCredits, deductFn, concurrency }) {
  console.log(`\n▶ Cenário: ${label} (saldo inicial=${startingCredits}, concorrência=${concurrency})`);
  await setBalance(USER_ID, startingCredits);

  const calls = Array.from({ length: concurrency }, () => deductFn());
  const results = await Promise.allSettled(calls);

  const successes = results.filter(r => r.status === 'fulfilled' && Number(r.value) >= 0).length;
  const finalBalance = await getBalance(USER_ID);
  const expectedSuccesses = Math.min(concurrency, startingCredits / deductScenarioAmount(label));
  const expectedFinalBalance = startingCredits - successes * deductScenarioAmount(label);

  const negativeAnywhere = results.some(r => r.status === 'fulfilled' && Number(r.value) < 0 && Number(r.value) !== -1);
  // -1 é o código de "insuficiente/não encontrado" da função — não é um saldo negativo real.

  console.log(`  → chamadas com sucesso: ${successes} / ${concurrency} (esperado: ${expectedSuccesses})`);
  console.log(`  → saldo final:          ${finalBalance} (esperado: ${expectedFinalBalance})`);

  const pass = successes === expectedSuccesses && finalBalance === expectedFinalBalance && finalBalance >= 0 && !negativeAnywhere;
  console.log(pass ? '  ✅ PASS — nenhuma corrida ganhou créditos extra, saldo nunca negativo.'
                    : '  ❌ FAIL — possível condição de corrida ou contagem inesperada.');
  return pass;
}

function deductScenarioAmount(label) {
  return label.includes('lote') ? 2 : 1;
}

(async () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log(' Teste de concorrência do credit_ledger (P1-09)');
  console.log(` Alvo: ${SUPABASE_URL}  |  user_id: ${USER_ID}`);
  console.log('══════════════════════════════════════════════════════════');

  const results = [];

  // Cenário 1: saldo=1, N pedidos simultâneos de 1 crédito cada.
  // Só UM deve ter sucesso — é o caso exacto citado na auditoria.
  results.push(await runScenario({
    label:           'deduct_credit — saldo=1, corrida por 1 crédito',
    startingCredits: 1,
    concurrency:     CONCURRENCY,
    deductFn:        () => rpc('deduct_credit', { user_id: USER_ID }),
  }));

  // Cenário 2: saldo=5, mais pedidos do que saldo disponível.
  results.push(await runScenario({
    label:           'deduct_credit — saldo=5, mais pedidos que saldo',
    startingCredits: 5,
    concurrency:     CONCURRENCY,
    deductFn:        () => rpc('deduct_credit', { user_id: USER_ID }),
  }));

  // Cenário 3: deduct_credits em lote (amount=2) — mesma classe de corrida,
  // caminho de código diferente (usado por serviços com custo >1 crédito).
  results.push(await runScenario({
    label:           'deduct_credits (lote de 2) — saldo=4',
    startingCredits: 4,
    concurrency:     CONCURRENCY,
    deductFn:        () => rpc('deduct_credits', { p_user_id: USER_ID, p_amount: 2 }),
  }));

  const allPass = results.every(Boolean);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(allPass ? '✅ TODOS OS CENÁRIOS PASSARAM' : '❌ PELO MENOS UM CENÁRIO FALHOU');
  console.log('══════════════════════════════════════════════════════════');
  process.exit(allPass ? 0 : 1);
})().catch(err => {
  console.error('💥 Erro inesperado a correr o teste de concorrência:', err.message);
  process.exit(1);
});
