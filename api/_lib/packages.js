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
const FALLBACK_PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso'  },
  starter: { credits: 10,  price: 120,  name: 'Starter' },
  basico:  { credits: 25,  price: 280,  name: 'Básico'  },
  pro:     { credits: 60,  price: 600,  name: 'Pro'     },
  empresa: { credits: 150, price: 1500, name: 'Empresa' },
};

async function loadPackagesFromSettings() {
  try {
    const keys = Object.keys(FALLBACK_PACKAGES)
      .flatMap(id => [`pkg_${id}_price`, `pkg_${id}_credits`]);
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
      packages[id] = {
        name:    fallback.name,
        price:   Number.isFinite(price)   && price   > 0 ? price   : fallback.price,
        credits: Number.isFinite(credits) && credits > 0 ? credits : fallback.credits,
      };
    }
    return packages;
  } catch (e) {
    console.warn('[packages] Falha ao carregar de system_settings, a usar fallback:', e.message);
    return clonePackages(FALLBACK_PACKAGES);
  }
}

function clonePackages(src) {
  return JSON.parse(JSON.stringify(src));
}

module.exports = { loadPackagesFromSettings, FALLBACK_PACKAGES };
