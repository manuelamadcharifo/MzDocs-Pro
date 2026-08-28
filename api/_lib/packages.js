// api/_lib/packages.js
// ──────────────────────────────────────────────────────────────────────────
// CORRIGIDO (Junho/2026): os preços/créditos dos pacotes (avulso, starter,
// básico, pro, empresa) estavam hard-coded e DUPLICADOS em 5 locais
// diferentes. Este módulo passou a ser a ÚNICA fonte de verdade no backend.
//
// NOVO (v61 — pacotes dinâmicos): até aqui a LISTA de pacotes em si
// continuava fixa a 5 IDs (Object.entries(FALLBACK_PACKAGES)) — só o
// preço/créditos/bónus de cada um vinham de system_settings. O admin
// nunca conseguia criar um 6º pacote. Agora a fonte de verdade é a
// tabela `credit_packages` (ver migration_v61_dynamic_packages_and_
// bonus_schedule.sql — "des-obsoleta" a tabela criada na v8 e fechada
// por RLS na v24): qualquer linha com is_active=true vira um pacote real
// no checkout, com o id que o admin escolher em /api/admin/packages.
//
// Ordem de fontes, cada uma só usada se a anterior falhar/estiver vazia:
//   1. credit_packages (tabela)              — fonte de verdade actual
//   2. system_settings (pkg_<id>_*, 5 IDs)    — compat com instalações
//                                                que ainda não correram
//                                                a migration_v61
//   3. FALLBACK_PACKAGES (hard-coded abaixo)  — última rede de segurança
//      se a base de dados estiver mesmo inacessível
//
// Usado por:
//   - api/process-payment.js → SEM cache (é onde os créditos reais são
//     atribuídos; não pode arriscar um valor desactualizado)
//   - api/_services/site.js (handleConfig) → chamado a cada pedido a
//     /api/config (sem cache local neste módulo)
// ──────────────────────────────────────────────────────────────────────────

const { restRequest } = require('./supabaseAdmin');

// Usado apenas se TUDO o resto falhar (tabela e system_settings
// inacessíveis) — nunca deve ser a fonte normal de valores.
const FALLBACK_PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso',  bonus: 0,  description: '3 documentos, sem conta permanente' },
  starter: { credits: 10,  price: 120,  name: 'Starter', bonus: 2  },
  basico:  { credits: 25,  price: 280,  name: 'Básico',  bonus: 5  },
  pro:     { credits: 60,  price: 600,  name: 'Pro',     bonus: 15 },
  empresa: { credits: 150, price: 1500, name: 'Empresa', bonus: 40 },
};

async function loadPackagesFromSettings() {
  // 1) Fonte de verdade actual: credit_packages (dinâmica, N pacotes).
  try {
    const rows = await restRequest(
      `credit_packages?is_active=eq.true&order=sort_order.asc,created_at.asc` +
      `&select=id,name,credits,price_mzn,bonus,description,is_popular,partner_segment`
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const packages = {};
      for (const r of rows) {
        const price   = Number(r.price_mzn);
        const credits = Number(r.credits);
        const bonus   = Number(r.bonus);
        // Linha malformada (preço/créditos inválidos) é ignorada em vez
        // de quebrar o checkout inteiro por causa de um pacote só.
        if (!r.id || !Number.isFinite(price) || price <= 0 || !Number.isFinite(credits) || credits <= 0) {
          console.warn('[packages] Linha inválida em credit_packages ignorada:', r.id);
          continue;
        }
        packages[r.id] = {
          name:        r.name || r.id,
          price,
          credits,
          bonus:       Number.isFinite(bonus) && bonus >= 0 ? bonus : 0,
          description: r.description || undefined,
          popular:     !!r.is_popular,
          // NOVO (v65): pacotes exclusivos por categoria de parceiro/
          // afiliado (papelaria, cyber, universidade, explicacao,
          // digitador, individual, advogado). NULL/undefined = pacote
          // público, comportamento idêntico ao que já existia.
          partnerSegment: r.partner_segment || null,
        };
      }
      if (Object.keys(packages).length > 0) return packages;
    }
  } catch (e) {
    console.warn('[packages] Falha ao carregar de credit_packages, a tentar legado:', e.message);
  }

  // 2) Compat: instalação ainda não correu a migration_v61 — mesma
  //    lógica que este módulo sempre teve, lendo os 5 IDs fixos de
  //    system_settings.
  try {
    return await loadLegacySettingsPackages();
  } catch (e) {
    console.warn('[packages] Falha ao carregar legado de system_settings, a usar fallback:', e.message);
    return clonePackages(FALLBACK_PACKAGES);
  }
}

