// assets/js/utils/IndexedDB.js
// Gestão de IndexedDB para offline-first

const DB_NAME = 'mzdocs-offline';
const DB_VERSION = 1;

export class OfflineDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Documentos pendentes (fila offline)
                if (!db.objectStoreNames.contains('pending')) {
                    db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
                }

                // Documentos gerados (cache local)
                if (!db.objectStoreNames.contains('documents')) {
                    const docStore = db.createObjectStore('documents', { keyPath: 'id' });
                    docStore.createIndex('user_id', 'user_id', { unique: false });
                    docStore.createIndex('created_at', 'created_at', { unique: false });
                }

                // Rascunhos de formulários
                if (!db.objectStoreNames.contains('drafts')) {
                    db.createObjectStore('drafts', { keyPath: 'service_type' });
                }

                // Cache de assets
                if (!db.objectStoreNames.contains('assets')) {
                    db.createObjectStore('assets', { keyPath: 'url' });
                }
            };
        });
    }

    // ============================================
    // DOCUMENTOS PENDENTES (fila offline)
    // ============================================
    async addPending(body) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('pending', 'readwrite');
            const store = tx.objectStore('pending');
            const request = store.add({
                body,
                created_at: new Date().toISOString(),
                attempts: 0
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getPending() {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('pending', 'readonly');
            const store = tx.objectStore('pending');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async removePending(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('pending', 'readwrite');
            const store = tx.objectStore('pending');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================
    // DOCUMENTOS GERADOS (cache local)
    // ============================================
    async saveDocument(doc) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('documents', 'readwrite');
            const store = tx.objectStore('documents');
            const request = store.put({
                ...doc,
                synced: false,
                created_at: new Date().toISOString()
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getDocuments(userId) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('documents', 'readonly');
            const store = tx.objectStore('documents');
            const index = store.index('user_id');
            const request = index.getAll(userId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getDocument(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('documents', 'readonly');
            const store = tx.objectStore('documents');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteDocument(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('documents', 'readwrite');
            const store = tx.objectStore('documents');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================
    // RASCUINHOS DE FORMULÁRIOS
    // ============================================
    async saveDraft(serviceType, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('drafts', 'readwrite');
            const store = tx.objectStore('drafts');
            const request = store.put({
                service_type: serviceType,
                data,
                updated_at: new Date().toISOString()
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getDraft(serviceType) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('drafts', 'readonly');
            const store = tx.objectStore('drafts');
            const request = store.get(serviceType);
            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================
    // VERIFICAÇÃO DE CONECTIVIDADE
    // ============================================
    isOnline() {
        return navigator.onLine;
    }

    async syncWhenOnline() {
        if (!this.isOnline()) return;

        const pending = await this.getPending();
        for (const item of pending) {
            try {
                const response = await fetch('/api/generate-document', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.body)
                });

                if (response.ok) {
                    await this.removePending(item.id);
                    const result = await response.json();
                    await this.saveDocument({
                        id: 'doc-' + Date.now(),
                        ...result,
                        synced: true
                    });
                }
            } catch (err) {
                console.error('Sync error:', err);
            }
        }
    }
}

export const offlineDB = new OfflineDB();