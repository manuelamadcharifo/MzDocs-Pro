// assets/js/controllers/HistoryController.js
// Histórico de documentos — Supabase (online) + IndexedDB (offline/fallback)

import { offlineDB } from '../utils/IndexedDB.js';
import { Storage } from '../utils/Storage.js';
import { ModalView, NotificationView } from '../views/Views.js';

const SERVICE_ICONS = {
  trabalho: '📚', cv: '📋', carta: '✉️',
  orcamento: '🏗️', impressao: '🖨️', foto: '📷', conversao: '🔄',
};

export class HistoryController {
  constructor() {
    this._bindEvents();
    this._registerOnlineSync();
  }

  // ── Sync automático ao voltar online ────────────────────────────
  _registerOnlineSync() {
    window.addEventListener('online', () => this._syncPendingToSupabase());
    // Tentar sincronizar também no arranque (caso haja docs offline pendentes)
    if (navigator.onLine) {
      setTimeout(() => this._syncPendingToSupabase(), 3000);
    }
  }

  async _syncPendingToSupabase() {
    const supabase = window.authManager?.supabase;
    const userId   = window.authManager?.user?.id;
    if (!supabase || !userId || !navigator.onLine) return;

    try {
      const allDocs = await offlineDB.getDocuments(userId);
      const pending = allDocs.filter(d => d.synced === false);
      if (pending.length === 0) return;

      console.log(`[History] A sincronizar ${pending.length} doc(s) offline com Supabase…`);

      let synced = 0;
      for (const doc of pending) {
        try {
          // Skip legacy non-UUID IDs — mark as synced locally to stop infinite retry
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(doc.id)) {
            console.warn('[History] Skipping legacy non-UUID doc id:', doc.id, '— marking synced locally');
            await offlineDB.saveDocument({ ...doc, synced: true });
            synced++;
            continue;
          }
          // Use insert with ignoreDuplicates — avoids 400 from missing unique constraint on upsert
          const payload = {
            id:           doc.id,
            user_id:      userId,
            service_type: doc.service_type,
            title:        doc.title,
            content:      doc.content,
            model_used:   doc.model_used,
            created_at:   doc.created_at,
          };
          const { error } = await supabase
            .from('documents')
            .upsert(payload, { ignoreDuplicates: true });

          if (!error) {
            await offlineDB.saveDocument({ ...doc, synced: true });
            synced++;
          } else {
            console.warn('[History] Sync upsert error:', error.code, error.message);
          }
        } catch (_) { /* continua para o próximo */ }
      }

      if (synced > 0) {
        NotificationView.success(`☁️ ${synced} documento${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} com a nuvem.`);
      }
    } catch (e) {
      console.warn('[History] Sync falhou:', e.message);
    }
  }

  _bindEvents() {
    document.getElementById('btnHistory')?.addEventListener('click', () => this.open());
    document.getElementById('historyClose')?.addEventListener('click', () => this.close());
    document.getElementById('historyOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'historyOverlay') this.close();
    });
  }

  async open() {
    ModalView.open('historyOverlay');
    await this._render();
  }

  close() {
    ModalView.close('historyOverlay');
  }

  // ── Guardar documento (chamado pelo DocumentController após geração) ──────
  async saveDocument(doc) {
    // 1. Sempre guardar localmente (offline-first)
    try {
      await offlineDB.saveDocument({ ...doc, synced: false });
    } catch (e) {
      console.warn('[History] IndexedDB save error:', e);
    }

    // 2. Se autenticado, guardar também no Supabase
    const supabase = window.authManager?.supabase;
    const userId   = window.authManager?.user?.id;
    if (!supabase || !userId) return;

    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(doc.id)) {
        console.warn('[History] saveDocument: non-UUID id skipped for Supabase:', doc.id);
        return;
      }
      // FIX 3: incluir template_html no upsert para que o histórico
      // restaure o documento com o template exacto em que foi guardado
      const payload = {
        id:            doc.id,
        user_id:       userId,
        service_type:  doc.service_type,
        title:         doc.title,
        content:       doc.content,
        model_used:    doc.model_used,
        created_at:    doc.created_at,
      };
      if (doc.template_html) payload.template_html = doc.template_html;
      if (doc.template_css)  payload.template_css  = doc.template_css;

      const { error } = await supabase.from('documents').upsert(payload, { ignoreDuplicates: true });
      if (!error) {
        await offlineDB.saveDocument({ ...doc, synced: true });
      } else {
        console.warn('[History] Supabase save error:', error.code, error.message);
      }
    } catch (e) {
      console.warn('[History] Supabase unreachable, ficará em IndexedDB:', e.message);
    }
  }

  // ── Carregar documentos (Supabase se online + autenticado, senão IndexedDB) ─
  async _loadDocuments() {
    const supabase = window.authManager?.supabase;

    // CORRIGIDO: aguardar authManager estar pronto antes de ler o userId.
    // Race condition: open() era chamado logo após o bootstrap e o user ainda
    // não tinha sido resolvido — a query ao Supabase devolvia 0 resultados
    // e o histórico aparecia vazio mesmo com documentos guardados na nuvem.
    let userId = window.authManager?.user?.id;
    if (!userId && window.authManager?.ready) {
      try { await window.authManager.ready(); } catch (_) {}
      userId = window.authManager?.user?.id;
    }

    if (supabase && userId && navigator.onLine && !this._justDeleted) {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (!error && data) {
          // Sincronizar documentos do Supabase para o IndexedDB local
          for (const doc of data) {
            await offlineDB.saveDocument({ ...doc, synced: true }).catch(() => {});
          }
          return { docs: data, source: 'cloud' };
        }
      } catch (e) {
        console.warn('[History] Supabase load error, usando IndexedDB:', e.message);
      }
    }

    // Se viemos de uma operação de apagar, repor a flag e usar IndexedDB
    if (this._justDeleted) this._justDeleted = false;

    // Fallback: IndexedDB local
    const localUserId = userId || Storage.getUserId();
    const docs = await offlineDB.getDocuments(localUserId);
    docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { docs, source: 'local' };
  }

  async _render() {
    const body    = document.getElementById('historyBody');
    const loading = document.getElementById('historyLoading');
    if (!body) return;

    if (loading) loading.style.display = 'block';
    body.innerHTML = `
      <div style="text-align:center;padding:32px;color:#64748b;">
        <div style="font-size:28px;margin-bottom:8px;">⏳</div>
        <div style="font-size:14px;">A carregar arquivo…</div>
      </div>
    `;

    try {
      const { docs, source } = await this._loadDocuments();
      if (loading) loading.style.display = 'none';

      const sourceLabel = source === 'cloud'
        ? '<span style="color:#16a34a;font-size:11px;font-weight:600;">☁️ sincronizado</span>'
        : '<span style="color:#f59e0b;font-size:11px;font-weight:600;">📴 local</span>';

      if (docs.length === 0) {
        body.innerHTML = this._emptyState();
        return;
      }

      const isBlocked = window.authManager?.isBlocked?.() === true;

      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:#64748b;">${docs.length} documento${docs.length !== 1 ? 's' : ''}</span>
            ${sourceLabel}
          </div>
          ${isBlocked
            ? '<span style="font-size:11px;color:#ef4444;font-weight:600;">🚫 Conta bloqueada</span>'
            : '<button id="btnClearHistory" style="background:none;border:none;color:#EF4444;font-size:12px;font-weight:600;cursor:pointer;padding:4px 8px;border-radius:6px;">🗑️ Limpar tudo</button>'
          }
        </div>
        ${docs.map(doc => this._docCard(doc, isBlocked)).join('')}
      `;

      // Eventos dos cartões
      body.querySelectorAll('.hist-card').forEach(card => {
        card.querySelector('.hist-view')?.addEventListener('click', () => {
          this._viewDoc(card.dataset.id, docs);
        });
        card.querySelector('.hist-del')?.addEventListener('click', async () => {
          await this._deleteDoc(card.dataset.id);
          NotificationView.info('🗑️ Documento removido');
          await this._render();
        });
        card.querySelector('.hist-copy')?.addEventListener('click', () => {
          const doc = docs.find(d => d.id === card.dataset.id);
          if (!doc) return;
          navigator.clipboard?.writeText(doc.content)
            .then(() => NotificationView.success('📋 Copiado!'))
            .catch(() => NotificationView.error('Não foi possível copiar'));
        });
      });

      document.getElementById('btnClearHistory')?.addEventListener('click', async () => {
        if (!confirm('Remover todos os documentos do arquivo?')) return;
        const btn = document.getElementById('btnClearHistory');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ A limpar…'; }
        let erros = 0;
        for (const doc of docs) {
          try { await this._deleteDoc(doc.id); } catch (_) { erros++; }
        }
        if (erros === 0) {
          NotificationView.info('🗑️ Arquivo limpo');
        } else {
          NotificationView.warn(`🗑️ Arquivo limpo (${erros} erro(s) ignorados)`);
        }
        await this._render();
      });

    } catch (err) {
      body.innerHTML = `
        <div style="text-align:center;padding:40px;color:#64748b;">
          <div style="font-size:32px;margin-bottom:8px;">⚠️</div>
          <div>Erro ao carregar o arquivo: ${err.message}</div>
        </div>
      `;
    }
  }

  async _deleteDoc(id) {
    // 1. Apagar localmente (IndexedDB)
    await offlineDB.deleteDocument(id).catch(() => {});

    // 2. Apagar no Supabase se o utilizador estiver autenticado
    const supabase = window.authManager?.supabase;
    const userId   = window.authManager?.user?.id;
    if (supabase && userId) {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) {
        console.warn('[History] Supabase delete error:', error.code, error.message);
        // Não lançar — o documento já foi apagado localmente
      }
    }
    // Sinalizar que deve usar IndexedDB na próxima leitura para evitar
    // dados obsoletos do Supabase (eventual consistency após delete)
    this._justDeleted = true;
  }

  _docCard(doc, isBlocked = false) {
    const icon    = SERVICE_ICONS[doc.service_type] || '📄';
    const date    = new Date(doc.created_at);
    const dateStr = date.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
    const preview = doc.content
      ?.replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 120) || '';
    const syncBadge = doc.synced === false
      ? '<span style="font-size:10px;color:#f59e0b;font-weight:600;">📴 local</span>'
      : '<span style="font-size:10px;color:#16a34a;font-weight:600;">☁️</span>';

    const actionBtns = isBlocked
      ? `<button class="hist-view" style="padding:6px 14px;border:none;background:#EFF6FF;color:#1d4ed8;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">👁️ Ver</button>`
      : `<button class="hist-copy" style="padding:6px 12px;border:1.5px solid #e5e7eb;background:#f9fafb;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#334155;">📋 Copiar</button>
         <button class="hist-view" style="padding:6px 14px;border:none;background:#EFF6FF;color:#1d4ed8;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">👁️ Ver</button>
         <button class="hist-del" style="padding:6px 10px;border:none;background:#FEF2F2;color:#EF4444;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">🗑️</button>`;

    return `
      <div class="hist-card" data-id="${doc.id}"
        style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;margin-bottom:10px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="width:38px;height:38px;border-radius:10px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:#07101f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${doc.title || doc.service_type}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;display:flex;gap:6px;align-items:center;">${dateStr} · ${timeStr} ${syncBadge}</div>
          </div>
        </div>
        <div style="font-size:12px;color:#64748b;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${preview}…</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          ${actionBtns}
        </div>
      </div>
    `;
  }

  _viewDoc(id, docs) {
    const doc = docs.find(d => d.id === id);
    if (!doc) return;

    // ── Fallback leve: páginas sem o motor completo de documentos (ex:
    // /perfil.html, /templates.html, que não carregam o overlay de
    // resultado #resultOverlay/#resModel/#resMeta) não têm como mostrar o
    // editor A4 completo. Verificamos tanto window.docController como a
    // presença real do elemento no DOM — confiar só na variável global é
    // frágil (ex: app.js define window.docController em qualquer página
    // onde é incluído, mesmo que essa página não tenha a marcação toda),
    // e foi exactamente isso que causou "Cannot set properties of null"
    // ao tentar abrir um documento nalgumas páginas.
    if (!window.docController || !document.getElementById('resultOverlay') || !document.getElementById('resModel')) {
      this._viewDocLite(doc);
      return;
    }

    this.close();

    const ctrl = window.docController;

    // ── 1. Restaurar estado do docModel ─────────────────────────────────────
    if (ctrl?.docModel) {
      ctrl.docModel.content = doc.content;
      ctrl.docModel.service = doc.service_type;

      if (doc.form_data) {
        try {
          ctrl.docModel.formData = typeof doc.form_data === 'string'
            ? JSON.parse(doc.form_data) : doc.form_data;
        } catch (_) {}
      } else {
        ctrl.docModel.formData = {
          _fromHistory:     true,
          _existingContent: doc.content,
          _historyId:       doc.id,
          title:            doc.title || '',
          service:          doc.service_type,
        };
      }
    }

    // ── 2. CRÍTICO: definir documentState com o conteúdo do histórico ────────
    // Sem isto, _downloadWithTemplate e _exportWord lêem null e falham.
    if (window.documentState) {
      window.documentState.set(doc.content, doc.service_type);
    }

    // ── 3. Restaurar template se foi guardado com o documento ────────────────
    // FIX 3: se o documento foi guardado com template_html (depois de uma edição),
    // restaurar o template para que o preview e os exports saiam correctos.
    if (ctrl) {
      if (doc.template_html && doc.template_css) {
        ctrl._activeTemplateHtml = doc.template_html;
        ctrl._activeTemplate     = { css: doc.template_css, htmlTemplate: doc.template_html };
      } else {
        ctrl._activeTemplate     = null;
        ctrl._activeTemplateHtml = null;
        if (window.DocumentView) window.DocumentView._activeTemplateCss = null;
      }
    }

    // ── 4. Renderizar ────────────────────────────────────────────────────────
    // CORRIGIDO: abrir o modal ANTES de renderResult(). Antes, o preview A4
    // era renderizado enquanto o overlay ainda estava com display:none —
    // o contentor tinha clientWidth 0 e as folhas ficavam com escala 0
    // (invisíveis), mesmo depois do modal abrir. Abrir primeiro garante que
    // o A4Renderer já vê a largura real do contentor.
    import('../views/Views.js').then(({ DocumentView, ModalView }) => {
      ModalView.open('resultOverlay');

      const svc = { title: doc.title || doc.service_type };
      DocumentView.renderResult(doc.content, svc, null, doc.model_used || '');

      const meta  = document.getElementById('resMeta');
      const model = document.getElementById('resModel');
      if (meta)  meta.innerHTML = `<span>📁 Do arquivo · ${new Date(doc.created_at).toLocaleDateString('pt-MZ')}</span>`;
      if (model) model.textContent = doc.model_used || '';

      ctrl?._bindEditBtn?.();
    });
  }

  // ── Visualizador leve e autónomo (sem dependências do editor A4 completo) ──
  // Usado em páginas como /perfil.html, que só incluem este controlador e o
  // modal de histórico, sem toda a infraestrutura de geração/edição de
  // documentos da homepage.
  _viewDocLite(doc) {
    document.getElementById('histLiteOverlay')?.remove();

    const dateStr = new Date(doc.created_at).toLocaleDateString('pt-MZ', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const safeContent = (doc.content || '').replace(/</g, '&lt;');

    const overlay = document.createElement('div');
    overlay.id = 'histLiteOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(7,16,31,.65);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .18s ease';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:88svh;overflow-y:auto;display:flex;flex-direction:column;animation:slideUp .3s cubic-bezier(.34,1.1,.64,1)">
        <div style="display:flex;align-items:center;gap:12px;padding:18px 18px 14px;border-bottom:1px solid #E2E8F0;position:sticky;top:0;background:#fff">
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:800;color:#07101F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(doc.title || doc.service_type || 'Documento').replace(/</g,'&lt;')}</div>
            <div style="font-size:11.5px;color:#64748B;margin-top:2px">📁 Do arquivo · ${dateStr}</div>
          </div>
          <button id="histLiteClose" style="border:none;background:#F8FAFD;width:32px;height:32px;border-radius:50%;font-size:15px;cursor:pointer;flex-shrink:0">✕</button>
        </div>
        <div style="padding:18px;white-space:pre-wrap;word-wrap:break-word;font-size:13.5px;line-height:1.7;color:#0F1E3B;flex:1">${safeContent || '<span style="color:#94a3b8">Este documento não tem conteúdo de texto guardado.</span>'}</div>
        <div style="display:flex;gap:8px;padding:14px 18px;border-top:1px solid #E2E8F0;position:sticky;bottom:0;background:#fff">
          <button id="histLiteCopy" style="flex:1;padding:11px;border:1.5px solid #E2E8F0;background:#F8FAFD;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📋 Copiar texto</button>
          <a href="/?history=1&doc=${encodeURIComponent(doc.id)}" style="flex:1;text-align:center;padding:11px;border:none;background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:#fff;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;font-family:inherit">✏️ Abrir no editor completo</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const cleanup = () => { overlay.remove(); document.body.style.overflow = ''; };
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
    overlay.querySelector('#histLiteClose')?.addEventListener('click', cleanup);
    overlay.querySelector('#histLiteCopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(doc.content || '')
        .then(() => NotificationView.success('📋 Copiado!'))
        .catch(() => NotificationView.error('Não foi possível copiar'));
    });
  }

  // ── Actualizar conteúdo de um documento já guardado no histórico ──────────
  // Chamado quando o utilizador edita (edição manual ou reedição IA) e fecha o editor.
  // FIX 3: aceita templateHtml opcional para persistir o template editado.
  async updateDocumentContent(id, newContent, templateHtml = null) {
    if (!id || !newContent) return;
    try {
      const { offlineDB } = await import('../utils/IndexedDB.js');
      const userId = window.authManager?.user?.id
                  || (await import('../utils/Storage.js')).Storage.getUserId();
      const allDocs = await offlineDB.getDocuments(userId);
      const existing = allDocs.find(d => d.id === id);
      if (existing) {
        const updated = {
          ...existing,
          content:      newContent,
          template_html: templateHtml || existing.template_html || null,
          synced:       false,
          updated_at:   new Date().toISOString(),
        };
        await offlineDB.saveDocument(updated);
      }

      // Actualizar no Supabase se disponível
      const supabase    = window.authManager?.supabase;
      const authUserId  = window.authManager?.user?.id;
      if (supabase && authUserId) {
        const updatePayload = { content: newContent, updated_at: new Date().toISOString() };
        if (templateHtml) updatePayload.template_html = templateHtml;
        await supabase.from('documents')
          .update(updatePayload)
          .eq('id', id)
          .eq('user_id', authUserId)
          .catch(e => console.warn('[History] Supabase update failed:', e.message));
      }

      // Actualizar o item na lista em memória (para re-render imediato sem reload)
      if (this._docs) {
        const idx = this._docs.findIndex(d => d.id === id);
        if (idx !== -1) {
          this._docs[idx] = {
            ...this._docs[idx],
            content:       newContent,
            template_html: templateHtml || this._docs[idx].template_html || null,
          };
        }
      }

    } catch (e) {
      console.warn('[History] updateDocumentContent failed:', e.message);
    }
  }

  _emptyState() {
    const isOnline = navigator.onLine;
    const isAuth   = !!window.authManager?.user;
    let msg = 'Os documentos que gerar aparecerão aqui automaticamente.';
    if (!isAuth) msg = 'Inicia sessão para aceder ao arquivo na nuvem.';
    else if (!isOnline) msg = 'Sem ligação — a mostrar apenas documentos guardados localmente.';

    return `
      <div style="text-align:center;padding:48px 24px;color:#64748b;">
        <div style="font-size:48px;margin-bottom:12px;">📭</div>
        <div style="font-size:16px;font-weight:600;color:#334155;margin-bottom:8px;">Arquivo vazio</div>
        <div style="font-size:14px;line-height:1.6;">${msg}</div>
      </div>
    `;
  }
}

export const historyController = new HistoryController();
