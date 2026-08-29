// api/generate-document.js — v2.3 (AUTO-CURA DE PROVIDERS/MODELOS)
// N providers em corrida paralela (todos os que tiverem env var configurada
// na Vercel — ver api/_lib/aiProviderRegistry.js). Suporte a geração em
// cadeia (_planMode / _sectionMode) com rate-limit generoso.
//
// CORREÇÕES v2.0:
//  1. Removido @supabase/supabase-js + require('ws'). A verificação do JWT
//     passou a usar api/_lib/supabaseAdmin.js (fetch puro contra /auth/v1/user).
//  2. Reembolso automático de crédito quando TODOS os providers falham.
//
// v2.1 (Amostra grátis + custo progressivo):
//  3. _previewMode: true — gera uma AMOSTRA curta e gratuita do documento.
//  4. Endpoint reaproveitado (limite de 12 functions do Vercel Hobby).
//
// v2.2 (Monitorização dos providers):
//  5. Cada tentativa (sucesso ou falha) de cada provider é registada de
//     forma assíncrona na tabela ai_provider_daily_usage — alimenta a aba
//     "IA Providers" em /admin.html.
//
// NOVO v2.3 (auto-cura de providers/modelos — substituição automática):
//  6. api/_lib/aiProviderRegistry.js passou a ser a FONTE ÚNICA de config
//     de todos os providers (activos + reserva já ligados). Qualquer chave
//     nova (MISTRAL_API_KEY, SAMBANOVA_API_KEY, TOGETHER_API_KEY,
//     FIREWORKS_API_KEY, além das 5 originais) entra na corrida sozinha,
//     assim que existir na Vercel — sem editar este ficheiro.
//  7. api/_lib/modelDiscovery.js consulta o endpoint /models real de cada
//     provider (com cache) e filtra a lista curada para os modelos que
//     REALMENTE existem neste momento. Se o provider trocar o catálogo
//     por completo (ex: Cerebras), o motor usa directamente os primeiros
//     modelos devolvidos pela descoberta ao vivo — substituição automática
//     sem deploy novo.
//  8. api/_lib/modelHealth.js é um disjuntor por modelo: desactiva 7 dias
//     um modelo com erro permanente ("decommissioned", "model not found",
//     "no endpoints found"...) e desactiva temporariamente (10min→30min→2h)
//     um modelo com falhas repetidas transitórias — sem gastar mais pedidos
//     num modelo que se sabe estar avariado.
//
// v2.4 (P0 — CONTROLO DE CUSTO DA CORRIDA PARALELA):
//  9. raceAllProviders() deixou de correr TODOS os providers com chave
//     configurada (9 chamadas por documento no pior caso). Agora corre por
//     omissão apenas os tiers "generoso" + "médio" (2-3 chamadas), que já
//     cobrem >95% dos casos. Os providers "reserva_ativa" só entram como
//     FALLBACK, e apenas se o grupo primário falhar por completo (todos os
//     providers generoso/médio configurados rejeitaram ou excederam quota).
//     Isto corrige o esgotamento de quota 3-4,5x mais cedo no tier grátis e
//     o custo real por documento (~2 MZN → 6-9 MZN) que estava a corroer a
//     margem. Providers "reserva_inativa" (sem adaptador — ver UNWIRED_RESERVE
//     em aiProviderRegistry.js) nunca fizeram parte da corrida.
// 10. Cada provider agora tem um TIMEOUT individual (9s) — um provider lento
//     ou pendurado já não atrasa a resposta ao utilizador nem bloqueia o
//     Promise.any(); é simplesmente descartado e os restantes continuam.

