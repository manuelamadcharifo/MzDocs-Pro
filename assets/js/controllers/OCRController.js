// assets/js/controllers/OCRController.js
// Versão melhorada: usa SmartOCRService para auto-preenchimento inteligente
import { NotificationView } from '../views/Views.js';
import { SmartOCRService } from '../services/SmartOCRService.js';

export class OCRController {
  constructor(docModel) {
    this.docModel   = docModel;
    this.smartOCR   = new SmartOCRService();
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btnCam')?.addEventListener('click',    () => this.trigger('cam'));
    document.getElementById('btnFile')?.addEventListener('click',   () => this.trigger('file'));
    document.getElementById('ocrInput')?.addEventListener('change', e => this.processFile(e));
    document.getElementById('btnUseOcr')?.addEventListener('click',     () => this.use());
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
    if (file.size > 5 * 1024 * 1024) {
      NotificationView.error('Imagem muito grande (máx. 5MB)');
      return;
    }

    const ocrBar       = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    const ocrFill      = document.getElementById('ocrFill');
    const ocrStatusTxt = document.getElementById('ocrStatusTxt');

    if (ocrBar) ocrBar.style.display = 'block';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    if (ocrFill) ocrFill.style.width = '0%';
    if (ocrStatusTxt) ocrStatusTxt.textContent = 'A inicializar OCR…';

    try {
      const serviceType = this.docModel?.service || '';

      const result = await this.smartOCR.extractFields(
        file,
        serviceType,
        (pct, msg) => {
          if (ocrFill) ocrFill.style.width = pct + '%';
          if (ocrStatusTxt) ocrStatusTxt.textContent = msg || `A reconhecer… ${pct}%`;
        }
      );

      if (ocrBar) ocrBar.style.display = 'none';

      const text   = result.rawText || '';
      const conf   = result.confidence || 0;
      const fields = result.fields || {};
      const missing = result.missing || [];

      if (this.docModel) this.docModel.ocrText = text;

      const ocrTxt  = document.getElementById('ocrTxt');
      const ocrConf = document.getElementById('ocrConf');
      if (ocrTxt) ocrTxt.value = text;
      if (ocrConf) ocrConf.textContent = `Confiança: ${conf}%`;

      const fieldCount = Object.keys(fields).length;
      if (fieldCount > 0) {
        const formBody = document.getElementById('formBody');
        if (formBody) {
          const applied = this.smartOCR.applyToForm(fields, formBody);
          this._showSmartFillBanner(applied, missing.length);
        }
      }

      if (ocrResultBox) ocrResultBox.style.display = 'block';

      if (conf < 50) {
        NotificationView.warn('⚠️ Reconhecimento com baixa confiança. Revise o texto.');
      } else if (fieldCount > 0) {
        NotificationView.success(`✅ ${fieldCount} campo(s) preenchido(s) automaticamente!`);
      }

    } catch (err) {
      if (ocrBar) ocrBar.style.display = 'none';
      NotificationView.error('❌ Erro no OCR: ' + err.message);
    }
    e.target.value = '';
  }

  _showSmartFillBanner(applied, missing) {
    document.getElementById('smartFillBanner')?.remove();
    if (!applied) return;

    const banner = document.createElement('div');
    banner.id = 'smartFillBanner';
    banner.style.cssText = [
      'margin:12px 0 4px',
      'padding:10px 14px',
      'background:linear-gradient(135deg,#ecfdf5,#d1fae5)',
      'border:1.5px solid #6ee7b7',
      'border-radius:10px',
      'font-size:13px',
      'color:#065f46',
      'font-weight:600',
      'display:flex',
      'align-items:center',
      'gap:8px'
    ].join(';');

    let msg = `✨ ${applied} campo(s) preenchido(s) automaticamente pela IA`;
    if (missing > 0) msg += ` · ${missing} campo(s) precisam revisão`;

    banner.innerHTML = `
      <span>${msg}</span>
      <div style="margin-left:auto;display:flex;gap:10px;font-size:11px;opacity:0.85;">
        <span><span style="display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:4px;"></span>Do doc.</span>
        <span><span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;margin-right:4px;"></span>Inferido</span>
      </div>
    `;

    const ocrZone = document.getElementById('ocrZone');
    if (ocrZone) ocrZone.insertAdjacentElement('afterend', banner);
  }

  use() {
    const text = document.getElementById('ocrTxt')?.value.trim();
    if (text && this.docModel) this.docModel.ocrText = text;
    document.getElementById('ocrResultBox').style.display = 'none';
    NotificationView.info('✅ Texto OCR incorporado');
  }

  discard() {
    if (this.docModel) this.docModel.ocrText = null;
    document.getElementById('smartFillBanner')?.remove();
    document.querySelectorAll('#formBody input, #formBody textarea, #formBody select').forEach(el => {
      el.style.borderColor = '';
      el.title = '';
    });
    this.reset();
  }

  reset() {
    const ocrBar = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    if (ocrBar) ocrBar.style.display = 'none';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    document.getElementById('smartFillBanner')?.remove();
    const input = document.getElementById('ocrInput');
    if (input) input.value = '';
    const txt = document.getElementById('ocrTxt');
    if (txt) txt.value = '';
    const fill = document.getElementById('ocrFill');
    if (fill) fill.style.width = '0%';
  }
}
