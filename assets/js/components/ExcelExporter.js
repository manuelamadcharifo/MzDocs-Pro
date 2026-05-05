// assets/js/components/ExcelExporter.js
// Converte conteúdo Markdown para .xlsx real usando SheetJS (xlsx)
// Tabelas MD → folhas de cálculo | Texto → folha "Documento"

export class ExcelExporter {

    async export(markdownContent, filename, metadata = {}) {
        if (!window.XLSX) await this._loadXLSX();

        const { utils, write } = window.XLSX;
        const wb = utils.book_new();

        // ── Analisa o markdown ──────────────────────────────────────
        const sections  = this._parse(markdownContent);
        const tables    = sections.filter(s => s.type === 'table');
        const textLines = sections.filter(s => s.type !== 'table');

        // ── Folha 1: Documento completo (texto estruturado) ─────────
        const docRows = this._buildDocRows(textLines, metadata);
        const wsDoc   = utils.aoa_to_sheet(docRows);

        // Largura das colunas
        wsDoc['!cols'] = [{ wch: 15 }, { wch: 80 }];

        // Estilos de cabeçalho (SheetJS community não suporta style — usamos apenas estrutura)
        utils.book_append_sheet(wb, wsDoc, 'Documento');

        // ── Folha 2+: Uma folha por tabela encontrada no markdown ───
        tables.forEach((tbl, i) => {
            const ws = utils.aoa_to_sheet(tbl.rows);
            ws['!cols'] = tbl.rows[0]?.map(() => ({ wch: 25 })) || [];
            utils.book_append_sheet(wb, ws, `Tabela ${i + 1}`);
        });

        // ── Gera e descarrega ───────────────────────────────────────
        const buf  = write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename?.replace(/\.[^.]+$/, '.xlsx') || `mzdocs-${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true };
    }

    // ── Parser de Markdown → secções tipadas ──────────────────────
    _parse(md) {
        const lines    = md.split('\n');
        const sections = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Tabela markdown
            if (line.includes('|') && lines[i + 1] && /^[\|\-\:\s]+$/.test(lines[i + 1])) {
                const tableLines = [];
                while (i < lines.length && lines[i].includes('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                const rows = tableLines
                    .filter(l => !/^[\|\-\:\s]+$/.test(l))
                    .map(l => l.split('|').map(c => c.trim()).filter((c, idx, arr) => idx !== 0 && idx !== arr.length - 1));
                sections.push({ type: 'table', rows });
                continue;
            }

            sections.push({ type: 'text', line, raw: line });
            i++;
        }

        return sections;
    }

    // ── Constrói linhas para a folha "Documento" ──────────────────
    _buildDocRows(textSections, metadata) {
        const rows = [];

        // Cabeçalho do ficheiro
        if (metadata.title) {
            rows.push([metadata.title]);
            rows.push(['Gerado por MzDocs Pro', new Date().toLocaleDateString('pt-MZ')]);
            rows.push([]);
        }

        textSections.forEach(({ line }) => {
            if (!line?.trim()) { rows.push([]); return; }

            const clean = line
                .replace(/^---PAGE_BREAK---$/, '── Quebra de Página ──')
                .replace(/^#{1,6}\s+/, '')   // remove # dos headings
                .replace(/\*\*(.+?)\*\*/g, '$1') // remove bold
                .replace(/\*(.+?)\*/g, '$1')     // remove italic
                .replace(/`(.+?)`/g, '$1');       // remove code

            const h1 = line.match(/^#\s+/);
            const h2 = line.match(/^##\s+/);
            const h3 = line.match(/^###\s+/);

            if (h1)      rows.push(['TÍTULO', clean]);
            else if (h2) rows.push(['SECÇÃO', clean]);
            else if (h3) rows.push(['Subsecção', clean]);
            else if (/^[-*]\s/.test(line)) rows.push(['  •', clean.replace(/^[-*]\s+/, '')]);
            else if (/^\d+\.\s/.test(line)) rows.push(['  N.', clean.replace(/^\d+\.\s+/, '')]);
            else rows.push(['', clean]);
        });

        return rows;
    }

    async _loadXLSX() {
        return new Promise((resolve, reject) => {
            if (window.XLSX) return resolve();
            const URLS = [
                'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
                'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
            ];
            const tryNext = (idx) => {
                if (idx >= URLS.length) return reject(new Error('Falha ao carregar SheetJS'));
                const s = document.createElement('script');
                s.src = URLS[idx];
                s.onload = () => window.XLSX ? resolve() : reject(new Error('XLSX não inicializado'));
                s.onerror = () => tryNext(idx + 1);
                document.head.appendChild(s);
            };
            tryNext(0);
        });
    }
}

export default ExcelExporter;