const { getUserFromToken, rpc } = require('./_lib/supabaseAdmin');
const { redactSensitive, restoreSensitive } = require('./_lib/piiRedaction');
// ALTERADO (Ago/2026): o motor de corrida por tiers (raceAllProviders e
// tudo o que ele depende — isModelDisabled/recordModelResult/getAvailableModels/
// tryOpenAIModel/tryGeminiModel) foi extraído para api/_lib/aiRace.js, sem
// alterar comportamento, para poder ser reutilizado por api/_services/blog.js
// (que antes só tinha Groq+Gemini fixos, sem tiers nem disjuntor — ver
// incidente de 19-23/08/2026 na fila de publicações agendadas).
const { raceAllProviders, buildApiKeysFromEnv } = require('./_lib/aiRace');

// Tokens máximos absolutos para uma amostra grátis — aplicado no servidor,
// independentemente do que o cliente envie, para que o preview nunca possa
// ser usado como substituto gratuito da geração completa.
const PREVIEW_MAX_TOKENS = 420;

const SYSTEM_PROMPT = `Você é o MzDocs Pro, motor de geração de documentos para Moçambique.
Gere documentos COMPLETOS e prontos para uso em português (variante moçambicana, formal).
Use Markdown. Nunca use meta-comentários como "Aqui está o documento...".
Nunca invente dados pessoais — use [PREENCHER]. Nunca corte o documento no meio.`;

// CORRIGIDO (Ago/2026 — bug "Não foi possível planear o documento"):
// _planMode usava o MESMO SYSTEM_PROMPT do documento completo ("Gere
// documentos COMPLETOS...", "Nunca corte o documento no meio"). Isto é
// contraditório com o que o planeamento precisa (só um JSON compacto) e
// deixava o modelo mais propenso a escrever preâmbulo/comentários antes do
// JSON, ou aspas por escapar dentro dos títulos — ambos produzem
// `JSON.parse` inválido no cliente (LongDocumentEngine.js). Prompt dedicado,
// mais estrito, para este modo.
const PLAN_SYSTEM_PROMPT = `Você é um motor de planeamento de estrutura de documentos.
Responda SEMPRE e APENAS com um único objecto JSON válido — nada de texto antes ou depois, nada de blocos de código (sem \`\`\`), nada de comentários ou explicações.
Regras estritas de formatação JSON:
- Use JSON compacto (sem indentação nem quebras de linha supérfluas dentro dos valores).
- NUNCA use aspas duplas (") dentro de um valor de texto — se precisar de citar algo dentro de um título, use aspas simples (').
- NUNCA deixe vírgulas a mais antes de "]" ou "}".
- Todas as strings devem estar correctamente fechadas antes da vírgula ou do fecho seguinte.
Se o JSON pedido tiver muitas secções, prefira títulos mais curtos a arriscar cortar o JSON antes de fechar todos os parênteses/chavetas — o JSON tem de ficar sempre 100% válido e completo.`;

const SITE_URL = process.env.SITE_URL || 'https://mzdocs.co.mz';

// ─── RATE LIMIT (Upstash Redis — persiste entre instâncias Vercel) ──────────
// Se UPSTASH_REDIS_REST_URL não estiver configurado, cai no Map local (sem persistência)
// Setup: vercel.com/integrations/upstash → cria DB grátis → cola as env vars no Vercel

// CORRIGIDO (auditoria — P1-06, Ago/2026): geração de documentos por IA é
// um dos namespaces sensíveis (custo directo por chamada de IA). Quando o
// Redis está indisponível, cada instância serverless só protege a si
// própria — um pedido distribuído por várias instâncias pode multiplicar
// o limite efectivo. Em vez de bloquear tudo, aplicamos aqui um tecto
// muito mais apertado enquanto o degrade durar, e avisamos o admin por
// Telegram uma vez por arranque de instância (não a cada pedido).
let _rateLimitDegradeAlerted = false;
function _alertRateLimitDegraded() {
    if (_rateLimitDegradeAlerted) return;
    _rateLimitDegradeAlerted = true;
    try {
        const { notifyTelegram } = require('./_lib/notifyTelegram');
        notifyTelegram(
            '🟠 *Rate limit em modo degradado*\nRedis (Upstash) indisponível — generate-document.js a usar limites locais muito mais apertados. Verifica UPSTASH_REDIS_REST_URL/TOKEN na Vercel.',
            { silent: true }
        ).catch(() => {});
    } catch (_) { /* best-effort — nunca deve quebrar o rate limit em si */ }
}

