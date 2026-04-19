// views/Views.js — MzDocs Pro v4
// UI views com copy melhorado e classes CSS actualizadas

// ─────────────────────────────────────────────────────────────
// NOTIFICAÇÕES (Toasts)
// ─────────────────────────────────────────────────────────────
export const NotificationView = {
  _show(msg, type = 'default', ms = 3500) {
    const stack = document.getElementById('notifStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.textContent = msg;
    el.setAttribute('role', 'alert');
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'all .25s ease';
      setTimeout(() => el.remove(), 260);
    }, ms);
  },
  success(msg) { this._show(msg, 'success'); },
  error(msg)   { this._show(msg, 'error', 5500); },
  warn(msg)    { this._show(msg, 'warn', 4500); },
  info(msg)    { this._show(msg, 'info'); },
  show(msg)    { this._show(msg); },
};

// ─────────────────────────────────────────────────────────────
// MODAIS (Overlay + Sheet)
// ─────────────────────────────────────────────────────────────
export const ModalView = {
  open(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('open');
      document.body.style.overflow = 'hidden';
      // Foco no primeiro elemento focável para acessibilidade
      setTimeout(() => {
        const focusable = el.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        focusable?.focus?.();
      }, 300);
    }
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('open');
      document.body.style.overflow = '';
    }
  },
  isOpen(id) { return document.getElementById(id)?.classList.contains('open') ?? false; },
};

// ─────────────────────────────────────────────────────────────
// DOCUMENTOS (Formulário + Loader + Resultado)
// ─────────────────────────────────────────────────────────────
import { Formatter } from '../utils/Formatter.js';
import { SERVICES }  from '../services/ServiceDefinitions.js';

export const DocumentView = {

  // ── Renderizar formulário ──────────────────────────────────
  renderForm(svc, formBodyEl, formFootEl) {
    if (!formBodyEl || !formFootEl) return;
    formBodyEl.innerHTML = this._buildFieldsHTML(svc.fields);
    if (svc.hasAI) {
      formFootEl.innerHTML = `
        <div class="loader-wrap" id="loaderWrap" aria-live="polite" aria-label="A gerar documento">
          <div class="l-spin" aria-hidden="true"></div>
          <div class="l-steps" id="loaderSteps"></div>
        </div>
        <button class="btn-gen" id="btnGen" aria-label="Gerar documento com IA">
          <span aria-hidden="true">✦</span>
          Gerar com IA
          <small style="opacity:.6;font-weight:500;font-size:12px">(1 crédito)</small>
        </button>`;
    } else {
      formFootEl.innerHTML = `
        <button class="btn-wa-direct" id="btnWaDirect" aria-label="Enviar pedido pelo WhatsApp">
          <span aria-hidden="true">💬</span> Enviar pelo WhatsApp
        </button>`;
    }
  },

  _buildFieldsHTML(fields) {
    return fields.map(f => {
      if (f.row) {
        return `<div class="fg-row">${f.items.map(fi => this._field(fi)).join('')}</div>`;
      }
      return this._field(f);
    }).join('');
  },

  _field(f) {
    const req = f.required ? 'required aria-required="true"' : '';
    const labelSuffix = f.required ? ' <span style="color:#DC2626" aria-label="obrigatório">*</span>' : '';
    let input = '';

    if (f.type === 'select') {
      const opts = (f.opts || []).map(o => `<option value="${o}">${o}</option>`).join('');
      input = `<select class="fs" id="${f.id}" name="${f.id}" ${req} aria-label="${f.label}">
        <option value="">Selecciona uma opção…</option>${opts}
      </select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea class="fta" id="${f.id}" name="${f.id}"
        placeholder="${f.ph || ''}" ${req} aria-label="${f.label}" rows="4"></textarea>`;
    } else {
      const extras = [
        f.min  ? `min="${f.min}"`    : '',
        f.max  ? `max="${f.max}"`    : '',
        f.val  ? `value="${f.val}"`  : '',
      ].filter(Boolean).join(' ');
      const inputMode = f.type === 'number' ? 'inputmode="numeric"' : '';
      input = `<input class="fi" id="${f.id}" name="${f.id}"
        type="${f.type || 'text'}" placeholder="${f.ph || ''}"
        ${extras} ${req} ${inputMode} aria-label="${f.label}" autocomplete="off"/>`;
    }
    return `<div class="fg">
      <label class="fl" for="${f.id}">${f.label}${labelSuffix}</label>
      ${input}
    </div>`;
  },

  // ── Loader animado ─────────────────────────────────────────
  showLoader(steps = []) {
    const lw   = document.getElementById('loaderWrap');
    const ls   = document.getElementById('loaderSteps');
    const btn  = document.getElementById('btnGen');
    if (!lw || !ls) return null;

    ls.innerHTML = steps.map((s, i) =>
      `<div class="ls" id="lstep${i}" aria-hidden="true">
        <div class="ls-dot"></div><span>${s}</span>
      </div>`
    ).join('');

    lw.classList.add('show');
    if (btn) btn.style.display = 'none';

    let i = 0;
    const iv = setInterval(() => {
      if (i > 0) {
        document.getElementById(`lstep${i - 1}`)?.classList.replace('active', 'done');
      }
      const el = document.getElementById(`lstep${i}`);
      if (el) el.classList.add('active');
      i++;
      if (i > steps.length) clearInterval(iv);
    }, 1000);
    return iv;
  },

  hideLoader(iv) {
    clearInterval(iv);
    const lw  = document.getElementById('loaderWrap');
    const btn = document.getElementById('btnGen');
    if (lw)  lw.classList.remove('show');
    if (btn) { btn.style.display = ''; btn.disabled = false; }
  },

  // ── Renderizar resultado ───────────────────────────────────
  renderResult(content, svc, credits, model) {
    const modelTag = document.getElementById('resModel');
    if (modelTag) {
      // Mostrar só o nome curto do modelo
      const shortModel = (model || 'IA').split('/').pop()?.split(':')[0] || 'IA';
      modelTag.textContent = shortModel;
    }

    const meta = document.getElementById('resMeta');
    if (meta) {
      const creditsMsg = credits === 0
        ? '⚠️ Sem créditos restantes'
        : `⚡ ${credits} crédito${credits !== 1 ? 's' : ''} restante${credits !== 1 ? 's' : ''}`;
      meta.innerHTML = `
        <span>📄 ${svc.title}</span>
        <span>${creditsMsg}</span>
        <span>🕐 ${new Date().toLocaleTimeString('pt', { hour: '2-digit', minute: '2-digit' })}</span>`;
    }

    const preview = document.getElementById('resPreview');
    if (preview) {
      preview.innerHTML = Formatter.markdownToHTML(content);
      // Scroll para o topo do preview
      preview.scrollTop = 0;
    }
  },

  // ── Colectar dados do formulário ───────────────────────────
  collectData(fields) {
    const data = {};
    const collect = f => {
      const el = document.getElementById(f.id);
      if (el) data[f.id] = el.value.trim();
    };
    fields.forEach(f => f.row ? f.items.forEach(collect) : collect(f));
    return data;
  },
};

// Re-export PaymentView
import { PaymentView } from './PaymentView.js';
export { PaymentView };
