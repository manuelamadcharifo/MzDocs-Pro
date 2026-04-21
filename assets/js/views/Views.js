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
  error(msg)   { this._show(msg, 'error', 5000); },
  warn(msg)    { this._show(msg, 'warn', 4000); },
  info(msg)    { this._show(msg, 'info'); },
  show(msg)    { this._show(msg); },
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
  // Renderizar campos do formulário
  renderForm(svc, formBodyEl, formFootEl) {
    formBodyEl.innerHTML = this._buildFieldsHTML(svc.fields);
    if (svc.hasAI) {
      formFootEl.innerHTML = `
        <div class="loader-wrap" id="loaderWrap">
          <div class="l-spin"></div>
          <div class="l-steps" id="loaderSteps"></div>
        </div>
        <button class="btn-gen" id="btnGen">
          <span>✦</span> Gerar com IA &nbsp;<small style="opacity:.65;font-weight:500">(1 crédito)</small>
        </button>`;
    } else {
      formFootEl.innerHTML = `
        <button class="btn-wa-direct" id="btnWaDirect">
          💬 Enviar pelo WhatsApp
        </button>`;
    }
  },

  _buildFieldsHTML(fields) {
    return fields.map(f => {
      if (f.row) return `<div class="fg-row">${f.items.map(fi => this._field(fi)).join('')}</div>`;
      return this._field(f);
    }).join('');
  },

  _field(f) {
    const req = f.required ? 'required' : '';
    let input = '';
    if (f.type === 'select') {
      const opts = (f.opts || []).map(o => `<option value="${o}">${o}</option>`).join('');
      input = `<select class="fs" id="${f.id}" name="${f.id}" ${req}><option value="">Seleccione…</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea class="fta" id="${f.id}" name="${f.id}" placeholder="${f.ph||''}" ${req}></textarea>`;
    } else {
      const extras = [f.min?`min="${f.min}"`:'', f.max?`max="${f.max}"`:'', f.val?`value="${f.val}"`:''].filter(Boolean).join(' ');
      input = `<input class="fi" id="${f.id}" name="${f.id}" type="${f.type||'text'}" placeholder="${f.ph||''}" ${extras} ${req}/>`;
    }
    return `<div class="fg"><label class="fl">${f.label}${f.required?' *':''}</label>${input}</div>`;
  },

  // Mostrar loader animado
  showLoader(steps = []) {
    const lw = document.getElementById('loaderWrap');
    const ls = document.getElementById('loaderSteps');
    const btn = document.getElementById('btnGen');
    if (!lw || !ls) return;
    ls.innerHTML = steps.map((s,i) =>
      `<div class="ls" id="lstep${i}"><div class="ls-dot"></div>${s}</div>`).join('');
    lw.classList.add('show');
    if (btn) btn.style.display = 'none';

    let i = 0;
    const iv = setInterval(() => {
      if (i > 0) document.getElementById(`lstep${i-1}`)?.classList.replace('active','done');
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

  // Renderizar resultado gerado
  renderResult(content, svc, credits, model) {
    document.getElementById('resModel').textContent = model || 'openrouter';
    document.getElementById('resMeta').innerHTML =
      `<span>📄 ${svc.title}</span><span>⚡ ${credits} créditos restantes</span><span>🕐 ${new Date().toLocaleTimeString('pt')}</span>`;
    document.getElementById('resPreview').innerHTML = Formatter.markdownToHTML(content);
  },

  // Colectar dados do formulário
  collectData(fields) {
    const data = {};
    const collect = f => { const el = document.getElementById(f.id); if (el) data[f.id] = el.value.trim(); };
    fields.forEach(f => f.row ? f.items.forEach(collect) : collect(f));
    return data;
  },
};
