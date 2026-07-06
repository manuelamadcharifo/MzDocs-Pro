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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const maxSize = 10 * 1024 * 1024; // 10 MB para PDF/Word; 5 MB para imagens
    // NOVO: limite de páginas para o rascunho manuscrito do Trabalho Escolar —
    // 8 fotos cobre confortavelmente um trabalho escolar típico (poucas
    // páginas manuscritas); acima disso o pedido às APIs de IA visual fica
    // demasiado grande para uma única chamada e o custo deixa de compensar
    // face a escrever o texto directamente.
    const maxPages = 8;
    if (files.length > maxPages) {
      NotificationView.warn(`⚠️ Máximo de ${maxPages} fotos de cada vez. Foram consideradas só as primeiras ${maxPages}.`);
      files.length = maxPages;
    }
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      if (file.size > maxSize || (isImage && file.size > 5 * 1024 * 1024)) {
        NotificationView.error(`Ficheiro "${file.name}" muito grande (máx. ${isImage ? '5' : '10'}MB)`);
        return;
      }
    }

    const ocrBar       = document.getElementById('ocrBar');
    const ocrResultBox = document.getElementById('ocrResultBox');
    const ocrFill      = document.getElementById('ocrFill');
    const ocrStatusTxt = document.getElementById('ocrStatusTxt');

    if (ocrBar) ocrBar.style.display = 'block';
    if (ocrResultBox) ocrResultBox.style.display = 'none';
    if (ocrFill) ocrFill.style.width = '0%';
    if (ocrStatusTxt) ocrStatusTxt.textContent = files.length > 1 ? `A inicializar OCR de ${files.length} páginas…` : 'A inicializar OCR…';

    try {
      const serviceType = this.docModel?.service || '';

      const progress = (pct, msg) => {
        if (ocrFill) ocrFill.style.width = pct + '%';
        if (ocrStatusTxt) ocrStatusTxt.textContent = msg || `A reconhecer… ${pct}%`;
      };

      // Uma só foto → caminho de sempre (extractFields). Várias páginas →
      // extractFieldsMulti, que junta todas as imagens numa ÚNICA chamada à
      // IA visual (não N chamadas separadas — mantém o custo controlado:
      // 5 páginas custam sensivelmente o mesmo que 1 chamada de OCR normal,
      // só que com mais tokens de imagem de entrada, e nenhum tokens extra
      // de saída, já que a resposta continua limitada a max_tokens:1500).
      const result = files.length > 1
        ? await this.smartOCR.extractFieldsMulti(files, serviceType, progress)
        : await this.smartOCR.extractFields(files[0], serviceType, progress);

      if (ocrBar) ocrBar.style.display = 'none';

      const text     = result.rawText || '';
      const conf     = result.confidence || 0;
      const fields   = result.fields   || {};
      const missing  = result.missing  || [];
      const fieldCount = Object.keys(fields).length;

      // Calcular confiança real: se a IA preencheu campos, usar a média das confianças
      // em vez do valor 0% do Tesseract (que pode ter falhado mas a IA funcionou)
      let displayConf = conf;
      if (fieldCount > 0) {
        const confs = Object.values(fields)
          .map(f => f.confidence || 0)
          .filter(c => c > 0);
        if (confs.length) {
          displayConf = Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100);
        }
      }

      if (this.docModel) this.docModel.ocrText = text;

      const ocrTxt  = document.getElementById('ocrTxt');
      const ocrConf = document.getElementById('ocrConf');

      // Se a IA preencheu campos mas Tesseract não extraiu texto,
      // mostrar resumo dos campos extraídos em vez de caixa vazia
      if (ocrTxt) {
        if (!text && fieldCount > 0) {
          const summary = Object.entries(fields)
            .map(([id, d]) => `${id}: ${d.value}`)
            .join('\n');
          ocrTxt.value = summary;
        } else {
          ocrTxt.value = text;
        }
      }
      if (ocrConf) {
        ocrConf.textContent = fieldCount > 0
          ? `IA: ${displayConf}% confiança`
          : `Confiança: ${conf}%`;
        ocrConf.style.color = displayConf >= 70 ? '#16a34a'
                            : displayConf >= 40 ? '#d97706'
                            : '#dc2626';
      }

      if (fieldCount > 0) {
        const formBody = document.getElementById('formBody');
        if (formBody) {
          const applied = this.smartOCR.applyToForm(fields, formBody);
          this._showSmartFillBanner(applied, missing.length);
        }
      }

      if (ocrResultBox) ocrResultBox.style.display = 'block';

      // Notificação correcta: basear no sucesso real da IA, não no Tesseract
      if (fieldCount > 0) {
        NotificationView.success(`✅ ${fieldCount} campo(s) preenchido(s) pela IA!`);
      } else if (!text || conf < 30) {
        NotificationView.warn('⚠️ Não foi possível extrair dados. Preencha manualmente.');
      } else {
        NotificationView.warn('⚠️ Reconhecimento com baixa confiança. Revise o texto.');
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
