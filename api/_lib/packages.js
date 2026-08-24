// api/_lib/packages.js
// ──────────────────────────────────────────────────────────────────────────
// CORRIGIDO (Junho/2026): os preços/créditos dos pacotes (avulso, starter,
// básico, pro, empresa) estavam hard-coded e DUPLICADOS em 5 locais
// diferentes: api/process-payment.js, api/misc.js,
// assets/js/services/PaymentService.js e
// assets/js/controllers/PaymentController.js. Alterar um preço no painel
// de administração (Configurações → system_settings) nunca se reflectia
// em nenhum desses locais — nem no que o utilizador via no checkout, nem
// no número de créditos realmente atribuído após pagamento.
//
// Este módulo é a ÚNICA fonte de verdade no backend para esses valores.
// system_settings já tinha as 10 chaves (pkg_<id>_price / pkg_<id>_credits)
// desde a migration_v8_2_admin_tables.sql — só faltava algo que as lesse.
//
// Usado por:
//   - api/process-payment.js → SEM cache (é onde os créditos reais são
//     atribuídos; não pode arriscar um valor desactualizado)
//   - api/misc.js (handleConfig) → COM cache de 60s (só para exibição)
// ──────────────────────────────────────────────────────────────────────────

const { restRequest } = require('./supabaseAdmin');

// Usado apenas se a tabela estiver indisponível (rede em falha, RLS mal
// configurada, etc.) — nunca deve ser a fonte normal de valores.
//
// NOVO (monetização — bónus escada): campo `bonus` — créditos extra
// atribuídos por cima de `credits` na mesma compra, sem alterar o preço.
// Pensado para aumentar o ticket médio nos pacotes maiores (quanto maior
// o pacote, maior o bónus proporcional). `avulso` fica sem bónus de
// propósito — é o pacote de entrada/experimentação, sem conta permanente.
const FALLBACK_PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso',  bonus: 0  },
  starter: { credits: 10,  price: 120,  name: 'Starter', bonus: 2  },
  basico:  { credits: 25,  price: 280,  name: 'Básico',  bonus: 5  },
  pro:     { credits: 60,  price: 600,  name: 'Pro',     bonus: 15 },
  empresa: { credits: 150, price: 1500, name: 'Empresa', bonus: 40 },
};

async function loadPackagesFromSettings() {
  try {
    const keys = Object.keys(FALLBACK_PACKAGES)
      .flatMap(id => [`pkg_${id}_price`, `pkg_${id}_credits`, `pkg_${id}_bonus`]);
    const rows = await restRequest(
      `system_settings?key=in.(${keys.join(',')})&select=key,value`
    );
    if (!Array.isArray(rows) || rows.length === 0) return clonePackages(FALLBACK_PACKAGES);

    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });

    const packages = {};
    for (const [id, fallback] of Object.entries(FALLBACK_PACKAGES)) {
      const price   = Number(map[`pkg_${id}_price`]);
      const credits = Number(map[`pkg_${id}_credits`]);
      // NOVO: bónus lido do mesmo padrão (pkg_<id>_bonus), com fallback
      // para o valor acima — 0 e valores negativos são tratados como
      // "sem bónus" (Number.isFinite && >= 0), nunca reduzem os créditos
      // base por engano de configuração no admin.
      const bonusRaw = map[`pkg_${id}_bonus`];
      const bonus    = Number(bonusRaw);
      packages[id] = {
        name:    fallback.name,
        price:   Number.isFinite(price)   && price   > 0 ? price   : fallback.price,
        credits: Number.isFinite(credits) && credits > 0 ? credits : fallback.credits,
        bonus:   bonusRaw !== undefined && Number.isFinite(bonus) && bonus >= 0 ? bonus : fallback.bonus,
      };
    }
    return packages;
  } catch (e) {
    console.warn('[packages] Falha ao carregar de system_settings, a usar fallback:', e.message);
    return clonePackages(FALLBACK_PACKAGES);
  }
}

// NOVO (monetização — bónus escada): total de créditos que um pacote
// realmente atribui numa compra (base + bónus). Única função que deve
// ser usada para creditar o utilizador — nunca ler `pkg.credits`
// directamente num fluxo de atribuição de créditos, ou o bónus fica de
// fora (mesmo que apareça correctamente no checkout/pending). Aceita
// pacotes sem o campo `bonus` (compatibilidade com dados antigos/mocks
// de teste) tratando-o como 0.
function packageTotalCredits(pkg) {
  if (!pkg) return 0;
  return (Number(pkg.credits) || 0) + (Number(pkg.bonus) || 0);
}

function clonePackages(src) {
  return JSON.parse(JSON.stringify(src));
}

// Usado pela repartição de vendas de templates (v39): os criadores são
// pagos em créditos (a mesma moeda usada em toda a plataforma — nunca se
// pede ao comprador um valor monetário à parte), mas o saldo do criador
// tem de ser levantável em MZN reais via M-Pesa. Esta função converte
// créditos → MZN usando a média ponderada de todos os pacotes activos
// (preço/créditos), a mesma fonte de verdade usada no checkout — nunca um
// valor fixo no código.
function estimateMznPerCredit(packages) {
  const list = Object.values(packages || {});
  const totalPrice   = list.reduce((s, p) => s + (p.price   || 0), 0);
  const totalCredits = list.reduce((s, p) => s + (p.credits || 0), 0);
  if (!totalCredits) return 10; // reserva — só se todos os pacotes vierem sem créditos (não deve acontecer)
  return totalPrice / totalCredits;
}

module.exports = { loadPackagesFromSettings, FALLBACK_PACKAGES, estimateMznPerCredit, packageTotalCredits };
