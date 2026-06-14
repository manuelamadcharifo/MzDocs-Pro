// assets/js/partners/NearbyPartners.js
// Injector de parceiras próximas no modal de serviços WhatsApp
// Usado por DocumentController ao abrir impressao / foto / conversao

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let _geoCache   = null;
let _geoTs      = 0;
let _partnersCache = {}; // key: "svc-lat-lng"

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
export async function fetchNearbyPartners(svcId, lat, lng) {
  const key = `${svcId}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
  if (_partnersCache[key] && Date.now() - _partnersCache[key].ts < CACHE_TTL) {
    return _partnersCache[key].data;
  }
  const url = `/api/partners?action=nearby&lat=${lat}&lng=${lng}&service=${svcId}&km=10`;
  const res  = await fetch(url);
  const data = await res.json();
  const partners = data.ok ? (data.partners || []) : [];
  _partnersCache[key] = { data: partners, ts: Date.now() };
  return partners;
}

// ── Gerar HTML do bloco de parceiras ─────────────────────────────────────
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
          <div class="np-name">${p.name}</div>
          <div class="np-dist">${dist}</div>
        </div>
        ${p.hours ? `<div class="np-hours">🕐 ${p.hours}</div>` : ''}
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

// ── Bloco de loading ──────────────────────────────────────────────────────
export function buildLoadingHTML() {
  return `<div class="np-loading">
    <div class="np-spin"></div>
    <span>A procurar parceiras próximas…</span>
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

// ── Injectar no modal do formulário ──────────────────────────────────────
// Chamado pelo DocumentController quando abre serviço WhatsApp
export async function injectPartnersIntoModal(svcId, containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = buildLoadingHTML();

  // Retry handler (botão "Activar localização")
  window._mzRetryGeo = (id) => injectPartnersIntoModal(id, containerSelector);

  try {
    const { lat, lng } = await getUserLocation();
    const partners = await fetchNearbyPartners(svcId, lat, lng);
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
