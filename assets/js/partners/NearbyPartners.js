// assets/js/partners/NearbyPartners.js
// Injector de parceiras próximas no modal de serviços WhatsApp
// (papelarias) e, desde v2.1, também de advogados no ecrã de resultado.
// Usado por DocumentController ao abrir impressao/foto/conversao (papelaria)
// e ao gerar documentos jurídicos (advogado).
import { escapeHtml } from '../utils/Sanitizer.js';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let _geoCache   = null;
let _geoTs      = 0;
let _partnersCache = {}; // key: "type-svc-lat-lng"

// Rótulos de área jurídica para as tags do card de advogado.
const SPECIALTY_LABEL = {
  civil: 'Civil', laboral: 'Laboral', comercial: 'Comercial', familia: 'Família',
  penal: 'Penal', imobiliario: 'Imobiliário', fiscal: 'Fiscal', sucessorio: 'Sucessório',
};

// ── Geolocalização com cache ──────────────────────────────────────────────
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    // Usar cache se recente
    if (_geoCache && Date.now() - _geoTs < CACHE_TTL) {
      return resolve(_geoCache);
    }
    if (!navigator.geolocation) return reject(new Error('sem_geo'));
    navigator.geolocation.getCurrentPosition(
      pos => {
        _geoCache = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        _geoTs = Date.now();
        resolve(_geoCache);
      },
      err => reject(err),
      { timeout: 8000, maximumAge: CACHE_TTL, enableHighAccuracy: false }
    );
  });
}

// ── Buscar parceiras próximas ─────────────────────────────────────────────
// NOVO (v2.1): 4º parâmetro `type` ('papelaria' por omissão | 'advogado').
export async function fetchNearbyPartners(svcId, lat, lng, type = 'papelaria') {
  const key = `${type}-${svcId}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
  if (_partnersCache[key] && Date.now() - _partnersCache[key].ts < CACHE_TTL) {
    return _partnersCache[key].data;
  }
  const url = `/api/partners?action=nearby&lat=${lat}&lng=${lng}&service=${svcId}&type=${type}&km=10`;
  const res  = await fetch(url);
  const data = await res.json();
  const partners = data.ok ? (data.partners || []) : [];
  _partnersCache[key] = { data: partners, ts: Date.now() };
  return partners;
}

// ── Gerar HTML do bloco de parceiras (papelaria) ──────────────────────────
export function buildPartnersHTML(partners, svcLabel) {
  if (!partners.length) {
    return `<div class="np-empty">
      <div class="np-empty-ico">📍</div>
      <div class="np-empty-text">Ainda não há parceiras na sua área.<br/>
        <a href="/parceiros.html" target="_blank" rel="noopener" class="np-link">
          Conhece uma papelaria? Convide-a →
        </a>
      </div>
    </div>`;
  }

  const cards = partners.map(p => {
    const dist  = p.distance_km < 1
      ? `${Math.round(p.distance_km * 1000)}m`
      : `${p.distance_km}km`;
    const rating = p.rating ? `⭐ ${p.rating}` : '';
    const wa = `https://wa.me/${(p.whatsapp||'').replace(/\D/g,'')}`;
    return `
      <div class="np-card">
        <div class="np-card-head">
          <div class="np-name">${escapeHtml(p.name)}</div>
          <div class="np-dist">${dist}</div>
        </div>
        ${p.hours ? `<div class="np-hours">🕐 ${escapeHtml(p.hours)}</div>` : ''}
        ${rating   ? `<div class="np-rating">${rating}</div>` : ''}
        <a href="${wa}" target="_blank" rel="noopener" class="np-btn-wa"
           onclick="window._mzPartnerClick && window._mzPartnerClick('${p.id}')">
          <span>📲</span> Contactar via WhatsApp
        </a>
      </div>`;
  }).join('');

  return `
    <div class="np-header">
      <div class="np-title">🏪 Parceiras próximas</div>
      <div class="np-sub">Escolha uma para enviar o pedido</div>
    </div>
    <div class="np-list">${cards}</div>
    <div class="np-footer">
      <a href="/parceiros.html" target="_blank" rel="noopener" class="np-link">
        É dono de uma papelaria? Seja parceiro →
      </a>
    </div>`;
}

