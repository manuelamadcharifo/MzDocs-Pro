// assets/js/services/PaymentService.js
// Pagamento: M-Pesa automático (desactivado) + Manual (fallback WhatsApp)
//
// CORRIGIDO (auditoria 3.4/3.6): o pagamento é, na prática, sempre PROCESSADO
// MANUALMENTE via WhatsApp (mpesaActive = false). A interface deve deixar
// isto explícito para o utilizador desde o início. Além disso, qualquer
// número moçambicano válido (M-Pesa, e-Mola ou mKesh) é aceite, já que o
// utilizador apenas envia um comprovativo por WhatsApp — não é exigido um
// número M-Pesa especificamente.

// CORRIGIDO (Junho/2026): hard-coded, desligado de whatsapp_support em
// system_settings — o admin alterava o número em Configurações e o
// utilizador nunca via a mudança aqui. updateWhatsAppFromConfig() é
// chamado em app.js, no mesmo ponto em que os preços são sincronizados.
let WA_NUMBER = '258858695506'; // fallback — só usado antes da config carregar

export function updateWhatsAppFromConfig(whatsappSupport) {
  if (!whatsappSupport) return;
  // Aceita tanto "+258858695506" como "258858695506" como "858695506"
  // (formato livre no campo de admin) — normaliza para o formato sem "+"
  // que wa.me espera, assumindo Moçambique (258) quando o número vier
  // sem código de país.
  const digits = String(whatsappSupport).replace(/\D/g, '');
  if (digits.length === 9)  WA_NUMBER = `258${digits}`;
  else if (digits.length >= 11) WA_NUMBER = digits;
}

// CORRIGIDO (Junho/2026): estes valores eram a única fonte usada pelo
// checkout — alterar o preço no painel de admin (system_settings) nunca
// se reflectia aqui. Agora servem só como FALLBACK inicial (para o
// checkout funcionar mesmo antes de /api/config responder, ou se falhar);
// updatePackagesFromConfig() é chamado em app.js logo após o fetch a
// /api/config, e substitui estes valores pelos reais. Ver
// api/_lib/packages.js para a mesma lógica espelhada no backend.
// NOVO (monetização — bónus escada): `bonus` — créditos extra por cima de
// `credits` na mesma compra, mesmo preço (ver api/_lib/packages.js para a
// fonte de verdade real). Estes valores locais são só fallback inicial,
// tal como price/credits já eram — updatePackagesFromConfig() abaixo
// substitui por dados reais assim que /api/config responder.
// NOVO (v61 — pacotes dinâmicos): antes só era possível ACTUALIZAR os 5
// ids fixos abaixo (`if (!PACKAGES[id]) continue` descartava qualquer id
// novo criado no admin). Agora a lista inteira vem de /api/config —
// PACKAGES é preenchido dinamicamente, com estes 5 a servirem só de
// fallback inicial (para o checkout funcionar mesmo antes de /api/config
// responder, ou se a chamada falhar).
const PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso',  bonus: 0,  popular: false, desc: '3 documentos, sem conta permanente' },
  starter: { credits: 10,  price: 120,  name: 'Starter',  bonus: 2,  popular: false },
  basico:  { credits: 25,  price: 280,  name: 'Básico',   bonus: 5,  popular: true  },
  pro:     { credits: 60,  price: 600,  name: 'Pro',      bonus: 15, popular: false },
  empresa: { credits: 150, price: 1500, name: 'Empresa',  bonus: 40, popular: false },
};
let _packagesHydrated = false; // true assim que /api/config já respondeu pelo menos uma vez

// NOVO (v65): pacotes exclusivos por categoria de parceiro/afiliado —
// nunca vêm de /api/config (público, em cache partilhado — ver nota em
// handleConfig, api/_services/site.js), só de um pedido autenticado à
// parte (GET /api/account?_op=my-packages). Guardados à parte de
// PACKAGES para nunca serem confundidos com pacotes públicos, e para
// serem fáceis de mostrar com destaque visual próprio ("Exclusivo").
let _exclusivePackages = {};
let _pricingSegment    = null;

