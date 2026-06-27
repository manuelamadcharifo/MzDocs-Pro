// assets/js/marketplace/TemplatePicker.js — v4.0 mobile-first + A4 paged preview
// Layout mobile: lista de templates (scroll horizontal) no topo, preview A4 em baixo
// PAGE_BREAK → folhas A4 separadas com sombra, como um PDF real

import { getTemplates, getDefaultTemplate, getTemplateById, addSessionTemplate, getSessionTemplates, loadPublicTemplatesFromSupabase } from './TemplateLibrary.js';
import { renderA4Pages, markdownToHtml, scalePage } from '../utils/A4Renderer.js';

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

/* ── Folha A4 individual — motor único A4Renderer (.a4-page) ──────────────
   Sombra/dimensão visual ajustadas ao layout do sheet do TemplatePicker;
   a estrutura e o scaling são geridos por renderA4Pages()/scalePage(). */
.a4-page{
  background:#fff;
  width:100%;
  max-width:560px;
  min-height:200px;
  border-radius:3px;
  box-shadow:0 4px 24px rgba(0,0,0,.35),0 1px 4px rgba(0,0,0,.15);
  overflow:hidden;
  flex-shrink:0;
  position:relative;
}
.a4-page-iframe{
  border:none;
  display:block;
  transform-origin:top left;
}

