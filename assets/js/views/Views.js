// views/NotificationView.js — Sistema de notificações em pilha
export const NotificationView = {
  _stack: document.getElementById('notifStack'),

  _show(msg, type = 'default', ms = 3500) {
    const stack = document.getElementById('notifStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, ms);
  },

  success(msg) { this._show(msg, 'success'); },
  error(msg) { this._show(msg, 'error', 5000); },
  warn(msg) { this._show(msg, 'warn', 4000); },
  info(msg) { this._show(msg, 'info'); },
  show(msg) { this._show(msg); },
};

// views/ModalView.js — Abrir/fechar overlays
let _openCount = 0; // contador de modais abertos — evita body bloqueado se fechar mal
export const ModalView = {
  open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.classList.contains('open')) {
      el.classList.add('open');
      _openCount++;
      document.body.style.overflow = 'hidden';
    }
  },
  close(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.classList.contains('open')) {
      el.classList.remove('open');
      _openCount = Math.max(0, _openCount - 1);
      if (_openCount === 0) document.body.style.overflow = '';
    }
  },
  // Fechar TODOS os modais abertos (escape de emergência)
  closeAll() {
    document.querySelectorAll('.open[id]').forEach(el => el.classList.remove('open'));
    _openCount = 0;
    document.body.style.overflow = '';
  },
  isOpen(id) { return document.getElementById(id)?.classList.contains('open') ?? false; }
};

// views/DocumentView.js — Renderizar formulário e resultado
import { Formatter } from '../utils/Formatter.js';
import { SERVICES } from '../services/ServiceDefinitions.js';

