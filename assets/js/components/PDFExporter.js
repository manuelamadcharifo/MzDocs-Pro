// assets/js/components/PDFExporter.js
// Exportador dedicado para PDF usando jsPDF

export class PDFExporter {
    constructor() {
        this._loaded = false;
        this._jsPDF = null;
    }

    async export(markdownContent, filename, metadata = {}) {
        try {
            const { jsPDF } = await this._loadJsPDF();
            const doc = new jsPDF();

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - margin * 2;

            let y = margin;

            // Cabeçalho azul
            doc.setFillColor(59, 130, 246);
            doc.rect(0, 0, pageWidth, 25, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('MzDocs Pro', margin, 17);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const dateStr = metadata.date || new Date().toLocaleDateString('pt-MZ');
            doc.text(dateStr, pageWidth - margin, 17, { align: 'right' });

            y = 35;

            // Título do documento
            if (metadata.title) {
                doc.setTextColor(7, 16, 31);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(metadata.title, margin, y);
                y += 10;
            }

            // Linha separadora
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(margin, y, pageWidth - margin, y);
            y += 8;

            // Conteúdo
            const plainText = this._markdownToPlain(markdownContent);
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');

            const lines = doc.splitTextToSize(plainText, contentWidth);
            let totalPages = 1;

            for (let i = 0; i < lines.length; i++) {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = margin;
                    totalPages++;
                }
                doc.text(lines[i], margin, y);
                y += 6;
            }

            // Rodapé em todas as páginas
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(
                    `MzDocs Pro © ${new Date().getFullYear()} • Página ${i} de ${pageCount}`,
                    pageWidth / 2,
                    pageHeight - 8,
                    { align: 'center' }
                );
            }

            const finalFilename = filename || `mzdocs-${Date.now()}.pdf`;
            doc.save(finalFilename);

            return { success: true, fileName: finalFilename };
        } catch (err) {
            console.error('[PDFExporter] Erro:', err);
            throw new Error('Falha ao gerar PDF: ' + err.message);
        }
    }

    _markdownToPlain(md) {
        return md
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^\s*[-*]\s+/gm, '• ')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/\|/g, ' ')
            .replace(/^\s*[-=]+\s*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async _loadJsPDF() {
        if (this._loaded && this._jsPDF) return this._jsPDF;

        return new Promise((resolve, reject) => {
            if (window.jspdf && window.jspdf.jsPDF) {
                this._jsPDF = window.jspdf;
                this._loaded = true;
                resolve(this._jsPDF);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => {
                this._jsPDF = window.jspdf;
                this._loaded = true;
                resolve(this._jsPDF);
            };
            script.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
            document.head.appendChild(script);
        });
    }
}

export const pdfExporter = new PDFExporter();
export default PDFExporter;