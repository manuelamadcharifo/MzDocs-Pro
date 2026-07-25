// api/_lib/aiProvidersCatalog.js — v2.0
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
// Bónus: os providers de reserva que passaram a estar LIGADOS ao motor
// (Mistral, SambaNova, Together, Fireworks) aparecem automaticamente no
// painel admin como Tier 3, com `configured: true` assim que a respectiva
// env var for definida na Vercel — sem qualquer alteração ao admin.
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

// Providers que ainda NÃO estão ligados ao motor de corrida — a API deles
// não fala o formato OpenAI chat/completions "de fábrica" e precisaria de
// um adaptador dedicado (ex: Cloudflare Workers AI exige account ID na
// própria URL). Continuam aqui só para referência/planeamento futuro.
const RESERVE_PROVIDERS = UNWIRED_RESERVE;

module.exports = { ACTIVE_PROVIDERS, RESERVE_PROVIDERS, TIER_LABELS };
