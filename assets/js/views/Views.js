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
    if (svc.hasAI) {
      formFootEl.innerHTML = `
        <button id="btnGen" class="btn-primary btn-gen" type="button">
          <span>✨ Gerar com IA</span>
          <small>1 crédito</small>
        </button>
      `;
    } else {
      formFootEl.innerHTML = `
        <button id="btnWaDirect" class="btn-wa" type="button">
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
    return `
      <div class="field-group">
        <label for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
        ${input}
      </div>
    `;
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
    if (previewContainer) {
      previewContainer.innerHTML = '';
      const editorWrapper = document.createElement('div');
      editorWrapper.id = 'editor-container';
      editorWrapper.style.cssText = 'width:100%;height:100%;';
      previewContainer.appendChild(editorWrapper);

      if (window.documentEditor) {
        window.documentEditor.loadDocument(content, svc.title);
      } else {
        previewContainer.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;padding:20px;">${content.replace(/</g, '&lt;')}</pre>`;
      }

      if (window.documentEditor) {
        window.documentEditor.onReedit = (data) => {
          this._handleReedit(data);
        };
      }
    }
  },

  _handleReedit(reeditData) {
    const event = new CustomEvent('document:reedit', { detail: reeditData });
    document.dispatchEvent(event);
  },

  collectData(fields) {
    const data = {};
    const collect = f => { const el = document.getElementById(f.id); if (el) data[f.id] = el.value.trim(); };
    fields.forEach(f => f.row ? f.items.forEach(collect) : collect(f));
    return data;
  },
};