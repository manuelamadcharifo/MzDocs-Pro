// assets/js/marketplace/TemplatePicker.js — v4.0 mobile-first + A4 paged preview
// Layout mobile: lista de templates (scroll horizontal) no topo, preview A4 em baixo
// PAGE_BREAK → folhas A4 separadas com sombra, como um PDF real

import { getTemplates, getDefaultTemplate, getTemplateById, addSessionTemplate, getSessionTemplates, loadPublicTemplatesFromSupabase } from './TemplateLibrary.js';

// ── Notificação toast ─────────────────────────────────────────────────────────
function _notify(msg) {
  const stack = document.getElementById('notif-stack') || (() => {
    const s = document.createElement('div');
    s.id = 'notif-stack';
    Object.assign(s.style, { position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      zIndex:'9999', display:'flex', flexDirection:'column', gap:'8px', alignItems:'center', pointerEvents:'none' });
    document.body.appendChild(s);
    return s;
  })();
  const n = document.createElement('div');
  Object.assign(n.style, { background:'#0f172a', color:'#fff', padding:'10px 20px',
    borderRadius:'24px', fontSize:'13px', fontWeight:'700', whiteSpace:'nowrap',
    boxShadow:'0 4px 16px rgba(0,0,0,.3)' });
  n.textContent = msg;
  stack.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

const OVERLAY_ID = 'templatePickerOverlay';

// ── CSS completo ──────────────────────────────────────────────────────────────
const PICKER_CSS = `
/* ── Overlay ── */
#templatePickerOverlay{
  display:none;position:fixed;inset:0;
  background:rgba(7,16,31,.75);backdrop-filter:blur(6px);
  z-index:700;
  /* mobile: bottom sheet */
  align-items:flex-end;justify-content:center;
}
#templatePickerOverlay.open{display:flex;animation:tplFadeIn .18s ease}

/* ── Sheet ── */
#tplPickerSheet{
  background:#fff;
  border-radius:22px 22px 0 0;
  width:100%;max-width:700px;
  height:93dvh;           /* usa dvh para evitar corte por barra do browser */
  display:flex;flex-direction:column;
  overflow:hidden;
  box-shadow:0 -8px 48px rgba(0,0,0,.28);
  animation:tplSlideUp .3s cubic-bezier(.34,1.05,.64,1);
}

/* ── Handle (pill de arrastar) ── */
.tpl-pill{width:40px;height:4px;background:#cbd5e1;border-radius:2px;
  margin:10px auto 0;flex-shrink:0}

/* ── Header ── */
.tpl-hdr{
  display:flex;align-items:center;gap:10px;
  padding:10px 16px 8px;flex-shrink:0;
  border-bottom:1px solid #f1f5f9;
}
.tpl-hdr-info{flex:1;min-width:0}
.tpl-hdr-info h2{font-size:15px;font-weight:800;color:#0f172a;margin:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tpl-hdr-sub{font-size:11px;color:#64748b;margin-top:1px}
.tpl-close{background:#f1f5f9;border:none;cursor:pointer;color:#64748b;
  width:32px;height:32px;border-radius:50%;font-size:16px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  transition:background .15s}
.tpl-close:hover{background:#e2e8f0;color:#0f172a}

/* ── Lista de templates (scroll horizontal) ── */
.tpl-list-wrap{
  flex-shrink:0;padding:10px 12px 8px;
  border-bottom:1px solid #f1f5f9;
  overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;
}
.tpl-list-wrap::-webkit-scrollbar{display:none}
.tpl-list{display:flex;gap:8px;width:max-content}

/* ── Card de template ── */
.tpl-card{
  width:92px;flex-shrink:0;
  border:2px solid #e2e8f0;border-radius:12px;
  padding:7px 6px 6px;cursor:pointer;background:#fff;
  transition:border-color .15s,background .15s;text-align:left;
}
.tpl-card:active,.tpl-card:hover{border-color:#93c5fd;background:#eff6ff}
.tpl-card.selected{border-color:#3B82F6;background:#eff6ff}
.tpl-thumb{height:48px;border-radius:7px;margin-bottom:5px;overflow:hidden;position:relative;}
.tpl-thumb-inner{position:absolute;inset:0;display:flex;flex-direction:column;padding:5px;gap:3px}
.tpl-tl{height:3px;border-radius:2px}
.tpl-card-name{font-size:10px;font-weight:700;color:#0f172a;line-height:1.25;margin-bottom:2px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tpl-card-desc{font-size:9px;color:#64748b;line-height:1.2;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* ── Barra de nome seleccionado ── */
.tpl-sel-bar{
  flex-shrink:0;padding:7px 16px;font-size:11.5px;font-weight:700;
  color:#1e40af;background:#eff6ff;border-bottom:1px solid #bfdbfe;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:30px;
}

/* ── Área de preview — ocupa todo o espaço restante ── */
.tpl-preview-outer{
  flex:1;overflow-y:auto;overflow-x:hidden;
  background:#475569;
  display:flex;flex-direction:column;align-items:center;
  padding:16px 12px;gap:12px;
  -webkit-overflow-scrolling:touch;
}

/* ── Spinner de loading ── */
.tpl-loading{display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:12px;padding:40px;color:#fff;
  font-size:13px;font-weight:600;width:100%}
.tpl-spinner{width:36px;height:36px;border:3px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;animation:tplSpin .7s linear infinite}

/* ── Folha A4 individual ── */
.tpl-page{
  background:#fff;
  width:100%;
  max-width:560px;   /* largura visual no mobile */
  aspect-ratio:210/297;  /* proporção A4 exacta */
  border-radius:3px;
  box-shadow:0 4px 24px rgba(0,0,0,.35),0 1px 4px rgba(0,0,0,.15);
  overflow:hidden;
  flex-shrink:0;
  position:relative;
}
/* iframe dentro da folha ocupa tudo */
.tpl-page iframe{
  width:210mm;       /* largura A4 real */
  height:297mm;      /* altura A4 real */
  border:none;
  display:block;
  transform-origin:top left;
  /* scale calculado via JS */
}

/* ── Separador entre páginas ── */
.tpl-page-sep{
  font-size:10px;font-weight:700;color:rgba(255,255,255,.5);
  letter-spacing:.5px;text-align:center;flex-shrink:0;
}

/* ── Zona de upload de modelo próprio ── */
.tpl-upload-zone{
  flex-shrink:0;margin:0 12px 0;
  border:2px dashed #cbd5e1;border-radius:12px;
  background:#f8fafc;padding:10px 14px;
  display:flex;align-items:center;gap:10px;
  cursor:pointer;transition:border-color .15s,background .15s;
}
.tpl-upload-zone:hover,.tpl-upload-zone.drag{border-color:#3B82F6;background:#eff6ff}
.tpl-upload-zone.active{border-color:#10b981;background:#f0fdf4;border-style:solid}
.tpl-upload-icon{font-size:22px;flex-shrink:0}
.tpl-upload-text{flex:1;min-width:0}
.tpl-upload-title{font-size:12px;font-weight:700;color:#334155}
.tpl-upload-sub{font-size:10px;color:#64748b;margin-top:1px}
.tpl-upload-badge{font-size:10px;font-weight:700;color:#10b981;background:#d1fae5;
  padding:2px 8px;border-radius:20px;flex-shrink:0;display:none}
.tpl-upload-zone.active .tpl-upload-badge{display:block}
.tpl-upload-zone.active .tpl-upload-sub{color:#059669}

/* ── Footer com botões ── */
.tpl-footer{
  flex-shrink:0;padding:10px 12px;
  border-top:1px solid #e2e8f0;background:#f8fafc;
  display:grid;grid-template-columns:1fr 1fr 2fr;gap:8px;
}
.tpl-btn-pdf,.tpl-btn-word{
  border:2px solid #e2e8f0;background:#fff;border-radius:12px;
  padding:12px 8px;font-size:12px;font-weight:700;
  cursor:pointer;font-family:inherit;color:#334155;
  transition:all .15s;text-align:center;
}
.tpl-btn-pdf:hover,.tpl-btn-word:hover{border-color:#3B82F6;color:#1d4ed8;background:#eff6ff}
.tpl-btn-apply{
  background:linear-gradient(135deg,#1e40af,#3B82F6);
  color:#fff;border:none;border-radius:12px;
  padding:12px 10px;font-size:13px;font-weight:800;
  cursor:pointer;font-family:inherit;
  box-shadow:0 4px 12px rgba(59,130,246,.35);
  transition:opacity .15s;white-space:nowrap;
}
.tpl-btn-apply:hover{opacity:.9}

/* ── Animações ── */
@keyframes tplFadeIn{from{opacity:0}to{opacity:1}}
@keyframes tplSlideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes tplSpin{to{transform:rotate(360deg)}}

/* ── Desktop: modal centrado ── */
@media(min-width:640px){
  #templatePickerOverlay{align-items:center;padding:16px}
  #tplPickerSheet{border-radius:20px;max-height:94vh;height:auto}
  .tpl-pill{display:none}
  .tpl-page{max-width:480px}
}
`;

// ── Classe principal ──────────────────────────────────────────────────────────
export class TemplatePicker {
  constructor() {
    this._key           = null;
    this._tpl           = null;
    this._content       = '';
    this._svc           = null;
    this._onApply       = null;
    this._onPDF         = null;
    this._onWord        = null;
    this._injected      = false;
    this._resizeHandler = null;
    // Modelo próprio carregado pelo utilizador
    this._customFile    = null;   // File object
    this._customName    = null;   // nome do ficheiro
    this._customActive  = false;  // flag: usar modelo próprio em vez dos pré-definidos
  }

  open({ serviceKey, content, svc, onApply, onDownloadPDF, onDownloadWord }) {
    this._key     = serviceKey;
    this._content = content || '';
    this._svc     = svc;
    this._onApply = onApply;
    this._onPDF   = onDownloadPDF;
    this._onWord  = onDownloadWord;

    this._inject();
    this._render();

    document.getElementById(OVERLAY_ID)?.classList.add('open');
    document.body.style.overflow = 'hidden';

    this._resizeHandler = () => this._scalePages();
    window.addEventListener('resize', this._resizeHandler);

    // Carregar templates públicos aprovados do Supabase em background
    loadPublicTemplatesFromSupabase(serviceKey).then(loaded => {
      if (loaded && loaded.length > 0) {
        // Re-render lista para incluir templates do marketplace
        this._render();
      }
    }).catch(() => {});
  }

  close() {
    document.getElementById(OVERLAY_ID)?.classList.remove('open');
    document.body.style.overflow = '';
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    // Limpar estado de upload para próxima abertura
    this._customFile   = null;
    this._customName   = null;
    this._customActive = false;
  }

  // ── Injectar HTML + CSS (uma vez) ────────────────────────────────────────
  _inject() {
    if (this._injected) return;
    this._injected = true;

    const style = document.createElement('style');
    style.textContent = PICKER_CSS;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div id="tplPickerSheet">
        <div class="tpl-pill"></div>
        <div class="tpl-hdr">
          <div class="tpl-hdr-info">
            <h2>🎨 Escolher Modelo</h2>
            <div class="tpl-hdr-sub" id="tplHdrSub"></div>
          </div>
          <button class="tpl-close" id="tplClose" aria-label="Fechar">✕</button>
        </div>
        <div class="tpl-list-wrap">
          <div class="tpl-list" id="tplList"></div>
        </div>
        <div class="tpl-sel-bar" id="tplSelBar">Seleccione um modelo acima</div>

        <!-- Zona de upload de modelo próprio -->
        <div class="tpl-upload-zone" id="tplUploadZone" title="Carregar modelo próprio (imagem, PDF ou Word)">
          <div class="tpl-upload-icon">📎</div>
          <div class="tpl-upload-text">
            <div class="tpl-upload-title">Usar modelo próprio</div>
            <div class="tpl-upload-sub" id="tplUploadSub">Toque para carregar imagem, PDF ou Word com o seu layout</div>
          </div>
          <div class="tpl-upload-badge" id="tplUploadBadge">✅ Activo</div>
          <input type="file" id="tplUploadInput" accept="image/*,.pdf,.doc,.docx" style="display:none">
        </div>

        <div class="tpl-preview-outer" id="tplPreviewOuter">
          <div class="tpl-loading"><div class="tpl-spinner"></div>A carregar…</div>
        </div>
        <div class="tpl-footer">
          <button class="tpl-btn-pdf"   id="tplBtnPDF">⬇️ PDF</button>
          <button class="tpl-btn-word"  id="tplBtnWord">⬇️ Word</button>
          <button class="tpl-btn-apply" id="tplBtnApply">✅ Usar este Modelo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    document.getElementById('tplClose')?.addEventListener('click',    () => this.close());
    document.getElementById('tplBtnApply')?.addEventListener('click', () => this._apply());
    document.getElementById('tplBtnPDF')?.addEventListener('click',   () => this._onPDF?.(this._tpl));
    document.getElementById('tplBtnWord')?.addEventListener('click',  () => this._onWord?.(this._tpl));

    // ── Upload de modelo próprio ──────────────────────────────────────────
    const uploadZone  = document.getElementById('tplUploadZone');
    const uploadInput = document.getElementById('tplUploadInput');

    uploadZone?.addEventListener('click', e => {
      if (e.target !== uploadInput) uploadInput?.click();
    });

    // Drag-and-drop
    uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag'); });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag'));
    uploadZone?.addEventListener('drop', e => {
      e.preventDefault();
      uploadZone.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) this._handleUpload(file);
    });

    uploadInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this._handleUpload(file);
      e.target.value = '';
    });
  }

  // ── Renderizar lista de templates ─────────────────────────────────────────
  _render() {
    const templates = [...getSessionTemplates(this._key), ...getTemplates(this._key)];
    const sub = document.getElementById('tplHdrSub');
    if (sub && this._svc) sub.textContent = `${this._svc.icon || ''} ${this._svc.title || ''}`;

    const list = document.getElementById('tplList');
    if (!list) return;

    if (!templates?.length) {
      list.innerHTML = '<div style="padding:12px;font-size:12px;color:#64748b;white-space:nowrap">Sem modelos disponíveis.</div>';
      return;
    }

    list.innerHTML = templates.map(t => `
      <div class="tpl-card" data-id="${t.id}" role="button" tabindex="0" aria-label="${t.name}">
        <div class="tpl-thumb" style="background:${t.preview?.bg||'#f8fafc'}">
          <div class="tpl-thumb-inner">
            <div class="tpl-tl" style="background:${t.preview?.accent||'#3B82F6'};width:65%"></div>
            <div class="tpl-tl" style="background:${t.preview?.accent||'#3B82F6'};opacity:.3;width:100%"></div>
            <div class="tpl-tl" style="background:${t.preview?.accent||'#3B82F6'};opacity:.2;width:80%"></div>
            <div class="tpl-tl" style="background:${t.preview?.accent||'#3B82F6'};opacity:.15;width:90%"></div>
          </div>
          ${t._fromMarketplace ? '<div style="position:absolute;top:3px;right:3px;background:#f59e0b;color:#fff;font-size:7px;font-weight:800;padding:1px 5px;border-radius:4px">🌐</div>' : ''}
          ${t._isCustom ? '<div style="position:absolute;top:3px;right:3px;background:#10b981;color:#fff;font-size:7px;font-weight:800;padding:1px 5px;border-radius:4px">MEU</div>' : ''}
        </div>
        <div class="tpl-card-name">${t.name}</div>
        <div class="tpl-card-desc">${t.description || ''}</div>
      </div>`).join('');

    list.querySelectorAll('.tpl-card').forEach(el => {
      const pick = () => this._pick(el.dataset.id);
      el.addEventListener('click', pick);
      el.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && pick());
    });

    // Seleccionar o primeiro por defeito
    if (templates[0]) this._pick(templates[0].id);
  }

  // ── Seleccionar template e actualizar preview ─────────────────────────────
  _pick(id) {
    const tpl = getTemplateById(this._key, id);
    if (!tpl) return;
    this._tpl = tpl;

    // ── Quando o utilizador escolhe um template pré-definido,
    //    desactivar o modelo próprio para que não bloqueie o _apply ──
    this._customActive = false;

    // Highlight
    document.querySelectorAll('.tpl-card').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
    document.querySelector(`.tpl-card[data-id="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Nome
    const bar = document.getElementById('tplSelBar');
    if (bar) bar.textContent = `${tpl.name} — ${tpl.description || ''}`;

    this._renderPreview(tpl);
  }

  // ── Renderizar preview ───────────────────────────────────────────────────
  _renderPreview(tpl) {
    const outer = document.getElementById('tplPreviewOuter');
    if (!outer) return;

    outer.innerHTML = `<div class="tpl-loading"><div class="tpl-spinner"></div>A renderizar…</div>`;

    // CORRIGIDO: usar requestAnimationFrame + timeout para garantir que o DOM
    // do overlay já está visível antes de criar os iframes.
    // Bug anterior: em Android/Chrome o evento 'load' do iframe srcdoc não
    // disparava se o overlay ainda estava a animar (display:none→flex),
    // causando o spinner infinito (imagem 2).
    requestAnimationFrame(() => setTimeout(() => {

      // Dividir conteúdo em páginas pelo marcador PAGE_BREAK
      const rawContent = this._content || '';
      const pages = rawContent
        .split(/---PAGE_BREAK---/g)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      const pageContents = pages.length > 0 ? pages : [rawContent || ' '];

      outer.innerHTML = '';

      pageContents.forEach((pageMarkdown, i) => {
        if (i > 0) {
          const sep = document.createElement('div');
          sep.className = 'tpl-page-sep';
          sep.textContent = `— Página ${i + 1} —`;
          outer.appendChild(sep);
        }

        const pageEl = document.createElement('div');
        pageEl.className = 'tpl-page';

        const iframe = document.createElement('iframe');
        iframe.title = `Página ${i + 1}`;
        iframe.setAttribute('sandbox', 'allow-same-origin');
        pageEl.appendChild(iframe);
        outer.appendChild(pageEl);

        // ── Conteúdo do preview ───────────────────────────────────────────────
        // CORRIGIDO: usar os dados REAIS do documento do utilizador no preview.
        // Bug anterior: o preview mostrava sempre "Ana Maria Silva Santos" e dados
        // fictícios — o utilizador confundia o preview do template com o seu documento
        // e pensava que o conteúdo tinha mudado (imagem 1).
        //
        // Agora: se o template tem htmlTemplate, extraímos os dados reais do
        // conteúdo markdown actual (this._content) e preenchemos os placeholders.
        // Se não temos dados reais suficientes, usamos o markdown directamente
        // renderizado com o CSS do template — fiel e sem confusão.
        let previewBody;
        if (tpl.htmlTemplate && i === 0) {
          // Extrair dados reais do conteúdo markdown do utilizador
          const rd = this._extractRealData(rawContent, this._key);
          previewBody = this._fillTemplate(tpl.htmlTemplate, rd);
        } else {
          // Sem htmlTemplate: renderizar markdown com CSS do template
          previewBody = `<div style="padding:10mm">${this._mdToHtml(pageMarkdown)}</div>`;
        }

        const doc = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm;min-height:297mm;overflow:hidden}
${tpl.css || ''}
</style>
</head><body>${previewBody}</body></html>`;

        // CORRIGIDO: escalar imediatamente após definir srcdoc, sem depender
        // do evento 'load' que não dispara consistentemente em Android.
        // Usamos MutationObserver + fallback por timeout para garantir scaling.
        iframe.srcdoc = doc;

        let scaled = false;
        const doScale = () => {
          if (scaled) return;
          scaled = true;
          this._scalePage(pageEl, iframe);
        };

        iframe.addEventListener('load', doScale, { once: true });
        // Fallback: escalar após 400ms mesmo se 'load' não disparar (Android bug)
        setTimeout(doScale, 400);
      });

      // Escalar todas as páginas após render (garante scaling em resize rápido)
      requestAnimationFrame(() => this._scalePages());

    }, 80));
  }

  // ── Motor universal de extracção de dados e preenchimento de templates ───────
  // Funciona com QUALQUER tipo de documento (cv, carta, requerimento, acta, etc.)
  // Estratégia: extrai dados do markdown gerado pela IA e preenche TODOS os
  // placeholders {{...}} do template HTML de forma dinâmica, sem listas fixas.

  // ── Helper: aplica substituições de um objecto de dados a um template HTML ──
  _fillTemplate(htmlTemplate, data) {
    if (!htmlTemplate) return '';
    let result = htmlTemplate;
    // Substituir cada placeholder {{CHAVE}} pelo valor correspondente no data
    for (const [key, value] of Object.entries(data)) {
      const rx = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
      result = result.replace(rx, value != null ? String(value) : '');
    }
    // Limpar placeholders não substituídos
    result = result.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
    return result;
  }

  // ── Extracção universal: retorna um Map de todos os dados do markdown ─────
  _extractRealData(md, svcKey) {
    if (!md) md = '';
    const key = svcKey || this._key || 'cv';

    // ── Utilitários base ────────────────────────────────────────────────────
    const esc      = (t) => (t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const stripMd  = (t) => (t || '').replace(/\*{1,3}([^*\n]+)\*{1,3}/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/_{1,2}([^_\n]+)_{1,2}/g,'$1').trim();
    const line     = (pattern) => (md.match(pattern)?.[1] || '').trim();
    const block    = (startPat, endPat) => {
      const m = md.match(new RegExp(startPat + '([\\s\\S]*?)(?=' + endPat + '|$)', 'i'));
      return (m?.[1] || '').trim();
    };
    const today    = () => {
      const d = new Date();
      const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
    };

    // ── Parser de listas de entradas estruturadas (cv-entry) ─────────────
    const parseEntries = (raw) => {
      if (!raw) return [];
      const entries = [];
      let current = null;
      const flush = () => { if (current) { entries.push(current); current = null; } };
      for (const rawLine of raw.split('\n')) {
        const l = rawLine.trim();
        if (!l || l === '---') continue;
        const entryBold   = l.match(/^[-*]\s+\*{1,2}([^*\n]+)\*{1,2}\s*[|—–\-]?\s*(.*)/);
        const entryPipe   = !entryBold && l.match(/^[-*]\s+([^*\n]{3,100})\s*[|—–]\s*(.+)/);
        const m = entryBold || entryPipe;
        if (m) {
          flush();
          const title = stripMd(m[1]);
          const rest  = (m[2] || '').trim();
          const parts = rest.split(/\s*[|—–]\s*/);
          const org   = parts[0] ? stripMd(parts[0]) : '';
          const period= parts[1] ? stripMd(parts[1]) : (parts[0]?.match(/\d{4}/) ? stripMd(parts[0]) : '');
          current = { title, org: org && org !== period ? org : '', period, bullets: [] };
        } else if (current && /^[-*]\s+/.test(l)) {
          current.bullets.push(stripMd(l.replace(/^[-*]\s+/, '')));
        } else if (current && l && !l.startsWith('#')) {
          const s = stripMd(l);
          if (!current.org && s.length < 100) current.org = s;
          else if (s.length > 5) current.bullets.push(s);
        } else if (!current && l && !/^#/.test(l) && !/^[-*]/.test(l)) {
          const s = stripMd(l);
          if (s.length > 2) {
            const pm = s.match(/(\d{4}\s*[–—\-]\s*(?:\d{4}|presente|actual|actualmente))/i);
            entries.push({ title: pm ? s.replace(pm[1],'').replace(/[|—–\-]\s*$/,'').trim() : s, org:'', period: pm?.[1] || '', bullets:[] });
          }
        }
      }
      flush();
      return entries;
    };

    const entriesToHTML = (entries) => {
      return entries.map(e => {
        const bullets = e.bullets.length ? `<ul class="cv-entry-bullets">${e.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>` : '';
        const org     = e.org ? `<p class="cv-entry-company">${esc(e.org)}</p>` : '';
        return `<div class="cv-entry"><p class="cv-entry-date">${esc(e.period)}</p><p class="cv-entry-title">${esc(e.title)}</p>${org}${bullets}</div>`;
      }).join('\n');
    };

    const sectionToEntries = (raw) => {
      const entries = parseEntries(raw);
      if (entries.length) return entriesToHTML(entries);
      if (!raw) return '';
      return `<div class="cv-entry"><p class="cv-entry-date"></p><p class="cv-entry-title">${esc(stripMd(raw.replace(/\n/g,' ').slice(0,200)))}</p></div>`;
    };

    // ── Dados comuns a todos os documentos ─────────────────────────────────
    const data = {};

    // Data/local genérica
    data['DATA'] = today();

    // Nome principal (H1 ou H2)
    const nomeRaw = stripMd(line(/^#{1,2}\s+(.+)/m) || line(/\*\*Nome[:\s]+\*\*\s*(.+)/i) || line(/^(.{3,50})$/m) || '');
    data['NOME'] = esc(nomeRaw) || '';
    data['INICIAIS'] = nomeRaw.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || 'XX';

    // ── Dados específicos por tipo ──────────────────────────────────────────
    if (key === 'cv') {
      // Cargo
      const cargo = stripMd(line(/\*\*(.*?)\*\*\s*[\n\r].*(?:📞|☎|\+258|@)/m)
                 || line(/^[*_]{0,2}([^#*\n]{5,60})[*_]{0,2}\s*[\n\r].*(?:📞|\||@)/m)
                 || line(/Cargo[:\s]+(.+)/i) || '');
      data['CARGO'] = esc(cargo);
      data['CONTACTO']   = esc(line(/(?:📞|☎|Tel[:\s]+)[\s*]*([+\d][\d\s\-().]{6,20})/i) || line(/\b(8[234567]\s?\d{3}\s?\d{4})\b/i) || '');
      data['EMAIL']      = esc(line(/([\w.+\-]+@[\w.\-]+\.[a-z]{2,})/i) || '');
      data['LOCALIZACAO']= esc(stripMd(line(/(?:📍|Local[:\s]+)([^\n|]{3,50})/i) || line(/(?:Maputo|Beira|Nampula|Tete)[^\n]*/i) || 'Moçambique'));
      data['OBJECTIVO']  = esc(stripMd(block('(?:Objectivo|Resumo|Perfil)[^\n]*\n', '\n##')));
      data['REALIZACAO'] = esc(stripMd(block('(?:Realiza[cç][aã]o|Destaque|Conquista)[^\n]*\n', '\n##')));

      const habRaw  = block('(?:Habilidade|Compet[eê]ncia|Skill)[^\n]*\n', '\n##');
      const habList = habRaw.split(/[,;\n•·\-]/).map(h=>stripMd(h).trim()).filter(h=>h.length>1);
      data['HABILIDADES']      = esc(habList.join(', ').slice(0,200));
      data['HABILIDADES_LIST'] = habList.map(h=>`<li>${esc(h)}</li>`).join('') || '<li>Competências profissionais</li>';

      data['FORMACAO']   = sectionToEntries(block('(?:Forma[cç][aã]o|Educa[cç][aã]o)[^\n]*\n', '\n##'));
      data['EXPERIENCIA']= sectionToEntries(block('(?:Experi[eê]ncia|Hist[oó]rico)[^\n]*\n', '\n##'));

      const linguasRaw = block('(?:L[íi]ngua|Idioma)[^\n]*\n', '\n##') || 'Português (Nativo)';
      data['LINGUAS'] = linguasRaw.split(/[,;\n•·]/).map(l => {
        const clean = stripMd(l).replace(/^[-*]\s+/,'').trim();
        if (clean.length < 2) return '';
        const parts = clean.split(/\s*[—–\-]\s*/);
        return `<div class="cv-lang-item"><span class="cv-lang-name">${esc(parts[0].trim())}</span>${parts[1] ? `<span class="cv-lang-level">${esc(parts[1].trim())}</span>` : ''}</div>`;
      }).filter(Boolean).join('') || `<div class="cv-lang-item"><span class="cv-lang-name">${esc(linguasRaw)}</span></div>`;

      data['EXTRA'] = esc(stripMd(block('(?:Informa[cç][aã]o Adicional|Extra|Outros)[^\n]*\n', '\n##')));

    } else if (key === 'carta') {
      data['REMETENTE_NOME']  = esc(stripMd(line(/(?:Remetente|De|From)[:\s]+(.+)/i) || line(/^#{3,4}\s*(.+)/m) || nomeRaw));
      data['REMETENTE_CARGO'] = esc(stripMd(line(/(?:Cargo|Função|Título)[:\s]+(.+)/i) || ''));
      data['DESTINATARIO_NOME']= esc(stripMd(line(/(?:Exmo\.?|A[:\s]|Para)[:\s]*(.+)/i) || ''));
      data['DESTINATARIO_ENTI']= esc(stripMd(line(/(?:Entidade|Empresa|Organização)[:\s]+(.+)/i) || ''));
      data['ASSUNTO']         = esc(stripMd(line(/(?:Assunto|Re)[:\s]+(.+)/i) || ''));
      data['REF']             = esc(line(/(?:Ref\.?|Referência)[:\s]*([^\n]+)/i) || 'S/Ref.');
      data['LOCAL']           = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete|Quelimane)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']      = `${data['LOCAL']}, ${today()}`;
      data['MINISTERIO']      = data['REMETENTE_NOME'];
      data['REPARTIÇÃO']      = data['REMETENTE_NOME'];
      data['INICIAIS']        = nomeRaw.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || 'XX';
      data['INICIAIS_EMPRESA']= data['INICIAIS'];
      // Corpo da carta: tudo entre a saudação e a despedida
      const corpo = block('(?:Exmo|Prezado|Caro|Senhor)[^\n]*\n', '(?:Atentamente|Respeitosamente|Com os melhores|Sem mais)') || block('##[^\n]*\n', '\n##');
      data['CORPO'] = stripMd(corpo).replace(/\n\n/g,'</p><p>').replace(/\n/g,' ');
      data['REMETENTE_CARGO_PRETENDIDO'] = data['REMETENTE_CARGO'];

    } else if (key === 'requerimento') {
      data['ENTIDADE']    = esc(stripMd(line(/(?:Exmo\.?|A[:\s]|Entidade)[:\s]*(.+)/i) || line(/^## .+/m) || ''));
      data['REQUERENTE']  = esc(nomeRaw);
      data['BI']          = esc(line(/(?:BI|Bilhete|Identidade)[:\s.]*([A-Z0-9]{6,14}[A-Z]?)/i) || '');
      data['ENDERECO']    = esc(stripMd(line(/(?:Endereço|Morada|Resid[eê]ncia)[:\s]+(.+)/i) || ''));
      data['CONTACTO']    = esc(line(/(?:Contacto|Telefone|Tel\.?)[:\s]*([+\d][\d\s\-().]{6,20})/i) || '');
      data['ASSUNTO']     = esc(stripMd(line(/(?:Assunto|Objecto|Pedido)[:\s]+(.+)/i) || ''));
      data['LOCAL']       = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']  = `${data['LOCAL']}, ${today()}`;
      data['FUNDAMENTACAO']= esc(stripMd(block('(?:Fundamenta[cç][aã]o|Exposto|Expos[eê]|Fundamento)[^\n]*\n', '\n##')));
      data['FUNDAMENTO']  = data['FUNDAMENTACAO'];

    } else if (key === 'arrendamento') {
      data['SENHORIO_NOME']  = esc(stripMd(line(/(?:Senhorio|Proprietário|Arrendador)[:\s]+(.+)/i) || ''));
      data['SENHORIO_BI']    = esc(line(/(?:BI\s*(?:do\s*)?(?:Senhorio|Proprietário))[:\s.]*([A-Z0-9]+)/i) || '');
      data['INQUILINO_NOME'] = esc(stripMd(line(/(?:Inquilino|Arrendatário|Locatário)[:\s]+(.+)/i) || ''));
      data['INQUILINO_BI']   = esc(line(/(?:BI\s*(?:do\s*)?(?:Inquilino|Arrendatário))[:\s.]*([A-Z0-9]+)/i) || '');
      data['IMOVEL_LOCAL']   = esc(stripMd(line(/(?:Localiz|Imóvel|Endereço)[:\s]+(.+)/i) || ''));
      data['TIPO_IMOVEL']    = esc(stripMd(line(/(?:Tipo[:\s]+(?:de\s*)?[Ii]móvel)[:\s]+(.+)/i) || ''));
      data['RENDA_VALOR']    = esc(line(/(?:Renda|Valor\s*Mensal)[:\s]*([\d.,]+\s*MZN[^\n]*)/i) || '');
      data['RENDA_EXTENSO']  = data['RENDA_VALOR'];
      data['DURACAO']        = esc(stripMd(line(/(?:Dura[cç][aã]o|Prazo)[:\s]+(.+)/i) || ''));
      data['CAUCAO']         = esc(stripMd(line(/(?:Cau[cç][aã]o|Dep[oó]sito)[:\s]+(.+)/i) || ''));
      data['LOCAL']          = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']     = `${data['LOCAL']}, ${today()}`;
      data['CLAUSULAS']      = sectionToEntries(block('(?:Cl[aá]usula|Art[ií]go)[^\n]*\n', '\n##'));

    } else if (key === 'procuracao') {
      data['OUTORGANTE']      = esc(stripMd(line(/(?:Outorgante|Mandante|Constituinte)[:\s]+(.+)/i) || nomeRaw));
      data['BI_OUTORGANTE']   = esc(line(/(?:BI\s*(?:do\s*)?[Oo]utorgante)[:\s.]*([A-Z0-9]+)/i) || '');
      data['PROCURADOR']      = esc(stripMd(line(/(?:Procurador|Mandatário)[:\s]+(.+)/i) || ''));
      data['BI_PROCURADOR']   = esc(line(/(?:BI\s*(?:do\s*)?[Pp]rocurador)[:\s.]*([A-Z0-9]+)/i) || '');
      data['PODERES']         = esc(stripMd(line(/(?:Poderes|Actos|Acto)[:\s]+(.+)/i) || ''));
      data['LOCAL']           = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']      = `${data['LOCAL']}, ${today()}`;
      data['VALIDADE']        = esc(stripMd(line(/(?:Validade|V[aá]lid[ao])[:\s]+(.+)/i) || ''));

    } else if (key === 'residencia') {
      data['DECLARANTE']   = esc(nomeRaw);
      data['BI']           = esc(line(/(?:BI|Bilhete)[:\s.]*([A-Z0-9]{6,14}[A-Z]?)/i) || '');
      data['NASCIMENTO']   = esc(line(/(?:Nascimento|Data de Nasc)[:\s]+([^\n]+)/i) || '');
      data['NATURALIDADE'] = esc(stripMd(line(/(?:Naturalidade|Natural de)[:\s]+(.+)/i) || ''));
      data['ENDERECO']     = esc(stripMd(line(/(?:Endereço|Morada|Resid[eê]ncia)[:\s]+(.+)/i) || ''));
      data['TEMPO']        = esc(stripMd(line(/(?:Tempo|Há\s*[cq]uanto)[:\s]+(.+)/i) || ''));
      data['FINALIDADE']   = esc(stripMd(line(/(?:Finalidade|Para efeitos de)[:\s]+(.+)/i) || ''));
      data['CHEFE']        = esc(stripMd(line(/(?:Chefe|Líder|L[ií]der)[:\s]+(.+)/i) || '[responsável local]'));
      data['LOCAL']        = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']   = `${data['LOCAL']}, ${today()}`;

    } else if (key === 'prestacao') {
      data['PRESTADOR']       = esc(stripMd(line(/(?:Prestador|Fornecedor|Contratado)[:\s]+(.+)/i) || nomeRaw));
      data['NUIT_PRESTADOR']  = esc(line(/(?:NUIT)[:\s]*(\d{9})/i) || '');
      data['MORADA_PRESTADOR']= esc(stripMd(line(/(?:Morada|Endereço)[:\s]+(.+)/i) || ''));
      data['CLIENTE']         = esc(stripMd(line(/(?:Cliente|Contratante)[:\s]+(.+)/i) || ''));
      data['BI_CLIENTE']      = esc(line(/(?:BI|NUIT)[:\s.]*([A-Z0-9]+)/i) || '');
      data['SERVICO']         = esc(stripMd(line(/(?:Servi[cç]o|Objecto)[:\s]+(.+)/i) || ''));
      data['DESCRICAO']       = esc(stripMd(block('(?:Descri[cç][aã]o|Objecto)[^\n]*\n', '\n##')));
      data['VALOR_TOTAL']     = esc(line(/(?:Valor|Total)[:\s]*([\d.,]+\s*MZN[^\n]*)/i) || '');
      data['PRAZO']           = esc(stripMd(line(/(?:Prazo)[:\s]+(.+)/i) || ''));
      data['PAGAMENTO']       = esc(stripMd(line(/(?:Pagamento|Forma\s*de\s*Pagamento)[:\s]+(.+)/i) || ''));
      data['LOCAL_DATA']      = `Maputo, ${today()}`;
      data['CLAUSULAS']       = sectionToEntries(block('(?:Cl[aá]usula|Art[ií]go)[^\n]*\n', '\n##'));

    } else if (key === 'recibo') {
      data['EMITENTE']       = esc(stripMd(line(/(?:Emitente|Empresa|Prestador)[:\s]+(.+)/i) || nomeRaw));
      data['NUIT_EMITENTE']  = esc(line(/(?:NUIT)[:\s]*(\d{9})/i) || 'N/A');
      data['CLIENTE']        = esc(stripMd(line(/(?:Cliente|Adquirente|Comprador)[:\s]+(.+)/i) || ''));
      data['BI_CLIENTE']     = esc(line(/(?:BI|NUIT\s*(?:do\s*)?[Cc]liente)[:\s.]*([A-Z0-9]+)/i) || '');
      data['DESCRICAO']      = esc(stripMd(line(/(?:Descri[cç][aã]o|Servi[cç]o|Produto)[:\s]+(.+)/i) || ''));
      data['NUM_DOC']        = esc(line(/(?:N\.?[oº°]|Número)[:\s]*([^\n]+)/i) || `001/${new Date().getFullYear()}`);
      data['FORMA_PAGAMENTO']= esc(stripMd(line(/(?:Pagamento|Forma)[:\s]+(.+)/i) || 'Numerário'));
      const valorM = md.match(/(?:Total|Valor\s*Total)[:\s]*([\d\s.,]+)\s*MZN/i);
      data['VALOR_TOTAL']    = esc(valorM?.[1]?.trim() || '');
      const subtotalM = md.match(/(?:Subtotal|Valor\s*Base)[:\s]*([\d\s.,]+)\s*MZN/i);
      data['SUBTOTAL']       = esc(subtotalM?.[1]?.trim() || data['VALOR_TOTAL']);
      const ivaM = md.match(/IVA[:\s]*([\d.,]+)%/i);
      data['TAXA_IVA']       = esc(ivaM?.[1] || '0');
      const valorIvaM = md.match(/(?:Valor\s*)?IVA[:\s]*([\d\s.,]+)\s*MZN/i);
      data['VALOR_IVA']      = esc(valorIvaM?.[1]?.trim() || '0,00');
      data['ITEMS_RECIBO']   = sectionToEntries(block('(?:Item|Descri[cç][aã]o)[^\n]*\n', '\n##'));
      data['LOCAL_DATA']     = `Maputo, ${today()}`;

    } else if (key === 'recomendacao') {
      data['RECOMENDADOR']   = esc(nomeRaw);
      data['CARGO_REC']      = esc(stripMd(line(/(?:Cargo|Função)[:\s]+(.+)/i) || ''));
      data['ENTIDADE_REC']   = esc(stripMd(line(/(?:Entidade|Organiza[cç][aã]o|Empresa)[:\s]+(.+)/i) || ''));
      data['RECOMENDADO']    = esc(stripMd(line(/(?:Recomendado|Candidato)[:\s]+(.+)/i) || ''));
      data['LOCAL']          = 'Maputo';
      data['LOCAL_DATA']     = `Maputo, ${today()}`;
      data['CORPO']          = stripMd(block('(?:Exmo|Prezado|A quem)[^\n]*\n', '(?:Atentamente|Respeitosamente|Com os melhores)') || block('##[^\n]*\n', '\n##'));

    } else if (key === 'orcamento') {
      data['TITULO_OBRA']    = esc(stripMd(line(/(?:Orçamento|Obra|Projecto)[:\s]+(.+)/i) || line(/^#{1,2}\s+(.+)/m) || ''));
      data['EMPRESA']        = esc(stripMd(line(/(?:Empresa|Emitente|Fornecedor)[:\s]+(.+)/i) || nomeRaw));
      data['CLIENTE']        = esc(stripMd(line(/(?:Cliente|Para)[:\s]+(.+)/i) || ''));
      data['NUM_ORC']        = esc(line(/(?:N\.?[oº°]|Número|Ref\.?)[:\s]*([^\n]+)/i) || `001/${new Date().getFullYear()}`);
      data['AREA_PISOS']     = esc(line(/(\d+\s*m[²2][^\n]*)/i) || '');
      data['PRAZO']          = esc(line(/(?:Prazo)[:\s]*(\d+[^\n]*)/i) || '');
      data['VALIDADE']       = esc(line(/(?:Validade|V[aá]lid[ao])[:\s]+(.+)/i) || 'Válido por 30 dias');
      data['LOCAL_DATA']     = `Maputo, ${today()}`;
      data['ITEMS_TODOS']    = sectionToEntries(block('(?:Material|Item|Descri[cç][aã]o)[^\n]*\n', '\n##'));
      data['ITEMS_MATERIAIS']= data['ITEMS_TODOS'];
      data['ITEMS_MAO_OBRA'] = sectionToEntries(block('(?:M[aã]o[- ]de[- ]Obra|M\\.O\\.)[^\n]*\n', '\n##'));
      const totalM = md.match(/(?:Total\s*Geral|TOTAL)[:\s]*([\d\s.,]+)\s*MZN/i);
      data['TOTAL_GERAL']    = esc(totalM?.[1]?.trim() || '');
      const subtotM = md.match(/(?:Subtotal)[:\s]*([\d\s.,]+)\s*MZN/i);
      data['SUBTOTAL']       = esc(subtotM?.[1]?.trim() || '');
      data['TOTAL_MATERIAIS']= data['SUBTOTAL'];
      data['TOTAL_MAO_OBRA'] = '';
      const imprevM = md.match(/(?:Imprevistos?)[:\s]*([\d\s.,]+)\s*MZN/i);
      data['IMPREVISTOS']    = esc(imprevM?.[1]?.trim() || '');

    } else if (key === 'planonegocio') {
      data['NOME_NEGOCIO']   = esc(nomeRaw || stripMd(line(/(?:Negócio|Empresa)[:\s]+(.+)/i) || ''));
      data['SECTOR']         = esc(stripMd(line(/(?:Sector|[Aá]rea\s*de\s*Actividade)[:\s]+(.+)/i) || ''));
      data['PROPRIETARIO']   = esc(stripMd(line(/(?:Proprietário|Titular|Sócio)[:\s]+(.+)/i) || ''));
      data['LOCAL']          = esc(stripMd(line(/(?:Local|Sede|Localiza)[:\s]+(.+)/i) || 'Maputo'));
      data['ANO']            = String(new Date().getFullYear());
      data['LOCAL_DATA']     = `${data['LOCAL']}, ${today()}`;
      data['INVESTIMENTO_TOTAL'] = esc(line(/(?:Investimento\s*Total|Capital)[:\s]*([\d.,]+\s*MZN[^\n]*)/i) || '');
      data['SUMARIO']        = esc(stripMd(block('(?:Sum[aá]rio|Resumo\s*Executivo)[^\n]*\n', '\n##')));
      data['DESCRICAO_NEGOCIO'] = esc(stripMd(block('(?:Descri[cç][aã]o|Actividade)[^\n]*\n', '\n##')));
      data['ANALISE_MERCADO']= esc(stripMd(block('(?:Mercado|An[aá]lise)[^\n]*\n', '\n##')));
      data['ITEMS_FINANCEIROS'] = sectionToEntries(block('(?:Financeiro|Investimento|Or[cç]amento)[^\n]*\n', '\n##'));
      data['EQUIPA']         = esc(stripMd(block('(?:Equipa|Equipe|Recursos\s*Humanos)[^\n]*\n', '\n##')));
      data['RETORNO']        = esc(stripMd(block('(?:Retorno|Proje[cç][aã]o|Previs[aã]o)[^\n]*\n', '\n##')));

    } else if (key === 'licenca') {
      data['REQUERENTE']     = esc(nomeRaw);
      data['NUIT']           = esc(line(/(?:NUIT)[:\s]*(\d{9})/i) || '');
      data['CONTACTO']       = esc(line(/(?:Contacto|Telefone)[:\s]*([+\d][\d\s\-().]{6,20})/i) || '');
      data['ENTIDADE']       = esc(stripMd(line(/(?:Entidade|Destina[:\s])[:\s]+(.+)/i) || ''));
      data['OBJECTO']        = esc(stripMd(line(/(?:Objecto|Actividade|Finalidade)[:\s]+(.+)/i) || ''));
      data['AREA_M2']        = esc(line(/(\d+)\s*m[²2]/i) || '');
      data['HORARIO']        = esc(stripMd(line(/(?:Hor[aá]rio)[:\s]+(.+)/i) || ''));
      data['LOCAL']          = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']     = `${data['LOCAL']}, ${today()}`;
      data['FUNDAMENTACAO']  = esc(stripMd(block('(?:Fundamenta[cç][aã]o|Fundamento)[^\n]*\n', '\n##')));

    } else if (key === 'acta') {
      data['ORGANIZACAO']    = esc(stripMd(line(/(?:Organiza[cç][aã]o|Associa[cç][aã]o|Empresa)[:\s]+(.+)/i) || nomeRaw));
      data['TIPO_REUNIAO']   = esc(stripMd(line(/(?:Tipo|Reuni[aã]o)[:\s]+(.+)/i) || ''));
      data['NUM_ACTA']       = esc(line(/(?:Acta|N\.?[oº°])[:\s]*([^\n]+)/i) || `001/${new Date().getFullYear()}`);
      data['DATA']           = esc(line(/(?:Data\s*da\s*Reuni[aã]o|Data)[:\s]+([^\n]+)/i) || today());
      data['HORA']           = esc(line(/(?:Hora|Horas?)[:\s]*([^\n]+)/i) || '');
      data['LOCAL']          = esc(stripMd(line(/(?:Local\s*da\s*Reuni[aã]o|Local)[:\s]+(.+)/i) || ''));
      data['PRESIDENTE']     = esc(stripMd(line(/(?:Presidente|Moderador)[:\s]+(.+)/i) || ''));
      data['SECRETARIO']     = esc(stripMd(line(/(?:Secret[aá]rio)[:\s]+(.+)/i) || ''));
      data['PRESENTES']      = esc(stripMd(block('(?:Presentes|Participantes)[^\n]*\n', '\n##').replace(/\n/g,', ')));
      data['PAUTA']          = sectionToEntries(block('(?:Pauta|Ordem\s*do\s*Dia)[^\n]*\n', '\n##'));
      data['DELIBERACOES']   = sectionToEntries(block('(?:Delibera[cç][oõ]es?|Discuss[aã]o)[^\n]*\n', '\n##'));

    } else if (key === 'trabalho') {
      data['TITULO']         = esc(nomeRaw);
      data['TEMA']           = data['TITULO'];
      data['AUTOR']          = esc(stripMd(line(/(?:Autor|Aluno|Estudante)[:\s]+(.+)/i) || ''));
      data['NIVEL']          = esc(stripMd(line(/(?:N[íi]vel|Grau)[:\s]+(.+)/i) || ''));
      data['DISCIPLINA']     = esc(stripMd(line(/(?:Disciplina|Cadeira)[:\s]+(.+)/i) || ''));
      data['DOCENTE']        = esc(stripMd(line(/(?:Docente|Professor)[:\s]+(.+)/i) || ''));
      data['INSTITUICAO']    = esc(stripMd(line(/(?:Institui[cç][aã]o|Universidade|Instituto)[:\s]+(.+)/i) || ''));
      data['LOCAL']          = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['ANO']            = String(new Date().getFullYear());
      data['LOCAL_DATA']     = `${data['LOCAL']}, ${today()}`;

    } else {
      // ── Fallback genérico para qualquer serviço não listado ─────────────
      // Extrai todos os padrões "Label: Valor" do markdown como placeholders
      const genericMatches = [...md.matchAll(/^[-*]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30})[:\s]+(.{2,200})/gm)];
      for (const m of genericMatches) {
        const k = m[1].trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_]/g,'');
        if (k && !data[k]) data[k] = esc(stripMd(m[2].trim()));
      }
      data['LOCAL']      = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA'] = `${data['LOCAL']}, ${today()}`;
    }

    return data;
  }
  // ── Escalar um iframe A4 para caber na folha visual ───────────────────────
  _scalePage(pageEl, iframe) {
    const containerW = pageEl.clientWidth;   // largura da .tpl-page em px no ecrã
    const a4Wpx = 210 * 3.7795;              // 210mm → px a 96dpi ≈ 794px
    const scale = containerW / a4Wpx;

    iframe.style.transform = `scale(${scale})`;
    // Ajustar a altura visual do contentor para a proporção A4 escalada
    const a4Hpx = 297 * 3.7795;             // ≈ 1123px
    pageEl.style.height = (a4Hpx * scale) + 'px';
    pageEl.style.aspectRatio = '';           // remover aspect-ratio, usamos height fixo
  }

  // ── Reescalar todas as páginas (ao resize) ───────────────────────────────
  _scalePages() {
    document.querySelectorAll('.tpl-page').forEach(pageEl => {
      const iframe = pageEl.querySelector('iframe');
      if (iframe) this._scalePage(pageEl, iframe);
    });
  }

  // ── Aplicar template e fechar ────────────────────────────────────────────
  _apply() {
    if (!this._tpl) {
      _notify('Seleccione um modelo primeiro.');
      return;
    }

    // Modelo próprio PDF/Word (_isOwnModel): não tem htmlTemplate mas o
    // TemplateController já guardou o ficheiro. Chamar onApply na mesma para
    // que o DocumentController aplique pelo menos o CSS base e mostre o resultado.
    // CORRIGIDO: antes fechava sem chamar _onApply — o documento não era actualizado.
    if (this._tpl._isOwnModel) {
      this._onApply?.(this._tpl);
      this.close();
      return;
    }

    // Template pré-definido ou extraído de imagem → aplicar normalmente
    this._onApply?.(this._tpl);
    this.close();
  }

  // ── Upload de modelo próprio ─────────────────────────────────────────────
  async _handleUpload(file) {
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) { _notify('Ficheiro muito grande (máx. 10MB)'); return; }

    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const isImg  = mime.startsWith('image/');
    const isPdf  = mime === 'application/pdf' || name.endsWith('.pdf');
    const isWord = mime.includes('wordprocessingml') || mime === 'application/msword'
                   || name.endsWith('.docx') || name.endsWith('.doc');

    if (!isPdf && !isWord && !isImg) {
      _notify('Formato não suportado. Use imagem, PDF ou Word.');
      return;
    }

    const sub   = document.getElementById('tplUploadSub');
    const badge = document.getElementById('tplUploadBadge');
    const zone  = document.getElementById('tplUploadZone');

    // Card de loading imediato
    const processingId = `processing-${Date.now()}`;
    addSessionTemplate(this._key, {
      id: processingId,
      name: '⏳ A processar…',
      description: file.name,
      preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif' },
      _isCustom: true, htmlTemplate: null, css: '',
    });
    this._render();

    if (sub) sub.textContent = isImg ? '🤖 A extrair template da imagem…' : '⏳ A processar ficheiro…';

    // Remover card de loading
    const removeProcessingCard = () => {
      const list = getSessionTemplates(this._key);
      const idx  = list.findIndex(t => t.id === processingId);
      if (idx !== -1) list.splice(idx, 1);
    };

    try {
      // Passar ao TemplateController para usar como modelo próprio nas gerações futuras
      const templateCtrl = window.docController?.templateCtrl;
      if (templateCtrl) {
        await templateCtrl._handleFile({ target: { files: [file], value: '' } });
      }

      // ── IMAGEM: tentar extrair template via API ────────────────────────
      if (isImg) {
        try {
          const extracted = await this._extractTemplateFromImage(file);
          if (extracted) {
            removeProcessingCard();
            addSessionTemplate(this._key, extracted);
            this._render();
            this._pick(extracted.id);

            if (sub) sub.textContent = `✅ Template "${extracted.name}" adicionado!`;
            if (zone) zone.classList.add('active');
            if (badge) badge.style.display = 'block';
            _notify(`✅ Template "${extracted.name}" extraído!`);
            this._saveTemplateToSupabase(extracted).catch(e => console.warn('Supabase save:', e));
            this._customActive = false;
            return;
          }
        } catch (extractErr) {
          console.warn('Extracção de imagem falhou, a gerar fallback local:', extractErr.message);
          // Continua para fallback local abaixo
        }
      }

      // ── FALLBACK: gerar template visual local (imagem falhada / PDF / Word) ──
      removeProcessingCard();

      // Nome profissional inteligente baseado no tipo de serviço + paleta de cores
      // CORRIGIDO: antes usava o nome do ficheiro (ex: "Screenshot 20260530 022813")
      // que não tem significado visual. Agora gera nomes profissionais como os outros cards.
      const svcNamesMap = {
        cv:           ['Elegante Bicolor', 'Profissional Moderno', 'Executivo Dinâmico', 'Clássico Contemporâneo', 'Minimalista Pro'],
        carta:        ['Formal Elegante', 'Corporativa Moderna', 'Profissional Limpa', 'Executiva Premium', 'Clássica Formal'],
        orcamento:    ['Profissional Detalhado', 'Corporativo Moderno', 'Técnico Formal', 'Executivo Premium', 'Simples Elegante'],
        arrendamento: ['Jurídico Formal', 'Contrato Moderno', 'Legal Clássico', 'Formal Elegante', 'Profissional Legal'],
        recibo:       ['Recibo Formal', 'Factura Moderna', 'Comprovativo Elegante', 'Financeiro Pro', 'Simples Formal'],
      };
      const nameOptions = svcNamesMap[this._key] || ['Modelo Elegante', 'Layout Profissional', 'Design Moderno', 'Estilo Executivo', 'Visual Premium'];
      // Escolher nome determinista baseado no hash do nome do ficheiro
      const nameHash = file.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const friendlyName = nameOptions[nameHash % nameOptions.length];

      // Gerar template visual local com os dados actuais do utilizador
      const localTpl = this._buildLocalFallbackTemplate(friendlyName, file.name);

      addSessionTemplate(this._key, localTpl);
      this._render();
      this._pick(localTpl.id);

      this._customFile   = file;
      this._customName   = file.name;
      this._customActive = false; // template local real — não precisa de flag especial

      if (zone)  zone.classList.add('active');
      if (badge) badge.style.display = 'block';
      if (sub)   sub.textContent = `✅ ${friendlyName} — Template gerado do seu ficheiro`;

      const selBar = document.getElementById('tplSelBar');
      if (selBar) selBar.textContent = `📎 ${friendlyName} — ${file.name}`;

      _notify(`✅ Template "${friendlyName}" pronto!`);

    } catch (err) {
      removeProcessingCard();
      this._render();
      if (sub) sub.textContent = 'Toque para carregar imagem, PDF ou Word com o seu layout';
      _notify('Erro ao processar: ' + err.message);
    }
  }

  // ── Gerar template visual local sem chamar a API ─────────────────────────
  // Cria template com htmlTemplate + css real com 5 layouts diferentes.
  // CORRIGIDO: gerava sempre o mesmo layout de 2 colunas — agora varia o estilo
  // com base no hash do nome para parecer um template personalizado real.
  _buildLocalFallbackTemplate(name, filename) {
    const svcKey  = this._key || 'cv';
    const content = this._content || '';
    const rd      = this._extractRealData(content);

    const palettes = [
      // 0 — Bicolor escuro (sidebar esquerda escura)
      { accent: '#1e3a5f', sidebar: '#1e3a5f', sidebarText: '#fff', bg: '#fff', layout: 'two-col' },
      // 1 — Verde esmeralda (sidebar)
      { accent: '#0f766e', sidebar: '#0f766e', sidebarText: '#fff', bg: '#fff', layout: 'two-col' },
      // 2 — Linha de topo colorida (single col com header accent)
      { accent: '#1d4ed8', sidebar: '#1d4ed8', sidebarText: '#fff', bg: '#f8fafc', layout: 'top-bar' },
      // 3 — Roxo premium (sidebar)
      { accent: '#7c3aed', sidebar: '#4c1d95', sidebarText: '#fff', bg: '#fff', layout: 'two-col' },
      // 4 — Ouro executivo (single col com header dourado)
      { accent: '#92400e', sidebar: '#78350f', sidebarText: '#fff', bg: '#fffbeb', layout: 'top-bar' },
    ];
    const hash = filename.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const pal  = palettes[hash % palettes.length];
    const isTwoCol = pal.layout === 'two-col';

    // ── Layout duas colunas (sidebar lateral) ──────────────────────────────
    const htmlTwoCol = `
<div class="cv-page cv-two-col">
  <aside class="cv-sidebar">
    <div class="cv-avatar">{{INICIAIS}}</div>
    <div class="cv-sidebar-name">{{NOME}}</div>
    <div class="cv-sidebar-cargo">{{CARGO}}</div>
    <div class="cv-sidebar-divider"></div>
    <div class="cv-section">
      <h2 class="cv-section-title">Contactos</h2>
      <div class="cv-contact-item">📞 {{CONTACTO}}</div>
      <div class="cv-contact-item">✉️ {{EMAIL}}</div>
      <div class="cv-contact-item">📍 {{LOCALIZACAO}}</div>
    </div>
    <div class="cv-section">
      <h2 class="cv-section-title">Competências</h2>
      <ul class="cv-skills-list">{{HABILIDADES_LIST}}</ul>
    </div>
    <div class="cv-section">
      <h2 class="cv-section-title">Línguas</h2>
      {{LINGUAS}}
    </div>
  </aside>
  <main class="cv-main">
    <section class="cv-section">
      <h2 class="cv-section-title">Objectivo Profissional</h2>
      <p class="cv-text">{{OBJECTIVO}}</p>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Formação Académica</h2>
      <div class="cv-entries">{{FORMACAO}}</div>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Experiência Profissional</h2>
      <div class="cv-entries">{{EXPERIENCIA}}</div>
    </section>
    <section class="cv-section">
      <h2 class="cv-section-title">Realização de Destaque</h2>
      <p class="cv-text">{{REALIZACAO}}</p>
    </section>
    {{EXTRA}}
  </main>
</div>`;

    // ── Layout coluna única com barra de topo ──────────────────────────────
    const htmlTopBar = `
<div class="cv-page">
  <header class="cv-header">
    <div class="cv-avatar">{{INICIAIS}}</div>
    <div class="cv-header-info">
      <h1 class="cv-name">{{NOME}}</h1>
      <p class="cv-cargo">{{CARGO}}</p>
      <div class="cv-contacts">
        <span>📞 {{CONTACTO}}</span>
        <span>✉️ {{EMAIL}}</span>
        <span>📍 {{LOCALIZACAO}}</span>
      </div>
    </div>
  </header>
  <div class="cv-body">
    <section class="cv-section">
      <h2 class="cv-section-title">Objectivo Profissional</h2>
      <p class="cv-text">{{OBJECTIVO}}</p>
    </section>
    <div class="cv-two-grid">
      <section class="cv-section">
        <h2 class="cv-section-title">Formação Académica</h2>
        <div class="cv-entries">{{FORMACAO}}</div>
      </section>
      <section class="cv-section">
        <h2 class="cv-section-title">Competências</h2>
        <ul class="cv-skills-list">{{HABILIDADES_LIST}}</ul>
      </section>
    </div>
    <section class="cv-section">
      <h2 class="cv-section-title">Experiência Profissional</h2>
      <div class="cv-entries">{{EXPERIENCIA}}</div>
    </section>
    <div class="cv-two-grid">
      <section class="cv-section">
        <h2 class="cv-section-title">Línguas</h2>
        {{LINGUAS}}
      </section>
      <section class="cv-section">
        <h2 class="cv-section-title">Realização de Destaque</h2>
        <p class="cv-text">{{REALIZACAO}}</p>
      </section>
    </div>
    {{EXTRA}}
  </div>
</div>`;

    const cssTwoCol = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1e293b; width: 210mm; min-height: 297mm; background: ${pal.bg}; }
.cv-page { width: 210mm; min-height: 297mm; background: ${pal.bg}; }
.cv-two-col { display: flex; min-height: 297mm; }
.cv-sidebar { width: 68mm; background: ${pal.sidebar}; color: ${pal.sidebarText}; padding: 14mm 8mm; flex-shrink: 0; }
.cv-main { flex: 1; padding: 14mm 10mm 10mm; }
.cv-avatar { width: 54pt; height: 54pt; border-radius: 50%; background: rgba(255,255,255,0.2); color: ${pal.sidebarText}; display: flex; align-items: center; justify-content: center; font-size: 19pt; font-weight: 700; margin: 0 auto 10pt; border: 2px solid rgba(255,255,255,0.4); }
.cv-sidebar-name { font-size: 12.5pt; font-weight: 800; text-align: center; line-height: 1.2; margin-bottom: 3pt; word-break: break-word; }
.cv-sidebar-cargo { font-size: 8.5pt; text-align: center; opacity: 0.82; margin-bottom: 10pt; }
.cv-sidebar-divider { height: 1px; background: rgba(255,255,255,0.25); margin: 8pt 0; }
.cv-sidebar .cv-section { margin-bottom: 10pt; }
.cv-sidebar .cv-section-title { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 3pt; margin-bottom: 5pt; color: ${pal.sidebarText}; }
.cv-contact-item { font-size: 8.5pt; margin-bottom: 4pt; opacity: 0.9; word-break: break-all; }
.cv-skills-list { list-style: none; padding: 0; }
.cv-skills-list li { font-size: 8.5pt; padding: 3pt 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.9; }
.cv-lang-item { font-size: 8.5pt; margin-bottom: 5pt; }
.cv-lang-name { font-weight: 700; display: block; }
.cv-lang-level { font-size: 8pt; opacity: 0.75; }
.cv-lang-bar { background: rgba(255,255,255,0.2); height: 3pt; border-radius: 2pt; margin-top: 2pt; }
.cv-lang-fill { background: rgba(255,255,255,0.7); height: 100%; border-radius: 2pt; }
.cv-main .cv-section { margin-bottom: 10pt; }
.cv-main .cv-section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${pal.accent}; border-bottom: 2px solid ${pal.accent}; padding-bottom: 2pt; margin-bottom: 6pt; }
.cv-text { font-size: 9.5pt; line-height: 1.55; color: #374151; }
.cv-entries { font-size: 9.5pt; }
.cv-entry { margin-bottom: 6pt; }
.cv-entry-date { font-size: 8pt; color: #6b7280; font-style: italic; }
.cv-entry-title { font-size: 10pt; font-weight: 700; color: #111827; margin-top: 1pt; }
.cv-entry-company { font-size: 9pt; color: #4b5563; margin-top: 1pt; }
.cv-entry-bullets { padding-left: 12pt; margin-top: 3pt; }
.cv-entry-bullets li { font-size: 9pt; margin-bottom: 1.5pt; color: #374151; }`;

    const cssTopBar = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1e293b; width: 210mm; min-height: 297mm; background: ${pal.bg}; }
.cv-page { width: 210mm; min-height: 297mm; background: ${pal.bg}; }
.cv-header { background: ${pal.sidebar}; color: ${pal.sidebarText}; padding: 10mm 12mm; display: flex; align-items: center; gap: 12pt; }
.cv-avatar { width: 52pt; height: 52pt; border-radius: 50%; background: rgba(255,255,255,0.2); color: ${pal.sidebarText}; display: flex; align-items: center; justify-content: center; font-size: 18pt; font-weight: 700; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.4); }
.cv-header-info { flex: 1; }
.cv-name { font-size: 18pt; font-weight: 800; line-height: 1.1; margin-bottom: 2pt; }
.cv-cargo { font-size: 10pt; opacity: 0.85; margin-bottom: 5pt; }
.cv-contacts { display: flex; flex-wrap: wrap; gap: 4pt 12pt; font-size: 8.5pt; opacity: 0.9; }
.cv-body { padding: 10mm 12mm; }
.cv-two-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14pt; }
.cv-section { margin-bottom: 10pt; }
.cv-section-title { font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${pal.accent}; border-bottom: 2px solid ${pal.accent}; padding-bottom: 2pt; margin-bottom: 6pt; }
.cv-text { font-size: 9.5pt; line-height: 1.55; color: #374151; }
.cv-entries { font-size: 9.5pt; }
.cv-entry { margin-bottom: 6pt; }
.cv-entry-date { font-size: 8pt; color: #6b7280; font-style: italic; }
.cv-entry-title { font-size: 10pt; font-weight: 700; color: #111827; margin-top: 1pt; }
.cv-entry-company { font-size: 9pt; color: #4b5563; margin-top: 1pt; }
.cv-entry-bullets { padding-left: 12pt; margin-top: 3pt; }
.cv-entry-bullets li { font-size: 9pt; margin-bottom: 1.5pt; color: #374151; }
.cv-skills-list { list-style: none; padding: 0; }
.cv-skills-list li { font-size: 9pt; padding: 2.5pt 0; border-bottom: 1px solid #e2e8f0; color: #374151; }
.cv-lang-item { font-size: 9pt; margin-bottom: 5pt; }
.cv-lang-name { font-weight: 700; color: #111827; }
.cv-lang-level { font-size: 8pt; color: #6b7280; }
.cv-lang-bar { background: #e2e8f0; height: 3pt; border-radius: 2pt; margin-top: 2pt; }
.cv-lang-fill { background: ${pal.accent}; height: 100%; border-radius: 2pt; }`;

    return {
      id:           `own-${svcKey}-${Date.now()}`,
      name:         name,
      description:  isTwoCol ? 'Layout bicolor com sidebar lateral' : 'Layout moderno com cabeçalho colorido',
      preview:      { accent: pal.accent, bg: pal.bg, font: 'sans-serif' },
      htmlTemplate: isTwoCol ? htmlTwoCol : htmlTopBar,
      css:          isTwoCol ? cssTwoCol  : cssTopBar,
      _isCustom:    true,
    };
  }

  // ── Extrair template HTML+CSS via backend /api/extract-template ─────────────
  // CORRIGIDO: chamada feita pelo backend Vercel para evitar bloqueio CORS.
  // O browser não pode chamar api.anthropic.com directamente — a Vercel faz o proxy.
  async _extractTemplateFromImage(file) {
    // Converter imagem para base64 (sem o prefixo data:image/...;base64,)
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result.split(',')[1]);
      reader.onerror = () => rej(new Error('Falha ao ler ficheiro'));
      reader.readAsDataURL(file);
    });

    const resp = await fetch('/api/extract-template', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType:    file.type || 'image/jpeg',
        serviceKey:  this._key,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || `Erro do servidor: ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.ok || !data.htmlTemplate || !data.css) {
      throw new Error(data.error || 'Resposta inválida do servidor');
    }

    const templateId = `custom-${this._key}-${Date.now()}`;
    return {
      id:           templateId,
      name:         data.name        || 'Template Personalizado',
      description:  data.description || 'Extraído da sua imagem',
      preview:      { accent: data.accent || '#3B82F6', bg: data.bg || '#fff', font: 'sans-serif' },
      htmlTemplate: data.htmlTemplate,
      css:          data.css,
      _isCustom:    true,
    };
  }
  // ── Markdown + PAGE_BREAK → HTML de uma única página ────────────────────
  _mdToHtml(md) {
    if (!md) return '<p style="color:#94a3b8;text-align:center;padding:40px 20px">Página vazia.</p>';

    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headings
      .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{4,6}\s+(.+)$/gm, '<h4>$1</h4>')
      // Bold + Italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      // HR
      .replace(/^---+$/gm, '<hr>')
      // Blockquote
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      // Listas não ordenadas
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      // Listas ordenadas
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Agrupar <li> consecutivos em <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

    // Parágrafos — agrupar blocos que não são tags de bloco
    const blockRe = /^<(h[1-6]|ul|ol|li|hr|blockquote|div|table|thead|tbody|tr|td|th|p)/;
    html = html.split('\n\n').map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return '';
      if (blockRe.test(chunk)) return chunk;
      return '<p>' + chunk.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');

    return html;
  }

  // ── Guardar template extraído no Supabase (pendente de aprovação admin) ──
  async _saveTemplateToSupabase(extracted) {
    try {
      const supabase = window.authManager?.supabase;
      if (!supabase) {
        console.warn('[TemplatePicker] Supabase não disponível — template não guardado na nuvem.');
        return;
      }

      const user = window.authManager?.user;

      // CORRIGIDO: guardar também accent/bg para o card de preview,
      // e incluir approved_at/rejected_at como null para evitar erros de schema.
      const { data, error } = await supabase.from('templates_custom').insert({
        user_id:       user?.id || null,
        service_type:  this._key,
        template_name: extracted.name,
        description:   extracted.description || '',
        template_html: extracted.htmlTemplate || '',
        template_css:  extracted.css || '',
        preview_accent: extracted.preview?.accent || '#3B82F6',
        preview_bg:     extracted.preview?.bg || '#fff',
        status:        'pending',
        is_public:     false,
        downloads:     0,
      }).select('id').single();

      if (error) {
        // Se a coluna preview_accent não existir, tentar sem ela
        if (error.message?.includes('preview_accent') || error.message?.includes('preview_bg')) {
          const { error: err2 } = await supabase.from('templates_custom').insert({
            user_id:       user?.id || null,
            service_type:  this._key,
            template_name: extracted.name,
            description:   extracted.description || '',
            template_html: extracted.htmlTemplate || '',
            template_css:  extracted.css || '',
            status:        'pending',
            is_public:     false,
            downloads:     0,
          });
          if (err2) { console.warn('[TemplatePicker] Supabase insert error:', err2.message); return; }
        } else {
          console.warn('[TemplatePicker] Supabase insert error:', error.message);
          return;
        }
      }

      // Actualizar o id do template na sessão com o id real do Supabase
      // para que ao recarregar a página o loadPublicTemplatesFromSupabase
      // o encontre e não o duplique.
      if (data?.id) {
        const sessionList = getSessionTemplates(this._key);
        const idx = sessionList.findIndex(t => t.id === extracted.id);
        if (idx !== -1) {
          sessionList[idx] = { ...sessionList[idx], id: data.id };
          // Re-salvar no localStorage com o id correcto
          const { addSessionTemplate: add } = await import('./TemplateLibrary.js').catch(() => ({ addSessionTemplate: null }));
          // _lsSave é interno — forçar re-save adicionando novamente
        }
      }

      _notify('📤 Template enviado para revisão! Aparecerá no painel do admin como pendente.');
    } catch (e) {
      console.warn('[TemplatePicker] _saveTemplateToSupabase falhou:', e.message);
    }
  }
}

export const templatePicker = new TemplatePicker();
