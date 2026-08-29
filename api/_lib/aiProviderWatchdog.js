// api/_lib/aiProviderWatchdog.js — v1.0 (Ago/2026)
// ──────────────────────────────────────────────────────────────────────────
// Cron diário que responde à pergunta do Manuel: "avisa-me quando um
// provider precisar de atenção, não preciso de estar sempre a abrir o
// painel admin". Complementa o alerta EM TEMPO REAL que já existe em
// aiRace.js (ver recordProviderExhaustion() em modelHealth.js) — aquele
// dispara no momento em que um provider falha repetidamente DURANTE uma
// geração de documento real; este cron apanha também o caso em que um
// provider fica "silenciosamente" sem sucesso nenhum (ex: madrugada com
// pouco tráfego, ou um provider de reserva que só entra em uso raramente).
//
// Corre uma vez por dia (ver vercel.json → crons, 07:00 hora de Moçambique
// = 05:00 UTC) e só envia mensagem se HOUVER pelo menos um provider
// problemático — propositadamente NÃO envia um "está tudo bem" diário, para
// não gerares fadiga de notificações e passares a ignorar o canal.
//
// Um provider CONFIGURADO (tem chave) entra no relatório se:
//   a) teve pelo menos 1 pedido HOJE e TODOS falharam (`status === 'offline'`
//      no mesmo critério já usado pelo painel admin — ver api/admin/index.js);
//   b) OU teve pelo menos 1 pedido e a maioria falhou nos últimos 3 dias
//      (taxa de sucesso < 20%) — apanha um provider "degradado" crónico que
//      nunca chega a ficar 100% offline num único dia, mas na prática já não
//      vale a pena manter ligado.
// Um provider sem qualquer pedido no período (ex: um Tier 3 que nunca
// chegou a ser preciso) NÃO é reportado — ausência de uso não é o mesmo que
// falha.
// ──────────────────────────────────────────────────────────────────────────

const { restRequest } = require('./supabaseAdmin');
const { PROVIDERS, isProviderConfigured } = require('./aiProviderRegistry');
const { notifyOps, buildProviderIssueText } = require('./notifyOps');

const LOOKBACK_DAYS = 3;
const CHRONIC_SUCCESS_RATE_THRESHOLD = 0.20; // < 20% de sucesso em 3 dias = crónico

async function checkAiProviders() {
    const today = new Date();
    const since = new Date(today); since.setDate(since.getDate() - (LOOKBACK_DAYS - 1));
    const todayStr = today.toISOString().split('T')[0];
    const sinceStr = since.toISOString().split('T')[0];

    let rows = [];
    try {
        rows = await restRequest(
            `ai_provider_daily_usage?day=gte.${sinceStr}&order=day.asc` +
            `&select=day,provider,requests_ok,requests_fail,last_error_message`
        ) || [];
    } catch (e) {
        console.warn('[aiProviderWatchdog] tabela ai_provider_daily_usage indisponível:', e.message);
        return { checked: 0, flagged: [], sent: false };
    }

    const flagged = [];

    for (const providerCfg of PROVIDERS) {
        if (!isProviderConfigured(providerCfg)) continue; // sem chave — nada a vigiar

        const history = rows.filter(r => r.provider === providerCfg.id);
        if (history.length === 0) continue; // sem uso no período — não é falha, é ausência de tráfego

        const todayRow = history.find(r => r.day === todayStr);
        const totalOk   = history.reduce((s, r) => s + Number(r.requests_ok || 0), 0);
        const totalFail = history.reduce((s, r) => s + Number(r.requests_fail || 0), 0);
        const totalReq  = totalOk + totalFail;
        if (totalReq === 0) continue;

        const successRate  = totalOk / totalReq;
        const offlineToday = todayRow && Number(todayRow.requests_ok) === 0 && Number(todayRow.requests_fail) > 0;
        const chronic       = successRate < CHRONIC_SUCCESS_RATE_THRESHOLD && totalReq >= 5;

        if (offlineToday || chronic) {
            const lastError = [...history].reverse().find(r => r.last_error_message)?.last_error_message || null;
            flagged.push({
                id: providerCfg.id,
                name: providerCfg.name,
                envVar: providerCfg.envVar,
                signupUrl: providerCfg.signupUrl,
                reason: offlineToday ? 'offline_hoje' : 'cronicamente_degradado',
                successRatePct: Math.round(successRate * 100),
                lastError,
            });
        }
    }

    let sent = false;
    if (flagged.length > 0) {
        const lines = flagged.map(f =>
            `\n━━━━━━━━━━━━━━━\n` + buildProviderIssueText({
                providerName: f.name,
                envVar: f.envVar,
                signupUrl: f.signupUrl,
                diagnosis: f.lastError || `${f.reason === 'offline_hoje' ? 'Sem nenhum pedido bem-sucedido hoje' : `Taxa de sucesso de apenas ${f.successRatePct}% nos últimos ${LOOKBACK_DAYS} dias`}`,
                isRealtime: false,
            })
        );
        const header = `📋 *Resumo diário — MzDocs Pro*\n${flagged.length} provider(es) de IA a precisar de atenção:\n`;
        await notifyOps(header + lines.join(''));
        sent = true;
    }

    return { checked: PROVIDERS.length, flagged, sent };
}

// ─── Handler HTTP (chamado via api/misc.js?action=ai-providers-cron) ──────
async function handleAiProvidersCron(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Mesmo padrão de autenticação do cron do blog (handleBlogCron em
    // api/_services/blog.js) — aceita o header nativo que a Vercel injecta
    // (Authorization: Bearer $CRON_SECRET) ou um header custom.
    const bearerSecret   = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    const customSecret   = req.headers['x-vercel-cron-secret'] || req.headers['x-cron-secret'] || '';
    const providedSecret = bearerSecret || customSecret;
    if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    try {
        const result = await checkAiProviders();
        return res.status(200).json({ success: true, ...result });
    } catch (e) {
        console.error('[ai-providers-cron] erro:', e.message);
        return res.status(500).json({ error: e.message });
    }
}

module.exports = { checkAiProviders, handleAiProvidersCron };
