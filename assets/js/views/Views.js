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
      previewContainer.innerHTML = this._markdownToHTML(content);
    }

    // Garante que o botão Editar existe nas res-actions
    const resActions = document.querySelector('.res-actions');
    if (resActions && !document.getElementById('btnEdit')) {
      const editBtn = document.createElement('button');
      editBtn.id = 'btnEdit';
      editBtn.innerHTML = '✏️ Editar';
      editBtn.style.cssText = 'grid-column:1/-1;background:#EFF6FF;color:#1d4ed8;border:1.5px solid #bfdbfe;';
      resActions.appendChild(editBtn);
      // re-bind no controller
      editBtn.onclick = () => document.dispatchEvent(new CustomEvent('result:openEditor'));
    }
  },

  // Converte Markdown para HTML para preview legível
  _markdownToHTML(md) {
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    const collect = f => { const el = document.getElementById(f.id); if (el) data[f.id] = el.value.trim(); };
    fields.forEach(f => f.row ? f.items.forEach(collect) : collect(f));
    return data;
  },
};