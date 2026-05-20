// assets/js/controllers/TemplateController.js
// Funcionalidade "Usar modelo próprio":
//   1. Utilizador carrega imagem/PDF/Word com o seu layout
//   2. IA extrai a estrutura do template
//   3. IA preenche o template com os dados do formulário (em vez de gerar do zero)

import { NotificationView } from '../views/Views.js';

export class TemplateController {
  constructor(docModel, openRouterService) {
    this.docModel = docModel;
    this._openRouter = openRouterService;
    this._templateText = null;
    this._templateBase64 = null;
    this._templateMime = null;
    this._active = false;
  }

  // Chamado pelo DocumentController após renderForm
  bindEvents() {
    const btn = document.getElementById('btnUseTemplate');
    const input = document.getElementById('templateInput');
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', e => this._handleFile(e));
  }

  // Indica se há um template activo (DocumentController verifica isto)
  isActive() { return this._active && (!!this._templateText || !!this._templateBase64); }

  // Devolve os dados do template para injectar no prompt
  getTemplateData() {
    return {
      text: this._templateText,
      base64: this._templateBase64,
      mime: this._templateMime,
    };
  }

  // Limpa o estado ao fechar o formulário
  reset() {
    this._templateText = null;
    this._templateBase64 = null;
    this._templateMime = null;
    this._active = false;
    this._clearBanner();
  }

  // ── Processamento do ficheiro carregado ────────────────────────
  async _handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      NotificationView.error('Modelo muito grande (máx. 10MB)');
      e.target.value = '';
      return;
    }

    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const isPdf  = mime === 'application/pdf' || name.endsWith('.pdf');
    const isWord = mime.includes('wordprocessingml') || mime === 'application/msword'
                   || name.endsWith('.docx') || name.endsWith('.doc');
    const isImg  = mime.startsWith('image/');

    NotificationView.info('📄 A processar modelo…');

    try {
      if (isPdf) {
        this._templateText = await this._extractPdfText(file);
        this._templateMime = 'pdf';
      } else if (isWord) {
        this._templateText = await this._extractWordText(file);
        this._templateMime = 'word';
      } else if (isImg) {
        this._templateBase64 = await this._toBase64(file);
        this._templateMime = mime;
      } else {
        NotificationView.error('Formato não suportado. Use imagem, PDF ou Word.');
        e.target.value = '';
        return;
      }

      this._active = true;
      this._showBanner(file.name);
      NotificationView.success('✅ Modelo carregado! A IA usará o seu layout.');
    } catch (err) {
      NotificationView.error('Erro ao ler o modelo: ' + err.message);
    }

    e.target.value = '';
  }

  // ── Extracção de texto PDF (pdf.js) ───────────────────────────
  async _extractPdfText(file) {
    if (!window.pdfjsLib) {
      await this._loadScript(
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
      );
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(s => s.str).join(' ') + '\n';
    }
    return text.trim();
  }

  // ── Extracção de texto Word (mammoth.js) ──────────────────────
  async _extractWordText(file) {
    if (!window.mammoth) {
      await this._loadScript(
        'https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js'
      );
    }
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }

  // ── Utilitários ───────────────────────────────────────────────
  _toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  _loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Falha ao carregar: ' + src));
      document.head.appendChild(s);
    });
  }

  _showBanner(filename) {
    this._clearBanner();
    const banner = document.createElement('div');
    banner.id = 'templateBanner';
    banner.className = 'template-banner-ocr';
    banner.innerHTML = `
      <span>📄 Modelo activo: <em style="font-weight:400">${filename}</em></span>
      <button id="btnClearTemplate" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:15px;color:#1e40af;line-height:1" title="Remover modelo">✕</button>
    `;
    // Insert before the ocr-divider ("ou preencha os dados directamente")
    const divider = document.querySelector('#ocrZone .ocr-divider');
    const ocrZone = document.getElementById('ocrZone');
    if (divider) divider.insertAdjacentElement('beforebegin', banner);
    else if (ocrZone) ocrZone.appendChild(banner);
    document.getElementById('btnClearTemplate')?.addEventListener('click', () => {
      this.reset();
      NotificationView.info('Modelo removido. A IA gerará o documento do zero.');
    });
  }

  _clearBanner() {
    document.getElementById('templateBanner')?.remove();
  }
}