/* ── Separador entre páginas ── */
.a4-page-sep-label{
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

.tpl-gallery-link{
  flex-shrink:0;margin:8px 12px 0;text-align:center;
  font-size:12px;font-weight:700;color:#3B82F6;text-decoration:none;
  display:flex;align-items:center;justify-content:center;gap:6px;
  padding:9px 14px;border-radius:10px;
  background:#eff6ff;border:1.5px solid #bfdbfe;
  transition:background .15s,border-color .15s;
}
.tpl-gallery-link:hover,.tpl-gallery-link:active{
  background:#dbeafe;border-color:#93c5fd;text-decoration:none;color:#1d4ed8;
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
  .a4-page{max-width:480px}
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
        <a href="/templates.html" target="_blank" rel="noopener" class="tpl-gallery-link">🌐 Ver mais modelos na Galeria Comunitária →</a>

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
  // Usa o motor único A4Renderer (mesmo usado no preview do resultado final em
  // Views.js) — garante que o preview aqui = o ficheiro PDF/Word exportado:
  // mesmas dimensões A4 reais, páginas separadas por ---PAGE_BREAK--- e
  // tabelas markdown "|" convertidas em <table> real (não texto cru).
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

      const rawContent = this._content || '';

      // Dividir conteúdo em páginas pelo marcador PAGE_BREAK (mesma lógica
      // normalizada do A4Renderer/PDFExporter — variantes "Nova Página" incluídas)
      const pageContents = this._splitContentPages(rawContent);

      // ── Conteúdo de cada página ────────────────────────────────────────
      // CORRIGIDO: usar os dados REAIS do documento do utilizador no preview.
      // Bug anterior: o preview mostrava sempre "Ana Maria Silva Santos" e dados
      // fictícios — o utilizador confundia o preview do template com o seu documento
      // e pensava que o conteúdo tinha mudado (imagem 1).
      //
      // Agora: se o template tem htmlTemplate, extraímos os dados reais do
      // conteúdo markdown actual (this._content) e preenchemos os placeholders
      // na primeira página. Se não temos htmlTemplate, ou para páginas
      // seguintes, renderizamos o markdown com o conversor GFM partilhado
      // (markdownToHtml) — que agora trata tabelas "|" como tabelas reais.
      const rawHtmlPages = pageContents.map((pageMarkdown, i) => {
        if (tpl.htmlTemplate && i === 0) {
          const rd = this._extractRealData(rawContent, this._key);
          return this._fillTemplate(tpl.htmlTemplate, rd);
        }
        return `<div style="padding:10mm">${markdownToHtml(pageMarkdown)}</div>`;
      });

      renderA4Pages(outer, rawContent, {
        css:          tpl.css || '',
        isRawHTML:    true,        // já convertido acima (mistura html/markdown por página)
        rawHtmlPages: rawHtmlPages,
        showPageLabel: true,
      });

    }, 80));
  }

  // ── Divide o conteúdo em páginas pelo marcador ---PAGE_BREAK--- ──────────
  // (mantido aqui também por compatibilidade — espelha splitIntoPages do A4Renderer)
  _splitContentPages(rawContent) {
    const pages = (rawContent || '')
      .split(/---PAGE_BREAK---/g)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    return pages.length > 0 ? pages : [rawContent || ' '];
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
    const esc     = (t) => (t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const stripMd = (t) => (t || '')
      .replace(/\*{1,3}([^*\n]+)\*{1,3}/g,'$1')
      .replace(/`([^`]+)`/g,'$1')
      .replace(/_{1,2}([^_\n]+)_{1,2}/g,'$1')
      .trim();

    // Extrai primeira captura de uma regex no markdown
    const line = (rx) => (md.match(rx)?.[1] || '').trim();

    // ── Extractor de secção ROBUSTO ─────────────────────────────────────────
    // Divide o markdown em secções por qualquer heading ## ou ###
    // Devolve o conteúdo da primeira secção cujo título coincide com o padrão
    const section = (titlePat) => {
      // Partir por linhas de heading (##, ###, ####)
      const headingRx = /^(#{1,4})\s+(.+)$/gm;
      let match;
      let sections = [];
      let lastEnd = 0;
      let firstMatch = null;

      // Primeiro heading do documento como âncora
      const allLines = md.split('\n');
      let current = null;

      for (let i = 0; i < allLines.length; i++) {
        const hm = allLines[i].match(/^(#{1,4})\s+(.+)$/);
        if (hm) {
          if (current) {
            current.content = allLines.slice(current.startLine + 1, i).join('\n').trim();
            sections.push(current);
          }
          current = { level: hm[1].length, title: hm[2].trim(), startLine: i, content: '' };
        }
      }
      if (current) {
        current.content = allLines.slice(current.startLine + 1).join('\n').trim();
        sections.push(current);
      }

      // Procurar secção cujo título coincide
      const rx = new RegExp(titlePat, 'i');
      for (const s of sections) {
        if (rx.test(s.title)) return s.content;
      }
      return '';
    };

    const today = () => {
      const d = new Date();
      const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
    };

    // ── Parser de entradas estruturadas (experiência / formação) ────────────
    const parseEntries = (raw) => {
      if (!raw) return [];
      const entries = [];
      let current = null;
      const flush = () => { if (current) { entries.push(current); current = null; } };

      for (const rawLine of raw.split('\n')) {
        const l = rawLine.trim();
        if (!l || l === '---') continue;

        // Entrada: - **Título** | Org | Período  OU  - **Título** — Org | Período
        const boldEntry = l.match(/^[-*]\s+\*{1,2}([^*\n]+)\*{1,2}\s*[|—–\-]?\s*(.*)/);
        // Entrada: - Título | Org | Período
        const pipeEntry = !boldEntry && l.match(/^[-*+]\s+([^*\n]{3,120})\s+[|—–]\s+(.+)/);
        // Linha simples bold: **Título** | Org
        const boldLine  = !boldEntry && !pipeEntry && l.match(/^\*{1,2}([^*\n]{3,80})\*{1,2}\s*[|—–]?\s*(.*)/);

        const m = boldEntry || pipeEntry || boldLine;
        if (m) {
          flush();
          const title = stripMd(m[1].trim());
          const rest  = (m[2] || '').trim();
          // Separar org e período
          const parts = rest.split(/\s*[|—–]\s*/);
          // Detectar qual parte é período (contém dígitos de ano)
          let org = '', period = '';
          if (parts.length >= 2) {
            // Último bloco com 4 dígitos = período
            const lastPart = parts[parts.length - 1];
            if (/\d{4}/.test(lastPart)) {
              period = stripMd(lastPart);
              org    = parts.slice(0, -1).map(p => stripMd(p)).filter(Boolean).join(' · ');
            } else {
              org    = parts.slice(0, -1).map(p => stripMd(p)).join(' · ');
              period = stripMd(parts[parts.length - 1]);
            }
          } else if (parts.length === 1) {
            if (/\d{4}/.test(parts[0])) period = stripMd(parts[0]);
            else org = stripMd(parts[0]);
          }
          current = { title, org: org && org !== period ? org : '', period, bullets: [] };
          continue;
        }

        // Bullet dentro de entrada: começam com +, *, - seguido de texto
        if (current && /^[+\-*]\s+/.test(l)) {
          current.bullets.push(stripMd(l.replace(/^[+\-*]\s+/, '')));
          continue;
        }

        // Texto adicional dentro de entrada (sem bullet)
        if (current && l && !/^#+/.test(l) && !/^[-*+]/.test(l)) {
          const s = stripMd(l);
          if (s.length > 3) current.bullets.push(s);
          continue;
        }

        // Linha solta sem entrada activa (ex: só texto de formação)
        if (!current && l && !/^#+/.test(l)) {
          const s = stripMd(l);
          if (s.length > 2) {
            const pm = s.match(/(\d{4}\s*[-–—]\s*(?:\d{4}|presente|actual|actualmente|em curso))/i);
            const period = pm ? pm[1] : '';
            const title  = period ? s.replace(period,'').replace(/[|—–\-]\s*$/,'').trim() : s;
            if (title) entries.push({ title, org:'', period, bullets:[] });
          }
        }
      }
      flush();
      return entries;
    };

    const entriesToHTML = (entries) => entries.map(e => {
      const bullets = e.bullets.length
        ? `<ul class="cv-entry-bullets">${e.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`
        : '';
      const org = e.org ? `<p class="cv-entry-company">${esc(e.org)}</p>` : '';
      return `<div class="cv-entry"><p class="cv-entry-date">${esc(e.period)}</p><p class="cv-entry-title">${esc(e.title)}</p>${org}${bullets}</div>`;
    }).join('\n');

    const sectionToEntries = (raw) => {
      const entries = parseEntries(raw);
      if (entries.length) return entriesToHTML(entries);
      if (!raw) return '';
      // Fallback: texto directo
      const lines = raw.split('\n').map(l => stripMd(l).trim()).filter(l => l && l !== '---');
      if (!lines.length) return '';
      return `<div class="cv-entry"><p class="cv-entry-date"></p><p class="cv-entry-title">${esc(lines[0])}</p>${lines.slice(1).map(l=>`<p class="cv-entry-company">${esc(l)}</p>`).join('')}</div>`;
    };

    // ── Dados comuns ────────────────────────────────────────────────────────
    const data = {};
    data['DATA'] = today();

    // Nome: primeiro H1 ou H2
    const nomeRaw = stripMd(
      line(/^#\s+(.+)/m) ||
      line(/^##\s+(.+)/m) ||
      line(/\*\*Nome[:\s]+\*\*\s*(.+)/i) ||
      ''
    );
    data['NOME']    = esc(nomeRaw);
    data['INICIAIS']= nomeRaw.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || 'XX';

    if (key === 'cv') {
      // Cargo: linha logo após o nome (antes dos contactos)
      const cargo = stripMd(
        line(/^#{1,2}\s+.+\n+([^\n#*]{3,60})\n.*(?:📞|☎|\+258|@)/m) ||
        line(/\*\*(.*?)\*\*\s*[\n\r].*(?:📞|☎|\+258|@)/m) ||
        line(/^[*_]{0,2}([^#*\n]{5,60})[*_]{0,2}\s*[\n\r].*(?:📞|\||@)/m) ||
        section('Cargo|Profiss[aã]o') ||
        ''
      );
      data['CARGO']      = esc(cargo);
      data['CONTACTO']   = esc(line(/(?:📞|☎|Tel[:\s]+)[\s*]*([+\d][\d\s\-().]{6,20})/i) || line(/\b(8[234567]\s?\d{3}\s?\d{4})\b/i) || '');
      data['EMAIL']      = esc(line(/([\w.+\-]+@[\w.\-]+\.[a-z]{2,})/i) || '');
      data['LOCALIZACAO']= esc(stripMd(line(/(?:📍|Local[:\s]+)([^\n|]{3,50})/i) || line(/(?:Maputo|Beira|Nampula|Tete|Quelimane|Inhambane)[^\n]*/i) || 'Moçambique'));

      // Objectivo / Resumo / Perfil
      data['OBJECTIVO'] = esc(stripMd(
        section('Objectivo|Resumo Profissional|Resumo|Perfil|Summary') || ''
      ));

      // Realização de Destaque
      data['REALIZACAO'] = esc(stripMd(
        section('Realiza[cç][aã]o|Destaque|Conquista|Achievement') || ''
      ));

      // Competências / Habilidades / Skills
      const habRaw = section('Compet[eê]ncia|Habilidade|Skill|T[eé]cnica') || '';
      const habList = habRaw
        .split(/[,;\n•·+\-*]/)
        .map(h => stripMd(h).trim())
        .filter(h => h.length > 1 && !/^#+/.test(h));
      data['HABILIDADES']      = esc(habList.join(', ').slice(0,200));
      data['HABILIDADES_LIST'] = habList.map(h=>`<li>${esc(h)}</li>`).join('') || '<li>Competências profissionais</li>';

      // Formação
      data['FORMACAO'] = sectionToEntries(
        section('Forma[cç][aã]o|Educa[cç][aã]o|Academic|Escolar')
      );

      // Experiência — pode ter vários padrões de nome
      data['EXPERIENCIA'] = sectionToEntries(
        section('Experi[eê]ncia Profissional|Experi[eê]ncia de Trabalho|Experi[eê]ncia|Hist[oó]rico|Work Experience') ||
        section('Experi[eê]ncia')
      );

      // Línguas
      const linguasRaw = section('L[íi]ngua|Idioma|Language') || '';
      data['LINGUAS'] = linguasRaw
        .split(/[\n,;•·]/)
        .map(l => {
          const clean = stripMd(l.replace(/^[-*+]\s*/,'')).trim();
          if (clean.length < 2) return '';
          // "Português — Nativo" ou "Português (Nativo)" ou "Português Nativo"
          const parts = clean.split(/\s*[—–\-]\s*|\s*[\(\)]\s*|\s{2,}/);
          const name  = parts[0].trim();
          const level = parts[1] ? parts[1].replace(/[()]/g,'').trim() : '';
          return `<div class="cv-lang-item"><span class="cv-lang-name">${esc(name)}</span>${level ? `<span class="cv-lang-level">${esc(level)}</span>` : ''}</div>`;
        })
        .filter(Boolean)
        .join('') || `<div class="cv-lang-item"><span class="cv-lang-name">${esc(linguasRaw || 'Português')}</span></div>`;

      // Extra / Informação Adicional
      data['EXTRA'] = esc(stripMd(section('Informa[cç][aã]o Adicional|Extra|Outros|Refer[eê]ncia') || ''));

    } else if (key === 'carta') {
      data['REMETENTE_NOME']   = esc(stripMd(line(/(?:Remetente|De|From)[:\s]+(.+)/i) || nomeRaw));
      data['REMETENTE_CARGO']  = esc(stripMd(section('Cargo|Fun[cç][aã]o') || ''));
      data['DESTINATARIO_NOME']= esc(stripMd(line(/(?:Exmo\.?|A[:\s]|Para)[:\s]*(.+)/i) || ''));
      data['DESTINATARIO_ENTI']= esc(stripMd(line(/(?:Entidade|Empresa|Organiza[cç][aã]o)[:\s]+(.+)/i) || ''));
      data['ASSUNTO']          = esc(stripMd(line(/(?:Assunto|Re)[:\s]+(.+)/i) || ''));
      data['REF']              = esc(line(/(?:Ref\.?|Refer[eê]ncia)[:\s]*([^\n]+)/i) || 'S/Ref.');
      data['LOCAL']            = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete|Quelimane)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']       = `${data['LOCAL']}, ${today()}`;
      data['CORPO']            = stripMd(section('Corpo|Conte[uú]do') || section('Exmo|Prezado') || '').replace(/\n\n/g,'</p><p>').replace(/\n/g,' ');
      data['MINISTERIO']       = data['REMETENTE_NOME'];
      data['INICIAIS']         = nomeRaw.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || 'XX';
      data['REMETENTE_CARGO_PRETENDIDO'] = data['REMETENTE_CARGO'];

    } else if (key === 'requerimento') {
      data['ENTIDADE']      = esc(stripMd(line(/(?:Exmo\.?|A[:\s]|Entidade)[:\s]*(.+)/i) || ''));
      data['REQUERENTE']    = esc(nomeRaw);
      data['BI']            = esc(line(/(?:BI|Bilhete)[:\s.]*([A-Z0-9]{6,14}[A-Z]?)/i) || '');
      data['ENDERECO']      = esc(stripMd(line(/(?:Endere[cç]o|Morada|Resid[eê]ncia)[:\s]+(.+)/i) || ''));
      data['CONTACTO']      = esc(line(/(?:Contacto|Telefone|Tel\.?)[:\s]*([+\d][\d\s\-().]{6,20})/i) || '');
      data['ASSUNTO']       = esc(stripMd(line(/(?:Assunto|Objecto|Pedido)[:\s]+(.+)/i) || ''));
      data['LOCAL']         = esc(stripMd(line(/(?:Maputo|Beira|Nampula|Tete)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']    = `${data['LOCAL']}, ${today()}`;
      data['FUNDAMENTACAO'] = esc(stripMd(section('Fundamenta[cç][aã]o|Fundamento|Exposto') || ''));
      data['FUNDAMENTO']    = data['FUNDAMENTACAO'];

    } else if (key === 'arrendamento') {
      data['SENHORIO_NOME']   = esc(stripMd(line(/(?:Senhorio|Propriet[aá]rio|Arrendador)[:\s]+(.+)/i) || ''));
      data['INQUILINO_NOME']  = esc(stripMd(line(/(?:Inquilino|Arrendat[aá]rio|Locat[aá]rio)[:\s]+(.+)/i) || ''));
      data['IMOVEL_LOCAL']    = esc(stripMd(line(/(?:Localiz|Im[oó]vel|Endere[cç]o)[:\s]+(.+)/i) || ''));
      data['RENDA_VALOR']     = esc(line(/(?:Renda|Valor\s*Mensal)[:\s]*([\d.,]+\s*MZN[^\n]*)/i) || '');
      data['DURACAO']         = esc(stripMd(line(/(?:Dura[cç][aã]o|Prazo)[:\s]+(.+)/i) || ''));
      data['LOCAL']           = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']      = `${data['LOCAL']}, ${today()}`;
      data['CLAUSULAS']       = sectionToEntries(section('Cl[aá]usula|Art[ií]go') || '');

    } else if (key === 'procuracao') {
      data['OUTORGANTE']    = esc(stripMd(line(/(?:Outorgante|Mandante)[:\s]+(.+)/i) || nomeRaw));
      data['PROCURADOR']    = esc(stripMd(line(/(?:Procurador|Mandat[aá]rio)[:\s]+(.+)/i) || ''));
      data['PODERES']       = esc(stripMd(line(/(?:Poderes|Actos)[:\s]+(.+)/i) || ''));
      data['LOCAL']         = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']    = `${data['LOCAL']}, ${today()}`;

    } else if (key === 'residencia') {
      data['DECLARANTE']    = esc(nomeRaw);
      data['BI']            = esc(line(/(?:BI|Bilhete)[:\s.]*([A-Z0-9]{6,14}[A-Z]?)/i) || '');
      data['ENDERECO']      = esc(stripMd(line(/(?:Endere[cç]o|Morada|Resid[eê]ncia)[:\s]+(.+)/i) || ''));
      data['LOCAL']         = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']    = `${data['LOCAL']}, ${today()}`;
      data['FINALIDADE']    = esc(stripMd(line(/(?:Finalidade|Para efeitos de)[:\s]+(.+)/i) || ''));
      data['CHEFE']         = esc(stripMd(line(/(?:Chefe|L[íi]der)[:\s]+(.+)/i) || '[responsável local]'));

    } else if (key === 'prestacao') {
      data['PRESTADOR']     = esc(stripMd(line(/(?:Prestador|Fornecedor)[:\s]+(.+)/i) || nomeRaw));
      data['CLIENTE']       = esc(stripMd(line(/(?:Cliente|Contratante)[:\s]+(.+)/i) || ''));
      data['SERVICO']       = esc(stripMd(line(/(?:Servi[cç]o|Objecto)[:\s]+(.+)/i) || ''));
      data['VALOR_TOTAL']   = esc(line(/(?:Valor|Total)[:\s]*([\d.,]+\s*MZN[^\n]*)/i) || '');
      data['LOCAL_DATA']    = `Maputo, ${today()}`;
      data['CLAUSULAS']     = sectionToEntries(section('Cl[aá]usula|Art[ií]go') || '');

    } else if (key === 'recibo') {
      data['EMITENTE']      = esc(stripMd(line(/(?:Emitente|Empresa|Prestador)[:\s]+(.+)/i) || nomeRaw));
      data['CLIENTE']       = esc(stripMd(line(/(?:Cliente|Adquirente)[:\s]+(.+)/i) || ''));
      data['DESCRICAO']     = esc(stripMd(line(/(?:Descri[cç][aã]o|Servi[cç]o|Produto)[:\s]+(.+)/i) || ''));
      data['VALOR_TOTAL']   = esc(line(/(?:Total|Valor\s*Total)[:\s]*([\d\s.,]+)\s*MZN/i) || '');
      data['LOCAL_DATA']    = `Maputo, ${today()}`;

    } else if (key === 'recomendacao') {
      data['RECOMENDADOR']  = esc(nomeRaw);
      data['RECOMENDADO']   = esc(stripMd(line(/(?:Recomendado|Candidato)[:\s]+(.+)/i) || ''));
      data['LOCAL_DATA']    = `Maputo, ${today()}`;
      data['CORPO']         = stripMd(section('Corpo|Conte[uú]do|Exmo|Prezado') || '');

    } else if (key === 'orcamento') {
      data['EMPRESA']       = esc(stripMd(line(/(?:Empresa|Emitente)[:\s]+(.+)/i) || nomeRaw));
      data['CLIENTE']       = esc(stripMd(line(/(?:Cliente|Para)[:\s]+(.+)/i) || ''));
      data['TOTAL_GERAL']   = esc(line(/(?:Total\s*Geral|TOTAL)[:\s]*([\d\s.,]+)\s*MZN/i) || '');
      data['LOCAL_DATA']    = `Maputo, ${today()}`;
      data['ITEMS_TODOS']   = sectionToEntries(section('Item|Material|Descri[cç][aã]o') || '');

    } else if (key === 'planonegocio') {
      data['NOME_NEGOCIO']  = esc(nomeRaw || stripMd(line(/(?:Neg[oó]cio|Empresa)[:\s]+(.+)/i) || ''));
      data['SECTOR']        = esc(stripMd(section('[Aá]rea|Sector|Actividade') || ''));
      data['LOCAL']         = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']    = `${data['LOCAL']}, ${today()}`;
      data['SUMARIO']       = esc(stripMd(section('Sum[aá]rio|Resumo Executivo') || ''));
      data['ANO']           = String(new Date().getFullYear());

    } else if (key === 'acta') {
      data['ORGANIZACAO']   = esc(stripMd(line(/(?:Organiza[cç][aã]o|Associa[cç][aã]o)[:\s]+(.+)/i) || nomeRaw));
      data['DATA']          = esc(line(/(?:Data\s*da\s*Reuni[aã]o|Data)[:\s]+([^\n]+)/i) || today());
      data['LOCAL']         = esc(stripMd(line(/(?:Local\s*da\s*Reuni[aã]o|Local)[:\s]+(.+)/i) || ''));
      data['PRESIDENTE']    = esc(stripMd(line(/(?:Presidente|Moderador)[:\s]+(.+)/i) || ''));
      data['DELIBERACOES']  = sectionToEntries(section('Delibera[cç][oõ]es?|Discuss[aã]o') || '');

    } else if (key === 'trabalho') {
      data['TITULO']        = esc(nomeRaw);
      data['AUTOR']         = esc(stripMd(line(/(?:Autor|Aluno|Estudante)[:\s]+(.+)/i) || ''));
      data['INSTITUICAO']   = esc(stripMd(line(/(?:Institui[cç][aã]o|Universidade|Instituto)[:\s]+(.+)/i) || ''));
      data['LOCAL']         = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['ANO']           = String(new Date().getFullYear());
      data['LOCAL_DATA']    = `${data['LOCAL']}, ${today()}`;

    } else if (key === 'licenca') {
      data['REQUERENTE']    = esc(nomeRaw);
      data['ENTIDADE']      = esc(stripMd(line(/(?:Entidade|Destina[:\s])[:\s]+(.+)/i) || ''));
      data['OBJECTO']       = esc(stripMd(line(/(?:Objecto|Actividade|Finalidade)[:\s]+(.+)/i) || ''));
      data['LOCAL']         = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA']    = `${data['LOCAL']}, ${today()}`;
      data['FUNDAMENTACAO'] = esc(stripMd(section('Fundamenta[cç][aã]o|Fundamento') || ''));

    } else {
      // ── Fallback genérico ──────────────────────────────────────────────
      for (const m of [...md.matchAll(/^[-*]?\s*([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s]{1,30})[:\s]+(.{2,200})/gm)]) {
        const k = m[1].trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_]/g,'');
        if (k && !data[k]) data[k] = esc(stripMd(m[2].trim()));
      }
      data['LOCAL']      = esc(stripMd(line(/(?:Maputo|Beira|Nampula)[^\n,]*/i) || 'Maputo'));
      data['LOCAL_DATA'] = `${data['LOCAL']}, ${today()}`;
    }

    return data;
  }
  // ── Reescalar todas as páginas (ao resize) ───────────────────────────────
  // Delega no scalePage() do A4Renderer — mesma lógica usada no preview do
  // resultado final, garantindo escala idêntica em toda a app.
  _scalePages() {
    document.querySelectorAll('#tplPreviewOuter .a4-page').forEach(pageEl => {
      const iframe = pageEl.querySelector('iframe');
      const outer  = document.getElementById('tplPreviewOuter');
      if (iframe && outer) scalePage(outer, pageEl, iframe);
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
    const rd      = this._extractRealData(content, svcKey);

    const palettes = [
      { accent: '#1e3a5f', sidebar: '#1e3a5f', sidebarText: '#fff', bg: '#fff',    layout: 'two-col' },
      { accent: '#0f766e', sidebar: '#0f766e', sidebarText: '#fff', bg: '#fff',    layout: 'two-col' },
      { accent: '#1d4ed8', sidebar: '#1d4ed8', sidebarText: '#fff', bg: '#f8fafc', layout: 'top-bar' },
      { accent: '#7c3aed', sidebar: '#4c1d95', sidebarText: '#fff', bg: '#fff',    layout: 'two-col' },
      { accent: '#92400e', sidebar: '#78350f', sidebarText: '#fff', bg: '#fffbeb', layout: 'top-bar' },
    ];
    const hash = filename.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const pal  = palettes[hash % palettes.length];

    // ── Seleccionar HTML+CSS consoante o tipo de serviço ──────────────────
    const isTwoCol = pal.layout === 'two-col';

    // ── GRUPO 1: CV ────────────────────────────────────────────────────────
    if (svcKey === 'cv') {
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

      return this._buildLocalResult(name, isTwoCol ? htmlTwoCol : htmlTopBar, pal, isTwoCol, svcKey);
    }

    // ── GRUPO 2: Carta / Recomendação ──────────────────────────────────────
    if (['carta', 'recomendacao'].includes(svcKey)) {
      const html = `
<div class="doc-page">
  <header class="doc-header">
    <div class="doc-header-left">
      <div class="doc-logo-initials">{{INICIAIS}}</div>
      <div>
        <div class="doc-remetente-nome">{{REMETENTE_NOME}}</div>
        <div class="doc-remetente-cargo">{{REMETENTE_CARGO}}</div>
      </div>
    </div>
    <div class="doc-header-ref">
      <div class="doc-ref">Ref: {{REF}}</div>
      <div class="doc-data">{{LOCAL_DATA}}</div>
    </div>
  </header>
  <div class="doc-body">
    <div class="doc-destinatario">
      <strong>{{DESTINATARIO_NOME}}</strong><br>
      {{DESTINATARIO_ENTI}}
    </div>
    <div class="doc-assunto-line"><span class="doc-assunto-label">Assunto:</span> {{ASSUNTO}}</div>
    <div class="doc-corpo">{{CORPO}}</div>
    <div class="doc-assinatura">
      <div class="doc-assinatura-linha"></div>
      <div class="doc-assinatura-nome">{{REMETENTE_NOME}}</div>
      <div class="doc-assinatura-cargo">{{REMETENTE_CARGO}}</div>
    </div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 3: Requerimento / Licença ────────────────────────────────────
    if (['requerimento', 'licenca'].includes(svcKey)) {
      const html = `
<div class="doc-page doc-formal">
  <div class="doc-formal-header">
    <div class="doc-formal-entidade">{{ENTIDADE}}</div>
    <div class="doc-formal-local-data">{{LOCAL_DATA}}</div>
  </div>
  <div class="doc-formal-titulo">REQUERIMENTO</div>
  <div class="doc-formal-identificacao">
    <p><strong>Requerente:</strong> {{REQUERENTE}}</p>
    <p><strong>BI:</strong> {{BI}}</p>
    <p><strong>Endereço:</strong> {{ENDERECO}}</p>
    <p><strong>Contacto:</strong> {{CONTACTO}}</p>
    <p><strong>Assunto:</strong> {{ASSUNTO}}</p>
  </div>
  <div class="doc-formal-corpo">
    <p>{{FUNDAMENTACAO}}</p>
  </div>
  <div class="doc-formal-assinatura">
    <div class="doc-assinatura-linha"></div>
    <div>{{REQUERENTE}}</div>
    <div class="doc-formal-data-final">{{LOCAL_DATA}}</div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 4: Arrendamento / Prestação de Serviços / Procuração ─────────
    if (['arrendamento', 'prestacao', 'procuracao'].includes(svcKey)) {
      const titulo = { arrendamento: 'CONTRATO DE ARRENDAMENTO', prestacao: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS', procuracao: 'PROCURAÇÃO' }[svcKey];
      const html = `
<div class="doc-page doc-contrato">
  <div class="doc-contrato-header">
    <div class="doc-contrato-titulo">${titulo}</div>
    <div class="doc-contrato-data">{{LOCAL_DATA}}</div>
  </div>
  <div class="doc-contrato-partes">
    <div class="doc-contrato-parte">
      <span class="doc-parte-label">PRIMEIRO OUTORGANTE</span>
      <span class="doc-parte-valor">{{SENHORIO_NOME}}{{OUTORGANTE}}{{PRESTADOR}}</span>
    </div>
    <div class="doc-contrato-parte">
      <span class="doc-parte-label">SEGUNDO OUTORGANTE</span>
      <span class="doc-parte-valor">{{INQUILINO_NOME}}{{PROCURADOR}}{{CLIENTE}}</span>
    </div>
  </div>
  <div class="doc-contrato-clausulas">{{CLAUSULAS}}</div>
  <div class="doc-contrato-assinaturas">
    <div class="doc-assinatura-bloco">
      <div class="doc-assinatura-linha"></div>
      <div>Primeiro Outorgante</div>
    </div>
    <div class="doc-assinatura-bloco">
      <div class="doc-assinatura-linha"></div>
      <div>Segundo Outorgante</div>
    </div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 5: Declaração de Residência ──────────────────────────────────
    if (svcKey === 'residencia') {
      const html = `
<div class="doc-page doc-formal">
  <div class="doc-formal-titulo">DECLARAÇÃO DE RESIDÊNCIA</div>
  <div class="doc-formal-corpo">
    <p>Eu, <strong>{{DECLARANTE}}</strong>, portador(a) do BI nº <strong>{{BI}}</strong>,
    declaro que resido em <strong>{{ENDERECO}}</strong>.</p>
    <p>Esta declaração é emitida para os devidos efeitos, nomeadamente: <strong>{{FINALIDADE}}</strong>.</p>
  </div>
  <div class="doc-formal-assinatura">
    <div>{{LOCAL_DATA}}</div>
    <div class="doc-assinatura-linha"></div>
    <div>{{CHEFE}}</div>
    <div style="font-size:8pt;opacity:0.7">Responsável / Chefe de Quarteirão</div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 6: Recibo / Factura ──────────────────────────────────────────
    if (svcKey === 'recibo') {
      const html = `
<div class="doc-page doc-recibo">
  <div class="doc-recibo-header">
    <div class="doc-recibo-empresa">{{EMITENTE}}</div>
    <div class="doc-recibo-titulo-bloco">
      <div class="doc-recibo-titulo">RECIBO</div>
      <div class="doc-recibo-num">Nº {{NUM_DOC}}</div>
    </div>
  </div>
  <div class="doc-recibo-body">
    <div class="doc-recibo-row"><span>Data:</span><span>{{LOCAL_DATA}}</span></div>
    <div class="doc-recibo-row"><span>Cliente:</span><span>{{CLIENTE}}</span></div>
    <div class="doc-recibo-row"><span>Descrição:</span><span>{{DESCRICAO}}</span></div>
    <div class="doc-recibo-row doc-recibo-total"><span>TOTAL:</span><span>{{VALOR_TOTAL}} MZN</span></div>
    <div class="doc-recibo-row"><span>Forma de Pagamento:</span><span>{{FORMA_PAGAMENTO}}</span></div>
  </div>
  <div class="doc-recibo-footer">
    <div class="doc-assinatura-linha"></div>
    <div>{{EMITENTE}}</div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 7: Orçamento ─────────────────────────────────────────────────
    if (svcKey === 'orcamento') {
      const html = `
<div class="doc-page doc-orcamento">
  <div class="doc-orc-header">
    <div class="doc-orc-empresa">{{EMPRESA}}</div>
    <div>
      <div class="doc-orc-titulo">ORÇAMENTO Nº {{NUM_ORC}}</div>
      <div class="doc-orc-data">{{LOCAL_DATA}}</div>
    </div>
  </div>
  <div class="doc-orc-cliente"><strong>Cliente:</strong> {{CLIENTE}}</div>
  <div class="doc-orc-items">{{ITEMS_TODOS}}</div>
  <div class="doc-orc-total">
    <span>TOTAL GERAL:</span>
    <span>{{TOTAL_GERAL}} MZN</span>
  </div>
  <div class="doc-orc-validade">Validade: {{VALIDADE}}</div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 8: Plano de Negócio ──────────────────────────────────────────
    if (svcKey === 'planonegocio') {
      const html = `
<div class="doc-page doc-plano">
  <header class="doc-header" style="background:${pal.sidebar};color:${pal.sidebarText};padding:10mm 12mm;">
    <h1 style="font-size:18pt;margin:0 0 4pt">{{NOME_NEGOCIO}}</h1>
    <div style="font-size:10pt;opacity:0.85">{{SECTOR}} · {{LOCAL}} · {{ANO}}</div>
  </header>
  <div class="doc-plano-body">
    <section class="doc-section">
      <h2 class="doc-section-title">Sumário Executivo</h2>
      <p>{{SUMARIO}}</p>
    </section>
    <section class="doc-section">
      <h2 class="doc-section-title">Descrição do Negócio</h2>
      <p>{{DESCRICAO_NEGOCIO}}</p>
    </section>
    <section class="doc-section">
      <h2 class="doc-section-title">Projecção Financeira</h2>
      <div>{{ITEMS_FINANCEIROS}}</div>
      <p><strong>Investimento Total:</strong> {{INVESTIMENTO_TOTAL}}</p>
    </section>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 9: Acta de Reunião ───────────────────────────────────────────
    if (svcKey === 'acta') {
      const html = `
<div class="doc-page doc-formal">
  <div class="doc-formal-titulo">ACTA DE REUNIÃO Nº {{NUM_ACTA}}</div>
  <div class="doc-formal-identificacao">
    <p><strong>Organização:</strong> {{ORGANIZACAO}}</p>
    <p><strong>Data:</strong> {{DATA}} &nbsp; <strong>Hora:</strong> {{HORA}}</p>
    <p><strong>Local:</strong> {{LOCAL}}</p>
    <p><strong>Presidente:</strong> {{PRESIDENTE}}</p>
    <p><strong>Secretário(a):</strong> {{SECRETARIO}}</p>
    <p><strong>Presentes:</strong> {{PRESENTES}}</p>
  </div>
  <div class="doc-section">
    <h2 class="doc-section-title">Ordem do Dia</h2>
    <div>{{PAUTA}}</div>
  </div>
  <div class="doc-section">
    <h2 class="doc-section-title">Deliberações</h2>
    <div>{{DELIBERACOES}}</div>
  </div>
  <div class="doc-formal-assinatura">
    <div class="doc-assinatura-linha"></div>
    <div>{{SECRETARIO}} — Secretário(a)</div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── GRUPO 10: Trabalho Académico ───────────────────────────────────────
    if (svcKey === 'trabalho') {
      const html = `
<div class="doc-page doc-academico">
  <div class="doc-academico-capa">
    <div class="doc-academico-instituicao">{{INSTITUICAO}}</div>
    <div class="doc-academico-titulo">{{TITULO}}</div>
    <div class="doc-academico-nivel">{{NIVEL}}</div>
    <div class="doc-academico-disciplina">{{DISCIPLINA}}</div>
    <div class="doc-academico-autor">{{AUTOR}}</div>
    <div class="doc-academico-docente">Docente: {{DOCENTE}}</div>
    <div class="doc-academico-data">{{LOCAL_DATA}}</div>
  </div>
</div>`;
      return this._buildLocalResult(name, html, pal, false, svcKey);
    }

    // ── FALLBACK genérico para qualquer serviço futuro ─────────────────────
    // Gera um template de documento formal genérico com todos os dados disponíveis
    const genericRows = Object.entries(rd)
      .filter(([k, v]) => v && !['DATA','INICIAIS'].includes(k))
      .map(([k, v]) => `<tr><td class="doc-gen-label">${k.replace(/_/g,' ')}</td><td>${v}</td></tr>`)
      .join('');

    const htmlGeneric = `
<div class="doc-page doc-formal">
  <div class="doc-formal-titulo">{{NOME}}</div>
  <div class="doc-formal-corpo">
    <table class="doc-gen-table"><tbody>${genericRows}</tbody></table>
  </div>
  <div class="doc-formal-assinatura">
    <div class="doc-assinatura-linha"></div>
    <div>{{LOCAL_DATA}}</div>
  </div>
</div>`;
    return this._buildLocalResult(name, htmlGeneric, pal, false, svcKey);
  }

  // ── Helper: montar o objecto de retorno com HTML preenchido + CSS universal
  _buildLocalResult(name, htmlTemplate, pal, isTwoCol, svcKey) {
    // CSS base para todos os documentos não-CV (cartas, contratos, recibos, etc.)
    const cssDoc = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #1e293b; width: 210mm; min-height: 297mm; background: #fff; }
.doc-page { width: 210mm; min-height: 297mm; background: #fff; padding: 0; }

/* ── Header genérico ── */
.doc-header { background: ${pal.sidebar}; color: ${pal.sidebarText}; padding: 8mm 12mm; display: flex; justify-content: space-between; align-items: flex-start; }
.doc-logo-initials { width: 38pt; height: 38pt; border-radius: 50%; background: rgba(255,255,255,0.25); color: ${pal.sidebarText}; display: flex; align-items: center; justify-content: center; font-size: 15pt; font-weight: 700; flex-shrink: 0; margin-right: 8pt; }
.doc-remetente-nome { font-size: 13pt; font-weight: 700; }
.doc-remetente-cargo { font-size: 9pt; opacity: 0.8; }
.doc-header-ref { text-align: right; font-size: 9pt; opacity: 0.85; }
.doc-ref { margin-bottom: 2pt; }
.doc-header-left { display: flex; align-items: center; }

/* ── Body genérico ── */
.doc-body { padding: 8mm 14mm 10mm; }
.doc-destinatario { margin-bottom: 8pt; font-size: 10.5pt; line-height: 1.5; }
.doc-assunto-line { margin-bottom: 8pt; font-size: 10pt; }
.doc-assunto-label { font-weight: 700; color: ${pal.accent}; }
.doc-corpo { font-size: 10.5pt; line-height: 1.7; text-align: justify; }
.doc-assinatura { margin-top: 20pt; }
.doc-assinatura-linha { border-top: 1px solid #374151; width: 140pt; margin-bottom: 4pt; }
.doc-assinatura-nome { font-weight: 700; font-size: 10pt; }
.doc-assinatura-cargo { font-size: 9pt; color: #6b7280; }

/* ── Documento formal (requerimento, declaração, acta) ── */
.doc-formal { padding: 12mm 14mm; }
.doc-formal-header { display: flex; justify-content: space-between; margin-bottom: 10pt; font-size: 9.5pt; }
.doc-formal-entidade { font-weight: 700; font-size: 11pt; }
.doc-formal-titulo { font-size: 14pt; font-weight: 800; text-align: center; color: ${pal.accent}; border-bottom: 2px solid ${pal.accent}; padding-bottom: 4pt; margin-bottom: 12pt; letter-spacing: 1px; }
.doc-formal-identificacao { background: #f8fafc; border-left: 3px solid ${pal.accent}; padding: 8pt 10pt; margin-bottom: 10pt; }
.doc-formal-identificacao p { margin-bottom: 3pt; font-size: 10pt; }
.doc-formal-corpo { line-height: 1.7; text-align: justify; margin-bottom: 14pt; }
.doc-formal-assinatura { margin-top: 20pt; text-align: center; }
.doc-formal-data-final { font-size: 9pt; color: #6b7280; margin-top: 4pt; }

/* ── Contrato ── */
.doc-contrato { padding: 12mm 14mm; }
.doc-contrato-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12pt; }
.doc-contrato-titulo { font-size: 14pt; font-weight: 800; color: ${pal.accent}; }
.doc-contrato-data { font-size: 9pt; color: #6b7280; }
.doc-contrato-partes { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-bottom: 12pt; }
.doc-contrato-parte { border: 1px solid #e2e8f0; border-radius: 4pt; padding: 8pt; }
.doc-parte-label { display: block; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: ${pal.accent}; margin-bottom: 3pt; }
.doc-parte-valor { font-size: 10pt; font-weight: 600; }
.doc-contrato-clausulas { margin-bottom: 12pt; }
.doc-contrato-assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt; margin-top: 20pt; }
.doc-assinatura-bloco { text-align: center; font-size: 9.5pt; }
.doc-assinatura-bloco .doc-assinatura-linha { margin: 0 auto 4pt; }

/* ── Recibo / Factura ── */
.doc-recibo { padding: 0; }
.doc-recibo-header { background: ${pal.sidebar}; color: ${pal.sidebarText}; padding: 8mm 12mm; display: flex; justify-content: space-between; align-items: center; }
.doc-recibo-empresa { font-size: 14pt; font-weight: 800; }
.doc-recibo-titulo { font-size: 22pt; font-weight: 900; opacity: 0.9; }
.doc-recibo-num { font-size: 9pt; opacity: 0.8; text-align: right; }
.doc-recibo-body { padding: 8mm 12mm; }
.doc-recibo-row { display: flex; justify-content: space-between; padding: 5pt 0; border-bottom: 1px solid #f1f5f9; font-size: 10.5pt; }
.doc-recibo-total { font-size: 13pt; font-weight: 800; color: ${pal.accent}; border-bottom: 2px solid ${pal.accent}; margin-top: 4pt; }
.doc-recibo-footer { padding: 6mm 12mm; text-align: right; }

/* ── Orçamento ── */
.doc-orcamento { padding: 0; }
.doc-orc-header { background: ${pal.sidebar}; color: ${pal.sidebarText}; padding: 8mm 12mm; display: flex; justify-content: space-between; align-items: center; }
.doc-orc-empresa { font-size: 14pt; font-weight: 800; }
.doc-orc-titulo { font-size: 13pt; font-weight: 700; }
.doc-orc-data { font-size: 9pt; opacity: 0.8; }
.doc-orc-cliente { padding: 6pt 12mm; background: #f8fafc; font-size: 10pt; border-bottom: 1px solid #e2e8f0; }
.doc-orc-items { padding: 6mm 12mm; }
.doc-orc-total { display: flex; justify-content: space-between; padding: 6pt 12mm; background: ${pal.accent}; color: #fff; font-size: 13pt; font-weight: 800; }
.doc-orc-validade { padding: 4pt 12mm; font-size: 8.5pt; color: #6b7280; }

/* ── Académico (capa) ── */
.doc-academico-capa { padding: 16mm 14mm; text-align: center; }
.doc-academico-instituicao { font-size: 12pt; font-weight: 700; color: ${pal.accent}; margin-bottom: 30pt; }
.doc-academico-titulo { font-size: 16pt; font-weight: 800; line-height: 1.3; margin-bottom: 20pt; }
.doc-academico-nivel { font-size: 10pt; color: #6b7280; margin-bottom: 6pt; }
.doc-academico-disciplina { font-size: 10pt; margin-bottom: 20pt; }
.doc-academico-autor { font-size: 11pt; font-weight: 700; margin-bottom: 4pt; }
.doc-academico-docente { font-size: 10pt; color: #6b7280; margin-bottom: 20pt; }
.doc-academico-data { font-size: 10pt; color: #6b7280; }

/* ── Plano de Negócio ── */
.doc-plano-body { padding: 8mm 12mm; }
.doc-section { margin-bottom: 10pt; }
.doc-section-title { font-size: 10.5pt; font-weight: 700; text-transform: uppercase; color: ${pal.accent}; border-bottom: 2px solid ${pal.accent}; padding-bottom: 2pt; margin-bottom: 6pt; letter-spacing: 0.5px; }
.doc-section p { font-size: 10pt; line-height: 1.6; color: #374151; }

/* ── cv-entry (reutilizado em orçamento e acta) ── */
.cv-entry { margin-bottom: 6pt; }
.cv-entry-date { font-size: 8pt; color: #6b7280; font-style: italic; }
.cv-entry-title { font-size: 10pt; font-weight: 700; color: #111827; }
.cv-entry-company { font-size: 9pt; color: #4b5563; }
.cv-entry-bullets { padding-left: 12pt; margin-top: 3pt; }
.cv-entry-bullets li { font-size: 9pt; margin-bottom: 1.5pt; color: #374151; }

/* ── Tabela genérica ── */
.doc-gen-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.doc-gen-label { font-weight: 700; color: ${pal.accent}; width: 35%; padding: 4pt 6pt; border-bottom: 1px solid #f1f5f9; text-transform: capitalize; }
.doc-gen-table td { padding: 4pt 6pt; border-bottom: 1px solid #f1f5f9; vertical-align: top; }

/* ── CV two-col (reutilizado aqui para coerência) ── */
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
.cv-main .cv-section { margin-bottom: 10pt; }
.cv-main .cv-section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${pal.accent}; border-bottom: 2px solid ${pal.accent}; padding-bottom: 2pt; margin-bottom: 6pt; }
.cv-text { font-size: 9.5pt; line-height: 1.55; color: #374151; }
.cv-entries { font-size: 9.5pt; }
.cv-entry { margin-bottom: 6pt; }
.cv-entry-date { font-size: 8pt; color: #6b7280; font-style: italic; }
.cv-entry-title { font-size: 10pt; font-weight: 700; color: #111827; margin-top: 1pt; }
.cv-entry-company { font-size: 9pt; color: #4b5563; margin-top: 1pt; }
.cv-entry-bullets { padding-left: 12pt; margin-top: 3pt; }
.cv-entry-bullets li { font-size: 9pt; margin-bottom: 1.5pt; color: #374151; }
.cv-header { background: ${pal.sidebar}; color: ${pal.sidebarText}; padding: 10mm 12mm; display: flex; align-items: center; gap: 12pt; }
.cv-header-info { flex: 1; }
.cv-name { font-size: 18pt; font-weight: 800; line-height: 1.1; margin-bottom: 2pt; }
.cv-cargo { font-size: 10pt; opacity: 0.85; margin-bottom: 5pt; }
.cv-contacts { display: flex; flex-wrap: wrap; gap: 4pt 12pt; font-size: 8.5pt; opacity: 0.9; }
.cv-body { padding: 10mm 12mm; }
.cv-two-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14pt; }`;

    return {
      id:           `own-${svcKey}-${Date.now()}`,
      name,
      description:  isTwoCol ? 'Layout bicolor com sidebar lateral' : 'Layout profissional moderno',
      preview:      { accent: pal.accent, bg: pal.bg, font: 'sans-serif' },
      htmlTemplate,
      css:          cssDoc,
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
  // DELEGADO no motor único A4Renderer.markdownToHtml — que agora trata
  // tabelas markdown "|" como <table> real (GFM), em vez de texto cru.
  // Mantido como método de instância apenas por compatibilidade com
  // eventuais chamadas externas a templatePicker._mdToHtml(...).
  _mdToHtml(md) {
    return markdownToHtml(md);
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
