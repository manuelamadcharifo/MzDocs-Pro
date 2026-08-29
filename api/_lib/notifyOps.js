// api/_lib/notifyOps.js — v1.0 (Ago/2026)
// ──────────────────────────────────────────────────────────────────────────
// Camada fina por cima de notifyTelegram.js que acrescenta um segundo canal
// (WhatsApp) e uma mensagem pronta para o cenário "um provider de IA precisa
// da tua atenção" — usada por api/_lib/aiRace.js (alerta em tempo real,
// assim que um provider esgota TODOS os modelos repetidamente) e por
// api/_lib/aiProviderWatchdog.js (resumo diário via cron).
//
// PORQUÊ WHATSAPP VIA CALLMEBOT E NÃO A API OFICIAL DO WHATSAPP BUSINESS:
// A API oficial da Meta exige verificação de empresa, número dedicado e
// aprovação de templates de mensagem — семanas de processo para um caso de
// uso tão simples como "avisa-me a mim". O CallMeBot (callmebot.com) é um
// serviço gratuito, sem esse processo: activas uma vez enviando uma
// mensagem ao número deles pelo teu WhatsApp pessoal, recebes uma API key,
// e a partir daí um simples pedido GET envia-te uma mensagem. Não é
// indicado para enviar milhares de mensagens (é um serviço de terceiros,
// com limites informais de uso razoável), mas é perfeito para alertas
// pontuais de operação como este.
//
// COMO CONFIGURAR (2 minutos, opcional — o Telegram já configurado
// continua a funcionar sozinho se não fizeres isto):
//  1. Vai a callmebot.com/whatsapp/ e segue as instruções "Send this
//     message 'I allow callmebot to send me messages'" para o número de
//     telefone do bot indicado NA PÁGINA (não fixamos o número aqui de
//     propósito — a CallMeBot troca-o de vez em quando quando o WhatsApp
//     bloqueia o anterior; usar sempre o número actual da própria página).
//  2. Recebes de volta uma mensagem com a tua API key.
//  3. Na Vercel → Environment Variables, adiciona:
//     WHATSAPP_ALERT_PHONE      = o teu número com código do país, sem "+" (ex: 258841234567)
//     WHATSAPP_CALLMEBOT_APIKEY = a chave que recebeste no passo 2
//
// NOTA IMPORTANTE: a CallMeBot é um serviço gratuito de terceiros, feito
// para uso PESSOAL (não para enviar milhares de mensagens/dia) e sem
// garantia de disponibilidade — perfeito para um alerta pontual como este,
// mas se um dia parar de responder e isso for crítico para ti, o Telegram
// (já 100% suportado neste projecto, oficial e gratuito) continua a ser o
// canal principal recomendado.
//
// DESIGN: à semelhança de notifyTelegram(), esta camada NUNCA lança
// excepção — um alerta falhado jamais pode derrubar a geração de um
// documento ou o cron diário. Sem as env vars configuradas, sai em
// silêncio (fail-open).
// ──────────────────────────────────────────────────────────────────────────

const { notifyTelegram } = require('./notifyTelegram');

/**
 * Envia uma mensagem de texto simples via WhatsApp (CallMeBot). Sem
 * suporte a Markdown — o texto é enviado tal como está.
 * @param {string} text
 */
async function notifyWhatsApp(text) {
    const phone  = process.env.WHATSAPP_ALERT_PHONE;
    const apikey = process.env.WHATSAPP_CALLMEBOT_APIKEY;

    if (!phone || !apikey) {
        return { sent: false, reason: 'not_configured' };
    }

    try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
            `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn('[notifyWhatsApp] CallMeBot devolveu erro:', res.status, body.slice(0, 200));
            return { sent: false, reason: `http_${res.status}` };
        }
        return { sent: true };
    } catch (err) {
        console.warn('[notifyWhatsApp] falha ao enviar alerta:', err.message);
        return { sent: false, reason: err.message };
    }
}

/**
 * Envia a mesma mensagem para TODOS os canais configurados (Telegram +
 * WhatsApp) em paralelo. Cada canal falha de forma independente — se o
 * Telegram falhar, o WhatsApp continua a ser tentado, e vice-versa.
 * @param {string} text — versão Markdown (usada tal como está no Telegram; no WhatsApp os asteriscos ficam como texto simples, o que também funciona como ênfase no cliente do WhatsApp)
 * @param {{ silent?: boolean }} [opts]
 */
async function notifyOps(text, opts = {}) {
    const [telegram, whatsapp] = await Promise.all([
        notifyTelegram(text, opts),
        notifyWhatsApp(text),
    ]);
    return { telegram, whatsapp };
}

/**
 * Mensagem pronta para o cenário "um provider de IA parece estar morto ou a
 * precisar de substituição". Usada tanto pelo alerta em tempo real
 * (aiRace.js, quando um provider esgota todos os modelos repetidamente)
 * como pelo resumo diário (aiProviderWatchdog.js).
 */
function buildProviderIssueText({ providerName, envVar, signupUrl, diagnosis, isRealtime }) {
    const origem = isRealtime
        ? '🔴 *Provider de IA sem resposta AGORA MESMO*'
        : '🟠 *Resumo diário — provider de IA precisa de atenção*';
    return (
        `${origem}\n` +
        `Provider: *${providerName}*\n` +
        (diagnosis ? `Último erro: ${String(diagnosis).slice(0, 300)}\n` : '') +
        `\nO que fazer:\n` +
        `1. Abre o painel admin → IA Providers → *${providerName}* e clica "🔄 Reactivar (limpar falhas)".\n` +
        `2. Se voltar a falhar, confirma a chave *${envVar}* na Vercel (Settings → Environment Variables) — pode ter expirado ou esgotado os créditos.\n` +
        `3. Se o problema persistir e não for a chave, o provider pode ter mudado o plano grátis ou o catálogo de modelos — considera obter uma chave nova em ${signupUrl} ou pedir para investigar uma alternativa.\n` +
        (isRealtime ? `\n_Este alerta em tempo real só se repete de 12 em 12 horas para o mesmo provider, mesmo que continue a falhar._` : '')
    );
}

/**
 * Alerta em tempo real: um provider acabou de esgotar TODOS os modelos da
 * sua cadeia de fallback numa única tentativa. Chamado por aiRace.js — já
 * vem protegido contra spam por recordProviderExhaustion() (ver
 * modelHealth.js), por isso aqui já sabemos que vale a pena avisar.
 */
async function notifyProviderIssue(providerCfg, diagnosisMsg) {
    const text = buildProviderIssueText({
        providerName: providerCfg.name,
        envVar: providerCfg.envVar,
        signupUrl: providerCfg.signupUrl,
        diagnosis: diagnosisMsg,
        isRealtime: true,
    });
    return notifyOps(text);
}

module.exports = { notifyOps, notifyWhatsApp, notifyProviderIssue, buildProviderIssueText };
