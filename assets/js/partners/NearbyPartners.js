// assets/js/partners/NearbyPartners.js
// Injector de parceiras próximas no modal de serviços WhatsApp
// (papelarias) e, desde v2.1, também de advogados no ecrã de resultado.
// Usado por DocumentController ao abrir impressao/foto/conversao (papelaria)
// e ao gerar documentos jurídicos (advogado).
import { escapeHtml } from '../utils/Sanitizer.js';

// CSP FASE 1 (auditoria Ago/2026): delegação de eventos por data-action, em
// vez de onclick="..." inline — mesma lógica usada em AdminApp.js.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  // ALTERADO: "partnerClick" já não abre o WhatsApp directamente — passa a
  // seleccionar a papelaria (ver selectPartner() abaixo), que activa o botão
  // fixo "Enviar pelo WhatsApp Grátis" do formulário em vez de contactar a
  // papelaria sem os dados do pedido.
  if (el.dataset.action === 'partnerClick') selectPartner(el);
  if (el.dataset.action === 'retryGeo' && window._mzRetryGeo) window._mzRetryGeo(el.dataset.svc);
  // NOVO: "tentar novamente" depois de uma busca que já correu (encontrou
  // 0 parceiras, ou encontrou fora do raio) — ao contrário de "retryGeo"
  // (só existe quando a geolocalização falhou), este limpa a localização
  // e a lista em cache e repete tudo do zero, útil ex.: depois do GPS
  // assentar numa posição mais precisa ou do utilizador se ter deslocado.
  if (el.dataset.action === 'forceRetryPartners' && window._mzForceRetryPartners) window._mzForceRetryPartners(el.dataset.svc);
  if (el.dataset.action === 'forceRetryLawyers' && window._mzForceRetryLawyers) window._mzForceRetryLawyers();
});

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let _geoCache   = null;
let _geoTs      = 0;
let _partnersCache = {}; // key: "type-svc-lat-lng"

// ── Selecção de papelaria (NOVO) ──────────────────────────────────────────
// Chamado ao clicar num cartão da lista "Parceiras próximas". Marca o
// cartão como seleccionado, guarda o WhatsApp da papelaria escolhida em
// window._mzSelectedPartnerWA (lido por DocumentController.sendDirect()) e
// activa o botão fixo "Enviar pelo WhatsApp Grátis", que nasce desactivado
// em Views.renderForm() até o utilizador escolher uma papelaria.
function selectPartner(el) {
  const wa = (el.dataset.wa || '').replace(/\D/g, '');
  if (!wa) return; // papelaria sem WhatsApp configurado — não activa o envio

  const card = el.closest('.np-card');
  const list = el.closest('.np-list');

  // Só um cartão seleccionado de cada vez
  list?.querySelectorAll('.np-card.np-selected').forEach(c => c.classList.remove('np-selected'));
  card?.classList.add('np-selected');
  list?.querySelectorAll('.np-btn-select').forEach(b => {
    b.classList.remove('np-btn-select--active');
    b.innerHTML = '<span>📲</span> Selecionar esta papelaria';
  });
  el.classList.add('np-btn-select--active');
  el.innerHTML = '<span>✅</span> Papelaria seleccionada';

  window._mzSelectedPartnerWA   = wa;
  window._mzSelectedPartnerName = el.dataset.name || '';
  // NOVO (Ago/2026 — agendamento): guarda também o id da papelaria, usado
  // por DocumentController.sendDirect() para criar o registo de marcação
  // em /api/partners?action=create-booking antes de abrir o WhatsApp.
  window._mzSelectedPartnerId   = el.dataset.id || null;

  // CORRIGIDO: passou a existir um SEGUNDO botão "Enviar pelo WhatsApp"
  // (#btnWaDirectResult, no ecrã de resultado — ver
  // injectPartnerToggleIntoModal abaixo), além do já existente no
  // formulário pré-geração (#btnWaDirect). Antes, isto só activava
  // #btnWaDirect por id — no ecrã de resultado esse id nem existe, por
  // isso seleccionar uma papelaria aí mostrava "✅ Papelaria seleccionada"
  // no cartão mas não havia NENHUM botão para realmente enviar o pedido.
  // Ambos os botões partilham a classe .btn-wa-direct (e as dicas a
  // classe .mz-wa-hint), por isso activa/actualiza-se sempre os dois,
  // exista um só ou os dois em simultâneo no DOM.
  document.querySelectorAll('.btn-wa-direct').forEach(btnWa => { btnWa.disabled = false; });
  document.querySelectorAll('.mz-wa-hint').forEach(hint => {
    hint.textContent = `✓ Pronto a enviar para ${window._mzSelectedPartnerName || 'a papelaria seleccionada'}`;
  });
}

