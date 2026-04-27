// assets/js/utils/ExportManager.js
// Exportação para PDF, Word e Excel

export class ExportManager {
    constructor() {
        this.jsPDFLoaded = false;
        this.docxLoaded = false;
        this.xlsxLoaded = false;
    }

    // ============================================
    // EXPORTAR PARA PDF
    // ============================================
    async toPDF(content, title, metadata = {}) {
        await this._loadJsPDF();
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Cabeçalho institucional
        doc.setFillColor(59, 130, 246);
        doc.rect(0, 0, 210, 25, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('MzDocs Pro', 15, 12);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Documento gerado por IA • mzdocs.pro', 15, 20);
        
        // Data e referência
        doc.setTextColor(100, 100, 100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-MZ')}`, 15, 32);
        if (metadata.user) {
            doc.text(`Utilizador: ${metadata.user}`, 15, 37);
        }

        // Conteúdo principal (converter Markdown para texto simples com formatação)
        const cleanContent = this._markdownToPlainText(content);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');

        // Quebra de linhas automática
        const splitText = doc.splitTextToSize(cleanContent, 180);
        let yPosition = 45;
        
        splitText.forEach(line => {
            if (yPosition > 280) {
                doc.addPage();
                yPosition = 20;
            }
            doc.text(line, 15, yPosition);
            yPosition += 5;
        });

        // Rodapé
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`MzDocs Pro © ${new Date().getFullYear()} • Página ${i} de ${pageCount}`, 105, 292, { align: 'center' });
        }

        // Download
        const fileName = `mzdocs-${metadata.type || 'doc'}-${Date.now()}.pdf`;
        doc.save(fileName);
        
        return { success: true, fileName, format: 'pdf' };
    }

    // ============================================
    // EXPORTAR PARA WORD (.docx)
    // ============================================
    async toWord(content, title, metadata = {}) {
        await this._loadDocx();
        const docx = window.docx;

        // Converter Markdown para parágrafos estruturados
        const paragraphs = this._markdownToDocxParagraphs(content);

        const doc = new docx.Document({
            sections: [{
                properties: {},
                children: [
                    // Cabeçalho
                    new docx.Paragraph({
                        text: 'MzDocs Pro',
                        heading: docx.HeadingLevel.HEADING_1,
                        alignment: docx.AlignmentType.CENTER,
                        spacing: { after: 200 }
                    }),
                    new docx.Paragraph({
                        text: `Documento gerado em ${new Date().toLocaleDateString('pt-MZ')}`,
                        alignment: docx.AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),
                    // Conteúdo
                    ...paragraphs
                ]
            }]
        });

        const blob = await docx.Packer.toBlob(doc);
        const fileName = `mzdocs-${metadata.type || 'doc'}-${Date.now()}.docx`;
        
        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        return { success: true, fileName, format: 'docx' };
    }

    // ============================================
    // EXPORTAR PARA EXCEL (apenas orçamentos)
    // ============================================
    async toExcel(data, title) {
        await this._loadXLSX();
        const XLSX = window.XLSX;

        // Criar workbook
        const wb = XLSX.utils.book_new();
        
        // Converter dados para worksheet
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Estilos básicos
        const wscols = data[0]?.map(() => ({ wch: 20 }));
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, 'Orçamento');
        
        const fileName = `mzdocs-orcamento-${Date.now()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        return { success: true, fileName, format: 'xlsx' };
    }

    // ============================================
    // HELPERS
    // ============================================
    _markdownToPlainText(md) {
        return md
            .replace(/#{1,6}\s/g, '')           // Remove headers
            .replace(/\*\*(.*?)\*\*/g, '$1')     // Remove bold
            .replace(/\*(.*?)\*/g, '$1')         // Remove italic
            .replace(/```[\s\S]*?```/g, '[CÓDIGO]')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // Links
            .replace(/!\[.*?\]\(.*?\)/g, '[IMAGEM]')
            .replace(/> /g, '    ')              // Quotes
            .replace(/-\s/g, '• ')               // Lists
            .replace(/\|/g, ' ')                 // Tables
            .replace(/---/g, '─────────────────');
    }

    _markdownToDocxParagraphs(md) {
        const docx = window.docx;
        const lines = md.split('\n');
        const paragraphs = [];

        lines.forEach(line => {
            // Heading
            if (line.startsWith('# ')) {
                paragraphs.push(new docx.Paragraph({
                    text: line.replace('# ', ''),
                    heading: docx.HeadingLevel.HEADING_1,
                    spacing: { before: 240, after: 120 }
                }));
            } else if (line.startsWith('## ')) {
                paragraphs.push(new docx.Paragraph({
                    text: line.replace('## ', ''),
                    heading: docx.HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 }
                }));
            } else if (line.startsWith('### ')) {
                paragraphs.push(new docx.Paragraph({
                    text: line.replace('### ', ''),
                    heading: docx.HeadingLevel.HEADING_3,
                    spacing: { before: 160, after: 80 }
                }));
            } else if (line.startsWith('- ')) {
                paragraphs.push(new docx.Paragraph({
                    text: line.replace('- ', '• '),
                    bullet: { level: 0 },
                    spacing: { after: 60 }
                }));
            } else if (line.trim() === '') {
                paragraphs.push(new docx.Paragraph({ spacing: { after: 120 } }));
            } else {
                paragraphs.push(new docx.Paragraph({
                    text: line,
                    spacing: { after: 80 }
                }));
            }
        });

        return paragraphs;
    }

    // ============================================
    // CARREGAR BIBLIOTECAS (lazy load)
    // ============================================
    async _loadJsPDF() {
        if (this.jsPDFLoaded) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => { this.jsPDFLoaded = true; resolve(); };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async _loadDocx() {
        if (this.docxLoaded) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/docx@8.5.0/build/index.js';
            script.onload = () => { this.docxLoaded = true; resolve(); };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async _loadXLSX() {
        if (this.xlsxLoaded) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.onload = () => { this.xlsxLoaded = true; resolve(); };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}

export const exportManager = new ExportManager();