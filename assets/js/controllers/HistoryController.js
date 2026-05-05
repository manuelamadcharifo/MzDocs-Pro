// assets/js/controllers/HistoryController.js
// Histórico de documentos gerados (armazenamento local IndexedDB)

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

  async _render() {
    const body = document.getElementById('historyBody');
    const loading = document.getElementById('historyLoading');
    if (!body) return;

    if (loading) loading.style.display = 'block';

    try {
      const userId = Storage.getUserId();
      const docs = await offlineDB.getDocuments(userId);

      // Ordenar por data descendente
      docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (docs.length === 0) {
        body.innerHTML = this._emptyState();
        return;
      }

      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:13px;color:#64748b;">${docs.length} documento${docs.length !== 1 ? 's' : ''} guardado${docs.length !== 1 ? 's' : ''}</span>
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
          await offlineDB.deleteDocument(card.dataset.id);
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
        if (!confirm('Remover todos os documentos do arquivo local?')) return;
        for (const doc of docs) await offlineDB.deleteDocument(doc.id);
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

  _docCard(doc) {
    const icon = SERVICE_ICONS[doc.service_type] || '📄';
    const date = new Date(doc.created_at);
    const dateStr = date.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
    const preview = doc.content
      ?.replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 120) || '';

    return `
      <div class="hist-card" data-id="${doc.id}"
        style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="width:38px;height:38px;border-radius:10px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:#07101f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${doc.title || doc.service_type}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">${dateStr} · ${timeStr}</div>
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
    // Reutilizar o modal de resultado para mostrar o documento
    const preview = document.getElementById('resPreview');
    const meta = document.getElementById('resMeta');
    const model = document.getElementById('resModel');
    if (preview) {
      preview.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7;">${doc.content.replace(/</g,'&lt;')}</pre>`;
    }
    if (meta) meta.innerHTML = `<span>📁 Do arquivo · ${new Date(doc.created_at).toLocaleDateString('pt-MZ')}</span>`;
    if (model) model.textContent = doc.model_used || '';

    // Disponibilizar para copiar/download via docController se existir
    if (window.docController?.docModel) {
      window.docController.docModel.content = doc.content;
      window.docController.docModel.service = doc.service_type;
    }
    import('../views/Views.js').then(({ ModalView }) => ModalView.open('resultOverlay'));
  }

  _emptyState() {
    return `
      <div style="text-align:center;padding:48px 24px;color:#64748b;">
        <div style="font-size:48px;margin-bottom:12px;">📭</div>
        <div style="font-size:16px;font-weight:600;color:#334155;margin-bottom:8px;">Arquivo vazio</div>
        <div style="font-size:14px;line-height:1.6;">Os documentos que gerar aparecerão aqui automaticamente para acesso rápido mesmo sem internet.</div>
      </div>
    `;
  }
}

export const historyController = new HistoryController();
