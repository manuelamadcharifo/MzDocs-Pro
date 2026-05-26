// assets/js/marketplace/TemplatePicker.js — v4.0 mobile-first + A4 paged preview
// Layout mobile: lista de templates (scroll horizontal) no topo, preview A4 em baixo
// PAGE_BREAK → folhas A4 separadas com sombra, como um PDF real

import { getTemplates, getDefaultTemplate, getTemplateById } from './TemplateLibrary.js';

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
.tpl-thumb{height:48px;border-radius:7px;margin-bottom:5px;overflow:hidden;position:relative}
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
    this._key          = null;
    this._tpl          = null;
    this._content      = '';
    this._svc          = null;
    this._onApply      = null;
    this._onPDF        = null;
    this._onWord       = null;
    this._injected     = false;
    this._resizeHandler = null;
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
  }

  close() {
    document.getElementById(OVERLAY_ID)?.classList.remove('open');
    document.body.style.overflow = '';
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
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
  }

  // ── Renderizar lista de templates ─────────────────────────────────────────
  _render() {
    const templates = getTemplates(this._key);
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

    // Highlight
    document.querySelectorAll('.tpl-card').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
    document.querySelector(`.tpl-card[data-id="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Nome
    const bar = document.getElementById('tplSelBar');
    if (bar) bar.textContent = `${tpl.name} — ${tpl.description || ''}`;

    this._renderPreview(tpl);
  }

  // ── Renderizar preview multi-página ──────────────────────────────────────
  _renderPreview(tpl) {
    const outer = document.getElementById('tplPreviewOuter');
    if (!outer) return;

    outer.innerHTML = `<div class="tpl-loading"><div class="tpl-spinner"></div>A renderizar…</div>`;

    setTimeout(() => {
      // Dividir conteúdo em páginas pelo marcador PAGE_BREAK
      const pages = this._content
        .split(/---PAGE_BREAK---/g)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      // Se não há PAGE_BREAK, tratar como uma única página
      const pageContents = pages.length > 0 ? pages : [this._content];

      outer.innerHTML = '';

      pageContents.forEach((pageMarkdown, i) => {
        // Separador entre páginas
        if (i > 0) {
          const sep = document.createElement('div');
          sep.className = 'tpl-page-sep';
          sep.textContent = `— Página ${i + 1} —`;
          outer.appendChild(sep);
        }

        const pageHtml = this._mdToHtml(pageMarkdown);

        // Folha A4
        const pageEl = document.createElement('div');
        pageEl.className = 'tpl-page';

        const iframe = document.createElement('iframe');
        iframe.title = `Página ${i + 1}`;
        iframe.setAttribute('sandbox', 'allow-same-origin');
        pageEl.appendChild(iframe);
        outer.appendChild(pageEl);

        // Conteúdo da página com o CSS do template
        const doc = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm;height:297mm;overflow:hidden}
${tpl.css}
</style>
</head><body>${pageHtml}</body></html>`;

        iframe.srcdoc = doc;

        // Quando o iframe carrega, escalar para caber no contentor visual
        iframe.addEventListener('load', () => {
          this._scalePage(pageEl, iframe);
        });
      });

      // Escalar todas as páginas após render
      requestAnimationFrame(() => this._scalePages());

    }, 60);
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
    if (!this._tpl) { _notify('Seleccione um modelo primeiro.'); return; }
    this._onApply?.(this._tpl);
    this.close();
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
}

export const templatePicker = new TemplatePicker();
