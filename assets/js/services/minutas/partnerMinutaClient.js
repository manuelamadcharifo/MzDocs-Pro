// assets/js/services/minutas/partnerMinutaClient.js
// Cliente fino para o namespace /api/misc?_ns=partnerMinutas — usado pela
// UI de escolha de minuta (a acrescentar ao formulário, ver nota em
// Services.js) e pelo eventual formulário "Submeter minuta" no marketplace.
// Segue o mesmo padrão simples de fetch já usado pelo resto do projecto
// (ver PaymentService.js / Services.js).

const ENDPOINT = '/api/misc';

async function _authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { authManager } = await import('../../auth/AuthManager.js');
    await authManager.ready();
    const token = await authManager.getValidToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { /* algumas acções (list/get/disclaimer/service-types) são públicas */ }
  return headers;
}

async function _get(action, params = {}) {
  const qs = new URLSearchParams({ _ns: 'partnerMinutas', _a: action, ...params }).toString();
  const headers = await _authHeaders();
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.code });
  return data;
}

async function _post(action, body = {}) {
  const headers = await _authHeaders();
  const res = await fetch(`${ENDPOINT}?_ns=partnerMinutas&_a=${action}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.code });
  return data;
}

export const PartnerMinutaClient = {
  // Minutas aprovadas e activas disponíveis para um serviço — para mostrar
  // ao utilizador final como alternativa à minuta padrão da plataforma.
  listForService(serviceType) {
    return _get('list', { service_type: serviceType });
  },
  // Texto completo de UMA minuta aprovada, para usar na geração real.
  get(id) {
    return _get('get', { id });
  },
  // Texto oficial do disclaimer de responsabilidade (para o formulário de
  // submissão mostrar antes de aceitar).
  disclaimer() {
    return _get('disclaimer');
  },
  // Serviços que aceitam minuta de parceiro + placeholders permitidos em
  // cada um (para o formulário de submissão guiar o autor).
  serviceTypes() {
    return _get('service-types');
  },
  // Submissão de uma nova minuta (exige sessão + ser afiliado/parceiro
  // aprovado — o servidor valida e devolve erro claro caso não seja).
  submit({ serviceType, minutaName, description, minutaText, liabilityAccepted, liabilityAcceptedVersion }) {
    return _post('submit', {
      service_type: serviceType,
      minuta_name: minutaName,
      description,
      minuta_text: minutaText,
      liability_accepted: liabilityAccepted,
      liability_accepted_version: liabilityAcceptedVersion,
    });
  },
  // As minhas próprias submissões (qualquer estado).
  mine() {
    return _get('mine');
  },
  // Ligar/desligar uma minuta própria já aprovada.
  toggleActive(id, isActive) {
    return _post('toggle-active', { id, is_active: isActive });
  },
};
