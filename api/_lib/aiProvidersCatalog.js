// api/_lib/aiProvidersCatalog.js — v2.1
// ──────────────────────────────────────────────────────────────────────────
// Mantém a MESMA forma de exportação de sempre (ACTIVE_PROVIDERS,
// RESERVE_PROVIDERS, TIER_LABELS), consumida por api/admin/index.js para a
// aba "IA Providers" do painel admin — por isso NENHUMA alteração é
// necessária nesse ficheiro.
//
// A diferença: os dados agora vêm todos de api/_lib/aiProviderRegistry.js,
// a mesma fonte usada por api/generate-document.js para a corrida real de
// providers. Antes desta versão havia duas listas paralelas (uma "de
// mentira" aqui, outra "a sério" em generate-document.js) que podiam
// facilmente ficar dessincronizadas — agora é impossível, há só uma.
//
// Bónus: qualquer provider novo adicionado a PROVIDERS em
// aiProviderRegistry.js (ex: os 4 ligados em Ago/2026 — GitHub Models,
// Cloudflare Workers AI, Hugging Face Inference, Cohere) aparece
// automaticamente no painel admin como Tier 3, com `configured: true`
// assim que as respectivas env vars forem definidas na Vercel — sem
// qualquer alteração ao admin.
// ──────────────────────────────────────────────────────────────────────────

const { PROVIDERS, UNWIRED_RESERVE, TIER_LABELS } = require('./aiProviderRegistry');

const ACTIVE_PROVIDERS = PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    tier: p.tier,
    envVar: p.envVar,
    signupUrl: p.signupUrl,
    limitType: p.limitType,
    dailyLimit: p.dailyLimit,
    limitLabel: p.limitLabel,
    note: p.note,
}));

// Providers ainda sem adaptador ligado ao motor de corrida (API não fala o
// formato OpenAI chat/completions "de fábrica"). Em Ago/2026 esta lista
// está vazia — os 4 providers que aqui estavam antes (Cloudflare Workers AI,
// GitHub Models, Hugging Face, Cohere) passaram todos a ter adaptador e
// entraram em PROVIDERS. Fica como array vazio (não removida) para o painel
// admin continuar a funcionar sem alterações caso volte a ter entradas.
const RESERVE_PROVIDERS = UNWIRED_RESERVE;

module.exports = { ACTIVE_PROVIDERS, RESERVE_PROVIDERS, TIER_LABELS };
