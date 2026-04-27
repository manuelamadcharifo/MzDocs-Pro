// assets/js/controllers/OCRController.js
import { NotificationView } from '../views/Views.js';

export class OCRController {
  constructor(docModel) {
    this.docModel = docModel;
    this._worker = null;
    this._loaded = false;
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnCam')?.addEventListener('click', () => this.trigger('cam'));
    document.getElementById('btnFile')?.addEventListener('click', () => this.trigger('file'));
    document.getElementById('ocrInput')?.addEventListener('change', e => this.processFile(e));
    document.getElementById('btnUseOcr')?.addEventListener('click', () => this.use());
    document.getElementById('btnDiscardOcr')?.addEventListener('click', () => this.discard());
  }

  trigger(mode) {
    const input = document.getElementById('ocrInput');
    if (!input) return;
    if (mode === 'cam') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  async processFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { NotificationView.error('Imagem muito grande (máx. 5MB)'); return; }

    document.getElementById('ocrBar').style.display = 'block';
    document.getElementById('ocrResultBox').style.display = 'none';
    document.getElementById('ocrFill').style.width = '0%';
    document.getElementById('ocrStatusTxt').textContent = 'A inicializar OCR…';

    try {
      if (!this._loaded) await this._loadTesseract();
      if (!this._worker) {
        document.getElementById('ocrStatusTxt').textContent = 'A carregar modelo de linguagem…';
        this._worker = await Tesseract.createWorker('por', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const p = Math.round(m.progress * 100);
              document.getElementById('ocrFill').style.width = p + '%';
              document.getElementById('ocrStatusTxt').textContent = `A reconhecer… ${p}%`;
            }
          }
        });
      }

      const result = await this._worker.recognize(file);
      const text = result.data.text.trim();
      const conf = Math.round(result.data.confidence);

      document.getElementById('ocrBar').style.display = 'none';
      document.getElementById('ocrTxt').value = text;
      document.getElementById('ocrConf').textContent = `Confiança: ${conf}%`;
      document.getElementById('ocrResultBox').style.display = 'block';

      if (conf < 50) NotificationView.warn('⚠️ Reconhecimento com baixa confiança. Revise o texto.');

    } catch (err) {
      document.getElementById('ocrBar').style.display = 'none';
      NotificationView.error('❌ Erro no OCR: ' + err.message);
    }
    e.target.value = '';
  }

  _loadTesseract() {
    return new Promise((res, rej) => {
      if (window.Tesseract) { this._loaded = true; res(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/tesseract.js@5.0.2/dist/tesseract.min.js';
      s.onload = () => { this._loaded = true; res(); };
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  use() {
    const text = document.getElementById('ocrTxt')?.value.trim();
    if (text && this.docModel) this.docModel.ocrText = text;
    document.getElementById('ocrResultBox').style.display = 'none';
    NotificationView.info('✅ Texto OCR incorporado');
  }

  discard() {
    if (this.docModel) this.docModel.ocrText = null;
    this.reset();
  }

  reset() {
    document.getElementById('ocrBar').style.display = 'none';
    document.getElementById('ocrResultBox').style.display = 'none';
    const input = document.getElementById('ocrInput');
    if (input) input.value = '';
    const txt = document.getElementById('ocrTxt');
    if (txt) txt.value = '';
    const fill = document.getElementById('ocrFill');
    if (fill) fill.style.width = '0%';
  }
}