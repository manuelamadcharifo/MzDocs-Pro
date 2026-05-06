// assets/js/models/Models.js
// Todos os models em um único ficheiro — imports consolidados no topo

import { NotificationView } from '../views/Views.js';
import { Storage } from '../utils/Storage.js';
import { SupabaseService } from '../services/Services.js';

// ═════════════════════════════════════════════════════════════════════════════
// QueueModel — Fila inteligente com retry e back-off
// ═════════════════════════════════════════════════════════════════════════════

export class QueueModel {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastRequest = 0;
        this.minInterval = 3000;
        this.maxRetries = 3;
    }

    add(job) {
        return new Promise((resolve, reject) => {
            const item = { id: Date.now() + Math.random(), job, resolve, reject, retries: 0 };
            this.queue.push(item);
            this._updateUI();
            this._process();
        });
    }

    async _process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        const item = this.queue[0];

        try {
            const wait = this.minInterval - (Date.now() - this.lastRequest);
            if (wait > 0) await this._sleep(wait);

            const result = await item.job();
            this.lastRequest = Date.now();
            this.queue.shift();
            this._updateUI();
            item.resolve(result);

        } catch (err) {
            const is429 = err?.status === 429 || err?.code === 'RATE_LIMIT';
            if (is429 && item.retries < this.maxRetries) {
                item.retries++;
                const backoff = Math.pow(2, item.retries) * 1500;
                NotificationView.warn(`Limite de velocidade. Tentando em ${Math.round(backoff / 1000)}s…`);
                await this._sleep(backoff);
            } else {
                this.queue.shift();
                this._updateUI();
                item.reject(err);
            }
        } finally {
            this.processing = false;
            if (this.queue.length > 0) setTimeout(() => this._process(), 100);
        }
    }

    _updateUI() {
        const bar = document.getElementById('queueBar');
        const msg = document.getElementById('queueMsg');
        const pos = document.getElementById('queuePos');
        if (!bar) return;
        if (this.queue.length === 0) {
            bar.style.display = 'none';
        } else {
            bar.style.display = 'flex';
            msg.textContent = this.processing ? 'A gerar documento…' : 'Na fila…';
            pos.textContent = this.queue.length > 1 ? `${this.queue.length} em espera` : '';
        }
    }

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    get length() { return this.queue.length; }
    clear() { this.queue = []; this.processing = false; this._updateUI(); }
}

// ═════════════════════════════════════════════════════════════════════════════
// CreditModel — Créditos com Supabase sync
// ═════════════════════════════════════════════════════════════════════════════

export class CreditModel {
    constructor() {
        this.userId = Storage.getUserId();
        this.credits = 0;
        this.supabase = new SupabaseService();
        this._syncTimer = null;
    }

    async init() {
        // Mostrar 0 enquanto carrega (nunca ler o localStorage como valor real)
        this.credits = 0;
        this._emit();

        const ok = await this.supabase.init().catch(() => false);
        if (!ok) {
            // Supabase indisponível: usar localStorage apenas como fallback de exibição
            this.credits = Storage.get('credits', 0);
            this._emit();
            return;
        }

        try {
            const { authManager } = await import('../auth/AuthManager.js');
            await authManager.ready();
            if (authManager.user?.id) {
                // Utilizador autenticado — Supabase é a fonte de verdade
                this.userId = authManager.user.id;
                await this._syncFromServer(); // sobrescreve localStorage com valor do servidor
                this._startAutoSync();
            } else {
                // Visitante — sem créditos (não há créditos grátis para não autenticados)
                this.credits = 0;
                this._emit();
            }
        } catch {
            // Falha silenciosa — modo local
            this.credits = Storage.get('credits', 0);
            this._emit();
        }
    }

    async _syncFromServer() {
        // syncUser não recebe localCredits — Supabase é a fonte de verdade
        const data = await this.supabase.syncUser(this.userId).catch(() => null);
        if (data && typeof data.credits === 'number') {
            // Sempre sobrescrever o localStorage com o valor do servidor
            this.credits = data.credits;
            Storage.set('credits', this.credits);
            this._emit();
        }
    }

    _startAutoSync() {
        this._syncTimer = setInterval(() => this._syncFromServer(), 30000);
    }

    canConsume(n = 1) { return this.credits >= n; }

    async consume(n = 1) {
        if (!this.canConsume(n)) throw new Error('INSUFFICIENT_CREDITS');

        const server = await this.supabase.deductCredit(this.userId).catch(() => null);
        if (server !== null && server >= 0) {
            this.credits = server;
        } else {
            // Fallback local — descontar dos créditos pagos
            this.credits = Math.max(0, this.credits - n);
            Storage.set('credits', Math.max(0, Storage.get('credits', 0) - n));
        }
        this._emit();
        return this.credits;
    }

    async add(n) {
        this.credits += n;
        Storage.set('credits', Storage.get('credits', 0) + n);
        await this.supabase.updateCredits(this.userId, this.credits).catch(() => {});
        this._emit();
        return this.credits;
    }

    _emit() {
        const e = new CustomEvent('creditsChanged', { detail: this.credits });
        window.dispatchEvent(e);
    }

    get value() { return this.credits; }
    destroy() { if (this._syncTimer) clearInterval(this._syncTimer); }
}

// ═════════════════════════════════════════════════════════════════════════════
// DocumentModel — Estado do documento gerado
// ═════════════════════════════════════════════════════════════════════════════

export class DocumentModel {
    constructor() {
        this.reset();
    }
    reset() {
        this.service = null;
        this.formData = {};
        this.ocrText = null;
        this.content = null;
        this.model = null;
        this.generatedAt = null;
    }
    setGenerated(content, model) {
        this.content = content;
        this.model = model;
        this.generatedAt = new Date();
    }
    get hasContent() { return !!this.content; }
}

// ═════════════════════════════════════════════════════════════════════════════
// UserModel — Dados do utilizador e suporte
// ═════════════════════════════════════════════════════════════════════════════

export class UserModel {
    constructor() {
        this.userId = Storage.getUserId();
        this.WA_SUPPORT = '258858695506'; // ← ALTERE PARA O NÚMERO DE SUPORTE
    }
    openSupport(context = '') {
        const msg = `[MzDocs Pro Suporte]\nID: ${this.userId.slice(0, 12)}\n${context}`.trim();
        window.open(`https://wa.me/${this.WA_SUPPORT}?text=${encodeURIComponent(msg)}`, '_blank');
    }
}