// utils/Storage.js — localStorage wrapper com namespace
export const Storage = {
  PREFIX: 'mz_',
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) { localStorage.removeItem(this.PREFIX + key); },
  clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(this.PREFIX))
      .forEach(k => localStorage.removeItem(k));
  },
  getUserId() {
    let id = this.get('uid');
    if (!id) {
      id = 'mz_' + (crypto.randomUUID?.() || Math.random().toString(36).slice(2,13));
      this.set('uid', id);
    }
    return id;
  },
  getFreeKey() { return `free_${new Date().toISOString().slice(0,7)}`; }
};
