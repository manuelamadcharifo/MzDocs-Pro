// api/_lib/aiProviderRegistry.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE para todos os providers de IA (activos + reserva
// já ligados ao motor). Antes desta versão, api/generate-document.js e
// api/_lib/aiProvidersCatalog.js tinham cada um a sua própria lista de
// providers e modelos, o que obrigava a editar código sempre que:
//   a) um provider descontinuava um modelo (ex: Groq removeu mixtral-8x7b),
//   b) um provider mudava o catálogo inteiro (ex: Cerebras já o fez várias
//      vezes em 2026 — ver nota no campo `note` abaixo),
//   c) o Manuel queria ligar um provider novo (ex: Mistral, SambaNova).
//
// Agora:
//   - api/generate-document.js usa PROVIDERS para saber QUEM chamar e COMO
//     chamar (URL, cabeçalhos de autenticação, tecto de tokens).
//   - api/_lib/aiProvidersCatalog.js usa os mesmos dados para alimentar o
//     painel "IA Providers" do admin — nunca mais fica dessincronizado.
//   - Assim que uma env var listada aqui existir na Vercel, o provider
//     correspondente entra AUTOMATICAMENTE na corrida paralela. Não é
//     preciso editar generate-document.js para "ligar" uma chave nova.
//
// `models` é a lista CURADA (ordem de preferência) — mas em tempo real o
// motor cruza esta lista com api/_lib/modelDiscovery.js (que pergunta ao
// próprio provider "que modelos tens neste momento?"). Se um modelo curado
// já não existir no catálogo real do provider, é saltado automaticamente
// — e se NENHUM dos curados existir mais (catálogo trocado por completo),
// o motor usa directamente os primeiros modelos que a descoberta ao vivo
// devolver. Isto é o que resolve, sem deploy manual, o cenário visto no
// painel: "mixtral-8x7b-32768 foi descontinuado" / "Cerebras HTTP 404".
// ──────────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

