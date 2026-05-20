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
export const ModalView = {
  open(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
  },
  isOpen(id) { return document.getElementById(id)?.classList.contains('open'); }
};

// views/DocumentView.js — Renderizar formulário e resultado
import { Formatter } from '../utils/Formatter.js';
import { SERVICES } from '../services/ServiceDefinitions.js';

export const DocumentView = {
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
        <button id="btnUseTemplate" class="btn-template" type="button" title="Use o seu próprio modelo de documento como base">
          <span>📄 Usar modelo próprio</span>
        </button>
        <input type="file" id="templateInput" accept="image/*,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/msword,.doc" style="display:none"/>
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

  renderResult(content, svc, credits, model) {
    document.getElementById('resModel').textContent = model || 'openrouter';
    document.getElementById('resMeta').innerHTML =
      `📄 ${svc.title} &nbsp;|&nbsp; ⚡ ${credits} créditos restantes &nbsp;|&nbsp; 🕐 ${new Date().toLocaleTimeString('pt')}`;

    const previewContainer = document.getElementById('resPreview');
    if (!previewContainer) return;

    // Preview em iframe com estilos A4 reais
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
      <div class="res-a4-wrap">
        <iframe id="resPreviewFrame" class="res-a4-frame"></iframe>
      </div>
    `;

    // Renderiza preview inicial (PDF)
    this._renderResultFrame('pdf', content);

    // Bind tabs
    previewContainer.querySelectorAll('.res-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        previewContainer.querySelectorAll('.res-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderResultFrame(btn.dataset.rfmt, content);
      });
    });
  },

  _renderResultFrame(format, content) {
    const frame = document.getElementById('resPreviewFrame');
    if (!frame) return;

    const bodyHTML = this._markdownToHTML(content).replace('<div class="md-preview">', '').replace('</div>', '');

    let css = '';
    if (format === 'pdf') {
      css = `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:18mm 18mm 14mm;}
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

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}${css}</style></head><body>${bodyHTML}</body></html>`;
    // contentDocument.write() — works on all browsers incl. Android Chrome
    // without blob URL (blocked on mobile in sandboxed iframes) or srcdoc (blocks scripts)
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    } catch (e) {
      if (this._resultBlobURL) URL.revokeObjectURL(this._resultBlobURL);
      this._resultBlobURL = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      frame.src = this._resultBlobURL;
    }
  },

  // Converte Markdown para HTML para preview legível
  _markdownToHTML(md) {
    // PAGE_BREAK must be replaced BEFORE html-escaping or it gets mangled
    const PB = '___PAGEBREAK___';
    let html = md
      .replace(/---PAGE_BREAK---/g, PB)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(new RegExp(PB, 'g'), '<div style="page-break-after:always;border-top:2px dashed #aaa;margin:20pt 0;"></div>')
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
};