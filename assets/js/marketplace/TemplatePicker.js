// assets/js/marketplace/TemplatePicker.js — v3.0 mobile-first
// Layout: lista de templates em scroll horizontal (topo) + preview A4 escalado (baixo)
// Preview mostra o documento real com CSS do template, sem cortes no mobile

import { getTemplates, getDefaultTemplate, getTemplateById } from './TemplateLibrary.js';

function _notify(msg) {
  const stack = document.getElementById('notif-stack') || (() => {
    const s = document.createElement('div');
    s.id = 'notif-stack';
    s.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
    document.body.appendChild(s);
    return s;
  })();
  const n = document.createElement('div');
  n.style.cssText = 'background:#0f172a;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  n.textContent = msg;
  stack.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

const OVERLAY_ID = 'templatePickerOverlay';

const PICKER_CSS = `
#templatePickerOverlay {
  display: none; position: fixed; inset: 0;
  background: rgba(7,16,31,.8); backdrop-filter: blur(8px);
  z-index: 600; align-items: flex-end; justify-content: center;
  padding: 0;
}
#templatePickerOverlay.open { display: flex; animation: tplFadeIn .18s ease; }

#tplPickerSheet {
  background: #fff;
  border-radius: 24px 24px 0 0;
  width: 100%; max-width: 680px;
  height: 94vh;
  overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 -8px 48px rgba(0,0,0,.28);
  animation: tplSlideUp .3s cubic-bezier(.34,1.05,.64,1);
}

/* ── Header ─────────────────────────────────────────── */
.tpl-hdr {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px 10px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.tpl-hdr-pill {
  width: 36px; height: 4px; background: #cbd5e1;
  border-radius: 2px; margin: 0 auto 2px;
}
.tpl-hdr-info { flex: 1; min-width: 0; }
.tpl-hdr-info h2 {
  font-size: 15px; font-weight: 800; color: #0f172a; margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tpl-hdr-sub { font-size: 11px; color: #64748b; margin-top: 1px; }
.tpl-close {
  background: #f1f5f9; border: none; font-size: 16px; cursor: pointer;
  color: #64748b; width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background .15s;
}
.tpl-close:hover { background: #e2e8f0; color: #0f172a; }

/* ── Template list — horizontal scroll cards ─────────── */
.tpl-list-wrap {
  flex-shrink: 0;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #f1f5f9;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tpl-list-wrap::-webkit-scrollbar { display: none; }
.tpl-list {
  display: flex; gap: 8px;
  width: max-content;
}
.tpl-card {
  width: 100px; flex-shrink: 0;
  border: 2px solid #e2e8f0; border-radius: 12px;
  padding: 8px 7px 7px; cursor: pointer;
  background: #fff; transition: all .15s;
  text-align: left;
}
.tpl-card:hover { border-color: #93c5fd; background: #eff6ff; }
.tpl-card.selected { border-color: #3B82F6; background: #eff6ff; }
.tpl-thumb {
  height: 52px; border-radius: 7px; margin-bottom: 6px;
  overflow: hidden; position: relative;
}
.tpl-thumb-inner {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  padding: 5px 5px; gap: 3px;
}
.tpl-thumb-line { height: 3px; border-radius: 2px; }
.tpl-thumb-line.t { height: 5px; width: 70% !important; }
.tpl-card-name {
  font-size: 10px; font-weight: 700; color: #0f172a;
  line-height: 1.25; margin-bottom: 2px;
  display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.tpl-card-badge {
  font-size: 9px; color: #64748b; line-height: 1.2;
  display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}

/* ── Selected template name bar ─────────────────────── */
.tpl-selected-bar {
  flex-shrink: 0;
  padding: 8px 16px 6px;
  font-size: 12px; font-weight: 700; color: #1e40af;
  background: #eff6ff; border-bottom: 1px solid #bfdbfe;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-height: 32px;
}

/* ── Preview area ────────────────────────────────────── */
.tpl-preview-outer {
  flex: 1; overflow: auto; background: #64748b;
  display: flex; justify-content: center; align-items: flex-start;
  padding: 16px 8px;
  -webkit-overflow-scrolling: touch;
}
.tpl-preview-scaler {
  /* Scales A4 page to fit viewport width */
  transform-origin: top center;
  display: flex; flex-direction: column;
}
.tpl-preview-iframe {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  border: none;
  box-shadow: 0 6px 32px rgba(0,0,0,.3);
  display: block;
  border-radius: 2px;
}

/* ── Footer ─────────────────────────────────────────── */
.tpl-footer {
  padding: 10px 12px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  display: grid;
  grid-template-columns: 1fr 1fr 2fr;
  gap: 8px;
  flex-shrink: 0;
}
.tpl-btn-apply {
  background: linear-gradient(135deg, #1e40af, #3B82F6);
  color: #fff; border: none; border-radius: 12px;
  padding: 13px 10px; font-size: 13px; font-weight: 800;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 4px 12px rgba(59,130,246,.35);
  transition: all .15s; white-space: nowrap;
}
.tpl-btn-apply:hover { opacity: .92; transform: translateY(-1px); }
.tpl-btn-pdf, .tpl-btn-word {
  border: 2px solid #e2e8f0; background: #fff; border-radius: 12px;
  padding: 13px 8px; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: inherit; color: #334155;
  transition: all .15s; text-align: center;
}
.tpl-btn-pdf:hover, .tpl-btn-word:hover {
  border-color: #3B82F6; color: #1d4ed8; background: #eff6ff;
}

/* ── Loading spinner ─────────────────────────────────── */
.tpl-loading {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; padding: 40px; color: #fff;
  font-size: 13px; font-weight: 600;
}
.tpl-spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(255,255,255,.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: tplSpin .7s linear infinite;
}

@keyframes tplFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes tplSlideUp { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes tplSpin { to { transform: rotate(360deg); } }

/* Desktop — show as centered modal, not bottom sheet */
@media (min-width: 640px) {
  #templatePickerOverlay {
    align-items: center;
    padding: 16px;
  }
  #tplPickerSheet {
    border-radius: 20px;
    max-height: 92vh;
    height: auto;
  }
  .tpl-hdr-pill { display: none; }
}
`;

export class TemplatePicker {
  constructor() {
    this._selectedKey    = null;
    this._selectedTpl    = null;
    this._content        = '';
    this._svc            = null;
    this._onApply        = null;
    this._onDownloadPDF  = null;
    this._onDownloadWord = null;
    this._injected       = false;
  }

  open({ serviceKey, content, svc, onApply, onDownloadPDF, onDownloadWord }) {
    this._selectedKey    = serviceKey;
    this._content        = content;
    this._svc            = svc;
    this._onApply        = onApply;
    this._onDownloadPDF  = onDownloadPDF;
    this._onDownloadWord = onDownloadWord;

    this._inject();
    this._render();

    document.getElementById(OVERLAY_ID)?.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Scale the A4 preview to fit the available width
    requestAnimationFrame(() => this._scalePreview());
    window.addEventListener('resize', this._scalePreview.bind(this));
  }

  close() {
    document.getElementById(OVERLAY_ID)?.classList.remove('open');
    document.body.style.overflow = '';
    window.removeEventListener('resize', this._scalePreview.bind(this));
  }

  _scalePreview() {
    const outer = document.querySelector('.tpl-preview-outer');
    const scaler = document.querySelector('.tpl-preview-scaler');
    if (!outer || !scaler) return;
    const outerW = outer.clientWidth - 16; // 8px padding each side
    const a4px = 210 * 3.7795; // 210mm in px at 96dpi
    const scale = Math.min(1, outerW / a4px);
    scaler.style.transform = `scale(${scale})`;
    scaler.style.marginBottom = `${(scale - 1) * 297 * 3.7795}px`; // compensate shrinkage
  }

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
        <div class="tpl-hdr">
          <div class="tpl-hdr-pill"></div>
          <div class="tpl-hdr-info">
            <h2>🎨 Escolher Modelo</h2>
            <div class="tpl-hdr-sub" id="tplHdrSub"></div>
          </div>
          <button class="tpl-close" id="tplClose" aria-label="Fechar">✕</button>
        </div>
        <div class="tpl-list-wrap">
          <div class="tpl-list" id="tplList"></div>
        </div>
        <div class="tpl-selected-bar" id="tplSelectedBar">Seleccione um modelo acima</div>
        <div class="tpl-preview-outer" id="tplPreviewOuter">
          <div class="tpl-loading" id="tplLoading">
            <div class="tpl-spinner"></div>
            A carregar preview…
          </div>
        </div>
        <div class="tpl-footer">
          <button class="tpl-btn-pdf"  id="tplBtnPDF">⬇️ PDF</button>
          <button class="tpl-btn-word" id="tplBtnWord">⬇️ Word</button>
          <button class="tpl-btn-apply" id="tplBtnApply">✅ Usar este Modelo</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('tplClose')?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    document.getElementById('tplBtnApply')?.addEventListener('click', () => this._apply());
    document.getElementById('tplBtnPDF')?.addEventListener('click',   () => this._downloadPDF());
    document.getElementById('tplBtnWord')?.addEventListener('click',  () => this._downloadWord());
  }

  _render() {
    const templates = getTemplates(this._selectedKey);
    const svc = this._svc;

    const sub = document.getElementById('tplHdrSub');
    if (sub) sub.textContent = svc ? `${svc.icon || ''} ${svc.title || ''}` : '';

    const list = document.getElementById('tplList');
    if (!list) return;

    if (!templates.length) {
      list.innerHTML = '<div style="padding:12px;font-size:12px;color:#64748b;white-space:nowrap">Sem modelos para este serviço.</div>';
      return;
    }

    list.innerHTML = templates.map(t => `
      <div class="tpl-card" data-tpl-id="${t.id}" role="button" tabindex="0" aria-label="${t.name}">
        <div class="tpl-thumb" style="background:${t.preview.bg};">
          <div class="tpl-thumb-inner">
            <div class="tpl-thumb-line t" style="background:${t.preview.accent};"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.35;width:100%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.25;width:85%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.2;width:90%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.15;width:70%"></div>
          </div>
        </div>
        <div class="tpl-card-name">${t.name}</div>
        <div class="tpl-card-badge">${t.description}</div>
      </div>
    `).join('');

    list.querySelectorAll('.tpl-card').forEach(el => {
      const handler = () => this._selectTemplate(el.dataset.tplId);
      el.addEventListener('click', handler);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });

    // Select first by default
    if (templates[0]) this._selectTemplate(templates[0].id);
  }

  _selectTemplate(tplId) {
    const tpl = getTemplateById(this._selectedKey, tplId);
    if (!tpl) return;
    this._selectedTpl = tpl;

    // Highlight selected card
    document.querySelectorAll('.tpl-card').forEach(el => {
      el.classList.toggle('selected', el.dataset.tplId === tplId);
    });

    // Scroll selected card into view
    const selected = document.querySelector(`.tpl-card[data-tpl-id="${tplId}"]`);
    selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Update name bar
    const bar = document.getElementById('tplSelectedBar');
    if (bar) bar.textContent = `${tpl.name} — ${tpl.description}`;

    this._updatePreview(tpl);
  }

  _updatePreview(tpl) {
    const outer = document.getElementById('tplPreviewOuter');
    if (!outer) return;

    // Show spinner first
    outer.innerHTML = `
      <div class="tpl-loading" id="tplLoading">
        <div class="tpl-spinner"></div>
        A renderizar preview…
      </div>
    `;

    // Small delay so spinner shows before heavy render
    setTimeout(() => {
      const bodyHTML = this._markdownToHTML(this._content);

      const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  ${tpl.css}
</style>
</head>
<body>${bodyHTML}</body>
</html>`;

      outer.innerHTML = `
        <div class="tpl-preview-scaler">
          <iframe class="tpl-preview-iframe" id="tplPreviewIframe" title="Preview do documento" sandbox="allow-same-origin"></iframe>
        </div>
      `;

      const iframe = document.getElementById('tplPreviewIframe');
      if (iframe) {
        iframe.srcdoc = html;
        iframe.onload = () => {
          // Adjust iframe height to actual content height
          try {
            const h = iframe.contentDocument?.body?.scrollHeight;
            if (h && h > 297 * 3.7795) iframe.style.minHeight = h + 'px';
          } catch (_) {}
          this._scalePreview();
        };
      }

      this._scalePreview();
    }, 60);
  }

  _apply() {
    if (!this._selectedTpl) { _notify('Seleccione um modelo primeiro.'); return; }
    this._onApply?.(this._selectedTpl);
    this.close();
  }

  _downloadPDF() {
    if (!this._selectedTpl) { _notify('Seleccione um modelo primeiro.'); return; }
    this._onDownloadPDF?.(this._selectedTpl);
  }

  _downloadWord() {
    if (!this._selectedTpl) { _notify('Seleccione um modelo primeiro.'); return; }
    this._onDownloadWord?.(this._selectedTpl);
  }

  // ── Markdown → HTML ───────────────────────────────────────────────────
  _markdownToHTML(md) {
    if (!md) return '<p style="color:#94a3b8;text-align:center;padding:40px">Documento vazio.</p>';

    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Headings
      .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{4,6}\s+(.+)$/gm, '<h4>$1</h4>')
      // Bold / italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // HR
      .replace(/^---+$/gm, '<hr>')
      // Blockquote
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      // Lists (unordered)
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      // Lists (ordered)
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

    // Paragraphs — wrap lines not already wrapped in block tags
    const blockTags = /^<(h[1-6]|ul|ol|li|hr|blockquote|div|table|thead|tbody|tr|td|th|p)/;
    html = html
      .split('\n\n')
      .map(chunk => {
        chunk = chunk.trim();
        if (!chunk) return '';
        if (blockTags.test(chunk)) return chunk;
        // Multi-line chunk → join with <br> then wrap in <p>
        return '<p>' + chunk.replace(/\n/g, '<br>') + '</p>';
      })
      .join('\n');

    return html;
  }
}

export const templatePicker = new TemplatePicker();