async function checkRateLimit(req, isChainCall, isPreview) {
    const auth = req.headers['authorization'];
    const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const mode = isPreview ? ':p' : (isChainCall ? ':c' : '');
    const key  = 'rl:' + (auth ? `u:${auth.slice(-16)}` : `i:${ip}`) + mode;

    const limit     = isPreview ? 4 : (isChainCall ? (auth ? 60 : 20) : (auth ? 20 : 8));
    const windowSec = isPreview ? 60 : (isChainCall ? 10 : 60);
    // Tecto degradado: bem mais apertado que o normal, mas ainda deixa um
    // utilizador legítimo continuar a trabalhar durante uma falha do Redis.
    const degradedLimit = isPreview ? 1 : (isChainCall ? 4 : 2);

    const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
        try {
            const headers = {
                Authorization: `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            };
            const incrRes  = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers });
            const incrData = await incrRes.json();
            const count    = incrData.result;

            if (count === 1) {
                await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSec}`, { method: 'POST', headers });
            }
            return count <= limit;
        } catch (redisErr) {
            console.warn('[rate-limit] Redis unavailable, using local Map:', redisErr.message);
        }
    }

    _alertRateLimitDegraded();
    const now   = Date.now();
    const entry = _localRateMap.get(key) || { count: 0, reset: now + windowSec * 1000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowSec * 1000; }
    entry.count++;
    _localRateMap.set(key, entry);
    return entry.count <= degradedLimit;
}