// Chamado em app.js, depois do login/hidratação da sessão — carrega os
// pacotes exclusivos deste utilizador, se pertencer a alguma categoria.
// Falha em aberto (silenciosamente) para nunca bloquear o checkout normal
// por causa desta funcionalidade extra.
export async function loadMyExclusivePackages(token) {
  if (!token) { _exclusivePackages = {}; _pricingSegment = null; return; }
  try {
    const res  = await fetch('/api/account?_op=my-packages', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (!data?.success) return;
    _pricingSegment = data.segment || null;
    const incoming = {};
    for (const [id, pkg] of Object.entries(data.exclusivePackages || {})) {
      if (!Number.isFinite(pkg.price) || pkg.price <= 0) continue;
      if (!Number.isFinite(pkg.credits) || pkg.credits <= 0) continue;
      incoming[id] = {
        credits: pkg.credits, price: pkg.price, name: pkg.name || id,
        bonus: Number.isFinite(pkg.bonus) ? pkg.bonus : 0,
        popular: false, desc: pkg.description,
        partnerSegment: pkg.partnerSegment,
      };
    }
    _exclusivePackages = incoming;
  } catch (e) {
    console.warn('[PaymentService] Falha ao carregar pacotes exclusivos:', e.message);
  }
}

export function getExclusivePackages() { return _exclusivePackages; }
export function getPricingSegment()    { return _pricingSegment; }

// Actualiza PACKAGES a partir de { avulso: {price, credits, name, bonus,
// description, popular}, ... } vindo de /api/config (fonte de verdade:
// api/_lib/packages.js, que por sua vez lê a tabela credit_packages).
// Ao contrário da versão anterior, agora:
//   - cria entradas novas (pacotes criados no admin depois do deploy)
//   - remove entradas que já não vêm da API (pacotes desactivados/apagados)
//     — mas só depois da 1ª resposta válida, para nunca esvaziar o
//     checkout por causa de uma resposta vazia/falhada de /api/config.
export function updatePackagesFromConfig(packagesFromApi) {
  if (!packagesFromApi || typeof packagesFromApi !== 'object') return;
  const incomingIds = Object.keys(packagesFromApi);
  if (incomingIds.length === 0) return; // resposta vazia — mantém o fallback local, não apaga nada

  for (const [id, data] of Object.entries(packagesFromApi)) {
    if (!data) continue;
    if (!Number.isFinite(data.price) || data.price <= 0) continue;
    if (!Number.isFinite(data.credits) || data.credits <= 0) continue;
    if (!PACKAGES[id]) PACKAGES[id] = { credits: 0, price: 0, name: id, bonus: 0, popular: false };
    PACKAGES[id].price   = data.price;
    PACKAGES[id].credits = data.credits;
    if (data.name) PACKAGES[id].name = data.name;
    if (data.description) PACKAGES[id].desc = data.description;
    PACKAGES[id].popular = !!data.popular;
    // bonus pode legitimamente ser 0 — por isso a condição aceita >= 0
    // em vez de > 0, ao contrário de price/credits.
    if (Number.isFinite(data.bonus) && data.bonus >= 0) PACKAGES[id].bonus = data.bonus;
  }

  // Remove pacotes que já não vêm da API (desactivados/apagados no
  // admin) — só depois de já termos recebido uma lista real, e nunca
  // remove 'avulso' (fluxo de conta temporária depende dele existir
  // sempre, mesmo que o admin o desactive por engano).
  Object.keys(PACKAGES).forEach(id => {
    if (id !== 'avulso' && !incomingIds.includes(id)) delete PACKAGES[id];
  });

  _packagesHydrated = true;
}

// NOVO: indica se PACKAGES já reflecte a resposta real de /api/config
// (usado pelo PaymentController para saber quando pode desenhar os
// cartões dinâmicos em vez de esperar).
export function packagesHydrated() {
  return _packagesHydrated;
}

// NOVO: total de créditos que o pacote realmente entrega (base + bónus) —
// usado pelo checkout para mostrar "25 + 5 bónus = 30 créditos".
export function packageTotalCredits(pkg) {
  if (!pkg) return 0;
  return (Number(pkg.credits) || 0) + (Number(pkg.bonus) || 0);
}
export class PaymentService {
  constructor() {
    this.endpoint = '/api/process-payment';
    this.mpesaActive = false;
  }

  // NOVO (v65): inclui os pacotes exclusivos deste utilizador (se
  // pertencer a alguma categoria) a seguir aos públicos — ver
  // loadMyExclusivePackages(), chamado em app.js após o login.
  getPackages() {
    return { ...PACKAGES, ...getExclusivePackages() };
  }

  async processPayment(packageId, phoneNumber = null, userId = 'anon') {
    // NOVO (v65): um pacote exclusivo de categoria vive em
    // _exclusivePackages, não em PACKAGES — procurar nos dois.
    const pkg = PACKAGES[packageId] || getExclusivePackages()[packageId];
    if (!pkg) throw new Error('Pacote inválido');

    if (phoneNumber && this.mpesaActive) {
      try {
        return await this._payMpesa(packageId, phoneNumber, userId);
      } catch (e) {
        console.warn('M-Pesa falhou, usando manual:', e.message);
      }
    }

    return await this._payManual(packageId, phoneNumber, userId);
  }

  async _parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    // A API retornou HTML ou texto (ex: erro do servidor) — converter em erro legível
    const text = await res.text();
    console.error('[PaymentService] Resposta não-JSON da API:', res.status, text.slice(0, 200));
    throw new Error(`Erro do servidor (${res.status}). Tente novamente ou contacte o suporte.`);
  }

  async _payMpesa(packageId, phoneNumber, userId) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'mpesa',
        packageId,
        phoneNumber: this._formatPhone(phoneNumber),
        userId,
      }),
    });

    const data = await this._parseResponse(res);
    if (!res.ok) {
      if (data.fallback === 'Use modo manual') throw new Error('M-Pesa indisponível');
      throw new Error(data.error || 'Erro no pagamento M-Pesa');
    }

    return { success: true, mode: 'mpesa', ...data };
  }

  async _payManual(packageId, phoneNumber, userId) {
    // NOVO (v65): pacotes exclusivos de categoria exigem sessão
    // autenticada real no servidor (ver validação em process-payment.js —
    // nunca confia só no userId enviado aqui). Sem o token, o servidor
    // recusa a compra com 401, mesmo que o preço pareça certo no ecrã.
    const pkg = PACKAGES[packageId] || getExclusivePackages()[packageId];
    const headers = { 'Content-Type': 'application/json' };
    if (pkg?.partnerSegment) {
      const token = window.authManager?.getToken ? window.authManager.getToken() : null;
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'manual',
        packageId,
        phone: phoneNumber ? this._formatPhone(phoneNumber) : null, // campo correcto para a API
        userId,
        // NOVO (Fase 2 — Marketing Analytics): permite atribuir esta venda à
        // origem de marketing certa quando o pagamento for confirmado mais
        // tarde (nunca no momento do clique — só quando o dinheiro é
        // verificado, seja por IA ou pelo admin).
        visitorId: window.marketingTracker?.visitorId || null,
      }),
    });

    const data = await this._parseResponse(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido manual');

    return {
      success: true,
      mode: 'manual',
      whatsappLink: data.whatsappLink,
      referenceId: data.referenceId,
      ...data,
    };
  }

  // Detecta a carteira móvel pelo prefixo do número, apenas para exibição
  // (qualquer carteira é aceite — pagamento manual via WhatsApp).
  detectWallet(raw) {
    const num = raw.replace(/\D/g, '').replace(/^258/, '');
    const prefix = num.slice(0, 2);
    if (prefix === '84' || prefix === '85') return 'M-Pesa';
    if (prefix === '86' || prefix === '87') return 'e-Mola';
    if (prefix === '82' || prefix === '83') return 'mKesh';
    return 'Carteira móvel';
  }

  openWhatsAppPayment(transactionId, packageName, amount, phoneNumber = '') {
    const wallet = phoneNumber ? this.detectWallet(phoneNumber) : 'M-Pesa/e-Mola/mKesh';
    const message = encodeURIComponent(
      `*Pagamento MzDocs Pro*\n\n` +
      `Referência: ${transactionId}\n` +
      `Pacote: ${packageName}\n` +
      `Valor: ${amount} MZN\n` +
      `Recebedor (${wallet}): Manuel Amad Charifo\n\n` +
      `Segue o comprovativo de pagamento:`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${message}`, '_blank');
  }

  _formatPhone(raw) {
    let num = raw.replace(/\D/g, '');
    if (num.startsWith('8')) num = '258' + num;
    if (!num.startsWith('258')) num = '258' + num;
    return num;
  }

  // CORRIGIDO (auditoria 3.6): aceita qualquer operador móvel moçambicano —
  // 82/83 mCel (mKesh) · 84/85 Vodacom (M-Pesa) · 86/87 Movitel (e-Mola).
  validatePhone(raw) {
    const num = raw.replace(/\D/g, '');
    return /^8[2-7]\d{7}$/.test(num);
  }
}

export const paymentService = new PaymentService();
