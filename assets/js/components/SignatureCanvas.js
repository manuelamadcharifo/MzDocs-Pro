// assets/js/components/SignatureCanvas.js
// Canvas para assinatura digital

export class SignatureCanvas {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.hasSignature = false;
    }

    create(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="signature-container">
                <canvas id="sigCanvas" width="400" height="200"></canvas>
                <div class="signature-actions">
                    <button id="btnClearSig" class="btn btn-ghost btn-sm">🗑 Limpar</button>
                    <button id="btnSaveSig" class="btn btn-primary btn-sm">✅ Guardar Assinatura</button>
                </div>
                <p class="signature-hint">Desenhe sua assinatura com o dedo ou rato</p>
            </div>
        `;

        this.canvas = document.getElementById('sigCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Configurar estilo
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this._bindEvents();
    }

    _bindEvents() {
        // Mouse
        this.canvas.addEventListener('mousedown', (e) => this._startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this._draw(e));
        this.canvas.addEventListener('mouseup', () => this._stopDrawing());
        this.canvas.addEventListener('mouseout', () => this._stopDrawing());

        // Touch
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this._startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this._draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this._stopDrawing());

        // Botões
        document.getElementById('btnClearSig')?.addEventListener('click', () => this.clear());
        document.getElementById('btnSaveSig')?.addEventListener('click', () => this.save());
    }

    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX || e.pageX) - rect.left,
            y: (e.clientY || e.pageY) - rect.top
        };
    }

    _startDrawing(e) {
        this.isDrawing = true;
        const pos = this._getPos(e);
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }

    _draw(e) {
        if (!this.isDrawing) return;
        const pos = this._getPos(e);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        this.hasSignature = true;
    }

    _stopDrawing() {
        this.isDrawing = false;
        this.ctx.beginPath();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.hasSignature = false;
    }

    save() {
        if (!this.hasSignature) {
            alert('⚠️ Desenhe uma assinatura primeiro');
            return null;
        }
        return this.canvas.toDataURL('image/png');
    }

    isEmpty() {
        return !this.hasSignature;
    }
}

export const signatureCanvas = new SignatureCanvas();