const PROVIDERS = [
    // ── TIER 1 · Grátis generoso ────────────────────────────────────────
    {
        id: 'groq',
        name: 'Groq',
        kind: 'openai', // formato de chamada: OpenAI-compatible chat/completions
        tier: 'generoso',
        envVar: 'GROQ_API_KEY',
        signupUrl: 'https://console.groq.com/keys',
        chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
        modelsUrl: 'https://api.groq.com/openai/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 8192,
        limitType: 'tokens',
        dailyLimit: 100000,
        limitLabel: '≈100.000 tokens/dia (TPD) — reinicia à meia-noite (hora do servidor Groq)',
        note: 'Fallback automático entre vários modelos quando o principal esgota o TPD ou é descontinuado (a Groq já descontinuou mixtral-8x7b-32768, gemma2-9b-it e está a descontinuar llama-3.3-70b-versatile/llama-3.1-8b-instant em favor da família gpt-oss).',
        // mixtral-8x7b-32768 e gemma2-9b-it REMOVIDOS (descontinuados pela Groq).
        // gpt-oss primeiro por serem os modelos recomendados pela própria Groq.
        models: [
            'openai/gpt-oss-120b',
            'llama-3.3-70b-versatile',
            'openai/gpt-oss-20b',
            'qwen/qwen3.6-27b',
            'llama-3.1-8b-instant',
        ],
    },
    {
        id: 'cerebras',
        name: 'Cerebras',
        kind: 'openai',
        tier: 'generoso',
        envVar: 'CEREBRAS_API_KEY',
        signupUrl: 'https://cloud.cerebras.ai',
        chatUrl: 'https://api.cerebras.ai/v1/chat/completions',
        modelsUrl: 'https://api.cerebras.ai/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 16000,
        limitType: 'tokens',
        dailyLimit: 1000000,
        limitLabel: '≈1.000.000 tokens/dia — o mais generoso, mas o catálogo de modelos MAIS instável dos 5',
        note: 'A Cerebras já reduziu o catálogo público a apenas 2 modelos de um dia para o outro. Este provider depende fortemente da descoberta automática de modelos (api/_lib/modelDiscovery.js) — a lista curada é apenas um ponto de partida.',
        models: [
            'llama-3.3-70b',
            'llama3.1-70b',
            'gpt-oss-120b',
            'qwen-3-32b',
            'llama-4-scout-17b-16e-instruct',
            'llama3.1-8b',
            'zai-glm-4.7',
        ],
    },

    // ── TIER 2 · Grátis médio ───────────────────────────────────────────
    {
        id: 'gemini',
        name: 'Google Gemini',
        kind: 'gemini', // formato de chamada próprio (generateContent)
        tier: 'medio',
        envVar: 'GEMINI_API_KEY',
        signupUrl: 'https://aistudio.google.com/apikey',
        chatUrlBase: 'https://generativelanguage.googleapis.com/v1beta/models',
        modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        maxTokensCap: 65536,
        limitType: 'requests',
        dailyLimit: 250,
        limitLabel: '≈250 pedidos/dia por modelo grátis (Flash) — varia por modelo/região',
        note: 'Encadeia modelos Flash; quando um esgota RPM, salta para o seguinte.',
        models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        kind: 'openai',
        tier: 'medio',
        envVar: 'OPENROUTER_API_KEY',
        signupUrl: 'https://openrouter.ai/keys',
        chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        authHeader: (key) => ({
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': SITE_URL,
            'X-Title': 'MzDocs Pro',
        }),
        maxTokensCap: 16384,
        limitType: 'requests',
        dailyLimit: 200,
        limitLabel: '≈200 pedidos/dia (modelos com sufixo :free) — 20 req/min',
        note: 'Agrega vários modelos grátis atrás de uma única chave; modelos individuais entram e saem de serviço com frequência (ex: deepseek-r1-0528-qwen3-8b:free deixou de ter endpoints disponíveis).',
        // deepseek/deepseek-r1-0528-qwen3-8b:free REMOVIDO ("No endpoints found").
        models: [
            'google/gemma-3-27b-it:free',
            'google/gemma-3-12b-it:free',
            'mistralai/mistral-7b-instruct:free',
            'qwen/qwen3-8b:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-chat-v3.1:free',
        ],
    },

    // ── TIER 3 · Reserva (já activo assim que a chave existir) ─────────
    {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'NVIDIA_API_KEY',
        signupUrl: 'https://build.nvidia.com',
        chatUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 32768,
        limitType: 'requests',
        dailyLimit: 57600, // 40 req/min * 60 * 24 (tecto teórico)
        limitLabel: '40 pedidos/minuto grátis — sem tecto diário fixo divulgado',
        note: 'Normalmente o último da corrida (mais lento a responder), funciona como rede de segurança final.',
        models: [
            'meta/llama-3.3-70b-instruct',
            'meta/llama-3.1-70b-instruct',
            'mistralai/mistral-7b-instruct-v0.3',
        ],
    },
    // Providers de reserva que já estavam catalogados mas SEM código —
    // agora estão totalmente LIGADOS ao motor de corrida. Basta o Manuel
    // definir a env var correspondente na Vercel para entrarem em jogo,
    // sem tocar em nenhum ficheiro.
    {
        id: 'mistral',
        name: 'Mistral (La Plateforme)',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'MISTRAL_API_KEY',
        signupUrl: 'https://console.mistral.ai',
        chatUrl: 'https://api.mistral.ai/v1/chat/completions',
        modelsUrl: 'https://api.mistral.ai/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 8192,
        limitType: 'requests',
        dailyLimit: null,
        limitLabel: 'Tier grátis "experiment" com rate-limit por minuto/mês (varia sem aviso)',
        note: 'Liga-se automaticamente à corrida assim que MISTRAL_API_KEY existir na Vercel.',
        models: ['mistral-small-latest', 'open-mistral-nemo', 'mistral-large-latest'],
    },
    {
        id: 'sambanova',
        name: 'SambaNova Cloud',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'SAMBANOVA_API_KEY',
        signupUrl: 'https://cloud.sambanova.ai',
        chatUrl: 'https://api.sambanova.ai/v1/chat/completions',
        modelsUrl: 'https://api.sambanova.ai/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 8192,
        limitType: 'requests',
        dailyLimit: null,
        limitLabel: 'Tier grátis com Llama a alta velocidade (RPM generoso, varia)',
        note: 'Liga-se automaticamente à corrida assim que SAMBANOVA_API_KEY existir na Vercel.',
        models: ['Meta-Llama-3.3-70B-Instruct', 'Meta-Llama-3.1-8B-Instruct'],
    },
    {
        id: 'together',
        name: 'Together AI',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'TOGETHER_API_KEY',
        signupUrl: 'https://api.together.ai',
        chatUrl: 'https://api.together.xyz/v1/chat/completions',
        modelsUrl: 'https://api.together.xyz/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 8192,
        limitType: 'requests',
        dailyLimit: null,
        limitLabel: 'Créditos grátis iniciais + alguns modelos open-source sempre grátis',
        note: 'Liga-se automaticamente à corrida assim que TOGETHER_API_KEY existir na Vercel.',
        models: [
            'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
            'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        ],
    },
    {
        id: 'fireworks',
        name: 'Fireworks AI',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'FIREWORKS_API_KEY',
        signupUrl: 'https://fireworks.ai',
        chatUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
        modelsUrl: 'https://api.fireworks.ai/inference/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 8192,
        limitType: 'requests',
        dailyLimit: null,
        limitLabel: 'Créditos grátis iniciais + modelos open-source a baixo custo depois',
        note: 'Liga-se automaticamente à corrida assim que FIREWORKS_API_KEY existir na Vercel.',
        models: [
            'accounts/fireworks/models/llama-v3p3-70b-instruct',
            'accounts/fireworks/models/llama-v3p1-8b-instruct',
        ],
    },
];

// Providers ainda SEM adaptador (a API deles não fala o formato OpenAI
// chat/completions — precisam de mapeamento dedicado antes de poderem
// entrar na corrida). Ficam listados só para referência/planeamento no
// painel admin, tal como antes.
const UNWIRED_RESERVE = [
    {
        id: 'cloudflare',
        name: 'Cloudflare Workers AI',
        limitLabel: '10.000 "neurons"/dia grátis por conta (vários modelos open-source)',
        signupUrl: 'https://developers.cloudflare.com/workers-ai',
        envVarSuggestion: 'CLOUDFLARE_AI_TOKEN',
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
];

const TIER_LABELS = {
    generoso:      { label: 'Tier 1 · Grátis generoso',    order: 1, color: '#16a34a' },
    medio:         { label: 'Tier 2 · Grátis médio',        order: 2, color: '#2563eb' },
    reserva_ativa: { label: 'Tier 3 · Reserva (já activo)', order: 3, color: '#f59e0b' },
};

function getProvider(id) {
    return PROVIDERS.find(p => p.id === id) || null;
}

module.exports = { PROVIDERS, UNWIRED_RESERVE, TIER_LABELS, getProvider };