// ── Reset da selecção (NOVO) ──────────────────────────────────────────────
// Chamado sempre que a lista de parceiras é (re)carregada — nova busca,
// "tentar novamente", ou abertura de um novo formulário — para nenhuma
// selecção antiga ficar "presa" a uma papelaria que já não está na lista.
function resetPartnerSelection() {
  window._mzSelectedPartnerWA   = null;
  window._mzSelectedPartnerName = null;
  window._mzSelectedPartnerId   = null;
  // CORRIGIDO: ver nota em selectPartner() — repor os dois botões/dicas
  // possíveis (form pré-geração + ecrã de resultado), não só um por id.
  document.querySelectorAll('.btn-wa-direct').forEach(btnWa => { btnWa.disabled = true; });
  document.querySelectorAll('.mz-wa-hint').forEach(hint => {
    hint.textContent = '📍 Escolha uma papelaria abaixo para activar o envio';
  });
}

// Rótulos dos serviços de papelaria — usados na mensagem "há papelarias
// perto, mas nenhuma faz X" (ver buildPartnersHTML) e para listar os
// serviços que as papelarias vizinhas realmente fazem.
const SERVICE_LABEL = {
  impressao: 'Impressão', foto: 'Foto para Documentos',
  plastificacao: 'Plastificação', encadernacao: 'Encadernação',
};
// Rótulos de área jurídica para as tags do card de advogado.
const SPECIALTY_LABEL = {
  civil: 'Civil', laboral: 'Laboral', comercial: 'Comercial', familia: 'Família',
  penal: 'Penal', imobiliario: 'Imobiliário', fiscal: 'Fiscal', sucessorio: 'Sucessório',
};

// ── Geolocalização com cache ──────────────────────────────────────────────
// CORRIGIDO (Ago/2026): enableHighAccuracy:false usava triangulação de
// rede/WiFi em vez de GPS — em Moçambique, com poucos pontos de referência
// WiFi/torres mapeados, isto podia errar por vários km (relatado: cliente
// fisicamente ao lado de uma papelaria via "não há parceiras na área",
// porque a localização de rede o colocou longe dali). Passa a pedir GPS
// real; o timeout sobe de 8s para 12s porque um "fix" de GPS demora mais
// a assentar do que uma resposta de rede, sobretudo em interiores.
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    // Usar cache se recente
    if (_geoCache && Date.now() - _geoTs < CACHE_TTL) {
      return resolve(_geoCache);
    }
    if (!navigator.geolocation) return reject(new Error('sem_geo'));
    navigator.geolocation.getCurrentPosition(
      pos => {
        _geoCache = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        _geoTs = Date.now();
        resolve(_geoCache);
      },
      err => reject(err),
      { timeout: 12000, maximumAge: CACHE_TTL, enableHighAccuracy: true }
    );
  });
}

