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

        // ── Conteúdo da página com o CSS do template ──────────────────────────
        // Se o template tem htmlTemplate, usar a estrutura HTML directamente para preview fiel.
        // Substituir os placeholders por texto de demonstração para visualização.
        let previewBody;
        if (tpl.htmlTemplate && i === 0) {
          // Preview com estrutura real — substituir placeholders por conteúdo de demo
          previewBody = tpl.htmlTemplate
            .replace(/\{\{NOME\}\}/g, 'Ana Maria Silva Santos')
            .replace(/\{\{CARGO\}\}/g, 'Gestora de Projectos Sénior')
            .replace(/\{\{CONTACTO\}\}/g, '+258 84 000 0000')
            .replace(/\{\{EMAIL\}\}/g, 'ana.silva@email.com')
            .replace(/\{\{LOCALIZACAO\}\}/g, 'Maputo, Moçambique')
            .replace(/\{\{INICIAIS\}\}/g, 'AS')
            .replace(/\{\{OBJECTIVO\}\}/g, 'Profissional experiente com 10 anos em gestão de projectos, especializada em coordenação de equipas multidisciplinares e entrega de resultados mensuráveis.')
            .replace(/\{\{FORMACAO\}\}/g, '<div class="cv-entry"><p class="cv-entry-date">2015 – 2018</p><p class="cv-entry-title">Licenciatura em Gestão</p><p class="cv-entry-company">Universidade Eduardo Mondlane | Maputo</p></div>')
            .replace(/\{\{EXPERIENCIA\}\}/g, '<div class="cv-entry"><p class="cv-entry-date">2019 – 2024</p><p class="cv-entry-title">Gestora de Projectos</p><p class="cv-entry-company">Empresa XYZ | Maputo</p><ul class="cv-entry-bullets"><li>Reduziu o tempo de entrega em 30% através de metodologias ágeis</li><li>Coordenou equipa de 12 pessoas com taxa de sucesso de 95%</li></ul></div>')
            .replace(/\{\{REALIZACAO\}\}/g, 'Implementou sistema de monitorização que reduziu custos operacionais em 25%, reconhecida como Colaboradora do Ano 2023.')
            .replace(/\{\{HABILIDADES\}\}/g, 'MS Project, Jira, Scrum, Power BI, Excel Avançado')
            .replace(/\{\{HABILIDADES_LIST\}\}/g, '<li>MS Project</li><li>Scrum/Kanban</li><li>Power BI</li><li>Liderança de equipas</li>')
            .replace(/\{\{LINGUAS\}\}/g, '<div class="cv-entry"><p class="cv-entry-title">Português</p><p class="cv-entry-sub">Nativo</p><div class="cv-lang-bar"><div class="cv-lang-fill" style="width:100%"></div></div></div><div class="cv-entry"><p class="cv-entry-title">Inglês</p><p class="cv-entry-sub">Avançado (C1)</p><div class="cv-lang-bar"><div class="cv-lang-fill" style="width:80%"></div></div></div>')
            .replace(/\{\{EXTRA\}\}/g, 'Carta de condução categoria B. Disponível para deslocações nacionais.')
            .replace(/\{\{[A-Z_]+\}\}/g, '<span style="color:#94a3b8">[conteúdo]</span>');
        } else {
          previewBody = pageHtml;
        }

        const doc = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm;min-height:297mm;overflow:hidden}