// ── Gerar HTML do bloco de advogados (NOVO v2.1) ──────────────────────────
// Mesmo padrão visual do bloco de papelarias, mas com selo de confiança
// (nº OAM) e tags de área de atuação em vez de tipo de impressão.
export function buildLawyersHTML(lawyers) {
  if (!lawyers.length) {
    return `<div class="np-empty">
      <div class="np-empty-ico">⚖️</div>
      <div class="np-empty-text">Ainda não há advogados parceiros na sua área.<br/>
        <a href="/parceiros.html?tipo=advogado" target="_blank" rel="noopener" class="np-link">
          É advogado(a)? Junte-se à rede →
        </a>
      </div>
    </div>`;
  }

  const cards = lawyers.map(p => {
    const dist  = p.distance_km < 1
      ? `${Math.round(p.distance_km * 1000)}m`
      : `${p.distance_km}km`;
    const rating = p.rating ? `⭐ ${p.rating}` : '';
    const wa = `https://wa.me/${(p.whatsapp||'').replace(/\D/g,'')}`;
    const tags = (p.services || []).map(s => `<span class="np-tag">${SPECIALTY_LABEL[s] || s}</span>`).join('');
    return `
      <div class="np-card">
        <div class="np-card-head">
          <div class="np-name">${escapeHtml(p.name)}</div>
          <div class="np-dist">${dist}</div>
        </div>
        ${p.credential_number ? `<div class="np-oam">🛡️ OAM Nº ${escapeHtml(p.credential_number)}</div>` : ''}
        ${p.bio ? `<div class="np-hours">${escapeHtml(p.bio)}</div>` : ''}
        ${tags ? `<div class="np-tags">${tags}</div>` : ''}
        ${rating ? `<div class="np-rating">${rating}</div>` : ''}
        <a href="${wa}" target="_blank" rel="noopener" class="np-btn-wa"
           onclick="window._mzPartnerClick && window._mzPartnerClick('${p.id}')">
          <span>📲</span> Falar com advogado
        </a>
      </div>`;
  }).join('');

  return `
    <div class="np-header">
      <div class="np-title">⚖️ Advogados próximos</div>
      <div class="np-sub">Revisão profissional deste documento, se precisar</div>
    </div>
    <div class="np-list">${cards}</div>
    <div class="np-disclaimer">
      O MzDocs Pro apenas liga-o a advogados independentes registados na
      Ordem dos Advogados de Moçambique — a prestação e a responsabilidade
      pelo aconselhamento jurídico são do advogado escolhido.
    </div>
    <div class="np-footer">
      <a href="/parceiros.html?tipo=advogado" target="_blank" rel="noopener" class="np-link">
        É advogado(a)? Junte-se à rede →
      </a>
    </div>`;
}

// ── Bloco de loading ──────────────────────────────────────────────────────
export function buildLoadingHTML(label = 'A procurar parceiras próximas…') {
  return `<div class="np-loading">
    <div class="np-spin"></div>
    <span>${label}</span>
  </div>`;
}

// ── Bloco de erro de geolocalização ──────────────────────────────────────
export function buildGeoErrorHTML(svcId) {
  return `<div class="np-geo-error">
    <div>📍 Precisamos da sua localização para encontrar parceiras próximas.</div>
    <button class="np-btn-geo" onclick="window._mzRetryGeo && window._mzRetryGeo('${svcId}')">
      Activar localização
    </button>
    <div style="margin-top:8px;font-size:11px;color:var(--muted)">
      Ou contacte diretamente:
      <a href="https://wa.me/258840000000" target="_blank" rel="noopener" class="np-link">
        WhatsApp MzDocs →
      </a>
    </div>
  </div>`;
}

// ── Injectar no modal do formulário (papelaria) ───────────────────────────
// Chamado pelo DocumentController quando abre serviço WhatsApp
export async function injectPartnersIntoModal(svcId, containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = buildLoadingHTML();

  // Retry handler (botão "Activar localização")
  window._mzRetryGeo = (id) => injectPartnersIntoModal(id, containerSelector);

  try {
    const { lat, lng } = await getUserLocation();
    const partners = await fetchNearbyPartners(svcId, lat, lng, 'papelaria');
    container.innerHTML = buildPartnersHTML(partners, svcId);
  } catch (err) {
    const isGeoErr = err.message === 'sem_geo' || err.code;
    if (isGeoErr) {
      container.innerHTML = buildGeoErrorHTML(svcId);
    } else {
      container.innerHTML = buildGeoErrorHTML(svcId);
    }
  }
}

// ── Injectar advogados no ecrã de resultado (NOVO v2.1) ───────────────────
// Chamado pelo DocumentController depois de gerar um documento cujo tipo
// beneficia de revisão jurídica (procuração, contrato, testamento, laboral,
// arrendamento, requerimento — ver LEGAL_DOC_TYPES em DocumentController.js).
// `specialty` é opcional: quando o docType tem uma área jurídica óbvia
// (ex: laboral), filtra directamente por ela.
export async function injectLawyersIntoModal(containerSelector, specialty = '') {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = buildLoadingHTML('A procurar advogados próximos…');
  window._mzRetryGeoLawyer = () => injectLawyersIntoModal(containerSelector, specialty);

  try {
    const { lat, lng } = await getUserLocation();
    const lawyers = await fetchNearbyPartners(specialty, lat, lng, 'advogado');
    container.innerHTML = buildLawyersHTML(lawyers);
  } catch (err) {
    container.innerHTML = buildGeoErrorHTML(specialty);
  }
}
