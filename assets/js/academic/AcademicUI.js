// assets/js/academic/AcademicUI.js
// Painel de referências académicas APA 7 — integra-se no resultOverlay
// Funções: adicionar fonte manual, upload PDF, extrair por URL, copiar citação, exportar

import { AcademicEngine } from './AcademicEngine.js';
// Notificação inline — sem dependência de Views.js
function _notify(msg) {
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

const PANEL_CSS = `
#academicPanel {
  position: fixed; inset: 0; background: rgba(7,16,31,.75);
  backdrop-filter: blur(10px); z-index: 600;
  display: none; align-items: center; justify-content: center; padding: 12px;
}
#academicPanel.open { display: flex; animation: fadeIn .18s ease; }
#acPanelSheet {
  background: #fff; border-radius: 20px;
  width: 100%; max-width: 680px; max-height: 92vh;
  overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 32px 80px rgba(0,0,0,.28);
  animation: slideUp .28s cubic-bezier(.34,1.1,.64,1);
}
.ac-hdr {
  display: flex; align-items: center; gap: 10px;
  padding: 15px 20px; border-bottom: 1px solid #e2e8f0;
  background: #f8fafc; border-radius: 20px 20px 0 0; flex-shrink: 0;
}
.ac-hdr h2 { font-size: 15px; font-weight: 800; color: #0f172a; margin: 0; flex: 1; }
.ac-hdr-sub { font-size: 11px; color: #64748b; }
.ac-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #64748b; padding: 4px 8px; border-radius: 8px; }
.ac-close:hover { background: #e2e8f0; }
.ac-tabs { display: flex; gap: 0; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; background: #f8fafc; }
.ac-tab { background: none; border: none; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; font-family: inherit; }
.ac-tab.active { color: #1d4ed8; border-bottom-color: #3B82F6; background: #fff; }
.ac-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.ac-refs-list { margin-bottom: 12px; }
.ac-ref-item {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 10px 12px; margin-bottom: 8px; position: relative;
}
.ac-ref-apa { font-size: 12px; line-height: 1.6; color: #1e293b; font-family: 'Times New Roman', serif; }
.ac-ref-apa em, .ac-ref-apa i { font-style: italic; }
.ac-ref-actions { display: flex; gap: 6px; margin-top: 6px; }
.ac-ref-btn {
  font-size: 11px; padding: 3px 9px; border-radius: 8px;
  border: 1px solid #e2e8f0; background: #fff; cursor: pointer;
  font-family: inherit; color: #374151; transition: all .12s;
}
.ac-ref-btn:hover { border-color: #3B82F6; color: #1d4ed8; }
.ac-ref-btn.danger:hover { border-color: #ef4444; color: #dc2626; background: #fef2f2; }
.ac-form label { display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 4px; margin-top: 12px; }
.ac-form input, .ac-form select, .ac-form textarea {
  width: 100%; padding: 8px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; font-family: inherit; color: #0f172a; background: #fff;
  transition: border-color .15s; box-sizing: border-box;
}
.ac-form input:focus, .ac-form select:focus, .ac-form textarea:focus {
  outline: none; border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59,130,246,.1);
}
.ac-form textarea { min-height: 70px; resize: vertical; }
.ac-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ac-btn {
  background: linear-gradient(135deg, #1e40af, #3B82F6);
  color: #fff; border: none; border-radius: 10px;
  padding: 10px 20px; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: inherit; margin-top: 14px;
  display: inline-block; transition: all .15s;
}
.ac-btn:hover { opacity: .88; transform: translateY(-1px); }
.ac-btn.secondary { background: #f1f5f9; color: #0f172a; border: 1.5px solid #e2e8f0; }
.ac-btn.secondary:hover { border-color: #3B82F6; background: #eff6ff; }
.ac-upload-zone {
  border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px;
  text-align: center; cursor: pointer; transition: all .15s; margin-bottom: 12px;
}
.ac-upload-zone:hover, .ac-upload-zone.drag { border-color: #3B82F6; background: #eff6ff; }
.ac-upload-zone p { font-size: 13px; color: #64748b; margin-top: 6px; }
.ac-upload-zone span { font-size: 28px; }
.ac-url-row { display: flex; gap: 8px; margin-top: 8px; }
.ac-url-row input { flex: 1; }
.ac-bib-out {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 12px; font-family: 'Times New Roman', serif; font-size: 12px;
  line-height: 1.8; white-space: pre-wrap; word-break: break-word;
  max-height: 300px; overflow-y: auto;
}
.ac-empty { text-align: center; color: #94a3b8; font-size: 13px; padding: 24px 0; }
.ac-footer {
  padding: 12px 20px; border-top: 1px solid #e2e8f0;
  background: #f8fafc; display: flex; gap: 10px;
  justify-content: flex-end; flex-shrink: 0; flex-wrap: wrap;
}
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes slideUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
`;

export class AcademicUI {
  constructor() {
    this._tab      = 'refs';
    this._injected = false;
    this._onInsert = null; // callback(bibMarkdown)
  }

  open(onInsert = null) {
    this._onInsert = onInsert;
    this._inject();
    this._renderRefs();
    document.getElementById('academicPanel')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    document.getElementById('academicPanel')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Injecção única ────────────────────────────────────────────────────
  _inject() {
    if (this._injected) return;
    this._injected = true;

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'academicPanel';
    panel.innerHTML = `
      <div id="acPanelSheet">
        <div class="ac-hdr">
          <div>
            <h2>📚 Referências Bibliográficas APA 7</h2>
            <div class="ac-hdr-sub" id="acRefCount">0 referências</div>
          </div>
          <button class="ac-close" id="acClose">✕</button>
        </div>
        <div class="ac-tabs">
          <button class="ac-tab active" data-tab="refs">📋 Referências</button>
          <button class="ac-tab" data-tab="add">➕ Adicionar</button>
          <button class="ac-tab" data-tab="pdf">📄 Upload PDF</button>
          <button class="ac-tab" data-tab="url">🔗 Por URL</button>
          <button class="ac-tab" data-tab="bib">📖 Bibliografia</button>
        </div>
        <div class="ac-body" id="acBody"></div>
        <div class="ac-footer">
          <button class="ac-btn secondary" id="acBtnCopy">📋 Copiar Tudo</button>
          <button class="ac-btn" id="acBtnInsert">✅ Inserir no Documento</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById('acClose')?.addEventListener('click', () => this.close());
    panel.addEventListener('click', e => { if (e.target === panel) this.close(); });

    panel.querySelectorAll('.ac-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.ac-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._tab = btn.dataset.tab;
        this._renderTab();
      });
    });

    document.getElementById('acBtnInsert')?.addEventListener('click', () => this._insertBib());
    document.getElementById('acBtnCopy')?.addEventListener('click', () => this._copyBib());
  }

  // ── Tabs ──────────────────────────────────────────────────────────────
  _renderTab() {
    switch (this._tab) {
      case 'refs': return this._renderRefs();
      case 'add':  return this._renderAddForm();
      case 'pdf':  return this._renderPDFUpload();
      case 'url':  return this._renderURLForm();
      case 'bib':  return this._renderBibliography();
    }
  }

  _updateCount() {
    const n = AcademicEngine.getReferences().length;
    const el = document.getElementById('acRefCount');
    if (el) el.textContent = `${n} referência${n !== 1 ? 's' : ''}`;
  }

  // ── Tab: Lista de referências ─────────────────────────────────────────
  _renderRefs() {
    const refs = AcademicEngine.getReferences();
    const body = document.getElementById('acBody');
    if (!body) return;

    this._updateCount();

    if (!refs.length) {
      body.innerHTML = `<div class="ac-empty">
        <div style="font-size:36px;margin-bottom:8px">📚</div>
        <p>Sem referências ainda.<br>Use os separadores acima para adicionar fontes.</p>
      </div>`;
      return;
    }

    body.innerHTML = `<div class="ac-refs-list">${refs.map(r => `
      <div class="ac-ref-item" data-ref-id="${r.id}">
        <div class="ac-ref-apa">${this._renderAPA(r.apa || '')}</div>
        <div class="ac-ref-actions">
          <button class="ac-ref-btn" data-action="copy-cite" data-id="${r.id}" title="Copiar citação in-text">📎 Citar</button>
          <button class="ac-ref-btn" data-action="copy-apa"  data-id="${r.id}" title="Copiar referência APA">📋 Copiar</button>
          <button class="ac-ref-btn danger" data-action="remove" data-id="${r.id}" title="Remover">🗑️</button>
        </div>
      </div>`).join('')}</div>`;

    body.querySelectorAll('.ac-ref-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const { action, id } = btn.dataset;
        const ref = refs.find(r => r.id === id);
        if (!ref) return;
        if (action === 'remove') {
          AcademicEngine.removeReference(id);
          this._renderRefs();
        } else if (action === 'copy-cite') {
          navigator.clipboard?.writeText(ref.citation || '').then(() => _notify('✅ Citação copiada!'));
        } else if (action === 'copy-apa') {
          navigator.clipboard?.writeText(ref.apa || '').then(() => _notify('✅ Referência APA copiada!'));
        }
      });
    });
  }

  // Renderizar APA com itálico nos títulos de livros/revistas (asteriscos markdown)
  _renderAPA(apa) {
    return apa.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
  }

  // ── Tab: Adicionar manualmente ────────────────────────────────────────
  _renderAddForm() {
    const body = document.getElementById('acBody');
    if (!body) return;

    body.innerHTML = `
      <div class="ac-form">
        <label>Tipo de fonte</label>
        <select id="acSourceType">
          <option value="book">Livro</option>
          <option value="article">Artigo Científico</option>
          <option value="website">Website</option>
          <option value="thesis">Tese / Dissertação</option>
          <option value="chapter">Capítulo de Livro</option>
          <option value="conference">Conferência</option>
          <option value="report">Relatório</option>
          <option value="newspaper">Jornal / Notícia</option>
        </select>

        <label>Autor(es) <span style="font-weight:400;color:#64748b">(um por linha: Apelido, Nome)</span></label>
        <textarea id="acAuthors" placeholder="Machel, Graça&#10;Mondlane, Eduardo" rows="2"></textarea>

        <label>Ano de publicação</label>
        <input id="acYear" type="text" placeholder="2024" maxlength="6">

        <label>Título</label>
        <input id="acTitle" type="text" placeholder="Título completo do trabalho">

        <div id="acExtraFields"></div>

        <button class="ac-btn" id="acBtnAddRef">➕ Adicionar Referência</button>
      </div>`;

    const typeSelect = document.getElementById('acSourceType');
    typeSelect.addEventListener('change', () => this._renderExtraFields(typeSelect.value));
    this._renderExtraFields('book');

    document.getElementById('acBtnAddRef')?.addEventListener('click', () => this._addManualRef());
  }

  _renderExtraFields(type) {
    const container = document.getElementById('acExtraFields');
    if (!container) return;

    const fields = {
      book:       `<label>Editora</label><input id="acPub" placeholder="Imprensa Universitária">
                   <div class="ac-form-row"><div><label>Cidade</label><input id="acCity" placeholder="Maputo"></div><div><label>Edição</label><input id="acEdition" placeholder="2.ª"></div></div>`,
      article:    `<label>Revista / Journal</label><input id="acJournal" placeholder="Revista Moçambicana de Ciências">
                   <div class="ac-form-row">
                     <div><label>Volume</label><input id="acVol" placeholder="12"></div>
                     <div><label>Número</label><input id="acIssue" placeholder="3"></div>
                   </div>
                   <label>Páginas</label><input id="acPages" placeholder="45–67">
                   <label>DOI (sem https://doi.org/)</label><input id="acDoi" placeholder="10.xxxx/xxxxx">`,
      website:    `<label>Nome do site</label><input id="acSiteName" placeholder="Portal do Governo de Moçambique">
                   <label>URL completo</label><input id="acUrl" type="url" placeholder="https://...">`,
      thesis:     `<label>Grau académico</label><input id="acDegree" placeholder="Dissertação de mestrado">
                   <label>Universidade</label><input id="acUni" placeholder="Universidade Eduardo Mondlane">`,
      chapter:    `<label>Editores do livro</label><input id="acEditors" placeholder="Silva, J. & Santos, M.">
                   <label>Título do livro</label><input id="acBookTitle" placeholder="Título do livro colectivo">
                   <label>Páginas do capítulo</label><input id="acPages" placeholder="45–67">
                   <label>Editora</label><input id="acPub" placeholder="Editora">`,
      conference: `<label>Nome da conferência</label><input id="acConf" placeholder="Conferência Internacional de Educação">
                   <label>Local</label><input id="acLocation" placeholder="Maputo, Moçambique">
                   <label>URL (opcional)</label><input id="acUrl" type="url" placeholder="https://...">`,
      report:     `<label>Instituição</label><input id="acInst" placeholder="Ministério da Educação">
                   <label>Número do relatório (opcional)</label><input id="acRepNum" placeholder="REL-2024-01">
                   <label>URL (opcional)</label><input id="acUrl" type="url" placeholder="https://...">`,
      newspaper:  `<label>Nome do jornal</label><input id="acNewspaper" placeholder="O País">
                   <label>URL (opcional)</label><input id="acUrl" type="url" placeholder="https://...">`,
    };
    container.innerHTML = fields[type] || '';
  }

  _addManualRef() {
    const g = id => (document.getElementById(id)?.value || '').trim();
    const type = g('acSourceType') || 'book';

    const rawAuthors = g('acAuthors').split('\n').map(a => a.trim()).filter(Boolean);
    const authors = rawAuthors.map(a => {
      const parts = a.split(',').map(p => p.trim());
      return parts.length >= 2 ? { last: parts[0], first: parts[1] } : a;
    });

    const source = {
      type,
      authors,
      year:       g('acYear') || 'n.d.',
      title:      g('acTitle'),
      publisher:  g('acPub'),
      journal:    g('acJournal'),
      volume:     g('acVol'),
      issue:      g('acIssue'),
      pages:      g('acPages'),
      doi:        g('acDoi'),
      url:        g('acUrl'),
      siteName:   g('acSiteName'),
      degree:     g('acDegree'),
      university: g('acUni'),
      conference: g('acConf'),
      location:   g('acLocation'),
      institution:g('acInst'),
      reportNumber: g('acRepNum'),
      newspaper:  g('acNewspaper'),
      city:       g('acCity'),
      edition:    g('acEdition'),
    };

    if (!source.title) { _notify('Insira o título da fonte.'); return; }

    const ref = AcademicEngine.addReference(source);
    if (ref) {
      _notify('✅ Referência adicionada!');
      this._tab = 'refs';
      document.querySelectorAll('.ac-tab').forEach((b,i) => b.classList.toggle('active', i===0));
      this._renderRefs();
    } else {
      _notify('Esta fonte já foi adicionada.');
    }
  }

  // ── Tab: Upload PDF ───────────────────────────────────────────────────
  _renderPDFUpload() {
    const body = document.getElementById('acBody');
    if (!body) return;

    body.innerHTML = `
      <p style="font-size:13px;color:#64748b;margin-bottom:14px">
        Carregue um PDF académico para extrair as referências bibliográficas automaticamente.
      </p>
      <div class="ac-upload-zone" id="acDropZone">
        <span>📄</span>
        <p>Clique ou arraste o PDF aqui</p>
        <p style="font-size:11px;color:#94a3b8">Formatos aceites: PDF, DOCX</p>
        <input type="file" id="acFileInput" accept=".pdf,.docx,.txt" style="display:none">
      </div>
      <div id="acPdfStatus" style="font-size:13px;color:#64748b;margin-top:8px"></div>
      <div id="acPdfRefs"></div>`;

    const zone  = document.getElementById('acDropZone');
    const input = document.getElementById('acFileInput');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      if (e.dataTransfer.files[0]) this._processPDFFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => { if (input.files[0]) this._processPDFFile(input.files[0]); });
  }

  async _processPDFFile(file) {
    const status = document.getElementById('acPdfStatus');
    const refsEl = document.getElementById('acPdfRefs');
    if (status) status.textContent = '⏳ A processar ficheiro…';

    try {
      let text = '';

      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        text = await file.text();
      } else if (file.name.endsWith('.pdf')) {
        // Tentar extrair texto do PDF via pdfjsLib
        text = await this._extractPDFText(file);
      } else if (file.name.endsWith('.docx')) {
        text = await this._extractDocxText(file);
      }

      const refs = AcademicEngine.extractReferencesFromPDF(text);

      if (!refs.length) {
        if (status) status.textContent = '⚠️ Não foi possível extrair referências. Tente copiar o texto manualmente.';
        return;
      }

      if (status) status.textContent = `✅ ${refs.length} referências detectadas. Seleccione as que pretende adicionar:`;

      if (refsEl) {
        refsEl.innerHTML = refs.map((r, i) => `
          <div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
            <input type="checkbox" id="acPdfRef_${i}" checked style="margin-top:3px;flex-shrink:0">
            <label for="acPdfRef_${i}" style="font-size:11.5px;color:#1e293b;line-height:1.5;cursor:pointer">
              ${r.raw?.slice(0, 180) || 'Referência sem texto'}
            </label>
          </div>`).join('');

        const addBtn = document.createElement('button');
        addBtn.className = 'ac-btn';
        addBtn.style.marginTop = '10px';
        addBtn.textContent = '➕ Adicionar seleccionadas';
        addBtn.addEventListener('click', () => {
          let added = 0;
          refs.forEach((r, i) => {
            if (document.getElementById(`acPdfRef_${i}`)?.checked) {
              if (AcademicEngine.addReference(r)) added++;
            }
          });
          _notify(`✅ ${added} referência(s) adicionada(s)!`);
          this._updateCount();
        });
        refsEl.appendChild(addBtn);
      }
    } catch (err) {
      if (status) status.textContent = `❌ Erro: ${err.message}`;
    }
  }

  async _extractPDFText(file) {
    // Carregar pdf.js se disponível
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf  = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = Math.min(pdf.numPages, 30); // máx 30 páginas
    let text = '';

    for (let p = 1; p <= pages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    return text;
  }

  async _extractDocxText(file) {
    if (!window.mammoth) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  }

  // ── Tab: Por URL ──────────────────────────────────────────────────────
  _renderURLForm() {
    const body = document.getElementById('acBody');
    if (!body) return;

    body.innerHTML = `
      <div class="ac-form">
        <label>URL da página / artigo</label>
        <div class="ac-url-row">
          <input id="acUrlInput" type="url" placeholder="https://www.exemplo.com/artigo">
          <button class="ac-btn" id="acBtnUrl" style="margin-top:0;white-space:nowrap">Extrair</button>
        </div>
        <label>Título <span style="font-weight:400;color:#64748b">(preencha se não for extraído)</span></label>
        <input id="acUrlTitle" placeholder="Título da página">
        <label>Autor(es) (opcional)</label>
        <input id="acUrlAuthors" placeholder="Apelido, Nome">
        <label>Ano (opcional)</label>
        <input id="acUrlYear" placeholder="${new Date().getFullYear()}" maxlength="4">
        <div id="acUrlPreview" style="margin-top:12px"></div>
        <button class="ac-btn" id="acBtnAddUrl" style="display:none">➕ Adicionar à Biblioteca</button>
      </div>`;

    let _currentSource = null;

    document.getElementById('acBtnUrl')?.addEventListener('click', () => {
      const url = document.getElementById('acUrlInput')?.value.trim();
      if (!url) { _notify('Insira um URL.'); return; }

      const extra = {
        title:   document.getElementById('acUrlTitle')?.value.trim() || null,
        authors: document.getElementById('acUrlAuthors')?.value.trim()
          ? [document.getElementById('acUrlAuthors').value.trim()] : [],
        year:    document.getElementById('acUrlYear')?.value.trim() || null,
      };

      _currentSource = AcademicEngine.extractReferencesFromURL(url, extra);
      const apa = AcademicEngine.generateAPA7(_currentSource);

      const preview = document.getElementById('acUrlPreview');
      if (preview) {
        preview.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px">
            <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:6px">REFERÊNCIA APA 7 GERADA:</div>
            <div style="font-family:'Times New Roman',serif;font-size:12.5px;line-height:1.7;color:#14532d">${apa}</div>
          </div>`;
      }
      const addBtn = document.getElementById('acBtnAddUrl');
      if (addBtn) addBtn.style.display = 'inline-block';
    });

    document.getElementById('acBtnAddUrl')?.addEventListener('click', () => {
      if (!_currentSource) return;
      if (AcademicEngine.addReference(_currentSource)) {
        _notify('✅ Referência adicionada!');
        this._updateCount();
      } else {
        _notify('Esta fonte já foi adicionada.');
      }
    });
  }

  // ── Tab: Bibliografia completa ────────────────────────────────────────
  _renderBibliography() {
    const body = document.getElementById('acBody');
    if (!body) return;

    const refs = AcademicEngine.getReferences();
    if (!refs.length) {
      body.innerHTML = `<div class="ac-empty">
        <p>Sem referências ainda para gerar a bibliografia.</p>
      </div>`;
      return;
    }

    const bib = AcademicEngine.generateBibliography(refs);
    const lines = bib.split('\n').slice(2); // remove o ## Referências Bibliográficas

    body.innerHTML = `
      <h3 style="font-size:14px;font-weight:800;margin-bottom:12px;color:#0f172a">Referências Bibliográficas</h3>
      <div class="ac-bib-out">${lines.join('\n')}</div>
      <p style="font-size:11px;color:#94a3b8;margin-top:6px">Ordenadas alfabeticamente · Formato APA 7ª Edição</p>`;
  }

  // ── Acções globais ────────────────────────────────────────────────────
  _insertBib() {
    const refs = AcademicEngine.getReferences();
    if (!refs.length) { _notify('Sem referências para inserir.'); return; }
    const bib = AcademicEngine.generateBibliography(refs);
    this._onInsert?.(bib);
    _notify('✅ Referências inseridas no documento!');
    this.close();
  }

  _copyBib() {
    const refs = AcademicEngine.getReferences();
    if (!refs.length) { _notify('Sem referências para copiar.'); return; }
    const bib = AcademicEngine.generateBibliography(refs);
    navigator.clipboard?.writeText(bib).then(() => _notify('✅ Bibliografia copiada!'));
  }
}

export const academicUI = new AcademicUI();