async function loadLegacySettingsPackages() {
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
    const bonusRaw = map[`pkg_${id}_bonus`];
    const bonus    = Number(bonusRaw);
    packages[id] = {
      name:        fallback.name,
      price:       Number.isFinite(price)   && price   > 0 ? price   : fallback.price,
      credits:     Number.isFinite(credits) && credits > 0 ? credits : fallback.credits,
      bonus:       bonusRaw !== undefined && Number.isFinite(bonus) && bonus >= 0 ? bonus : fallback.bonus,
      description: fallback.description,
    };
  }
  return packages;
}

// Total de créditos que um pacote realmente atribui numa compra (base +
// bónus). Única função que deve ser usada para creditar o utilizador —
// nunca ler `pkg.credits` directamente num fluxo de atribuição de
// créditos, ou o bónus fica de fora. Aceita pacotes sem o campo `bonus`
// (compatibilidade com dados antigos/mocks de teste) tratando-o como 0.
function packageTotalCredits(pkg) {
  if (!pkg) return 0;
  return (Number(pkg.credits) || 0) + (Number(pkg.bonus) || 0);
}

function clonePackages(src) {
  return JSON.parse(JSON.stringify(src));
}

// Usado pela repartição de vendas de templates (v39): os criadores são
// pagos em créditos, mas o saldo do criador tem de ser levantável em MZN
// reais via M-Pesa. Esta função converte créditos → MZN usando a média
// ponderada de todos os pacotes activos (preço/créditos), a mesma fonte
// de verdade usada no checkout — nunca um valor fixo no código.
function estimateMznPerCredit(packages) {
  const list = Object.values(packages || {});
  const totalPrice   = list.reduce((s, p) => s + (p.price   || 0), 0);
  const totalCredits = list.reduce((s, p) => s + (p.credits || 0), 0);
  if (!totalCredits) return 10; // reserva — só se todos os pacotes vierem sem créditos (não deve acontecer)
  return totalPrice / totalCredits;
}

// ── NOVO (v65): categoria de preços por parceiro/afiliado ──────────────────
// Resolve a categoria de um utilizador AUTENTICADO — usada para decidir que
// pacotes exclusivos (credit_packages.partner_segment) lhe são
// visíveis/compráveis. NUNCA aceitar esta categoria vinda do cliente: quem
// chama isto deve sempre passar um userId já validado por um token real
// (ver getUserFromToken em supabaseAdmin.js), nunca body.userId em bruto.
//
// Prioridade:
//   1. Afiliado aprovado com segmento definido (profiles.is_affiliate +
//      affiliates.aff_segment) — papelaria, cyber, universidade,
//      explicacao, digitador, individual.
//   2. Parceiro aprovado e activo, ligado à conta (partners.linked_user_id
//      + partners.type — migration_v55) — papelaria, advogado. Só
//      consultado se (1) não encontrar nada.
// Devolve null para um consumidor normal (sem categoria especial).
async function resolveUserPricingSegment(userId) {
  if (!userId) return null;

  try {
    const profileRows = await restRequest(
      `profiles?id=eq.${userId}&select=is_affiliate&limit=1`
    );
    if (Array.isArray(profileRows) && profileRows[0]?.is_affiliate) {
      const affRows = await restRequest(
        `affiliates?user_id=eq.${userId}&select=aff_segment&limit=1`
      );
      const seg = Array.isArray(affRows) && affRows[0]?.aff_segment;
      if (seg) return seg;
    }
  } catch (e) {
    console.warn('[packages] resolveUserPricingSegment (afiliado) falhou:', e.message);
  }

  try {
    const partnerRows = await restRequest(
      `partners?linked_user_id=eq.${userId}&status=eq.approved&active=eq.true&select=type&limit=1`
    );
    if (Array.isArray(partnerRows) && partnerRows[0]?.type) return partnerRows[0].type;
  } catch (e) {
    console.warn('[packages] resolveUserPricingSegment (parceiro) falhou:', e.message);
  }

  return null;
}

// Filtra um mapa de pacotes (já carregado por loadPackagesFromSettings)
// para o que ESTE utilizador pode ver/comprar: pacotes sem partnerSegment
// são sempre visíveis para todos; pacotes com partnerSegment só aparecem
// para quem tiver exactamente esse segmento resolvido no servidor.
function filterPackagesForSegment(packages, segment) {
  const out = {};
  for (const [id, pkg] of Object.entries(packages || {})) {
    if (!pkg.partnerSegment || pkg.partnerSegment === segment) out[id] = pkg;
  }
  return out;
}

module.exports = {
  loadPackagesFromSettings,
  FALLBACK_PACKAGES,
  estimateMznPerCredit,
  packageTotalCredits,
  resolveUserPricingSegment,
  filterPackagesForSegment,
};
