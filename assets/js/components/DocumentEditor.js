// assets/js/components/DocumentEditor.js
// Editor Markdown interativo com exportação multi-formato

import { exportManager } from '../utils/ExportManager.js';
import { authManager } from '../auth/AuthManager.js';

export class DocumentEditor {
    constructor() {
        this.content = '';
        this.serviceType = '';
        this.modal = null;
        this._createModal();
    }

    _createModal() {
        const html = `
        <div id="editorOverlay" class="modal-overlay" style="display:none;">
            <div class="editor-modal">
                <div class="editor-header">
                    <h3>✏️ Editor de Documento</h3>
                    <div class="editor-actions">
                        <button id="btnPreview" class="btn btn-ghost btn-sm">👁 Pré-visualizar</button>
                        <button id="btnReedit" class="btn btn-primary btn-sm">🤖 Reeditar com IA</button>
                        <button id="btnExportPdf" class="btn btn-ghost btn-sm">📄 PDF</button>
                        <button id="btnExportWord" class="btn btn-ghost btn-sm">📝 Word</button>
                        <button id="btnExportMd" class="btn btn-ghost btn-sm">💾 Markdown</button>
                        <button id="btnCopy" class="btn btn-ghost btn-sm">📋 Copiar</button>
                        <button id="editorClose" class="btn btn-close">×</button>
                    </div>
                </div>
                
                <div class="editor-body">
                    <div class="editor-pane">
                        <textarea id="editorTextarea" class="editor-textarea" placeholder="Edite seu documento aqui..."></textarea>
                    </div>
                    <div id="previewPane" class="preview-pane" style="display:none;">
                        <div id="previewContent" class="preview-content"></div>
                    </div>
                </div>
                
                <div class="editor-footer">
                    <span id="editorStats">0 palavras | 0 caracteres</span>
                    <div class="editor-templates">
                        <label>Template:</label>
                        <select id="templateSelect">
                            <option value="default">Padrão</option>
                            <option value="formal">Formal Institucional</option>
                            <option value="modern">Moderno</option>
                            <option value="minimal">Minimalista</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>`;

        if (!document.getElementById('editorOverlay')) {
            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);
            this.modal = document.getElementById('editorOverlay');
            this._bindEvents();
        }
    }

    _bindEvents() {
        document.getElementById('editorClose')?.addEventListener('click', () => this.close());
        document.getElementById('btnCopy')?.addEventListener('click', () => this._copyContent());
        document.getElementById('btnExportMd')?.addEventListener('click', () => this._downloadMarkdown());
        document.getElementById('btnExportPdf')?.addEventListener('click', () => this._exportPDF());
        document.getElementById('btnExportWord')?.addEventListener('click', () => this._exportWord());
        document.getElementById('btnPreview')?.addEventListener('click', () => this._togglePreview());
        document.getElementById('btnReedit')?.addEventListener('click', () => this._showReeditDialog());
        
        // Stats
        document.getElementById('editorTextarea')?.addEventListener('input', (e) => {
            this.content = e.target.value;
            this._updateStats();
        });
    }

    loadDocument(content, serviceType) {
        this.content = content;
        this.serviceType = serviceType;
        
        const textarea = document.getElementById('editorTextarea');
        if (textarea) textarea.value = content;
        
        this._updateStats();
        this.open();
    }

    open() {
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    // ============================================
    // EXPORTAÇÕES
    // ============================================
    async _exportPDF() {
        const btn = document.getElementById('btnExportPdf');
        btn.disabled = true;
        btn.textContent = '⏳...';
        
        try {
            await exportManager.toPDF(this.content, 'Documento', {
                type: this.serviceType,
                user: authManager.profile?.full_name
            });
        } catch (err) {
            alert('❌ Erro ao gerar PDF: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '📄 PDF';
        }
    }

    async _exportWord() {
        const btn = document.getElementById('btnExportWord');
        btn.disabled = true;
        btn.textContent = '⏳...';
        
        try {
            await exportManager.toWord(this.content, 'Documento', {
                type: this.serviceType,
                user: authManager.profile?.full_name
            });
        } catch (err) {
            alert('❌ Erro ao gerar Word: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '📝 Word';
        }
    }

    _downloadMarkdown() {
        const blob = new Blob([this.content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mzdocs-${this.serviceType}-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    _copyContent() {
        navigator.clipboard.writeText(this.content)
            .then(() => alert('✅ Copiado!'))
            .catch(() => alert('❌ Não foi possível copiar'));
    }

    // ============================================
    // PRÉ-VISUALIZAÇÃO
    // ============================================
    _togglePreview() {
        const previewPane = document.getElementById('previewPane');
        const isVisible = previewPane.style.display !== 'none';
        
        if (isVisible) {
            previewPane.style.display = 'none';
        } else {
            previewPane.style.display = 'block';
            this._renderPreview();
        }
    }

    _renderPreview() {
        const preview = document.getElementById('previewContent');
        // Converter Markdown simples para HTML
        let html = this.content
            .replace(/#{6}\s(.+)/g, '<h6>$1</h6>')
            .replace(/#{5}\s(.+)/g, '<h5>$1</h5>')
            .replace(/#{4}\s(.+)/g, '<h4>$1</h4>')
            .replace(/#{3}\s(.+)/g, '<h3>$1</h3>')
            .replace(/#{2}\s(.+)/g, '<h2>$1</h2>')
            .replace(/#{1}\s(.+)/g, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        preview.innerHTML = html;
    }

    // ============================================
    // REEDIÇÃO COM IA
    // ============================================
    _showReeditDialog() {
        const instruction = prompt('💡 O que deseja alterar no documento?\n\nExemplo: "Adicione mais detalhes na introdução"');
        if (!instruction) return;

        // Disparar evento para o DocumentController
        document.dispatchEvent(new CustomEvent('document:reedit', {
            detail: {
                currentContent: this.content,
                instruction,
                serviceType: this.serviceType
            }
        }));
    }

    _updateStats() {
        const words = this.content.trim().split(/\s+/).filter(w => w.length > 0).length;
        const chars = this.content.length;
        document.getElementById('editorStats').textContent = 
            `${words} palavras | ${chars} caracteres`;
    }

    getContent() {
        return this.content;
    }
}

export const documentEditor = new DocumentEditor();
window.documentEditor = documentEditor;