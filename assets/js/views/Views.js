// views/NotificationView.js — Sistema de notificações em pilha
import { renderA4Pages, A4_PAGES_CONTAINER_CSS, scalePage } from '../utils/A4Renderer.js';

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
      // NOVO v2.1: botão "Ver amostra grátis" — chama /api/generate-document em
      // _previewMode (sem dedução de crédito) para o utilizador avaliar a
      // qualidade antes de decidir gastar o crédito. Fica visível só ANTES da
      // geração completa; some quando o documento real é gerado.
      formFootEl.innerHTML = `
        <button id="btnPreview" class="btn-preview" type="button">
          <span>👀 Ver amostra grátis</span>
        </button>
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

  // ── NOVO v2.1: painel de amostra grátis (preview) ─────────────────────────
  // Renderizado dentro do próprio formulário (formBody), acima do rodapé com
  // os botões. Não usa o overlay de resultado (resultOverlay) porque essa
  // área é reservada ao documento PAGO/completo, com export, templates, etc.
  // A amostra é só texto simples, claramente identificada como tal.
  showPreviewLoading() {
    const formBody = document.getElementById('formBody');
    if (!formBody) return;
    this.removePreviewPanel();
    const panel = document.createElement('div');
    panel.id = 'mzPreviewPanel';
    panel.className = 'mz-preview-panel';
    panel.innerHTML = `<div class="mz-preview-label"><span>👀 A gerar amostra grátis…</span></div><span style="color:var(--muted)">Isto não consome créditos.</span>`;
    formBody.insertAdjacentElement('afterend', panel);
  },

  showPreviewPanel(text) {
    const formBody = document.getElementById('formBody');
    if (!formBody) return;
    this.removePreviewPanel();
    const panel = document.createElement('div');
    panel.id = 'mzPreviewPanel';
    panel.className = 'mz-preview-panel mz-preview-fade';
    const safe = (text || '').replace(/</g, '&lt;');
    panel.innerHTML = `
      <div class="mz-preview-label">
        <span>👀 Amostra grátis — início do documento</span>
        <button class="mz-preview-close" type="button" aria-label="Fechar amostra">✕</button>
      </div>
      ${safe}…
    `;
    formBody.insertAdjacentElement('afterend', panel);
    panel.querySelector('.mz-preview-close')?.addEventListener('click', () => this.removePreviewPanel());
  },

  showPreviewError(message) {
    const formBody = document.getElementById('formBody');
    if (!formBody) return;
    this.removePreviewPanel();
    const panel = document.createElement('div');
    panel.id = 'mzPreviewPanel';
    panel.className = 'mz-preview-panel';
    panel.style.borderColor = '#fca5a5';
    panel.style.background = '#fef2f2';
    panel.style.color = '#991b1b';
    panel.innerHTML = `<div class="mz-preview-label" style="color:#991b1b">⚠️ Não foi possível gerar a amostra</div>${(message || '').replace(/</g, '&lt;')}`;
    formBody.insertAdjacentElement('afterend', panel);
  },

  removePreviewPanel() {
    document.getElementById('mzPreviewPanel')?.remove();
  },

  // ── Preview do resultado final — MESMO motor A4Renderer do TemplatePicker ──
  // Garante paridade total entre o que o utilizador vê aqui e o ficheiro
  // PDF/Word que sai no download: páginas A4 separadas reais (uma folha por
  // ---PAGE_BREAK---, não um único iframe cortado) e tabelas markdown "|"
  // convertidas em <table> real via markdownToHtml (GFM).
  renderResult(content, svc, credits, model, templateCss = null) {
    try {
      this._renderResultInner(content, svc, credits, model, templateCss);
    } catch (err) {
      // CORRIGIDO: diagnóstico visível sem precisar de consola/DevTools.
      // Antes, qualquer excepção aqui deixava a área de preview completamente
      // vazia (sem tabs, sem folha, sem explicação) — agora mostra o erro
      // real directamente no ecrã, para sabermos exactamente o que falhou.
      console.error('[DocumentView.renderResult] erro:', err);
      const previewContainer = document.getElementById('resPreview');
      if (previewContainer) {
        previewContainer.innerHTML = `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:14px;color:#991b1b;font-size:13px;line-height:1.6;">
            <strong>⚠️ Erro ao mostrar o preview</strong><br><br>
            <code style="display:block;white-space:pre-wrap;word-break:break-word;background:#fff;border-radius:6px;padding:8px;margin-top:6px;font-size:11.5px;">${(err?.message || String(err)).replace(/</g,'&lt;')}</code>
            <br>O download continua disponível normalmente — pode tentar pelos botões abaixo.
          </div>`;
      }
    }
  },

  _renderResultInner(content, svc, credits, model, templateCss = null) {
    document.getElementById('resModel').textContent = model || 'openrouter';
    // CORRIGIDO: guardar templateCss activo para usar no _renderResultFrame
    this._activeTemplateCss = templateCss || null;

    // CORRIGIDO: blindar contra content nulo/undefined/não-string — alguns
    // documentos antigos do histórico podem ter content vazio. Sem isto,
    // content.trim() lançava TypeError e interrompia a função ANTES de
    // desenhar qualquer coisa em #resPreview — a área ficava completamente
    // vazia (cabeçalho aparecia, preview não), exactamente o bug reportado
    // ao abrir certos documentos "Do arquivo".
    const safeContent = (typeof content === 'string') ? content : (content == null ? '' : String(content));

    // CORRIGIDO: svc pode vir nulo/sem .title em alguns fluxos (ex: aplicar
    // template passava this.docModel em vez de svc) — usar fallback seguro
    // em vez de deixar "svc.title" rebentar com TypeError.
    const svcTitle = (svc && typeof svc === 'object' && svc.title) ? svc.title : (svc?.service || 'Documento');

    // CORRIGIDO: "null créditos restantes" — credits pode ser null quando vem do histórico
    const creditsLabel = (credits != null && credits !== '') ? `⚡ ${credits} créditos restantes &nbsp;|&nbsp; ` : '';
    document.getElementById('resMeta').innerHTML =
      `📄 ${svcTitle} &nbsp;|&nbsp; ${creditsLabel}🕐 ${new Date().toLocaleTimeString('pt')}`;

    const previewContainer = document.getElementById('resPreview');
    if (!previewContainer) return;

    if (!safeContent.trim()) {
      // Sem conteúdo real para mostrar — avisar visivelmente em vez de
      // deixar a área em branco sem qualquer explicação.
      previewContainer.innerHTML = `
        <div class="res-preview-header">
          <div class="res-preview-tabs" id="resPreviewTabs"></div>
          <div class="res-preview-stats">0 palavras</div>
        </div>
        <div class="a4-pages-outer" id="resA4Wrap">
          <p style="color:#fff;text-align:center;padding:40px 20px;">⚠️ Este documento não tem conteúdo para mostrar.</p>
        </div>`;
      return;
    }

    const words = safeContent.trim().split(/\s+/).length;
    const pages = Math.max(1, Math.ceil(safeContent.length / 2800));

    // Injectar CSS partilhado das folhas A4 uma única vez (idempotente)
    if (!document.getElementById('a4PagesSharedStyle')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'a4PagesSharedStyle';
      styleEl.textContent = A4_PAGES_CONTAINER_CSS;
      document.head.appendChild(styleEl);
    }

    // Aviso de revisão jurídica: mostrado apenas para serviços da categoria
    // 'juridico' (arrendamento, requerimento, procuração, residência, acta).
    // Não altera nenhum fluxo de geração/download — é só uma faixa informativa
    // acima do preview. Ver docs/legal/VERIFICACAO-LEGAL.md para o que já foi
    // verificado e o que ainda está pendente de confirmação.
    const legalNotice = (svc && svc.category === 'juridico')
      ? `<div style="background:#fffbeb;border-bottom:1px solid #fde68a;padding:8px 14px;font-size:11.5px;line-height:1.5;color:#92400e;">
          ⚖️ Esta minuta cita legislação moçambicana. Confirme os artigos e diplomas junto de um advogado ou notário antes de uso formal — a IA pode cometer erros em referências legais.
        </div>`
      : '';

    previewContainer.innerHTML = `
      ${legalNotice}
      <div class="res-preview-header">
        <div class="res-preview-tabs" id="resPreviewTabs">
          <button class="res-tab active" data-rfmt="pdf">📄 PDF</button>
          <button class="res-tab" data-rfmt="word">📃 Word</button>
          <button class="res-tab" data-rfmt="text">📝 Texto</button>
        </div>
        <div class="res-preview-stats">${words} palavras · ~${pages} pág.</div>
      </div>
      <div class="a4-pages-outer" id="resA4Wrap"></div>
    `;

    this._renderResultFrame('pdf', safeContent);

    if (!this._resizeResultHandler) {
      this._resizeResultHandler = () => this._scaleResultFrame();
      window.addEventListener('resize', this._resizeResultHandler);
    }

    previewContainer.querySelectorAll('.res-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        previewContainer.querySelectorAll('.res-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderResultFrame(btn.dataset.rfmt, safeContent);
      });
    });
  },

  // ── Reescalar todas as folhas A4 do resultado (ao redimensionar a janela) ──
  _scaleResultFrame() {
    const outer = document.getElementById('resA4Wrap');
    if (!outer) return;
    outer.querySelectorAll('.a4-page').forEach(pageEl => {
      const iframe = pageEl.querySelector('iframe');
      if (iframe) scalePage(outer, pageEl, iframe);
    });
  },

  _renderResultFrame(format, content) {
    const outer = document.getElementById('resA4Wrap');
    if (!outer) return;

    try {
      this._renderResultFrameInner(outer, format, content);
    } catch (err) {
      // CORRIGIDO: mesmo diagnóstico visível do renderResult — evita folha
      // em branco silenciosa quando chamado directamente (tabs, _applyTemplate).
      console.error('[DocumentView._renderResultFrame] erro:', err);
      outer.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:14px;color:#991b1b;font-size:13px;line-height:1.6;">
          <strong>⚠️ Erro ao desenhar a folha</strong><br><br>
          <code style="display:block;white-space:pre-wrap;word-break:break-word;background:#fff;border-radius:6px;padding:8px;margin-top:6px;font-size:11.5px;">${(err?.message || String(err)).replace(/</g,'&lt;')}</code>
        </div>`;
    }
  },

  _renderResultFrameInner(outer, format, content) {
    // CORRIGIDO: normalizar para string sempre — protege contra content
    // nulo/undefined/não-string vindo de chamadas directas (ex: DocumentController
    // chama _renderResultFrame('pdf', content) fora de renderResult()).
    const safeContent = (typeof content === 'string') ? content : (content == null ? '' : String(content));

    // ── Detecção automática HTML vs Markdown ────────────────────────────────
    // Se o conteúdo começa com '<' é HTML estruturado gerado pelo htmlTemplate.
    // Usar directamente no preview sem passar pelo conversor md→html.
    const isRawHTML = !!safeContent && safeContent.trimStart().startsWith('<');

    // ── CSS para o formato pedido ───────────────────────────────────────────
    let css = '';
    if (isRawHTML) {
      // HTML estruturado: usar CSS do template activo ou reset mínimo
      css = this._activeTemplateCss
        ? this._activeTemplateCss
        : 'body{font-family:Calibri,Arial,sans-serif;}';
    } else if (format === 'pdf') {
      css = this._activeTemplateCss ||
        `body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;padding:30mm 25mm 25mm 30mm;}
        h1{font-size:17pt;text-align:center;margin-bottom:14pt;font-weight:bold;}
        h2{font-size:13pt;font-weight:bold;margin-top:12pt;margin-bottom:6pt;border-bottom:1px solid #bbb;padding-bottom:2pt;}
        h3{font-size:12pt;font-weight:bold;margin-top:8pt;}
        p{margin-bottom:8pt;text-align:justify;}
        ul,ol{margin:6pt 0 6pt 18pt;}li{margin-bottom:2pt;}
        table{width:100%;border-collapse:collapse;margin:8pt 0;}
        td,th{border:1px solid #000;padding:4pt 6pt;font-size:11pt;}
        th{background:#f0f0f0;font-weight:bold;}
        strong{font-weight:bold;}em{font-style:italic;}hr{border:none;border-top:1px solid #888;margin:10pt 0;}`;
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
        h1,h2,h3{font-weight:bold;}
        table{border-collapse:collapse;}td,th{border:1px solid #cbd5e1;padding:4px 8px;}`;
    }

    // ── Renderizar páginas A4 reais separadas — mesmo motor do TemplatePicker ──
    // isRawHTML: o conteúdo (eventualmente já dividido por PAGE_BREAK) é HTML puro.
    // Caso contrário, o A4Renderer faz split por ---PAGE_BREAK--- e converte cada
    // página de markdown para HTML (com tabelas GFM reais incluídas).
    renderA4Pages(outer, safeContent, {
      css,
      isRawHTML,
      showPageLabel: true,
    });
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