const _localRateMap = new Map();

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', SITE_URL);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const {
        serviceType, prompt, userId,
        _reedit, _currentContent, _instruction,
        _preferProvider,
        _planMode,    // planeamento (retorna JSON de secções)
        _sectionMode, // geração de uma secção individual
        _previewMode, // amostra grátis, sem dedução de crédito
        _operationId, // P1-08: mesmo UUID usado em /api/deduct-credit — liga a dedução ao seu próprio reembolso
        creditsRemaining: preDeductedCredits,
        cost: deductedCost,
    } = body;

    // Mesma validação de formato do endpoint /api/deduct-credit — um valor
    // inválido é apenas ignorado (cai para o reembolso sem idempotência),
    // nunca bloqueia a geração do documento.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const operationId = typeof _operationId === 'string' && UUID_RE.test(_operationId) ? _operationId : null;

    const isPreview   = !!_previewMode && !_planMode && !_sectionMode;
    const isChainCall = !isPreview && !!(_planMode || _sectionMode);

    if (!await checkRateLimit(req, isChainCall, isPreview)) {
        const retryAfter = isPreview ? 60 : (isChainCall ? 10 : 60);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: isPreview
                ? 'Já gerou várias amostras grátis. Aguarde um pouco ou gere o documento completo.'
                : 'Muitos pedidos. Aguarde alguns segundos.',
            code: 'RATE_LIMIT',
            retryAfter,
        });
    }

    // Constrói o mapa de chaves disponíveis a partir do REGISTO CENTRAL —
    // qualquer provider listado em aiProviderRegistry.js entra aqui
    // automaticamente assim que a sua env var existir na Vercel.
    // (movido para api/_lib/aiRace.js — mesma lógica, agora partilhada)
    const apiKeys = buildApiKeysFromEnv();

    if (Object.keys(apiKeys).length === 0) {
        return res.status(503).json({ error: 'Nenhuma API key configurada.' });
    }

    let finalPrompt = prompt;
    if (_reedit && _currentContent && _instruction) {
        finalPrompt = `Você é um editor de documentos profissional.\n\nDOCUMENTO ATUAL:\n"""\n${_currentContent}\n"""\n\nINSTRUÇÃO: "${_instruction}"\n\nEdite o documento aplicando a instrução. Mantenha o formato Markdown. Devolva apenas o documento editado, sem comentários.`;
    }

    if (!finalPrompt) return res.status(400).json({ error: 'prompt obrigatório' });

    if (isPreview) {
        finalPrompt = `${finalPrompt}\n\n---\nIMPORTANTE: Esta é apenas uma AMOSTRA GRÁTIS para o utilizador avaliar a qualidade antes de gerar o documento completo. Escreva APENAS o cabeçalho/título e a abertura do documento (primeiro parágrafo ou primeira secção, no máximo). Pare num ponto natural — não tente preencher o documento todo. Não escreva "[continua]" nem comentários meta.`;
    }

    // SEGURANÇA (auditoria Jul/2026, item 5): mascara BI, NUIT, telefone e
    // e-mail ANTES de enviar o texto aos fornecedores de IA externos —
    // ver api/_lib/piiRedaction.js. Os valores reais são restaurados no
    // texto devolvido, mais abaixo, antes de responder ao utilizador.
    // O provider e o modelo nunca chegam a ver estes valores.
    const { text: redactedPrompt, tokens: piiTokens } = redactSensitive(finalPrompt);
    finalPrompt = redactedPrompt;

    // CORRIGIDO (auditoria A-3): limite de tamanho do prompt.
    const MAX_PROMPT_LENGTH = 15000;
    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({
            error: `Prompt demasiado longo (${finalPrompt.length} caracteres). Máximo: ${MAX_PROMPT_LENGTH}.`,
            code:  'PROMPT_TOO_LONG',
        });
    }

    // ── Autenticação ───────────────────────────────────────────────────────
    let verifiedUserId = userId;
    if (!isChainCall && !isPreview) {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!token) {
            return res.status(401).json({
                error: 'Autenticação obrigatória para gerar documentos.',
                code: 'AUTH_REQUIRED',
            });
        }
        try {
            const { user: jwtUser, error: authErr } = await getUserFromToken(token);
            if (authErr || !jwtUser) {
                return res.status(401).json({
                    error: 'Sessão inválida ou expirada. Inicie sessão novamente.',
                    code: 'AUTH_REQUIRED',
                });
            }
            verifiedUserId = jwtUser.id;
        } catch (e) {
            console.error('[generate-document] Erro ao verificar JWT:', e.message);
            return res.status(401).json({ error: 'Erro ao verificar sessão.' });
        }
    } else if (isPreview) {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (token) {
            try {
                const { user: jwtUser } = await getUserFromToken(token);
                if (jwtUser) verifiedUserId = jwtUser.id;
            } catch (_) { /* ignorar — preview continua anónimo */ }
        }
    }

    const creditsAfterDeduction = isPreview
        ? null
        : (typeof preDeductedCredits === 'number' ? preDeductedCredits : null);

    // CORRIGIDO (Ago/2026 — bug "Não foi possível planear o documento"):
    // 1024 tokens era demasiado apertado para o planeamento de um "trabalho"
    // com muitas páginas — o formulário permite até 30 páginas
    // (ServiceDefinitions.js), o que gera até ~21 secções no JSON pedido
    // (1 intro + até 18 capítulos + conclusão + referências). Com títulos
    // reais em português, 21 secções facilmente ultrapassam 1024 tokens,
    // cortando a resposta a meio de uma string/objecto — exactamente o que
    // o erro "Expected ',' or ']' after array element" no console denuncia.
    // max_tokens é só um TECTO (não obriga a gastar tokens a mais quando a
    // resposta natural é curta), por isso subir isto não tem custo extra
    // para planos pequenos — só dá margem para os grandes não cortarem.
    const maxTokens = isPreview
        ? PREVIEW_MAX_TOKENS
        : (_sectionMode ? 8192 : (_planMode ? 4096 : 8192));

    // Planeamento usa um system prompt dedicado (JSON estrito) e uma
    // temperatura mais baixa, para reduzir a chance de o modelo desviar-se
    // do formato JSON pedido (menos criatividade = formatação mais fiável).
    const systemPromptToUse = _planMode ? PLAN_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const temperatureToUse  = _planMode ? 0.3 : undefined;

    try {
        const result = await raceAllProviders(finalPrompt, apiKeys, _preferProvider, maxTokens, systemPromptToUse, temperatureToUse);

        if (!isChainCall) {
            console.log(JSON.stringify({
                event: isPreview ? 'doc_preview_generated' : 'doc_generated', serviceType,
                provider: result.provider, model: result.model,
                ms: result.ms,
                userId: verifiedUserId ? verifiedUserId.slice(0, 8) + '***' : 'anon',
                ts: new Date().toISOString(),
            }));
        }

        // SEGURANÇA (auditoria Jul/2026, item 5): restaura os valores reais
        // de BI/NUIT/telefone/e-mail nos marcadores que o modelo devolveu.
        // Ver nota em api/_lib/piiRedaction.js sobre o carácter de "melhor
        // esforço" desta restauração (defesa em profundidade).
        const restoredContent = restoreSensitive(result.content, piiTokens);

        return res.status(200).json({
            document: restoredContent,
            model: `${result.provider} · ${result.model}`,
            creditsRemaining: creditsAfterDeduction,
            usage: result.usage,
            preview: isPreview || undefined,
        });

    } catch (err) {
        console.error('[generate-document] Todos os providers falharam:', err?.message);

        let refunded = false;
        let creditsAfterRefund = creditsAfterDeduction;

        if (!isChainCall && !isPreview && verifiedUserId && (deductedCost === 1 || deductedCost === 2)) {
            // P1-08: com operationId, usa a RPC idempotente — protege contra
            // reembolso duplicado se este handler for invocado duas vezes
            // para a mesma tentativa (ex.: função serverless reexecutada
            // pela plataforma após um timeout do lado do cliente, quando na
            // realidade já tinha corrido — cenário citado na auditoria).
            let usedIdempotent = false;
            if (operationId) {
                try {
                    const rows = await rpc('refund_credit_idempotent', {
                        p_user_id:       verifiedUserId,
                        p_amount:        deductedCost,
                        p_operation_id:  operationId,
                        p_document_type: serviceType || null,
                    });
                    const row = Array.isArray(rows) ? rows[0] : rows;
                    if (row && typeof row.remaining_credits === 'number') {
                        refunded            = true;
                        creditsAfterRefund  = row.remaining_credits;
                        usedIdempotent      = true;
                    }
                } catch (refundErr) {
                    console.warn('[generate-document] refund_credit_idempotent indisponível, a usar rpc antiga:', refundErr.message);
                }
            }
            if (!usedIdempotent) {
                try {
                    const newCredits = await rpc('refund_credit', { p_user_id: verifiedUserId, p_amount: deductedCost });
                    if (newCredits !== undefined && newCredits !== null) {
                        refunded = true;
                        creditsAfterRefund = newCredits;
                    }
                } catch (refundErr) {
                    console.error('[generate-document] Falha ao reembolsar crédito automaticamente:', refundErr.message);
                }
            }
        }

        return res.status(503).json({
            error: refunded
                ? 'Serviço de IA temporariamente indisponível. O crédito foi devolvido automaticamente — tente novamente.'
                : (isPreview
                    ? 'Não foi possível gerar a amostra agora. Tente novamente em alguns segundos.'
                    : 'Serviço de IA temporariamente indisponível. Tente novamente.'),
            code: 'SERVICE_UNAVAILABLE',
            refunded,
            creditsRemaining: creditsAfterRefund,
        });
    }
}