export const DocumentView = {
  // CSS do template activo — null = usar CSS padrão MzDocs
  // Definido por renderResult() quando um template é escolhido,
  // limpo por DocumentController.closeResult()
  _activeTemplateCss: null,

  renderForm(svc, formBodyEl, formFootEl) {
    formBodyEl.innerHTML = this._buildFieldsHTML(svc.fields);
    this.bindConditionalFields(formBodyEl);
    if (svc.hasAI) {
      const cost = svc.cost || 1;
      const costLabel = cost === 1 ? '1 crédito' : `${cost} créditos`;
      formFootEl.innerHTML = `
        <button id="btnGen" class="btn-primary btn-gen" type="button">
          <span>✨ Gerar com IA</span>
          <small>${costLabel}</small>
        </button>
      `;
    } else {
      formFootEl.innerHTML = `
        <button id="btnWaDirect" class="btn-wa btn-wa-direct" type="button">
          <span>📱 Enviar pelo WhatsApp</span>
          <small>Grátis</small>
        </button>
      `;
    }
  },

  _buildFieldsHTML(fields) {
    return fields.map(f => {
      if (f.row) return `
        <div class="form-row">
          ${f.items.map(fi => this._field(fi)).join('')}
        </div>
      `;
      return this._field(f);
    }).join('');
  },

  _field(f) {
    const req = f.required ? 'required' : '';
    let input = '';
    if (f.type === 'select') {
      const opts = (f.opts || []).map(o => `<option value="${o}">${o}</option>`).join('');
      input = `<select id="${f.id}" ${req}><option value="" disabled selected>${f.ph || 'Selecione…'}</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${f.id}" ${req} placeholder="${f.ph || ''}" rows="4"></textarea>`;
    } else {
      const extras = [f.min ? `min="${f.min}"` : '', f.max ? `max="${f.max}"` : '', f.val ? `value="${f.val}"` : ''].filter(Boolean).join(' ');
      input = `<input type="${f.type}" id="${f.id}" ${req} placeholder="${f.ph || ''}" ${extras} />`;
    }
    // Conditional fields: hidden by default, shown when trigger field matches condValue
    const isConditional = !!(f.conditional && f.condValue);
    const conditionalAttrs = isConditional
      ? `data-conditional="${f.conditional}" data-cond-value="${f.condValue}" style="display:none"`
      : '';
    return `
      <div class="field-group" ${conditionalAttrs}>
        <label for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
        ${input}
      </div>
    `;
  },

  // Call after rendering form to wire up conditional field visibility
  bindConditionalFields(formEl) {
    if (!formEl) return;
    const conditionalGroups = formEl.querySelectorAll('[data-conditional]');
    if (!conditionalGroups.length) return;

    const updateVisibility = () => {
      conditionalGroups.forEach(group => {
        const triggerFieldId = group.dataset.conditional;
        const condValue      = group.dataset.condValue;
        const triggerEl      = formEl.querySelector(`#${triggerFieldId}`);
        if (!triggerEl) return;
        const show = triggerEl.value === condValue;
        group.style.display = show ? '' : 'none';
        // Remove required attr when hidden to avoid browser blocking submission
        const input = group.querySelector('input, select, textarea');
        if (input) {
          if (show) {
            if (group.dataset.wasRequired === 'true') input.setAttribute('required', '');
          } else {
            group.dataset.wasRequired = input.hasAttribute('required') ? 'true' : 'false';
            input.removeAttribute('required');
            input.value = '';
          }
        }
      });
    };

    // Collect unique trigger field IDs and attach listeners
    const triggerIds = new Set([...conditionalGroups].map(g => g.dataset.conditional));
    triggerIds.forEach(id => {
      const el = formEl.querySelector(`#${id}`);
      if (el) el.addEventListener('change', updateVisibility);
    });

    // Run once on load to set initial state
    updateVisibility();
  },

  showLoader(steps = []) {
    const lw = document.getElementById('loaderWrap');
    const ls = document.getElementById('loaderSteps');
    const btn = document.getElementById('btnGen');
    if (!lw || !ls) return;
    ls.innerHTML = steps.map((s, i) =>
      `<div class="lstep" id="lstep${i}"><span class="lnum">${i + 1}</span><span>${s}</span></div>`
    ).join('');
    lw.classList.add('show');
    if (btn) btn.style.display = 'none';

    let i = 0;
    const iv = setInterval(() => {
      if (i > 0) document.getElementById(`lstep${i - 1}`)?.classList.replace('active', 'done');
      const el = document.getElementById(`lstep${i}`);
      if (el) el.classList.add('active');
      i++;
      if (i > steps.length) clearInterval(iv);
    }, 800);
    return iv;
  },

  hideLoader(iv) {
    clearInterval(iv);
    const lw = document.getElementById('loaderWrap');
    const btn = document.getElementById('btnGen');
    if (lw) lw.classList.remove('show');
    if (btn) { btn.style.display = ''; btn.disabled = false; }
  },

  renderResult(content, svc, credits, model, templateCss = null) {
    document.getElementById('resModel').textContent = model || 'openrouter';
    // CORRIGIDO: guardar templateCss activo para usar no _renderResultFrame
    this._activeTemplateCss = templateCss || null;

    // svc pode ser uma string (título) ou um objecto docModel — normalizar
    const svcTitle = (typeof svc === 'string') ? svc
      : (svc?.title || svc?.service || '');

    // CORRIGIDO: "null créditos restantes" — credits pode ser null quando vem do histórico
    const creditsLabel = (credits != null && credits !== '') ? `⚡ ${credits} créditos restantes &nbsp;|&nbsp; ` : '';
    document.getElementById('resMeta').innerHTML =
      `📄 ${svcTitle} &nbsp;|&nbsp; ${creditsLabel}🕐 ${new Date().toLocaleTimeString('pt')}`;

    const previewContainer = document.getElementById('resPreview');
    if (!previewContainer) return;

    const words = content.trim().split(/\s+/).length;
    const pages = Math.max(1, Math.ceil(content.length / 2800));

    previewContainer.innerHTML = `
      <div class="res-preview-header">
        <div class="res-preview-tabs" id="resPreviewTabs">
          <button class="res-tab active" data-rfmt="pdf">📄 PDF</button>
          <button class="res-tab" data-rfmt="word">📃 Word</button>
          <button class="res-tab" data-rfmt="text">📝 Texto</button>
        </div>
        <div class="res-preview-stats">${words} palavras · ~${pages} pág.</div>
      </div>
      <div class="res-a4-wrap" id="resA4Wrap">
        <div class="res-a4-scaler" id="resA4Scaler">
          <iframe id="resPreviewFrame" class="res-a4-frame"></iframe>
        </div>
      </div>
    `;

    this._renderResultFrame('pdf', content);
    // Scale after render
    requestAnimationFrame(() => this._scaleResultFrame());
    if (!this._resizeResultHandler) {
      this._resizeResultHandler = () => this._scaleResultFrame();
      window.addEventListener('resize', this._resizeResultHandler);
    }

    previewContainer.querySelectorAll('.res-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        previewContainer.querySelectorAll('.res-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderResultFrame(btn.dataset.rfmt, content);
      });
    });
  },

  _scaleResultFrame() {
    const wrap   = document.getElementById('resA4Wrap');
    const scaler = document.getElementById('resA4Scaler');
    const frame  = document.getElementById('resPreviewFrame');
    if (!wrap || !scaler || !frame) return;

    const wrapW = Math.max(200, wrap.clientWidth - 32);
    const a4W   = 794;
    const scale = Math.min(1, wrapW / a4W);

    frame.style.transform       = `scale(${scale})`;
    frame.style.transformOrigin = 'top center';

    const a4H = 1123;
    scaler.style.height = (a4H * scale) + 'px';
    scaler.style.width  = (a4W * scale) + 'px';
    // Nunca forçar altura no wrap — o CSS (max-height / flex) controla
  },

  _renderResultFrame(format, content) {
    const frame = document.getElementById('resPreviewFrame');
    if (!frame) return;

    // ── Detecção automática HTML vs Markdown ────────────────────────────────
    // Se o conteúdo começa com '<' é HTML estruturado gerado pelo htmlTemplate.
    // Usar directamente no iframe sem passar pelo conversor md→html.
    const isRawHTML = content && content.trimStart().startsWith('<');

    let bodyHTML;
    if (isRawHTML) {
      bodyHTML = content;
    } else {
      const converted = this._markdownToHTML(content);
      bodyHTML = converted.replace('<div class="md-preview">', '').replace('</div>', '');
    }

    // ── Construir CSS para o formato pedido ────────────────────────────────
    let css = '';
    if (isRawHTML) {
      // HTML estruturado: usar CSS do template activo ou reset mínimo
      css = this._activeTemplateCss
        ? this._activeTemplateCss
        : 'body{font-family:Calibri,Arial,sans-serif;}';
    } else if (format === 'pdf') {
      css = this._activeTemplateCss ||
        `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:18mm 18mm 14mm;}
        h1{font-size:17pt;text-align:center;margin-bottom:14pt;font-weight:bold;}
        h2{font-size:13pt;font-weight:bold;margin-top:12pt;margin-bottom:6pt;border-bottom:1px solid #bbb;padding-bottom:2pt;}
        h3{font-size:12pt;font-weight:bold;margin-top:8pt;}
        p{margin-bottom:8pt;text-align:justify;}
        ul,ol{margin:6pt 0 6pt 18pt;}li{margin-bottom:2pt;}
        table{width:100%;border-collapse:collapse;margin:8pt 0;}
        td,th{border:1px solid #000;padding:4pt 6pt;font-size:11pt;}
        th{background:#f0f0f0;font-weight:bold;}
        strong{font-weight:bold;}em{font-style:italic;}hr{border:none;border-top:1px solid #888;margin:10pt 0;}
        div[style*="page-break"]{margin:16pt 0;}`;
    } else if (format === 'word') {
      css = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.15;color:#000;padding:18mm;}
        h1{font-size:16pt;color:#2E74B5;margin-bottom:12pt;}
        h2{font-size:13pt;color:#2E74B5;margin-top:10pt;margin-bottom:6pt;}
        h3{font-size:12pt;font-weight:bold;margin-top:8pt;}
        p{margin-bottom:7pt;}
        ul,ol{margin:5pt 0 5pt 18pt;}li{margin-bottom:2pt;}
        table{width:100%;border-collapse:collapse;margin:8pt 0;}
        td,th{border:1px solid #BFBFBF;padding:4pt 6pt;}
        th{background:#D9E2F3;color:#1F3864;font-weight:bold;}
        strong{font-weight:bold;}em{font-style:italic;}`;
    } else {
      css = `body{font-family:monospace;font-size:11pt;line-height:1.6;color:#1e293b;padding:16px;white-space:pre-wrap;}
        h1,h2,h3{font-weight:bold;}`;
    }

    // ── Montar HTML final e injectar no iframe ─────────────────────────────
    const pageHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}' + css + '</style></head><body>' + bodyHTML + '</body></html>';
    try {
      frame.srcdoc = pageHtml;
      frame.onload = () => { DocumentView._scaleResultFrame(); };
    } catch (e) {
      if (this._resultBlobURL) URL.revokeObjectURL(this._resultBlobURL);
      this._resultBlobURL = URL.createObjectURL(new Blob([pageHtml], { type: 'text/html' }));
      frame.src = this._resultBlobURL;
      frame.onload = () => { DocumentView._scaleResultFrame(); };
    }
  },

  // Converte Markdown para HTML para preview legível
  _markdownToHTML(md) {
    // PAGE_BREAK must be replaced BEFORE html-escaping or it gets mangled
    const PB = '___PAGEBREAK___';
    let html = md
      .replace(/---PAGE_BREAK---/g, PB)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(new RegExp(PB, 'g'), '<div style="page-break-after:always;height:0;margin:0;padding:0;"></div><div style="display:flex;align-items:center;justify-content:center;margin:18pt 0 14pt;gap:8px;"><div style="height:1px;flex:1;background:#d1d5db"></div><span style="font-size:9pt;color:#9ca3af;letter-spacing:.5px;white-space:nowrap">— Nova Página —</span><div style="height:1px;flex:1;background:#d1d5db"></div></div>')
      // Headers
      .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      // Bold, italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // HR
      .replace(/^---+$/gm, '<hr>')
      // Listas
      .replace(/^(\s*)[-*]\s+(.+)$/gm, '<li>$2</li>')
      .replace(/^(\s*)\d+\.\s+(.+)$/gm, '<li>$2</li>')
      // Parágrafos
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<div class="md-preview"><p>${html}</p></div>`;
  },

  collectData(fields) {
    const data = {};
    const collect = f => {
      const el = document.getElementById(f.id);
      if (!el) return;
      // Skip hidden conditional fields
      const group = el.closest('[data-conditional]');
      if (group && group.style.display === 'none') return;
      data[f.id] = el.value.trim();
    };
    fields.forEach(f => f.row ? f.items.forEach(collect) : collect(f));
    return data;
  },

  // Preenche os campos do formulário com dados do rascunho guardado
  restoreDraft(fields, draftData) {
    if (!draftData) return;
    const restore = f => {
      const el = document.getElementById(f.id);
      if (!el || !(f.id in draftData)) return;
      el.value = draftData[f.id] ?? '';
    };
    fields.forEach(f => f.row ? f.items.forEach(restore) : restore(f));
    // Re-dispara change em todos os selects para activar campos condicionais
    fields.forEach(f => {
      const items = f.row ? f.items : [f];
      items.forEach(fi => {
        if (fi.type === 'select') {
          document.getElementById(fi.id)?.dispatchEvent(new Event('change'));
        }
      });
    });
  },

  // Recolhe todos os campos (incluindo os condicionais ocultos) para guardar rascunho
  collectAllFields(fields) {
    const data = {};
    const collect = f => {
      const el = document.getElementById(f.id);
      if (el) data[f.id] = el.value;
    };
    fields.forEach(f => f.row ? f.items.forEach(collect) : collect(f));
    return data;
  },
};
