// assets/js/components/ExelExporter.js
// Exportador para Excel — mantém nome "Exel" conforme projecto

export class ExelExporter {
    constructor() {
        this._loaded = false;
        this._XLSX = null;
    }

    async exportOrcamento(markdownContent, filename) {
        try {
            const XLSX = await this._loadXLSX();
            const tables = this._parseMarkdownTables(markdownContent);

            const wb = XLSX.utils.book_new();
            wb.Props = {
                Title: 'Orçamento MzDocs Pro',
                Subject: 'Orçamento de Construção',
                Author: 'MzDocs Pro',
                CreatedDate: new Date()
            };

            // Sheet de dados (primeira tabela encontrada ou dados genéricos)
            if (tables.length > 0) {
                tables.forEach((table, idx) => {
                    const ws = XLSX.utils.aoa_to_sheet(table);
                    XLSX.utils.book_append_sheet(wb, ws, idx === 0 ? 'Orçamento' : `Dados ${idx + 1}`);
                });
            } else {
                // Fallback: cria sheet com conteúdo como texto
                const ws = XLSX.utils.aoa_to_sheet([['Conteúdo'], [markdownContent]]);
                XLSX.utils.book_append_sheet(wb, ws, 'Conteúdo');
            }

            // Sheet Resumo
            const resumoData = [
                ['MzDocs Pro - Resumo'],
                [],
                ['Documento:', 'Orçamento de Construção'],
                ['Data:', new Date().toLocaleDateString('pt-MZ')],
                ['Gerado por:', 'MzDocs Pro'],
                [],
                ['Nota:', 'Este orçamento foi gerado automaticamente por IA.']
            ];
            const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
            XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

            const finalFilename = filename || `mzdocs-orcamento-${Date.now()}.xlsx`;
            XLSX.writeFile(wb, finalFilename);

            return { success: true, fileName: finalFilename };
        } catch (err) {
            console.error('[ExelExporter] Erro:', err);
            throw new Error('Falha ao gerar Excel: ' + err.message);
        }
    }

    _parseMarkdownTables(md) {
        const tables = [];
        const lines = md.split('\n');
        let currentTable = [];
        let inTable = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                inTable = true;
                const cells = trimmed
                    .slice(1, -1)
                    .split('|')
                    .map(c => c.trim())
                    .filter(c => c !== '');
                if (cells.length > 0 && !cells.every(c => /^[-:\s]+$/.test(c))) {
                    currentTable.push(cells);
                }
            } else if (inTable && trimmed === '') {
                if (currentTable.length > 0) {
                    tables.push([...currentTable]);
                    currentTable = [];
                }
                inTable = false;
            }
        }

        if (currentTable.length > 0) {
            tables.push(currentTable);
        }

        return tables;
    }

    async _loadXLSX() {
        if (this._loaded && this._XLSX) return this._XLSX;

        return new Promise((resolve, reject) => {
            if (window.XLSX) {
                this._XLSX = window.XLSX;
                this._loaded = true;
                resolve(this._XLSX);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.onload = () => {
                this._XLSX = window.XLSX;
                this._loaded = true;
                resolve(this._XLSX);
            };
            script.onerror = () => reject(new Error('Falha ao carregar SheetJS'));
            document.head.appendChild(script);
        });
    }
}

export const exelExporter = new ExelExporter();
export default ExelExporter;