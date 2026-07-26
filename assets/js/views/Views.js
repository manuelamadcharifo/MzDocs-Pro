// views/NotificationView.js — Sistema de notificações em pilha
import { renderA4Pages, A4_PAGES_CONTAINER_CSS, scalePage } from '../utils/A4Renderer.js';
import { getPaginatedContent } from '../utils/Paginator.js';

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
    // NOVO (correcção 2.5): activa as caixas de dica dinâmica ("Tipo de
    // Documento" no Recibo/Factura, "Tipo de Imóvel" no Arrendamento, etc.)
    // — ver _field() e bindDynamicHints() abaixo.
    this.bindDynamicHints(formBodyEl);
    // NOVO (correcção 2.6): inicializa qualquer tabela de itens do
    // formulário (ex.: "Itens / Serviços" do Recibo/Factura).
    this.bindItemTables(formBodyEl, svc.fields);
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
    // NOVO (correcção 2.4): campos com 'requiredIf' calculam a obrigatoriedade
    // dinamicamente (ver bindConditionalFields), por isso não recebem o
    // atributo 'required' estático no HTML inicial — evita que o browser
    // bloqueie o envio por um campo que, para o tipo escolhido, é opcional.
    const hasRequiredIf = !!(f.requiredIf && f.requiredIf.field && Array.isArray(f.requiredIf.in));
    const req = (!hasRequiredIf && f.required) ? 'required' : '';
    let input = '';
    if (f.type === 'select') {
      // NOVO (correcção 2.5): 'val' permite pré-seleccionar uma opção (ex.:
      // 'Recibo Simples' no Tipo de Documento) em vez de abrir sempre em
      // branco — sem isto, "nada seleccionado" e "Recibo Simples" pareciam
      // visualmente o mesmo estado, dando a impressão de que a selecção
      // nunca mudava nada.
      const opts = (f.opts || []).map(o => `<option value="${o}" ${f.val === o ? 'selected' : ''}>${o}</option>`).join('');
      const placeholderSelected = f.val ? '' : 'selected';
      input = `<select id="${f.id}" ${req}><option value="" disabled ${placeholderSelected}>${f.ph || 'Selecione…'}</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${f.id}" ${req} placeholder="${f.ph || ''}" rows="4"></textarea>`;
    } else if (f.type === 'itemtable') {
      // NOVO (correcção 2.6 — "sistema de cálculos automáticos"): tabela de
      // itens real (descrição + quantidade + preço unitário por linha), com
      // subtotal por linha e total geral calculados no browser, sem o
      // utilizador fazer contas. O valor é guardado como JSON num <input
      // type="hidden">, para se comportar como qualquer outro campo perante
      // collectData()/collectAllFields()/restoreDraft(). Ver
      // bindItemTables()/_itemTableAddRow()/_itemTableRecalc() abaixo.
      input = `
        <div class="mz-itemtable" id="${f.id}_wrap">
          <div class="mz-item-head">
            <span>Descrição</span><span>Qtd</span><span>Preço (MZN)</span><span>Subtotal</span><span></span>
          </div>
          <div class="mz-item-rows" id="${f.id}_rows"></div>
          <button type="button" class="mz-item-add" id="${f.id}_add">➕ Adicionar linha</button>
          <div class="mz-item-total">Total: <strong id="${f.id}_totalDisplay">0 MZN</strong></div>
          <input type="hidden" id="${f.id}" value="[]" data-sync-total-to="${f.syncTotalTo || ''}" />
        </div>
      `;
    } else {
      // CORRIGIDO (auditoria 2.3): campos como NUIT/telefone não tinham
      // pattern/maxlength/inputmode — permitiam texto livre sem formato.
      // Estes atributos são opcionais por campo (definidos em ServiceDefinitions.js).
      const extras = [
        f.min ? `min="${f.min}"` : '',
        f.max ? `max="${f.max}"` : '',
        f.val ? `value="${f.val}"` : '',
        f.pattern ? `pattern="${f.pattern}"` : '',
        f.maxlength ? `maxlength="${f.maxlength}"` : '',
        f.inputmode ? `inputmode="${f.inputmode}"` : '',
        // NOVO (correcção 2.6): campos calculados automaticamente (ex.:
        // "Valor Total" do Recibo) ficam só-de-leitura — o utilizador vê o
        // resultado mas não pode escrever um valor divergente das linhas.
        f.readonly ? 'readonly' : '',
      ].filter(Boolean).join(' ');
      input = `<input type="${f.type}" id="${f.id}" ${req} placeholder="${f.ph || ''}" ${extras} />`;
    }
    // Conditional fields: hidden by default, shown when trigger field matches
    // one of condValue's values. condValue accepts a single string (legado)
    // ou um array de strings (NOVO — vários tipos de documento podem exigir
    // o mesmo campo). Os valores são serializados com o separador '|||'
    // porque nenhuma opção do formulário usa essa sequência de caracteres.
    const isConditional = !!(f.conditional && f.condValue);
    const conditionalValues = isConditional
      ? (Array.isArray(f.condValue) ? f.condValue : [f.condValue])
      : null;
    const conditionalAttrs = isConditional
      ? `data-conditional="${f.conditional}" data-cond-value="${conditionalValues.join('|||')}" style="display:none"`
      : '';
    // NOVO: requiredIf — campo permanece sempre visível, mas só se torna
    // obrigatório quando o campo-gatilho (ex.: 'tipoDoc') tiver um dos
    // valores listados. O asterisco (*) da label aparece/desaparece junto
    // com a obrigatoriedade (ver bindConditionalFields).
    const requiredIfAttrs = hasRequiredIf
      ? `data-required-if="${f.requiredIf.field}" data-required-values="${f.requiredIf.in.join('|||')}"`
      : '';
    const asteriskHTML = hasRequiredIf
      ? `<span class="req-mark" style="display:none"> *</span>`
      : (f.required ? ' *' : '');
    // NOVO: texto de apoio opcional por campo, para explicar regras fiscais
    // ou formato esperado (ex.: "NUIT obrigatório para Factura…").
    const hintHTML = f.hint ? `<small class="field-hint">${f.hint}</small>` : '';
    // NOVO (correcção 2.5): caixa de dica dinâmica — texto muda consoante o
    // valor actual do próprio select (ex.: explica o Tipo de Documento
    // escolhido). O mapa valor→texto vai serializado em JSON no atributo
    // data-dynhint-map; aspas simples usadas para não colidir com aspas
    // duplas do HTML, e o apóstrofo é escapado para não quebrar o atributo.
    const dynHintHTML = (f.type === 'select' && f.dynamicHint)
      ? `<div class="field-dynhint" data-dynhint-map='${JSON.stringify(f.dynamicHint).replace(/'/g, '&#39;')}'></div>`
      : '';
    return `
      <div class="field-group" ${conditionalAttrs} ${requiredIfAttrs}>
        <label for="${f.id}">${f.label}${asteriskHTML}</label>
        ${input}
        ${hintHTML}
        ${dynHintHTML}
      </div>
    `;
  },

  // Call after rendering form to wire up conditional field visibility and
  // dynamic (requiredIf) obrigatoriedade.
  bindConditionalFields(formEl) {
    if (!formEl) return;
    const conditionalGroups = formEl.querySelectorAll('[data-conditional]');
    const requiredIfGroups  = formEl.querySelectorAll('[data-required-if]');
    if (!conditionalGroups.length && !requiredIfGroups.length) return;

    const updateVisibility = () => {
      conditionalGroups.forEach(group => {
        const triggerFieldId = group.dataset.conditional;
        const condValues      = group.dataset.condValue.split('|||');
        const triggerEl      = formEl.querySelector(`#${triggerFieldId}`);
        if (!triggerEl) return;
        const show = condValues.includes(triggerEl.value);
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

      // NOVO: campos requiredIf ficam sempre visíveis — só a obrigatoriedade
      // (atributo required + asterisco na label) muda consoante o valor
      // actual do campo-gatilho.
      requiredIfGroups.forEach(group => {
        const triggerFieldId = group.dataset.requiredIf;
        const reqValues      = group.dataset.requiredValues.split('|||');
        const triggerEl      = formEl.querySelector(`#${triggerFieldId}`);
        if (!triggerEl) return;
        const isRequired = reqValues.includes(triggerEl.value);
        const input = group.querySelector('input, select, textarea');
        const mark  = group.querySelector('.req-mark');
        if (input) {
          if (isRequired) input.setAttribute('required', '');
          else input.removeAttribute('required');
        }
        if (mark) mark.style.display = isRequired ? '' : 'none';
      });
    };

    // Collect unique trigger field IDs and attach listeners
    const triggerIds = new Set([
      ...[...conditionalGroups].map(g => g.dataset.conditional),
      ...[...requiredIfGroups].map(g => g.dataset.requiredIf),
    ]);
    triggerIds.forEach(id => {
      const el = formEl.querySelector(`#${id}`);
      if (el) el.addEventListener('change', updateVisibility);
    });

    // Run once on load to set initial state
    updateVisibility();
  },

  // NOVO (correcção 2.5): liga as caixas de dica dinâmica (data-dynhint-map)
  // ao respectivo <select> — é a mudança mais visível de todas quando o
  // utilizador troca o Tipo de Documento (ou qualquer outro select com
  // 'dynamicHint' definido em ServiceDefinitions.js), porque aparece/muda
  // uma caixa azul de texto, em vez de uma alteração subtil como um
  // asterisco. Reutilizável por qualquer serviço, sem depender de 'tipoDoc'.
  bindDynamicHints(formEl) {
    if (!formEl) return;
    const hintEls = formEl.querySelectorAll('[data-dynhint-map]');
    if (!hintEls.length) return;
    hintEls.forEach(hintEl => {
      const group  = hintEl.closest('.field-group');
      const select = group?.querySelector('select');
      if (!select) return;
      let map = {};
      try { map = JSON.parse(hintEl.dataset.dynhintMap); } catch (e) { map = {}; }
      const update = () => {
        const text = map[select.value];
        hintEl.textContent = text || '';
        hintEl.style.display = text ? 'block' : 'none';
      };
      select.addEventListener('change', update);
      update(); // estado inicial (já reflecte o 'val' pré-seleccionado)
    });
  },

  // ── Tabela de itens com cálculo automático (correcção 2.6) ──────────────
  // Formato de cada item guardado: { desc, qtd, preco, subtotal }.
  // Tudo aqui é "stateless": encontra os elementos pelo id do campo sempre
  // que é chamado, em vez de guardar referências, para funcionar tanto na
  // criação inicial da linha como na reposição de um rascunho guardado.

  // Cria uma linha da tabela (vazia, ou pré-preenchida com 'item') e liga os
  // seus próprios listeners de recálculo/remoção.
  _itemTableAddRow(fieldId, item) {
    const rowsEl = document.getElementById(`${fieldId}_rows`);
    if (!rowsEl) return;
    const row = document.createElement('div');
    row.className = 'mz-item-row';
    const esc = (s) => String(s || '').replace(/"/g, '&quot;');
    row.innerHTML = `
      <input type="text" class="mz-item-desc" placeholder="Ex: Reparação de telemóvel" value="${esc(item?.desc)}" />
      <input type="number" class="mz-item-qtd" min="0" step="1" value="${item?.qtd || 1}" />
      <input type="number" class="mz-item-preco" min="0" step="0.01" placeholder="0" value="${item?.preco ?? ''}" />
      <span class="mz-item-subtotal">0</span>
      <button type="button" class="mz-item-remove" aria-label="Remover linha">✕</button>
    `;
    rowsEl.appendChild(row);
    row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => this._itemTableRecalc(fieldId)));
    row.querySelector('.mz-item-remove').addEventListener('click', () => {
      // Mantém sempre pelo menos 1 linha visível, para não ficar sem sítio
      // para o utilizador escrever.
      if (rowsEl.children.length > 1) { row.remove(); this._itemTableRecalc(fieldId); }
    });
  },

  // Recalcula subtotais + total geral, grava o JSON no <input hidden> e
  // actualiza o campo alvo (ex.: "Valor Total") se 'syncTotalTo' existir.
  _itemTableRecalc(fieldId) {
    const rowsEl   = document.getElementById(`${fieldId}_rows`);
    const totalEl  = document.getElementById(`${fieldId}_totalDisplay`);
    const hiddenEl = document.getElementById(fieldId);
    if (!rowsEl || !hiddenEl) return;
    const syncFieldId = hiddenEl.dataset.syncTotalTo;
    const syncEl = syncFieldId ? document.getElementById(syncFieldId) : null;
    let total = 0;
    const items = [];
    [...rowsEl.children].forEach(row => {
      const desc  = row.querySelector('.mz-item-desc').value.trim();
      const qtd   = parseFloat(row.querySelector('.mz-item-qtd').value) || 0;
      const preco = parseFloat(row.querySelector('.mz-item-preco').value) || 0;
      const sub   = qtd * preco;
      row.querySelector('.mz-item-subtotal').textContent = sub ? sub.toLocaleString('pt-MZ', { maximumFractionDigits: 2 }) : '0';
      if (desc || qtd || preco) items.push({ desc, qtd, preco, subtotal: Math.round(sub * 100) / 100 });
      total += sub;
    });
    if (totalEl) totalEl.textContent = `${total.toLocaleString('pt-MZ', { maximumFractionDigits: 2 })} MZN`;
    hiddenEl.value = JSON.stringify(items);
    if (syncEl) {
      syncEl.value = total ? String(Math.round(total * 100) / 100) : '';
      // Campo é readonly mas 'required' continua a validar-se sobre .value —
      // isto garante que "sem itens preenchidos" bloqueia o envio (Formatter.js).
    }
  },

  // Chamado por renderForm(): cria a 1.ª linha vazia de cada tabela de itens
  // do formulário e activa o botão "➕ Adicionar linha".
  bindItemTables(formEl, fields) {
    if (!formEl) return;
    const flat = [];
    (fields || []).forEach(f => f.row ? f.items.forEach(fi => flat.push(fi)) : flat.push(f));
    flat.filter(f => f.type === 'itemtable').forEach(f => {
      const wrap = formEl.querySelector(`#${f.id}_wrap`);
      if (!wrap) return;
      const addBtn = wrap.querySelector(`#${f.id}_add`);
      addBtn?.addEventListener('click', () => { this._itemTableAddRow(f.id); this._itemTableRecalc(f.id); });
      this._itemTableAddRow(f.id);
      this._itemTableRecalc(f.id);
    });
  },

  // Chamado por restoreDraft(): repõe as linhas guardadas de um rascunho
  // (itemsJSON é a string JSON tal como veio de offlineDB).
  setItemTableData(fieldId, itemsJSON) {
    const rowsEl = document.getElementById(`${fieldId}_rows`);
    if (!rowsEl) return;
    let items = [];
    try { items = JSON.parse(itemsJSON) || []; } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
    rowsEl.innerHTML = '';
    if (items.length) items.forEach(it => this._itemTableAddRow(fieldId, it));
    else this._itemTableAddRow(fieldId);
    this._itemTableRecalc(fieldId);
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
    // CORRIGIDO: esta função assume que a página tem o overlay de resultado
    // completo (#resModel/#resMeta/#resPreview, só existem em index.html).
    // Se for chamada nalgum contexto sem essa infra (ex: engano futuro numa
    // página como /perfil.html ou /templates.html), grava sem rebentar em
    // vez de lançar "Cannot set properties of null" e parar tudo a meio.
    const resModelEl = document.getElementById('resModel');
    if (resModelEl) resModelEl.textContent = model || 'openrouter';
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
    const resMetaEl = document.getElementById('resMeta');
    if (resMetaEl) {
      resMetaEl.innerHTML =
        `📄 ${svcTitle} &nbsp;|&nbsp; ${creditsLabel}🕐 ${new Date().toLocaleTimeString('pt')}`;
    }

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
    // Estimativa rápida (instantânea) — substituída pelo nº REAL de páginas
    // assim que a paginação (medida no browser) estiver pronta, ver abaixo.
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

    // CORRIGIDO: o botão "📚 APA" (referências bibliográficas APA 7) só faz
    // sentido para documentos académicos — antes aparecia fixo para TODOS
    // os tipos de documento (ex.: Recibo/Factura), por estar definido direto
    // no index.html sem nenhuma condição. Agora é mostrado/escondido aqui,
    // a cada renderização do resultado, conforme a categoria do serviço.
    const btnAcademicEl = document.getElementById('btnAcademic');
    if (btnAcademicEl) {
      btnAcademicEl.style.display = (svc && svc.category === 'academico') ? '' : 'none';
    }

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
        const contentToShow = (this._resultPaginationSource === safeContent && this._resultPaginatedContent)
          ? this._resultPaginatedContent
          : safeContent;
        this._renderResultFrame(btn.dataset.rfmt, contentToShow);
      });
    });

    // CORRIGIDO (bug: "1 página na app, 3 no download"): calcular a
    // paginação REAL em segundo plano — mesmo motor partilhado usado no
    // download (assets/js/utils/Paginator.js) — e, assim que pronta,
    // actualizar o contador "~N pág." para o valor real e redesenhar o
    // preview já com as mesmas quebras que o PDF/Word vão respeitar.
    // Sem isto, "~N pág." era só uma estimativa por nº de caracteres,
    // sem qualquer relação com a paginação real do ficheiro exportado.
    this._scheduleResultPagination(safeContent, words);
  },

  async _scheduleResultPagination(safeContent, words) {
    if (!safeContent || safeContent.trimStart().startsWith('<')) return; // HTML de template pagina-se a si próprio

    const token = Symbol('result-pagination');
    this._resultPaginationToken = token;
    try {
      const paginated = await getPaginatedContent(safeContent);
      // Ignorar se entretanto o resultado mudou (novo documento gerado)
      if (this._resultPaginationToken !== token) return;

      this._resultPaginatedContent = paginated;
      this._resultPaginationSource  = safeContent;

      const realPages = (paginated.match(/---PAGE_BREAK---/g)?.length || 0) + 1;
      const statsEl = document.querySelector('.res-preview-stats');
      if (statsEl) statsEl.textContent = `${words} palavras · ${realPages} pág.`;

      if (paginated !== safeContent) {
        const activeTab = document.querySelector('.res-tab.active');
        this._renderResultFrame(activeTab?.dataset.rfmt || 'pdf', paginated);
      }
    } catch (err) {
      console.warn('[DocumentView] paginação real do resultado falhou, mantém estimativa:', err.message);
    }
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
      if (!(f.id in draftData)) return;
      // NOVO (correcção 2.6): campos 'itemtable' guardam JSON — reconstrói as
      // linhas visíveis (desc/qtd/preço) em vez de só copiar a string para o
      // <input hidden>, senão a tabela ficava vazia mesmo com dados no rascunho.
      if (f.type === 'itemtable') {
        this.setItemTableData(f.id, draftData[f.id]);
        return;
      }
      const el = document.getElementById(f.id);
      if (!el) return;
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