// ── Buscar parceiras próximas ─────────────────────────────────────────────
// NOVO (v2.1): 4º parâmetro `type` ('papelaria' por omissão | 'advogado').
// ALTERADO (Ago/2026): passa a devolver um objecto { partners, meta } em
// vez de só o array — `meta` carrega `service_unavailable` +
// `nearby_without_service`, devolvidos pelo backend quando há parceiras na
// área mas nenhuma faz o serviço pedido (ver handleNearby em
// api/partners.js e buildPartnersHTML abaixo). Nenhum chamador antigo
// dependia do valor de retorno ser um array puro fora deste ficheiro.
export async function fetchNearbyPartners(svcId, lat, lng, type = 'papelaria') {
  const key = `${type}-${svcId}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
  if (_partnersCache[key] && Date.now() - _partnersCache[key].ts < CACHE_TTL) {
    return _partnersCache[key].data;
  }
  const url = `/api/partners?action=nearby&lat=${lat}&lng=${lng}&service=${svcId}&type=${type}&km=10`;
  const res  = await fetch(url);
  const data = await res.json();
  // NOVO: quando não há ninguém dentro do raio habitual, o backend devolve
  // a(s) parceira(s) mais próxima(s) na mesma, marcadas com
  // outside_radius=true — ver api/partners.js. Preserva-se essa marca ao
  // guardar em cache para o aviso continuar a aparecer.
  const result = {
    partners: data.ok ? (data.partners || []) : [],
    meta: {
      service_unavailable: !!data.service_unavailable,
      nearby_without_service: data.nearby_without_service || [],
    },
  };
  _partnersCache[key] = { data: result, ts: Date.now() };
  return result;
}

// ── Gerar HTML do bloco de parceiras (papelaria) ──────────────────────────
export function buildPartnersHTML(partners, svcId, meta = {}) {
  // NOVO: botão de retry real (limpa a localização em cache e repete a
  // busca do zero) — antes só existia para o caso de a geolocalização
  // falhar (buildGeoErrorHTML); depois de uma busca que correu mas não
  // encontrou ninguém não havia NENHUMA forma de tentar de novo sem sair
  // do formulário e reabrir o serviço.
  const retryBtn = `<button type="button" class="np-btn-geo" data-action="forceRetryPartners" data-svc="${escapeHtml(svcId)}" style="margin-top:8px">
    🔄 Tentar novamente
  </button>`;

  if (!partners.length) {
    // NOVO (Ago/2026): distingue "não há NENHUMA papelaria na área" de "há
    // papelarias na área, mas nenhuma faz este serviço" — antes as duas
    // situações mostravam exactamente a mesma mensagem genérica, o que
    // levava o cliente a pensar (erradamente) que não havia papelaria
    // nenhuma por perto, quando na verdade havia uma mesmo ao lado, só que
    // sem aquele serviço específico (ver `service_unavailable` +
    // `nearby_without_service`, devolvidos por handleNearby em
    // api/partners.js).
    if (meta.service_unavailable && meta.nearby_without_service?.length) {
      const label = SERVICE_LABEL[svcId] || 'este serviço';
      const altCards = meta.nearby_without_service.map(p => {
        const dist = p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km}km`;
        const otherServices = (p.services || []).map(s => SERVICE_LABEL[s] || s).join(', ') || '—';
        return `<div class="np-alt-card">
          <div class="np-alt-head"><b>${escapeHtml(p.name)}</b><span class="np-dist">${dist}</span></div>
          <div class="np-alt-services">Faz: ${escapeHtml(otherServices)}</div>
        </div>`;
      }).join('');
      return `<div class="np-empty">
        <div class="np-empty-ico">📍</div>
        <div class="np-empty-text">
          Há papelarias perto de si, mas nenhuma faz <b>${escapeHtml(label)}</b> por enquanto:
        </div>
        <div class="np-alt-list">${altCards}</div>
        <div class="np-empty-text" style="margin-top:8px">
          <a href="/parceiros.html" target="_blank" rel="noopener" class="np-link">
            Conhece uma papelaria que faça? Convide-a →
          </a>
        </div>
        ${retryBtn}
      </div>`;
    }

    return `<div class="np-empty">
      <div class="np-empty-ico">📍</div>
      <div class="np-empty-text">Ainda não há parceiras na sua área.<br/>
        <a href="/parceiros.html" target="_blank" rel="noopener" class="np-link">
          Conhece uma papelaria? Convide-a →
        </a>
      </div>
      ${retryBtn}
    </div>`;
  }

  // NOVO: quando a lista veio do fallback "fora do raio habitual" (rede
  // ainda pequena — ver api/partners.js), avisa antes dos cartões em vez
  // de os mostrar como se estivessem perto, sem contexto. Inclui o mesmo
  // botão de retry — útil se a imprecisão da localização for a causa
  // (ver enableHighAccuracy em getUserLocation) e o utilizador quiser
  // tentar apanhar um GPS mais preciso antes de assumir que está mesmo
  // longe.
  const anyOutside = partners.some(p => p.outside_radius);
  const outsideNotice = anyOutside ? `
    <div class="np-notice" style="background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;font-size:12px;padding:8px 10px;border-radius:8px;margin-bottom:10px">
      📍 Ainda não há parceiras perto de si — mas esta(s) já entregam pela zona:
      ${retryBtn}
    </div>` : '';

  // ALTERADO: já não é um <a href="wa.me/..."> que abre o WhatsApp de
  // imediato (sem os dados do pedido preenchidos no formulário) — passa a
  // ser um <button> que apenas SELECCIONA a papelaria (selectPartner()),
  // activando o botão fixo "Enviar pelo WhatsApp Grátis", que é quem
  // realmente monta e envia a mensagem com os dados do pedido para o
  // WhatsApp da papelaria escolhida (ver DocumentController.sendDirect()).
  const cards = partners.map(p => {
    const dist  = p.distance_km < 1
      ? `${Math.round(p.distance_km * 1000)}m`
      : `${p.distance_km}km`;
    const rating = p.rating ? `⭐ ${p.rating}` : '';
    const waDigits = (p.whatsapp || '').replace(/\D/g, '');
    return `
      <div class="np-card" data-partner-id="${escapeHtml(p.id)}">
        <div class="np-card-head">
          <div class="np-name">${escapeHtml(p.name)}</div>
          <div class="np-dist">${dist}</div>
        </div>
        ${p.hours ? `<div class="np-hours">🕐 ${escapeHtml(p.hours)}</div>` : ''}
        ${rating   ? `<div class="np-rating">${rating}</div>` : ''}
        <button type="button" class="np-btn-select"
           data-action="partnerClick" data-id="${escapeHtml(p.id)}"
           data-wa="${escapeHtml(waDigits)}" data-name="${escapeHtml(p.name)}">
          <span>📲</span> Selecionar esta papelaria
        </button>
      </div>`;
  }).join('');

  return `
    <div class="np-header">
      <div class="np-title">🏪 Parceiras próximas</div>
      <div class="np-sub">Escolha uma para enviar o pedido</div>
    </div>
    ${outsideNotice}
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
  const retryBtn = `<button type="button" class="np-btn-geo" data-action="forceRetryLawyers" style="margin-top:8px">
    🔄 Tentar novamente
  </button>`;

  if (!lawyers.length) {
    return `<div class="np-empty">
      <div class="np-empty-ico">⚖️</div>
      <div class="np-empty-text">Ainda não há advogados parceiros na sua área.<br/>
        <a href="/parceiros.html?tipo=advogado" target="_blank" rel="noopener" class="np-link">
          É advogado(a)? Junte-se à rede →
        </a>
      </div>
      ${retryBtn}
    </div>`;
  }

  const anyOutside = lawyers.some(p => p.outside_radius);
  const outsideNotice = anyOutside ? `
    <div class="np-notice" style="background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;font-size:12px;padding:8px 10px;border-radius:8px;margin-bottom:10px">
      📍 Ainda não há advogados perto de si — mas este(s) já atendem à distância:
    </div>` : '';

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
           data-action="partnerClick" data-id="${escapeHtml(p.id)}">
          <span>📲</span> Falar com advogado
        </a>
      </div>`;
  }).join('');

  return `
    <div class="np-header">
      <div class="np-title">⚖️ Advogados próximos</div>
      <div class="np-sub">Revisão profissional deste documento, se precisar</div>
    </div>
    ${outsideNotice}
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
// ── Alternador Papelaria/Advogado no ecrã de resultado (NOVO) ─────────────
// Pedido explícito: na mesma zona onde antes só aparecia o bloco de
// advogados (para documentos em LEGAL_DOC_TYPES), a pessoa que acabou de
// gerar o documento também pode querer simplesmente imprimi-lo — por isso
// passa a haver um alternador entre "Papelarias" e "Advogados", com
// Papelarias marcado como parceiro PRINCIPAL por omissão (é o caso mais
// comum logo a seguir a gerar um documento) e Advogados como opção à
// distância de um toque — mesmo princípio visual dos filtros de categoria
// da homepage (.cat-filters/.cat-btn, index.html), reaproveitados aqui tal
// e qual para a pessoa reconhecer o mesmo padrão de interacção.
// Não reimplementa a busca: delega sempre em injectPartnersIntoModal() /
// injectLawyersIntoModal(), já existentes e já testados — só troca qual
// delas escreve no painel interno consoante a aba activa.
export function injectPartnerToggleIntoModal(containerSelector, { printService = 'impressao', specialty = '' } = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = `
    <div class="cat-filters np-toggle-tabs" style="padding-bottom:0;margin-bottom:10px;overflow-x:visible">
      <button class="cat-btn active" type="button" data-np-tab="papelaria">🖨️ Papelarias</button>
      <button class="cat-btn" type="button" data-np-tab="advogado">⚖️ Advogados</button>
    </div>
    <div id="npTogglePanel"></div>
    <div id="npSendBlock" style="margin-top:10px;">
      <div id="mzWaHintResult" class="mz-wa-hint">📍 Escolha uma papelaria abaixo para activar o envio</div>
      <button id="btnWaDirectResult" class="btn-wa btn-wa-direct" type="button" disabled>
        <span>📱 Enviar pedido pelo WhatsApp</span>
        <small>Grátis</small>
      </button>
    </div>
  `;

  const tabs = container.querySelectorAll('[data-np-tab]');
  const sendBlock = container.querySelector('#npSendBlock');
  const showTab = (tab) => {
    tabs.forEach(b => b.classList.toggle('active', b.dataset.npTab === tab));
    // NOVO: o botão de envio directo só faz sentido para papelarias — um
    // advogado não recebe "pedidos" da mesma forma (é um contacto/
    // referência, não uma encomenda de impressão) — por isso esconde-se
    // na aba Advogados em vez de ficar ali desactivado sem explicação.
    if (sendBlock) sendBlock.style.display = tab === 'papelaria' ? '' : 'none';
    if (tab === 'papelaria') {
      injectPartnersIntoModal(printService, '#npTogglePanel');
    } else {
      injectLawyersIntoModal('#npTogglePanel', specialty);
    }
  };
  tabs.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.npTab)));
  showTab('papelaria'); // papelaria fica marcada como parceiro principal por omissão — ver nota acima
}

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
    <button class="np-btn-geo" data-action="retryGeo" data-svc="${escapeHtml(svcId)}">
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

  // NOVO: qualquer (re)carregamento da lista limpa a selecção anterior e
  // desactiva de novo o botão "Enviar pelo WhatsApp Grátis" — evita enviar
  // para uma papelaria seleccionada numa busca anterior que já não é
  // mostrada (ex.: depois de "tentar novamente").
  resetPartnerSelection();

  container.innerHTML = buildLoadingHTML();

  // Retry handler (botão "Activar localização", quando a geolocalização falha)
  window._mzRetryGeo = (id) => injectPartnersIntoModal(id, containerSelector);
  // NOVO: retry handler para depois de uma busca que já correu (0
  // resultados, ou fora do raio) — limpa a localização E a lista em
  // cache antes de repetir, para não devolver instantaneamente o mesmo
  // resultado antigo guardado (a cache normal dura 5 minutos).
  window._mzForceRetryPartners = (id) => {
    _geoCache = null; _geoTs = 0;
    _partnersCache = {};
    injectPartnersIntoModal(id, containerSelector);
  };

  try {
    const { lat, lng } = await getUserLocation();
    const { partners, meta } = await fetchNearbyPartners(svcId, lat, lng, 'papelaria');
    container.innerHTML = buildPartnersHTML(partners, svcId, meta);
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
  // NOVO: mesmo retry "a sério" do bloco de papelarias acima.
  window._mzForceRetryLawyers = () => {
    _geoCache = null; _geoTs = 0;
    _partnersCache = {};
    injectLawyersIntoModal(containerSelector, specialty);
  };

  try {
    const { lat, lng } = await getUserLocation();
    const { partners: lawyers } = await fetchNearbyPartners(specialty, lat, lng, 'advogado');
    container.innerHTML = buildLawyersHTML(lawyers);
  } catch (err) {
    container.innerHTML = buildGeoErrorHTML(specialty);
  }
}
