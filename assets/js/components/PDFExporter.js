// assets/js/components/PDFExporter.js
// PDF académico: hierarquia de títulos, quebras de página reais,
// numeração a partir do índice, sem marca de água, sem branding

export class PDFExporter {

    async export(markdownContent, filename, metadata = {}) {
        const { jsPDF } = await this._loadJsPDF();

        const doc       = new jsPDF({ unit: 'mm', format: 'a4' });
        const W         = doc.internal.pageSize.getWidth();   // 210
        const H         = doc.internal.pageSize.getHeight();  // 297
        const ML        = 30;  // margem esquerda  (3 cm)
        const MR        = 25;  // margem direita   (2.5 cm)
        const MT        = 30;  // margem topo      (3 cm)
        const MB        = 25;  // margem base      (2.5 cm)
        const CW        = W - ML - MR;  // largura útil

        // ── Estado ────────────────────────────────────────────────
        let y           = MT;
        let pageNum     = 0;   // página actual (0 = ainda não contada)
        let countPages  = false; // só conta a partir do índice

        const newPage = () => {
            if (pageNum > 0) doc.addPage();
            pageNum++;
            y = MT;
        };

        const checkY = (needed = 10) => {
            if (y + needed > H - MB) newPage();
        };

        // ── Helpers de texto ──────────────────────────────────────
        const write = (text, opts = {}) => {
            const {
                size = 12, bold = false, italic = false,
                align = 'left', color = [0, 0, 0], indent = 0, leading = 7,
            } = opts;

            doc.setFontSize(size);
            doc.setFont('times', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
            doc.setTextColor(...color);

            const x      = ML + indent;
            const usable = CW - indent;
            const lines  = doc.splitTextToSize(text, usable);

            lines.forEach(line => {
                checkY(leading + 1);
                doc.text(line, align === 'center' ? W / 2 : align === 'right' ? W - MR : x, y, { align });
                y += leading;
            });
            return lines.length * leading;
        };

        const gap = (mm = 4) => { y += mm; };

        // ── Parse markdown ────────────────────────────────────────
        const lines = markdownContent.split('\n');

        // Primeira página (capa) — sem numeração
        newPage();

        let i = 0;
        while (i < lines.length) {
            const raw  = lines[i];
            const line = raw.trim();

            // ── Quebra de página explícita ──────────────────────
            if (line === '---PAGE_BREAK---') {
                newPage();
                // A partir da 2ª quebra de página (índice) começa a numeração
                if (pageNum === 2) countPages = true;
                i++; continue;
            }

            // ── Separador --- ───────────────────────────────────
            if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
                gap(2);
                doc.setDrawColor(180, 180, 180);
                doc.setLineWidth(0.3);
                doc.line(ML, y, W - MR, y);
                gap(4);
                i++; continue;
            }

            // ── Linha vazia ──────────────────────────────────────
            if (!line) { gap(3); i++; continue; }

            // ── Tabela markdown ──────────────────────────────────
            if (line.startsWith('|') && i + 1 < lines.length && /^\|[\|\-\:\s]+\|/.test(lines[i + 1])) {
                const tableLines = [];
                while (i < lines.length && lines[i].trim().startsWith('|')) {
                    tableLines.push(lines[i].trim());
                    i++;
                }
                this._drawTable(doc, tableLines, ML, y, CW, H, MB, MT);
                // avança y após tabela
                const rows = tableLines.filter(l => !/^\|[\|\-\:\s]+\|$/.test(l)).length;
                y += rows * 8 + 4;
                if (y > H - MB) newPage();
                continue;
            }

            // ── H1 ───────────────────────────────────────────────
            const h1 = line.match(/^#\s+(.+)/);
            if (h1) {
                gap(6);
                checkY(20);
                write(this._clean(h1[1]), { size: 18, bold: true, align: 'center' });
                gap(6);
                i++; continue;
            }

            // ── H2 ───────────────────────────────────────────────
            const h2 = line.match(/^##\s+(.+)/);
            if (h2) {
                gap(8);
                checkY(14);
                write(this._clean(h2[1]), { size: 14, bold: true });
                // sublinhado
                const tw = doc.getTextWidth(this._clean(h2[1]));
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.4);
                doc.line(ML, y - 1, ML + Math.min(tw, CW), y - 1);
                gap(4);
                i++; continue;
            }

            // ── H3 ───────────────────────────────────────────────
            const h3 = line.match(/^###\s+(.+)/);
            if (h3) {
                gap(6);
                checkY(12);
                write(this._clean(h3[1]), { size: 12, bold: true, italic: true });
                gap(3);
                i++; continue;
            }

            // ── H4 ───────────────────────────────────────────────
            const h4 = line.match(/^####\s+(.+)/);
            if (h4) {
                gap(4);
                write(this._clean(h4[1]), { size: 12, bold: true });
                gap(2);
                i++; continue;
            }

            // ── Lista bullet ─────────────────────────────────────
            const bullet = line.match(/^[-*]\s+(.+)/);
            if (bullet) {
                checkY(8);
                doc.setFontSize(12);
                doc.setFont('times', 'normal');
                doc.setTextColor(0, 0, 0);
                const txt   = this._clean(bullet[1]);
                const bLines = doc.splitTextToSize(txt, CW - 8);
                bLines.forEach((bl, bi) => {
                    checkY(7);
                    if (bi === 0) doc.text('•', ML + 2, y);
                    doc.text(bl, ML + 8, y);
                    y += 7;
                });
                i++; continue;
            }

            // ── Lista numerada ───────────────────────────────────
            const num = line.match(/^(\d+)\.\s+(.+)/);
            if (num) {
                checkY(8);
                doc.setFontSize(12);
                doc.setFont('times', 'normal');
                doc.setTextColor(0, 0, 0);
                const txt    = this._clean(num[2]);
                const nLines = doc.splitTextToSize(txt, CW - 8);
                nLines.forEach((nl, ni) => {
                    checkY(7);
                    if (ni === 0) doc.text(`${num[1]}.`, ML + 1, y);
                    doc.text(nl, ML + 8, y);
                    y += 7;
                });
                i++; continue;
            }

            // ── Parágrafo normal ─────────────────────────────────
            checkY(8);
            doc.setFontSize(12);
            doc.setFont('times', 'normal');
            doc.setTextColor(0, 0, 0);
            const pText  = this._cleanInline(line);
            const pLines = doc.splitTextToSize(pText, CW);
            pLines.forEach(pl => {
                checkY(7);
                doc.text(pl, ML, y);
                y += 7;
            });
            gap(3);
            i++;
        }

        // ── Numeração de páginas (só a partir do índice) ─────────
        const total     = doc.internal.getNumberOfPages();
        const indexPage = 2; // página do índice = começo da numeração
        for (let p = indexPage; p <= total; p++) {
            doc.setPage(p);
            doc.setFontSize(10);
            doc.setFont('times', 'normal');
            doc.setTextColor(100, 100, 100);
            const n = p - indexPage + 1;
            doc.text(`${n}`, W / 2, H - 12, { align: 'center' });
        }

        doc.save(filename || `documento-${Date.now()}.pdf`);
        return { success: true };
    }

    // ── Tabela ────────────────────────────────────────────────────
    _drawTable(doc, tableLines, x, startY, cw, H, MB, MT) {
        const rows = tableLines.filter(l => !/^\|[\|\-\:\s]+\|$/.test(l))
            .map(l => l.split('|').map(c => c.trim()).filter((_, i, a) => i !== 0 && i !== a.length - 1));

        if (!rows.length) return;
        const cols   = rows[0].length;
        const colW   = cw / cols;
        const rowH   = 8;
        let y        = startY;

        rows.forEach((row, ri) => {
            if (y + rowH > H - MB) { doc.addPage(); y = MT; }
            if (ri === 0) {
                doc.setFillColor(220, 220, 220);
                doc.rect(x, y - 6, cw, rowH, 'F');
            }
            doc.setDrawColor(150, 150, 150);
            doc.setLineWidth(0.2);
            doc.rect(x, y - 6, cw, rowH);

            row.forEach((cell, ci) => {
                doc.setFontSize(10);
                doc.setFont('times', ri === 0 ? 'bold' : 'normal');
                doc.setTextColor(0, 0, 0);
                const cx = x + ci * colW + 2;
                const cellLines = doc.splitTextToSize(this._clean(cell), colW - 4);
                doc.text(cellLines[0] || '', cx, y);
                doc.line(x + ci * colW, y - 6, x + ci * colW, y + 2);
            });
            y += rowH;
        });
    }

    _clean(text) {
        return (text || '')
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
    }

    _cleanInline(text) {
        return this._clean(text);
    }

    async _loadJsPDF() {
        if (window.jspdf?.jsPDF) return window.jspdf;
        return new Promise((resolve, reject) => {
            const URLS = [
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
            ];
            const tryNext = (idx) => {
                if (idx >= URLS.length) return reject(new Error('Falha ao carregar jsPDF'));
                const s = document.createElement('script');
                s.src     = URLS[idx];
                s.onload  = () => window.jspdf?.jsPDF ? resolve(window.jspdf) : reject(new Error('jsPDF não inicializado'));
                s.onerror = () => tryNext(idx + 1);
                document.head.appendChild(s);
            };
            tryNext(0);
        });
    }
}

export const pdfExporter = new PDFExporter();
export default PDFExporter;