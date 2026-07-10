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
const PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso',  popular: false, desc: '3 documentos, sem conta permanente' },
  starter: { credits: 10,  price: 120,  name: 'Starter',  popular: false },
  basico:  { credits: 25,  price: 280,  name: 'Básico',   popular: true  },
  pro:     { credits: 60,  price: 600,  name: 'Pro',      popular: false },
  empresa: { credits: 150, price: 1500, name: 'Empresa',  popular: false },
};

// Actualiza PACKAGES in-place a partir de { avulso: {price, credits, name}, ... }
// vindo de /api/config. Mantém popular/desc (não vêm do backend) e só
// substitui price/credits/name quando presentes e válidos — nunca apaga
// um pacote inteiro por uma resposta incompleta.
export function updatePackagesFromConfig(packagesFromApi) {
  if (!packagesFromApi || typeof packagesFromApi !== 'object') return;
  for (const [id, data] of Object.entries(packagesFromApi)) {
    if (!PACKAGES[id] || !data) continue;
    if (Number.isFinite(data.price) && data.price > 0)     PACKAGES[id].price   = data.price;
    if (Number.isFinite(data.credits) && data.credits > 0) PACKAGES[id].credits = data.credits;
    if (data.name) PACKAGES[id].name = data.name;
  }
}
export class PaymentService {
  constructor() {
    this.endpoint = '/api/process-payment';
    this.mpesaActive = false;
  }

  getPackages() {
    return PACKAGES;
  }

  async processPayment(packageId, phoneNumber = null, userId = 'anon') {
    const pkg = PACKAGES[packageId];
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
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
