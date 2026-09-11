// ═══════════════════════════════════════════════════════════════════════════
// AdminTableSort.js — ordenação genérica de tabelas por cabeçalho (Set/2026)
// ─────────────────────────────────────────────────────────────────────────
// Torna QUALQUER <table class="admin-table"> ou <table class="data-table">
// do painel administrativo ordenável por coluna: clicar num <th> (ex:
// "Estado" ou "Visitas") ordena as linhas do <tbody> por essa coluna;
// clicar de novo inverte a direcção (▲/▼).
//
// Desenhado para NÃO exigir alterações às funções de render existentes em
// AdminApp.js: a lógica de clique fica delegada no próprio <th> (elemento
// estático, definido em admin.html), nunca nas linhas do <tbody> — por
// isso continua a funcionar mesmo quando o conteúdo do <tbody> é
// substituído por completo a cada recarregamento de dados (_loadBlog,
// _loadAffiliates, _loadUsers, etc.).
//
// Para tabelas criadas dinamicamente via innerHTML (ex: os quadros de
// Analytics gerados em _loadAnalytics), chame window.AdminTableSort.init()
// depois de inserir o novo <table> no DOM — é seguro chamar quantas vezes
// for preciso (tabelas já marcadas são ignoradas).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Remove acentos e normaliza para comparação de cabeçalhos ("Ações",
    // "Acções", "AÇÕES" → "acoes"/"accoes").
    function normalize(str) {
        return (str || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    const NON_SORTABLE_HEADERS = new Set(['acoes', 'accoes', 'acao', 'accao', '']);

    function isExcludedHeader(th) {
        if (th.hasAttribute('data-no-sort')) return true;
        return NON_SORTABLE_HEADERS.has(normalize(th.textContent));
    }

    // Extrai um valor comparável de uma célula: data pt-MZ (dd/mm/aaaa[,
    // hh:mm]), número (ignora símbolos como "MZN", "%", espaços) ou, em
    // último caso, texto normalizado.
    function cellSortValue(td) {
        const raw = (td.textContent || '').trim();
        if (!raw || raw === '—' || raw === '-') return { type: 'text', value: '' };

        const dateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
        if (dateMatch) {
            const [, d, m, y, hh, mm] = dateMatch;
            const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh || 0), Number(mm || 0));
            if (!isNaN(date.getTime())) return { type: 'number', value: date.getTime() };
        }

        if (/\d/.test(raw)) {
            let cleaned = raw.replace(/[^\d.,\-]/g, '');
            if (cleaned.includes(',') && !cleaned.includes('.')) cleaned = cleaned.replace(',', '.');
            else cleaned = cleaned.replace(/,/g, '');
            const num = Number(cleaned);
            if (cleaned !== '' && cleaned !== '-' && !isNaN(num)) return { type: 'number', value: num };
        }

        return { type: 'text', value: normalize(raw) };
    }

    function sortTable(table, colIndex, dir) {
        const tbody = table.tBodies[0];
        if (!tbody) return;
        const rows = Array.from(tbody.rows);
        if (!rows.length) return;
        // Não ordenar estados de placeholder ("A carregar…", "Sem dados…"
        // — uma única linha com célula colspan não é uma linha de dados real).
        if (rows.length === 1 && rows[0].querySelector('td[colspan]')) return;

        const withKey = rows.map(row => ({
            row,
            key: row.cells[colIndex] ? cellSortValue(row.cells[colIndex]) : { type: 'text', value: '' },
        }));

        withKey.sort((a, b) => {
            let cmp;
            if (a.key.type === 'number' && b.key.type === 'number') cmp = a.key.value - b.key.value;
            else cmp = String(a.key.value).localeCompare(String(b.key.value), 'pt');
            return dir === 'asc' ? cmp : -cmp;
        });

        const frag = document.createDocumentFragment();
        withKey.forEach(({ row }) => frag.appendChild(row));
        tbody.appendChild(frag);
    }

    function markSortable(table) {
        if (table.dataset.sortInit) return;
        table.dataset.sortInit = '1';
        table.querySelectorAll(':scope > thead > tr > th').forEach(th => {
            if (isExcludedHeader(th)) return;
            th.classList.add('sortable-col');
            if (!th.title) th.title = 'Clique para ordenar';
        });
    }

    function init() {
        document.querySelectorAll('table.admin-table, table.data-table').forEach(markSortable);
    }

    document.addEventListener('click', (e) => {
        const th = e.target.closest('th.sortable-col');
        if (!th) return;
        const table = th.closest('table');
        const headerRow = th.parentElement;
        if (!table || !headerRow) return;

        const colIndex = Array.from(headerRow.children).indexOf(th);
        const nextDir = th.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc';

        headerRow.querySelectorAll('th').forEach(h => h.removeAttribute('data-sort-dir'));
        th.setAttribute('data-sort-dir', nextDir);

        sortTable(table, colIndex, nextDir);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exposto para que secções que criam tabelas dinamicamente via
    // innerHTML (ex: AdminApp.js#_loadAnalytics) possam marcar as novas
    // tabelas como ordenáveis assim que as inserem no DOM.
    window.AdminTableSort = { init };
})();
