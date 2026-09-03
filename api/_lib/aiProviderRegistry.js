// api/_lib/aiProviderRegistry.js — v2.0 (Ago/2026 — auditoria + novos providers)
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
//
// ── AUDITORIA Ago/2026 — porque é que "quase todos os providers" estavam
//    a falhar, e o que mudou nesta versão ──────────────────────────────────
//
// 1. NVIDIA NIM — REMOVIDO. Causa raiz: dezenas de relatos no fórum oficial
//    da NVIDIA (forums.developer.nvidia.com) ao longo de 2026 mostram que
//    GET /v1/models funciona (lista o catálogo), mas POST /v1/chat/completions
//    devolve sempre "404 Function not found for account" em contas NGC
//    pessoais/gratuitas — falta a permissão "Public API Endpoints", que só a
//    própria NVIDIA pode activar manualmente por conta, sem previsão. Não é
//    um bug de código (a chamada está correcta), é uma restrição da conta do
//    lado da NVIDIA que já dura meses para múltiplos utilizadores. Sem
//    solução automatizável → substituído por GitHub Models + Cloudflare
//    Workers AI + Hugging Face + Cohere (4 providers novos, ver abaixo).
//
// 2. Together AI e Fireworks AI — REMOVIDOS. Causa raiz: deixaram de ser
//    gratuitos. A Together AI retirou o crédito de $25 de registo em Jul/2025
//    e agora exige depósito mínimo de $5 antes de qualquer chamada funcionar
//    (por isso "Invalid API key provided" — a chave só fica activa depois do
//    depósito). A Fireworks AI dá apenas $1 de crédito único de avaliação,
//    sem tecto de tokens/dia contínuo — esgota-se em minutos de uso normal e
//    passa a devolver catálogo vazio. Ambos deixaram de caber na categoria
//    "grátis" desta lista → substituídos pelos 4 providers novos abaixo.
//
// 3. Cerebras — CORRIGIDO. A Cerebras descontinuou llama-3.3-70b e
//    qwen-3-32b a 16/Fev/2026. A lista curada tinha-os no TOPO, por isso
//    o disjuntor (modelHealth.js) marcava-os como permanentemente
//    indisponíveis e, por um bug relacionado (ver ponto 6), continuava a
//    ignorar mesmo os modelos que a descoberta ao vivo confirmava existir.
//    Modelos reordenados: gpt-oss-120b e llama3.1-8b primeiro (confirmados
//    activos em Ago/2026), os descontinuados ficam no fim só por segurança.
//
// 4. Google Gemini — CORRIGIDO. gemini-1.5-flash e gemini-2.0-flash foram
//    AMBOS desligados (1.5 já não existe; 2.0 encerrou a 1/Jun/2026) — só
//    "gemini-2.5-flash" da lista antiga ainda respondia, daí "Degradado".
//    Lista trocada para os aliases "gemini-flash-latest" /
//    "gemini-flash-lite-latest" (apontam sempre para o Flash mais recente,
//    com 2 semanas de aviso da Google antes de qualquer mudança) seguidos
//    dos modelos estáveis actuais gemini-2.5-flash / gemini-2.5-flash-lite.
//    Nota: desde Abr/2026 só Flash e Flash-Lite continuam grátis (Pro
//    passou a pago).
//
// 5. SambaNova Cloud — CORRIGIDO. O tier grátis é MUITO mais apertado do
//    que o código assumia: 20 pedidos/dia (não 20/minuto!) POR MODELO,
//    200k tokens/dia por modelo (docs.sambanova.ai/docs/en/models/rate-limits).
//    Além disso "Meta-Llama-3.1-8B-Instruct" já não consta da lista de
//    modelos grátis actual. Lista actualizada para os 5 modelos grátis reais
//    (DeepSeek-V3.1, Meta-Llama-3.3-70B-Instruct, gpt-oss-120b, DeepSeek-V3.2,
//    gemma-4-31B-it) — com 5 modelos em vez de 2, o tecto efectivo de
//    pedidos/dia do provider quintuplica (5×20 = 100/dia).
//
// 6. Disjuntor (modelHealth.js) — CORRIGIDO. Um modelo marcado como
//    "permanentemente indisponível" (7 dias) ficava bloqueado mesmo que a
//    descoberta ao vivo (modelDiscovery.js) confirmasse, horas depois, que
//    o modelo VOLTOU a existir no catálogo do provider — isto é o que
//    produzia o "Cerebras: nenhum modelo disponível (todos desactivados ou
//    catálogo vazio)" mesmo com o catálogo real a conter modelos válidos.
//    Agora, se a descoberta ao vivo confirma o modelo, o disjuntor permanente
//    é ignorado (mas continua a proteger contra falhas transitórias reais,
//    como 429/5xx repetidos). Ver aiRace.js e modelHealth.js.
//
// 7. Providers de reserva "por ligar" (Cloudflare Workers AI, GitHub Models,
//    Hugging Face Inference, Cohere) — LIGADOS AO MOTOR. Já estavam
//    catalogados como referência em UNWIRED_RESERVE mas sem código nenhum —
//    agora têm adaptador completo e entram automaticamente na corrida assim
//    que as respectivas env vars existirem na Vercel, tal como qualquer
//    outro provider desta lista. O Cloudflare Workers AI é o único que
//    precisa de DUAS env vars (token + ID da conta) — ver `extraEnvVars`.
// ──────────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