${tpl.css}
</style>
</head><body>${previewBody}</body></html>`;

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
    if (!this._tpl) {
      _notify('Seleccione um modelo primeiro.');
      return;
    }

    // Modelo próprio PDF/Word (sem htmlTemplate real) — TemplateController já activo
    if (this._tpl._isOwnModel) {
      _notify('✅ Modelo próprio activado! Gere o documento no formulário.');
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

    // ── Mostrar card "A processar…" IMEDIATAMENTE enquanto a IA trabalha ──
    // CORRIGIDO: antes o utilizador não via nenhum feedback visual na lista de cards
    // durante o processamento — agora aparece um card de loading no topo da lista.
    const processingId = `processing-${Date.now()}`;
    addSessionTemplate(this._key, {
      id: processingId,
      name: '⏳ A processar…',
      description: file.name,
      preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif' },
      _isCustom: true,
      htmlTemplate: null,
      css: '',
    });
    this._render();

    if (sub) sub.textContent = isImg ? '🤖 A extrair template da imagem…' : '⏳ A processar ficheiro…';

    // Helper: remover card de processamento da lista de sessão
    const removeProcessingCard = () => {
      const list = getSessionTemplates(this._key);
      const idx  = list.findIndex(t => t.id === processingId);
      if (idx !== -1) list.splice(idx, 1);
    };

    try {
      // ── Sempre: passar ao TemplateController para usar como modelo próprio ──
      const templateCtrl = window.docController?.templateCtrl;
      if (templateCtrl) {
        await templateCtrl._handleFile({ target: { files: [file], value: '' } });
      }

      // ── IMAGEM: extrair template HTML+CSS via API e adicionar como card real ──
      if (isImg) {
        try {
          const extracted = await this._extractTemplateFromImage(file);
          if (extracted) {
            // Remover card de processamento e adicionar o template extraído
            removeProcessingCard();
            addSessionTemplate(this._key, extracted);
            this._render();
            this._pick(extracted.id);

            if (sub) sub.textContent = `✅ Template "${extracted.name}" adicionado!`;
            if (zone) zone.classList.add('active');
            if (badge) badge.style.display = 'block';
            _notify(`✅ Template "${extracted.name}" extraído!`);

            // Guardar no Supabase para revisão admin (não bloqueia UI)
            this._saveTemplateToSupabase(extracted).catch(e => console.warn('Supabase save:', e));

            this._customActive = false;
            return;
          }
        } catch (extractErr) {
          console.warn('Extracção de imagem falhou, a usar modelo próprio:', extractErr.message);
          // Continua para o fallback abaixo
        }
      }

      // ── FALLBACK para imagem falhada / PDF / Word ──
      // Remover card de processamento
      removeProcessingCard();

      // Criar card "Modelo Próprio" permanente para o utilizador ver e seleccionar
      // CORRIGIDO: antes ficava sem card nenhum quando a extracção falhava ou
      // quando se carregava PDF/Word — o utilizador não sabia que o modelo estava activo.
      const ownModelId = `own-model-${Date.now()}`;
      const ownModelTpl = {
        id: ownModelId,
        name: 'Modelo Próprio',
        description: file.name,
        preview: { accent: '#10b981', bg: '#f0fdf4', font: 'sans-serif' },
        _isCustom: true,
        _isOwnModel: true,   // flag para _apply() saber que não deve chamar _regenerateWithHTMLTemplate
        htmlTemplate: null,
        css: '',
      };
      addSessionTemplate(this._key, ownModelTpl);
      this._render();
      this._pick(ownModelId);

      this._customFile   = file;
      this._customName   = file.name;
      this._customActive = true;

      if (zone)  zone.classList.add('active');
      if (badge) badge.style.display = 'block';
      if (sub)   sub.textContent = `✅ ${file.name} — A IA usará o seu layout ao gerar`;

      const selBar = document.getElementById('tplSelBar');
      if (selBar) selBar.textContent = `📎 Modelo próprio: ${file.name}`;

      _notify(`✅ Modelo próprio carregado: ${file.name}`);

    } catch (err) {
      // Limpar card de processamento em caso de erro inesperado
      removeProcessingCard();
      this._render();
      if (sub) sub.textContent = 'Toque para carregar imagem, PDF ou Word com o seu layout';
      _notify('Erro ao processar: ' + err.message);
    }
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
      // Obter supabase client do AuthManager
      const supabase = window.authManager?.supabase;
      if (!supabase) return; // Modo anónimo — não guardar

      const user = window.authManager?.user;

      const { error } = await supabase.from('templates_custom').insert({
        user_id:       user?.id || null,
        service_type:  this._key,
        template_name: extracted.name,
        description:   extracted.description || '',
        template_html: extracted.htmlTemplate || '',
        template_css:  extracted.css || '',
        status:        'pending',
        is_public:     false,
      });

      if (error) {
        console.warn('[TemplatePicker] Supabase insert error:', error.message);
        return;
      }
      _notify('📤 Template enviado para revisão do administrador!');
    } catch (e) {
      console.warn('[TemplatePicker] _saveTemplateToSupabase falhou:', e.message);
    }
  }
}

export const templatePicker = new TemplatePicker();
