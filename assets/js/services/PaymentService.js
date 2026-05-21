// assets/js/services/PaymentService.js
// Pagamento: M-Pesa automático + Manual (fallback WhatsApp)

const WA_NUMBER = '258858695506'; // ← ALTERE PARA O TEU NÚMERO

const PACKAGES = {
  avulso:  { credits: 3,   price: 50,   name: 'Avulso',  popular: false, desc: '3 documentos, sem conta permanente' },
  starter: { credits: 10,  price: 120,  name: 'Starter',  popular: false },
  basico:  { credits: 25,  price: 280,  name: 'Básico',   popular: true  },
  pro:     { credits: 60,  price: 600,  name: 'Pro',      popular: false },
  empresa: { credits: 150, price: 1500, name: 'Empresa',  popular: false },
};

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

    const data = await res.json();
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
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido manual');

    return {
      success: true,
      mode: 'manual',
      whatsappLink: data.whatsappLink,
      referenceId: data.referenceId,
      ...data,
    };
  }

  openWhatsAppPayment(transactionId, packageName, amount) {
    const message = encodeURIComponent(
      `*Pagamento MzDocs Pro*\n\n` +
      `Referência: ${transactionId}\n` +
      `Pacote: ${packageName}\n` +
      `Valor: ${amount} MZN\n` +
      `Recebedor M-Pesa: Manuel Amad Charifo\n\n` +
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

  validatePhone(raw) {
    const num = raw.replace(/\D/g, '');
    return /^8[4-7]\d{7}$/.test(num);
  }
}

export const paymentService = new PaymentService();