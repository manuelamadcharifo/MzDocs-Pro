// assets/js/services/MPesaService.js
// Módulo standalone do serviço M-Pesa

import { Validator, Formatter } from '../utils/Formatter.js';

export class MPesaService {
    constructor() {
        this.endpoint = '/api/process-payment';
        this.env = this._detectEnv();
    }

    _detectEnv() {
        const { hostname } = window.location;
        if (hostname === 'localhost' || hostname === '127.0.0.1') return 'sandbox';
        if (hostname.includes('netlify.app') && new URLSearchParams(location.search).has('debug')) return 'sandbox';
        return 'production';
    }

    isSandbox() {
        return this.env === 'sandbox';
    }

    validatePhone(raw) {
        if (!Validator.phone(raw)) throw new Error('Número inválido. Use formato: 84 XXX XXXX');
    }

    async processPayment(phone, amount, packageId) {
        this.validatePhone(phone);
        if (!Validator.amount(amount)) throw new Error('Valor inválido para o pacote');

        const body = {
            phoneNumber: Formatter.phone(phone),
            amount: parseInt(amount),
            packageId,
            environment: this.env,
            timestamp: Date.now(),
        };

        const res = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Erro no pagamento');
        return data;
    }
}

export const mpesaService = new MPesaService();
export default MPesaService;