// P0.4 (Master Audit, Set/2026): CORRIGIDO — a Cohere estava marcada no seu
// próprio `limitLabel` como "uso não-comercial apenas", mas nada no motor
// de corrida (aiRace.js) impedia que entrasse automaticamente na produção
// comercial assim que COHERE_API_KEY existisse. `commercialAllowed` é a
// fonte única de verdade que aiRace.js agora consulta antes de considerar
// qualquer provider elegível — por omissão `true` (todos os outros
// providers desta lista usam tiers gratuitos que os próprios termos
// permitem em produção); só é preciso marcar `false` explicitamente nos
// que, como a Cohere Trial, o próprio fornecedor restringe a uso não
// comercial. Antes de reactivar a Cohere para uso comercial, seria preciso
// mudar para uma chave/plano pago da Cohere e então marcar
// commercialAllowed: true aqui.
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
        note: 'Fallback automático entre vários modelos quando o principal esgota o TPD ou é descontinuado (a Groq já descontinuou mixtral-8x7b-32768, gemma2-9b-it e está a descontinuar llama-3.3-70b-versatile/llama-3.1-8b-instant em favor da família gpt-oss). qwen/qwen3.6-27b por vezes devolve "request too large" por limite de TPM da organização em picos de tráfego — o motor salta automaticamente para o modelo seguinte, sem intervenção manual.',
        // mixtral-8x7b-32768 e gemma2-9b-it REMOVIDOS (descontinuados pela Groq).
        // gpt-oss primeiro por serem os modelos recomendados pela própria Groq
        // e os mais resistentes a "request too large" em picos de tráfego.
        models: [
            'openai/gpt-oss-120b',
            'openai/gpt-oss-20b',
            'llama-3.3-70b-versatile',
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
        maxTokensCap: 8192, // tecto de contexto do tier grátis é 8K (128K só no tier pago)
        limitType: 'tokens',
        dailyLimit: 1000000,
        limitLabel: '≈1.000.000 tokens/dia — o mais generoso, mas o catálogo de modelos MAIS instável dos 5',
        note: 'A Cerebras descontinuou llama-3.3-70b e qwen-3-32b a 16/Fev/2026 — ficam no fim da lista só por segurança, gpt-oss-120b e llama3.1-8b é que são os modelos de produção confirmados em Ago/2026. Este provider continua a depender fortemente da descoberta automática de modelos (api/_lib/modelDiscovery.js) — a lista curada é apenas um ponto de partida.',
        models: [
            'gpt-oss-120b',
            'llama3.1-8b',
            'zai-glm-4.7',
            'llama-4-scout-17b-16e-instruct',
            'qwen-3-32b',
            'llama-3.3-70b',
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
        limitLabel: '≈250 pedidos/dia no Flash grátis (Pro deixou de ser grátis desde Abr/2026) — varia por modelo/região',
        note: 'gemini-1.5-flash e gemini-2.0-flash foram ambos desligados pela Google em 2026 (o 2.0 encerrou a 1/Jun/2026). Usa agora os aliases "latest" (apontam sempre para o Flash mais recente, com 2 semanas de aviso antes de qualquer troca) antes dos nomes fixos, para sobreviver a futuras migrações sem deploy manual.',
        models: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'],
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
        dailyLimit: 50,
        limitLabel: '≈50 pedidos/dia (modelos com sufixo :free) — sobe para 1000/dia depois de comprar $10 em créditos (não precisa de saldo activo) — 20 req/min',
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
        limitLabel: 'API activada por omissão sem cartão de crédito — tier "experiment" com rate-limit por minuto/mês (varia sem aviso)',
        note: 'Liga-se automaticamente à corrida assim que MISTRAL_API_KEY existir na Vercel. Timeouts ocasionais (perto dos 9s do tecto por provider) são normais no tier grátis em horas de pico — o motor avança para o provider seguinte sem bloquear a resposta ao utilizador.',
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
        dailyLimit: 100, // 20 pedidos/dia POR MODELO × 5 modelos grátis (docs.sambanova.ai)
        limitLabel: 'Tier grátis: 20 pedidos/dia + 200k tokens/dia POR MODELO (não é um tecto único) — 5 modelos grátis',
        note: 'Correcção Ago/2026: "Meta-Llama-3.1-8B-Instruct" já não consta da lista de modelos grátis da SambaNova — substituído pelos 5 modelos grátis reais e documentados em docs.sambanova.ai/docs/en/models/rate-limits. Como o tecto é por modelo, ter mais modelos na cadeia de fallback aumenta directamente a capacidade diária total.',
        models: [
            'Meta-Llama-3.3-70B-Instruct',
            'gpt-oss-120b',
            'DeepSeek-V3.1',
            'DeepSeek-V3.2',
            'gemma-4-31B-it',
        ],
    },

    // ── Novos providers Ago/2026 — substituem NVIDIA NIM (bloqueio de conta
    // do lado da NVIDIA, sem solução) e Together AI / Fireworks AI (deixaram
    // de ter tier gratuito contínuo) — ver auditoria no topo do ficheiro.
    {
        id: 'github',
        name: 'GitHub Models',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'GITHUB_MODELS_TOKEN',
        signupUrl: 'https://github.com/marketplace/models',
        chatUrl: 'https://models.github.ai/inference/chat/completions',
        // Sem modelsUrl: o catálogo da GitHub Models não devolve o formato
        // OpenAI-compatible padrão em /models (é um endpoint próprio em
        // /catalog/models, com esquema diferente) — a descoberta ao vivo
        // fica desligada para este provider (getAvailableModels devolve
        // `null` de forma segura) e o motor usa sempre a lista curada.
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 4096, // tier grátis limita a 4K tokens de saída
        limitType: 'requests',
        dailyLimit: 150,
        limitLabel: 'Grátis com conta GitHub (Personal Access Token com scope "models:read") — ≈10 pedidos/min, 50-150 pedidos/dia consoante o modelo',
        note: 'Requer um Personal Access Token do GitHub (não o GITHUB_TOKEN automático das Actions) com o scope "models:read" — gerar em github.com/settings/personal-access-tokens. Modelos "low-tier" (gpt-4o-mini, Phi-4, Mistral Small) têm tecto diário mais alto do que os "high-tier" (Llama 3.3 70B) — por isso vêm primeiro na lista.',
        models: [
            'openai/gpt-4o-mini',
            'microsoft/Phi-4',
            'mistral-ai/Mistral-Small-2503',
            'meta/Llama-3.3-70B-Instruct',
            'deepseek/DeepSeek-V3-0324',
        ],
    },
    {
        id: 'cloudflare',
        name: 'Cloudflare Workers AI',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'CLOUDFLARE_AI_TOKEN',
        // ÚNICO provider desta lista que precisa de UMA SEGUNDA env var — a
        // URL de chamada inclui o ID da conta Cloudflare. Sem esta segunda
        // variável definida, isProviderConfigured() mantém o provider
        // desligado da corrida (evita gastar um pedido contra uma URL
        // ".../accounts/undefined/..." garantidamente inválida).
        extraEnvVars: ['CLOUDFLARE_ACCOUNT_ID'],
        signupUrl: 'https://developers.cloudflare.com/workers-ai',
        // chatUrl como função: recebe process.env e constrói o URL com o
        // account ID em runtime (ver resolveUrl() mais abaixo).
        chatUrl: (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
        authHeader: (key) => ({ Authorization: `Bearer ${key}`, 'cf-aig-gateway-id': 'default' }),
        maxTokensCap: 4096,
        limitType: 'tokens',
        dailyLimit: 10000,
        limitLabel: '10.000 "neurons"/dia grátis por conta (varia por modelo — modelos maiores consomem mais neurons por token)',
        note: 'Precisa de DUAS env vars na Vercel: CLOUDFLARE_AI_TOKEN (API Token com permissão "Workers AI") e CLOUDFLARE_ACCOUNT_ID (visível no dashboard da Cloudflare, canto superior direito). Liga-se automaticamente à corrida assim que AMBAS existirem.',
        models: [
            '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
            '@cf/openai/gpt-oss-120b',
            '@cf/google/gemma-3-12b-it',
            '@cf/meta/llama-4-scout-17b-16e-instruct',
            '@cf/qwen/qwen2.5-coder-32b-instruct',
        ],
    },
    {
        id: 'huggingface',
        name: 'Hugging Face Inference',
        kind: 'openai',
        tier: 'reserva_ativa',
        envVar: 'HUGGINGFACE_API_KEY',
        signupUrl: 'https://huggingface.co/settings/tokens',
        chatUrl: 'https://router.huggingface.co/v1/chat/completions',
        modelsUrl: 'https://router.huggingface.co/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 4096,
        limitType: 'requests',
        dailyLimit: 1000,
        limitLabel: 'Tier grátis serverless (~1000 pedidos/dia, infra-estrutura partilhada, latência variável)',
        note: 'O router da Hugging Face exige o formato "modelo:provider" (ex: "meta-llama/Llama-3.1-8B-Instruct:hf-inference") — usa-se sempre o sufixo ":hf-inference" (infra-estrutura própria da HF) para garantir que fica no tier grátis nativo, em vez de ser encaminhado para um provider terceiro que pode exigir facturação própria.',
        models: [
            'meta-llama/Llama-3.1-8B-Instruct:hf-inference',
            'Qwen/Qwen2.5-7B-Instruct:hf-inference',
            'google/gemma-2-9b-it:hf-inference',
            'mistralai/Mistral-7B-Instruct-v0.3:hf-inference',
        ],
    },
    {
        id: 'cohere',
        name: 'Cohere',
        kind: 'openai',
        tier: 'reserva_ativa',
        commercialAllowed: false, // v67: chave "Trial" da Cohere é só para uso não-comercial (ver limitLabel) — nunca deve entrar na corrida em produção
        envVar: 'COHERE_API_KEY',
        signupUrl: 'https://dashboard.cohere.com/api-keys',
        chatUrl: 'https://api.cohere.ai/compatibility/v1/chat/completions',
        modelsUrl: 'https://api.cohere.ai/compatibility/v1/models',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
        maxTokensCap: 4096,
        limitType: 'requests',
        dailyLimit: null,
        limitLabel: 'Chave "Trial" grátis, rate-limit por minuto — uso não-comercial apenas (ver termos da Cohere antes de usar em produção)',
        note: 'Usa a API de Compatibilidade OpenAI da Cohere (api.cohere.ai/compatibility/v1) em vez do formato /v1/chat proprietário — assim reaproveita o mesmo adaptador "openai" dos restantes providers, sem código dedicado.',
        models: ['command-r7b-12-2024', 'command-r-08-2024', 'command-a-03-2025'],
    },
];

// Providers ainda SEM adaptador (a API deles não fala o formato OpenAI
// chat/completions "de fábrica" e precisaria de mapeamento dedicado antes de
// poder entrar na corrida). Ficam listados só para referência/planeamento no
// painel admin. Em Ago/2026 os 4 que aqui estavam (Cloudflare, GitHub
// Models, Hugging Face, Cohere) passaram todos a ter adaptador — ver
// PROVIDERS acima — por isso esta lista fica vazia por agora. Mantida como
// array (em vez de removida) para o painel admin continuar a funcionar sem
// alterações caso volte a ter entradas no futuro.
const UNWIRED_RESERVE = [];

const TIER_LABELS = {
    generoso:      { label: 'Tier 1 · Grátis generoso',    order: 1, color: '#16a34a' },
    medio:         { label: 'Tier 2 · Grátis médio',        order: 2, color: '#2563eb' },
    reserva_ativa: { label: 'Tier 3 · Reserva (já activo)', order: 3, color: '#f59e0b' },
};

function getProvider(id) {
    return PROVIDERS.find(p => p.id === id) || null;
}

// NOVO (Ago/2026) — resolve um campo que tanto pode ser uma string estática
// (a maioria dos providers) como uma função `(env) => string` (só o
// Cloudflare Workers AI, por precisar do account ID na própria URL). Mantém
// 100% de compatibilidade com todos os providers antigos, que continuam a
// definir `chatUrl`/`modelsUrl` como string simples.
function resolveUrl(urlOrFn, env = process.env) {
    return typeof urlOrFn === 'function' ? urlOrFn(env) : urlOrFn;
}

// NOVO (Ago/2026) — um provider só entra na corrida se TODAS as suas env
// vars obrigatórias existirem (a principal, `envVar`, mais quaisquer
// `extraEnvVars`). Antes desta função, api/admin/index.js e aiRace.js só
// verificavam `envVar`, o que fazia o Cloudflare Workers AI aparecer como
// "chave configurada" mesmo faltando o CLOUDFLARE_ACCOUNT_ID — e a corrida
// tentava (e falhava sempre) contra uma URL com "accounts/undefined/".
function isProviderConfigured(providerCfg, env = process.env) {
    if (!providerCfg || !env[providerCfg.envVar]) return false;
    if (Array.isArray(providerCfg.extraEnvVars)) {
        for (const extra of providerCfg.extraEnvVars) {
            if (!env[extra]) return false;
        }
    }
    return true;
}

module.exports = { PROVIDERS, UNWIRED_RESERVE, TIER_LABELS, getProvider, resolveUrl, isProviderConfigured };
