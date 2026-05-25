// assets/js/marketplace/TemplatePicker.js
// Modal de escolha de template com preview em tempo real
// Integra-se no fluxo: IA gera → TemplatePicker → Download PDF/DOCX

import { getTemplates, getDefaultTemplate, getTemplateById } from './TemplateLibrary.js';

// Notificação inline — não depende de Views.js para evitar erros de import em cadeia
function _notify(msg, type = 'warn') {
  const stack = document.getElementById('notif-stack') || (() => {
    const s = document.createElement('div');
    s.id = 'notif-stack';
    s.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
    document.body.appendChild(s);
    return s;
  })();
  const n = document.createElement('div');
  n.style.cssText = 'background:#0f172a;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:tplFadeIn .2s ease';
  n.textContent = msg;
  stack.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

const OVERLAY_ID  = 'templatePickerOverlay';
const PICKER_CSS  = `
#templatePickerOverlay {
  display: none; position: fixed; inset: 0;
  background: rgba(7,16,31,.72); backdrop-filter: blur(10px);
  z-index: 600; align-items: center; justify-content: center;
  padding: 12px;
}
#templatePickerOverlay.open { display: flex; animation: tplFadeIn .18s ease; }

#tplPickerSheet {
  background: #fff; border-radius: 20px;
  width: 100%; max-width: 760px; max-height: 92vh;
  overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 32px 80px rgba(0,0,0,.25);
  animation: tplSlideUp .3s cubic-bezier(.34,1.1,.64,1);
}

.tpl-hdr {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
  background: #f8fafc; border-radius: 20px 20px 0 0;
  flex-shrink: 0;
}
.tpl-hdr h2 { font-size: 15px; font-weight: 800; color: #0f172a; margin: 0; flex: 1; }
.tpl-hdr-sub { font-size: 12px; color: #64748b; }
.tpl-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #64748b; padding: 4px 8px; border-radius: 8px; }
.tpl-close:hover { background: #e2e8f0; color: #0f172a; }

.tpl-body { display: flex; flex: 1; min-height: 0; overflow: hidden; }

/* Sidebar — lista de templates */
.tpl-sidebar {
  width: 200px; flex-shrink: 0; border-right: 1px solid #e2e8f0;
  overflow-y: auto; padding: 8px;
  background: #f8fafc;
}
.tpl-item {
  border: 2px solid transparent; border-radius: 12px;
  padding: 10px; cursor: pointer; margin-bottom: 6px;
  transition: all .15s; background: #fff;
}
.tpl-item:hover { border-color: #94a3b8; transform: translateY(-1px); }
.tpl-item.selected { border-color: #3B82F6; background: #eff6ff; }
.tpl-thumb {
  height: 56px; border-radius: 8px; margin-bottom: 6px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; position: relative;
}
.tpl-thumb-inner {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  padding: 6px; gap: 3px;
}
.tpl-thumb-line { height: 3px; border-radius: 2px; }
.tpl-thumb-line.title { height: 5px; }
.tpl-item-name { font-size: 11px; font-weight: 700; color: #0f172a; line-height: 1.2; }
.tpl-item-desc { font-size: 10px; color: #64748b; line-height: 1.3; margin-top: 2px; }

/* Preview area */
.tpl-preview-area {
  flex: 1; overflow: hidden; display: flex; flex-direction: column;
  min-width: 0;
}
.tpl-preview-toolbar {
  display: flex; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
  align-items: center; flex-wrap: wrap;
}
.tpl-preview-toolbar span { font-size: 12px; font-weight: 700; color: #0f172a; margin-right: auto; }
.tpl-preview-frame-wrap {
  flex: 1; overflow: auto; background: #94a3b8; padding: 16px;
  display: flex; justify-content: center;
}
.tpl-preview-iframe {
  width: 210mm; min-height: 297mm; background: #fff;
  border: none; box-shadow: 0 4px 24px rgba(0,0,0,.2);
  display: block;
}

/* Footer */
.tpl-footer {
  padding: 12px 20px; border-top: 1px solid #e2e8f0;
  background: #f8fafc; display: flex; gap: 10px;
  justify-content: flex-end; flex-shrink: 0; flex-wrap: wrap;
}
.tpl-btn-apply {
  background: linear-gradient(135deg, #1e40af, #3B82F6);
  color: #fff; border: none; border-radius: 12px;
  padding: 11px 24px; font-size: 14px; font-weight: 800;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 4px 12px rgba(59,130,246,.35);
  transition: all .15s;
}
.tpl-btn-apply:hover { transform: translateY(-1px); opacity: .92; }
.tpl-btn-pdf, .tpl-btn-word {
  border: 2px solid #e2e8f0; background: #fff; border-radius: 12px;
  padding: 11px 18px; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: inherit; color: #0f172a;
  transition: all .15s;
}
.tpl-btn-pdf:hover, .tpl-btn-word:hover { border-color: #3B82F6; color: #1d4ed8; background: #eff6ff; }

@media (max-width: 600px) {
  .tpl-sidebar { width: 130px; }
  .tpl-thumb { height: 40px; }
  .tpl-preview-iframe { width: 100%; min-height: 400px; }
}
@keyframes tplFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes tplSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;

export class TemplatePicker {
  constructor() {
    this._selectedKey   = null;
    this._selectedTpl   = null;
    this._content       = '';
    this._svc           = null;
    this._onApply       = null;
    this._onDownloadPDF = null;
    this._onDownloadWord= null;
    this._injected      = false;
  }

  /** Abre o picker. content = markdown gerado pela IA */
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
  }

  close() {
    document.getElementById(OVERLAY_ID)?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Injecção única do overlay no DOM ─────────────────────────────────
  _inject() {
    if (this._injected) return;
    this._injected = true;

    // CSS
    const style = document.createElement('style');
    style.textContent = PICKER_CSS;
    document.head.appendChild(style);

    // HTML
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div id="tplPickerSheet">
        <div class="tpl-hdr">
          <div>
            <h2>🎨 Escolher Modelo de Apresentação</h2>
            <div class="tpl-hdr-sub" id="tplHdrSub"></div>
          </div>
          <button class="tpl-close" id="tplClose">✕</button>
        </div>
        <div class="tpl-body">
          <div class="tpl-sidebar" id="tplSidebar"></div>
          <div class="tpl-preview-area">
            <div class="tpl-preview-toolbar">
              <span id="tplSelectedName">Nenhum seleccionado</span>
            </div>
            <div class="tpl-preview-frame-wrap">
              <iframe class="tpl-preview-iframe" id="tplPreviewIframe" title="Preview do documento"></iframe>
            </div>
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
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    document.getElementById('tplBtnApply')?.addEventListener('click', () => this._apply());
    document.getElementById('tplBtnPDF')?.addEventListener('click', () => this._downloadPDF());
    document.getElementById('tplBtnWord')?.addEventListener('click', () => this._downloadWord());
  }

  // ── Renderizar sidebar e preview ──────────────────────────────────────
  _render() {
    const templates = getTemplates(this._selectedKey);
    const svc = this._svc;

    // Actualizar sub-título
    const sub = document.getElementById('tplHdrSub');
    if (sub) sub.textContent = svc ? `${svc.icon} ${svc.title}` : '';

    // Sidebar
    const sidebar = document.getElementById('tplSidebar');
    if (!sidebar) return;

    if (!templates.length) {
      sidebar.innerHTML = '<div style="padding:12px;font-size:12px;color:#64748b">Sem templates para este serviço.</div>';
      return;
    }

    sidebar.innerHTML = templates.map(t => `
      <div class="tpl-item" data-tpl-id="${t.id}" role="button" tabindex="0" aria-label="${t.name}">
        <div class="tpl-thumb" style="background:${t.preview.bg};">
          <div class="tpl-thumb-inner">
            <div class="tpl-thumb-line title" style="background:${t.preview.accent};width:75%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.3;width:100%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.3;width:85%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.3;width:90%"></div>
            <div class="tpl-thumb-line" style="background:${t.preview.accent};opacity:.2;width:70%"></div>
          </div>
        </div>
        <div class="tpl-item-name">${t.name}</div>
        <div class="tpl-item-desc">${t.description}</div>
      </div>
    `).join('');

    // Click handlers
    sidebar.querySelectorAll('.tpl-item').forEach(el => {
      const handler = () => this._selectTemplate(el.dataset.tplId);
      el.addEventListener('click', handler);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });

    // Seleccionar o primeiro por defeito
    const defaultTpl = templates[0];
    if (defaultTpl) this._selectTemplate(defaultTpl.id);
  }

  _selectTemplate(tplId) {
    const tpl = getTemplateById(this._selectedKey, tplId);
    if (!tpl) return;

    this._selectedTpl = tpl;

    // Actualizar selecção visual
    document.querySelectorAll('.tpl-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.tplId === tplId);
    });

    // Nome do seleccionado
    const nameEl = document.getElementById('tplSelectedName');
    if (nameEl) nameEl.textContent = `${tpl.name} — ${tpl.description}`;

    // Actualizar preview
    this._updatePreview(tpl);
  }

  _updatePreview(tpl) {
    const iframe = document.getElementById('tplPreviewIframe');
    if (!iframe) return;

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

    // Usar srcdoc para preview instantâneo sem fetch
    iframe.srcdoc = html;
  }

  // ── Acções ────────────────────────────────────────────────────────────
  _apply() {
    if (!this._selectedTpl) {
      _notify('Seleccione um modelo primeiro.');
      return;
    }
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

  // ── Converter markdown para HTML simples ──────────────────────────────
  _markdownToHTML(md) {
    if (!md) return '<p>Documento vazio.</p>';
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{4,6}\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^---+$/gm, '<hr>')
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[hbpuilot])(.+)$/gm, (m) => m.trim() ? m : '')
      .replace(/<\/p><p>\s*(<h[1-6])/g, '$1')
      .replace(/<p>\s*(<h[1-6])/g, '$1')
      .replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1')
      .replace(/<p>(<ul>)/g, '$1')
      .replace(/<\/ul><\/p>/g, '</ul>')
      .replace(/<p>(<hr>)<\/p>/g, '$1')
      .replace(/<p>\s*<\/p>/g, '')
      .replace(/(^|\n)([^<\n][^\n]*)(\n|$)/g, (m, a, line, b) => {
        if (!line.trim()) return m;
        if (/<[a-z]/.test(line)) return m;
        return `${a}<p>${line}</p>${b}`;
      });
  }
}

// Singleton global
export const templatePicker = new TemplatePicker();
