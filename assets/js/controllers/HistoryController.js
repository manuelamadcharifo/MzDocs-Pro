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
      const { error } = await supabase.from('documents').insert({
        id:           doc.id,
        user_id:      userId,
        service_type: doc.service_type,
        title:        doc.title,
        content:      doc.content,
        model_used:   doc.model_used,
        created_at:   doc.created_at,
      });
      if (error) console.warn('[History] Supabase save error:', error.message);
      else {
        // Marcar como sincronizado no IndexedDB
        await offlineDB.saveDocument({ ...doc, synced: true });
      }
    } catch (e) {
      console.warn('[History] Supabase unreachable, ficará em IndexedDB:', e.message);
    }
  }

  // ── Carregar documentos (Supabase se online + autenticado, senão IndexedDB) ─
  async _loadDocuments() {
    const supabase = window.authManager?.supabase;
    const userId   = window.authManager?.user?.id;

    if (supabase && userId && navigator.onLine) {
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

      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:#64748b;">${docs.length} documento${docs.length !== 1 ? 's' : ''}</span>
            ${sourceLabel}
          </div>
          <button id="btnClearHistory" style="background:none;border:none;color:#EF4444;font-size:12px;font-weight:600;cursor:pointer;padding:4px 8px;border-radius:6px;">🗑️ Limpar tudo</button>
        </div>
        ${docs.map(doc => this._docCard(doc)).join('')}
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
        for (const doc of docs) await this._deleteDoc(doc.id);
        NotificationView.info('🗑️ Arquivo limpo');
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
    // Apagar localmente
    await offlineDB.deleteDocument(id).catch(() => {});

    // Apagar no Supabase se disponível
    const supabase = window.authManager?.supabase;
    const userId   = window.authManager?.user?.id;
    if (supabase && userId) {
      await supabase.from('documents').delete().eq('id', id).eq('user_id', userId).catch(() => {});
    }
  }

  _docCard(doc) {
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
          <button class="hist-copy" style="padding:6px 12px;border:1.5px solid #e5e7eb;background:#f9fafb;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#334155;">📋 Copiar</button>
          <button class="hist-view" style="padding:6px 14px;border:none;background:#EFF6FF;color:#1d4ed8;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">👁️ Ver</button>
          <button class="hist-del" style="padding:6px 10px;border:none;background:#FEF2F2;color:#EF4444;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">🗑️</button>
        </div>
      </div>
    `;
  }

  _viewDoc(id, docs) {
    const doc = docs.find(d => d.id === id);
    if (!doc) return;
    this.close();
    const preview = document.getElementById('resPreview');
    const meta    = document.getElementById('resMeta');
    const model   = document.getElementById('resModel');
    if (preview) {
      // Usar o renderizador Markdown do Views se disponível
      if (window.docController) {
        import('../views/Views.js').then(({ DocumentView }) => {
          const svc = { title: doc.title || doc.service_type };
          DocumentView.renderResult(doc.content, svc, null, doc.model_used || '');
        });
      } else {
        preview.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7;">${doc.content.replace(/</g,'&lt;')}</pre>`;
      }
    }
    if (meta) meta.innerHTML = `<span>📁 Do arquivo · ${new Date(doc.created_at).toLocaleDateString('pt-MZ')}</span>`;
    if (model) model.textContent = doc.model_used || '';

    if (window.docController?.docModel) {
      window.docController.docModel.content = doc.content;
      window.docController.docModel.service = doc.service_type;
    }
    import('../views/Views.js').then(({ ModalView }) => {
      ModalView.open('resultOverlay');
      // Re-bind do botão editar para este documento
      window.docController?._bindEditBtn?.();
    });
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
