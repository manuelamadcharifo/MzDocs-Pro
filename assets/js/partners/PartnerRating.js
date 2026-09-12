// assets/js/partners/PartnerRating.js — pedir avaliação (⭐) depois de um
// pedido feito a uma papelaria (Set/2026)
// ─────────────────────────────────────────────────────────────────────────
// O backend (api/partners.js, action=rate) e a tabela partner_ratings já
// existiam — e o cartão em NearbyPartners.js já sabia MOSTRAR "⭐ X.X"
// quando havia avaliações — mas não havia NENHUMA forma de o cliente as
// dar: faltava sempre este ficheiro. Fecha o ciclo em duas partes:
//
//   1. recordBookingForRating() — chamado pelo DocumentController sempre
//      que se cria uma marcação (sendDirect / sendDirectForGeneratedDoc),
//      guarda em localStorage um registo "por avaliar" com o nome/id da
//      papelaria escolhida.
//   2. checkPendingRatings() — corre sozinho pouco depois da app abrir; se
//      houver um pedido feito há mais de RATING_DELAY_MS (tempo real de ida
//      à papelaria) e ainda não avaliado nem dispensado, mostra um pedido
//      de avaliação simples (5 estrelas, um toque = envia e fecha).
//
// Filosofia igual à do MarketingTracker: nunca deve poder quebrar nada —
// localStorage indisponível, fetch falhado, etc. são sempre engolidos em
// silêncio, isto é um extra, nunca um bloqueio ao resto da app.
import { escapeHtml } from '../utils/Sanitizer.js';

const STORAGE_KEY     = 'mzd_pending_ratings';
const VISITOR_KEY     = 'mzd_visitor_id'; // mesma chave usada por MarketingTracker.js
const RATING_DELAY_MS  = 2  * 60 * 60 * 1000; // só pergunta depois de 2h (tempo real de ida à papelaria)
const RATING_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // ao fim de 30 dias, desiste de perguntar (pedido "esquecido")
const MAX_PENDING      = 20; // nunca deixa a lista local crescer sem limite

function _readPending() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (_) { return []; }
}

function _writePending(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_PENDING))); }
    catch (_) { /* localStorage indisponível (modo privado, etc.) — degrada sem rebentar */ }
}

function _getVisitorId() {
    try {
        const id = localStorage.getItem(VISITOR_KEY);
        if (id) return id;
    } catch (_) { /* ignora */ }
    // MarketingTracker.init() já deve ter corrido antes disto no arranque
    // da app (ver app.js#bootstrap) — isto é só uma rede de segurança.
    return window.marketingTracker?.visitorId || null;
}

// ── Registar um pedido para avaliação futura ──────────────────────────────
// Chamado pelo DocumentController logo após criar a marcação com sucesso.
export function recordBookingForRating(partnerId, partnerName) {
    if (!partnerId) return;
    try {
        const list = _readPending();
        list.push({ partnerId, partnerName: partnerName || 'a papelaria', ts: Date.now(), rated: false, dismissed: false });
        _writePending(list);
    } catch (_) { /* melhor esforço — nunca deve impedir o envio do pedido */ }
}

function _markEntry(ts, patch) {
    const list = _readPending().map(e => (e.ts === ts ? { ...e, ...patch } : e));
    _writePending(list);
}

// ── Modal de avaliação (5 estrelas) ───────────────────────────────────────
// Mesmo padrão visual/estrutural dos overlays já existentes em app.js
// (#mzOnboard) e DocumentController.js (#mzUpsellOverlay): <div> criado em
// runtime, anexado a document.body, removido no fim — sem depender de
// nenhum modal genérico que não existia no projecto.
function _showRatingModal(entry) {
    const overlay = document.createElement('div');
    overlay.id = 'mzRatingOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(7,16,31,.65);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .18s ease';

    overlay.innerHTML = `
        <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:22px 20px max(22px,env(safe-area-inset-bottom));text-align:center">
            <div style="font-size:32px;margin-bottom:6px">🖨️</div>
            <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:4px">Como foi o seu pedido?</div>
            <div style="font-size:13px;color:#64748b;margin-bottom:16px">${escapeHtml(entry.partnerName)}</div>
            <div id="mzStars" style="display:flex;justify-content:center;gap:6px;margin-bottom:16px">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${n} estrelas" style="background:none;border:none;font-size:34px;cursor:pointer;padding:2px;color:#CBD5E1;line-height:1">★</button>`).join('')}
            </div>
            <button type="button" id="mzRatingSkip" style="background:none;border:none;color:#94a3b8;font-size:13px;padding:8px;cursor:pointer">Agora não</button>
        </div>`;

    document.body.appendChild(overlay);

    const starsWrap = overlay.querySelector('#mzStars');
    const stars = overlay.querySelectorAll('[data-star]');
    const paint = (n) => stars.forEach(s => { s.style.color = Number(s.dataset.star) <= n ? '#F59E0B' : '#CBD5E1'; });
    stars.forEach(s => {
        s.addEventListener('mouseenter', () => paint(Number(s.dataset.star)));
        s.addEventListener('click', () => _submitRating(entry, Number(s.dataset.star), overlay));
    });
    starsWrap.addEventListener('mouseleave', () => paint(0));

    const dismiss = () => { _markEntry(entry.ts, { dismissed: true }); overlay.remove(); };
    overlay.querySelector('#mzRatingSkip').addEventListener('click', dismiss);
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
}

async function _submitRating(entry, rating, overlay) {
    const visitorId = _getVisitorId();
    const panel = overlay.firstElementChild;
    panel.innerHTML = `<div style="padding:20px 0;font-size:15px;font-weight:700;color:#0f172a">A enviar…</div>`;
    try {
        if (visitorId) {
            await fetch('/api/partners?action=rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: entry.partnerId, rating, visitor_id: visitorId }),
            });
        }
    } catch (_) { /* melhor esforço — a avaliação é um extra, nunca deve mostrar erro ao cliente */ }
    _markEntry(entry.ts, { rated: true });
    panel.innerHTML = `<div style="padding:20px 0"><div style="font-size:28px">🙏</div><div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:6px">Obrigado pela avaliação!</div></div>`;
    setTimeout(() => overlay.remove(), 1400);
}

// ── Verificação no arranque ────────────────────────────────────────────────
// Chamado sozinho (ver auto-execução no fim do ficheiro). Escolhe sempre o
// pedido mais antigo ainda por avaliar/dispensar; nunca mostra dois de
// seguida na mesma sessão — a pessoa só vê outro na próxima vez que abrir
// a app (e mesmo assim só se voltar a passar o RATING_DELAY_MS).
export function checkPendingRatings() {
    try {
        const now = Date.now();
        const list = _readPending();
        const cleaned = list.filter(e => !e.rated && !e.dismissed && (now - e.ts) < RATING_EXPIRY_MS);
        if (cleaned.length !== list.length) _writePending(cleaned);

        const due = cleaned.find(e => (now - e.ts) >= RATING_DELAY_MS);
        if (due && !document.getElementById('mzRatingOverlay')) _showRatingModal(due);
    } catch (_) { /* nunca deve impedir o arranque da app */ }
}

// Corre sozinho ao carregar — pequeno atraso para não competir com o ecrã
// de onboarding (app.js) nem com o carregamento inicial dos pacotes.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkPendingRatings, 4000));
} else {
    setTimeout(checkPendingRatings, 4000);
}
