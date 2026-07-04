// api/_lib/aiProvidersCatalog.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// Catálogo estático (metadados) dos 5 providers de IA activos em
// api/generate-document.js + uma lista de providers "de reserva" (grátis,
// ainda não ligados ao código) para o caso de algum dos 5 actuais esgotar
// a quota grátis de forma permanente e precisar de ser substituído.
//
// Os números de "limite diário" são estimativas públicas dos planos grátis
// de cada serviço (podem mudar sem aviso dos próprios providers — por isso
// o painel admin trata-os sempre como aproximação, nunca como valor exacto).
// O valor real e fiável é o consumo medido (ai_provider_daily_usage), que é
// alimentado em cada pedido feito pelo próprio site.
// ──────────────────────────────────────────────────────────────────────────

// Providers já integrados em api/generate-document.js (raceAllProviders).
// `envVar` é o nome da variável de ambiente na Vercel — usado apenas para
// verificar SE está configurada (true/false), nunca para ler o valor.
const ACTIVE_PROVIDERS = [
    {
        id: 'groq',
        name: 'Groq',
        tier: 'generoso',
        envVar: 'GROQ_API_KEY',
        signupUrl: 'https://console.groq.com/keys',
        limitType: 'tokens',
        dailyLimit: 100000,
        limitLabel: '≈100.000 tokens/dia (Llama 3.3 70B, TPD) — reinicia à meia-noite (hora do servidor Groq)',
        note: 'Faz fallback automático para modelos mais leves (8B, Gemma, Mixtral) quando o modelo principal esgota o TPD.',
    },
    {
        id: 'cerebras',
        name: 'Cerebras',
        tier: 'generoso',
        envVar: 'CEREBRAS_API_KEY',
        signupUrl: 'https://cloud.cerebras.ai',
        limitType: 'tokens',
        dailyLimit: 1500000,
        limitLabel: '≈1.500.000 tokens/dia — o mais generoso dos 5, usado como âncora da corrida paralela',
        note: 'Inferência muito rápida (~2400 tok/s). Ideal como 1º provider preferido em documentos longos.',
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        tier: 'medio',
        envVar: 'GEMINI_API_KEY',
        signupUrl: 'https://aistudio.google.com/apikey',
        limitType: 'requests',
        dailyLimit: 250,
        limitLabel: '≈250 pedidos/dia por modelo grátis (Flash) — varia por modelo/região',
        note: 'Encadeia 3 modelos (2.5 → 2.0 → 1.5 Flash); quando um esgota RPM, salta para o seguinte.',
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        tier: 'medio',
        envVar: 'OPENROUTER_API_KEY',
        signupUrl: 'https://openrouter.ai/keys',
        limitType: 'requests',
        dailyLimit: 200,
        limitLabel: '≈200 pedidos/dia (modelos com sufixo :free) — 20 req/min',
        note: 'Agrega vários modelos grátis (Gemma, Mistral, Qwen3, DeepSeek R1) atrás de uma única chave.',
    },
    {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        tier: 'reserva_ativa',
        envVar: 'NVIDIA_API_KEY',
        signupUrl: 'https://build.nvidia.com',
        limitType: 'requests',
        dailyLimit: 57600, // 40 req/min * 60 * 24 (tecto teórico; na prática o gargalo é o RPM)
        limitLabel: '40 pedidos/minuto grátis — sem tecto diário fixo divulgado',
        note: 'Normalmente o último da corrida (mais lento a responder), funciona como rede de segurança final.',
    },
];

// Providers grátis "de reserva" — ainda NÃO estão ligados a
// api/generate-document.js. Servem de lista pronta a usar: se um dos 5
// providers activos ficar permanentemente esgotado/indisponível, o
// próximo passo é obter uma chave grátis aqui, adicionar a variável de
// ambiente na Vercel e "ligar" o provider em generate-document.js
// (nova função tryX() + entrada em `avail`), substituindo o que falhou.
const RESERVE_PROVIDERS = [
    {
        id: 'sambanova',
        name: 'SambaNova Cloud',
        limitLabel: 'Tier grátis com Llama 3.1/3.3 a alta velocidade (RPM generoso)',
        signupUrl: 'https://cloud.sambanova.ai',
        envVarSuggestion: 'SAMBANOVA_API_KEY',
    },
    {
        id: 'cloudflare',
        name: 'Cloudflare Workers AI',
        limitLabel: '10.000 "neurons"/dia grátis por conta (vários modelos open-source)',
        signupUrl: 'https://developers.cloudflare.com/workers-ai',
        envVarSuggestion: 'CLOUDFLARE_AI_TOKEN',
    },
    {
        id: 'mistral',
        name: 'Mistral (La Plateforme)',
        limitLabel: 'Tier grátis "experiment" com rate-limit por minuto/mês',
        signupUrl: 'https://console.mistral.ai',
        envVarSuggestion: 'MISTRAL_API_KEY',
    },
    {
        id: 'github-models',
        name: 'GitHub Models',
        limitLabel: 'Grátis com conta GitHub, rate-limit por minuto/dia (varia por modelo)',
        signupUrl: 'https://github.com/marketplace/models',
        envVarSuggestion: 'GITHUB_MODELS_TOKEN',
    },
    {
        id: 'huggingface',
        name: 'Hugging Face Inference',
        limitLabel: 'Tier grátis serverless com limite mensal de créditos de inferência',
        signupUrl: 'https://huggingface.co/settings/tokens',
        envVarSuggestion: 'HUGGINGFACE_API_KEY',
    },
    {
        id: 'cohere',
        name: 'Cohere',
        limitLabel: 'Chave "trial" grátis, rate-limit por minuto (uso não-comercial)',
        signupUrl: 'https://dashboard.cohere.com/api-keys',
        envVarSuggestion: 'COHERE_API_KEY',
    },
    {
        id: 'fireworks',
        name: 'Fireworks AI',
        limitLabel: 'Créditos grátis iniciais + modelos open-source a baixo custo depois',
        signupUrl: 'https://fireworks.ai',
        envVarSuggestion: 'FIREWORKS_API_KEY',
    },
    {
        id: 'together',
        name: 'Together AI',
        limitLabel: 'Créditos grátis iniciais + alguns modelos open-source sempre grátis',
        signupUrl: 'https://api.together.ai',
        envVarSuggestion: 'TOGETHER_API_KEY',
    },
];

const TIER_LABELS = {
    generoso:      { label: 'Tier 1 · Grátis generoso',    order: 1, color: '#16a34a' },
    medio:         { label: 'Tier 2 · Grátis médio',        order: 2, color: '#2563eb' },
    reserva_ativa: { label: 'Tier 3 · Reserva (já activo)', order: 3, color: '#f59e0b' },
};

module.exports = { ACTIVE_PROVIDERS, RESERVE_PROVIDERS, TIER_LABELS };
