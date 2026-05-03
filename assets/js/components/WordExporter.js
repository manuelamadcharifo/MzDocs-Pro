// assets/js/components/WordExporter.js
// Gera .docx REAL com formatação académica via docx-js (CDN)
// Times New Roman 12pt, margens 2.5cm, espaçamento 1.5, numeração de página

export class WordExporter {

    async export(markdownContent, filename, metadata = {}) {
        // Carrega docx-js da CDN se ainda não estiver disponível
        if (!window.docx) {
            await this._loadDocxLib();
        }

        const {
            Document, Packer, Paragraph, TextRun, HeadingLevel,
            AlignmentType, PageNumber, Header, Footer, ImageRun,
            TableOfContents, LevelFormat, NumberFormat,
            BorderStyle, PageBreak, Tab, TabStopType, TabStopPosition,
            WidthType, Table, TableRow, TableCell, ShadingType,
            LineRuleType, convertInchesToTwip, UnderlineType
        } = window.docx;

        const sections = this._parseMarkdown(markdownContent, metadata, window.docx);

        const doc = new Document({
            creator: 'MzDocs Pro',
            title: metadata.title || 'Documento',
            description: 'Gerado por MzDocs Pro',

            numbering: {
                config: [
                    {
                        reference: 'bullets',
                        levels: [{
                            level: 0, format: LevelFormat.BULLET, text: '•',
                            alignment: AlignmentType.LEFT,
                            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
                        }]
                    },
                    {
                        reference: 'numbered',
                        levels: [{
                            level: 0, format: LevelFormat.DECIMAL, text: '%1.',
                            alignment: AlignmentType.LEFT,
                            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
                        }]
                    }
                ]
            },

            styles: {
                default: {
                    document: {
                        run: { font: 'Times New Roman', size: 24, color: '000000' },
                        paragraph: {
                            spacing: { line: 360, lineRule: LineRuleType.AUTO, after: 200 }
                        }
                    }
                },
                paragraphStyles: [
                    {
                        id: 'Normal', name: 'Normal', quickFormat: true,
                        run: { font: 'Times New Roman', size: 24, color: '000000' },
                        paragraph: {
                            spacing: { line: 360, lineRule: LineRuleType.AUTO, after: 200 },
                            indent: { firstLine: 720 } // Recuo de 1.27cm na primeira linha
                        }
                    },
                    {
                        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: 'Times New Roman', size: 28, bold: true, color: '000000' },
                        paragraph: {
                            spacing: { before: 480, after: 240, line: 360, lineRule: LineRuleType.AUTO },
                            indent: { firstLine: 0 },
                            outlineLevel: 0,
                            alignment: AlignmentType.CENTER
                        }
                    },
                    {
                        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: 'Times New Roman', size: 24, bold: true, color: '000000' },
                        paragraph: {
                            spacing: { before: 360, after: 180, line: 360, lineRule: LineRuleType.AUTO },
                            indent: { firstLine: 0 },
                            outlineLevel: 1
                        }
                    },
                    {
                        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: 'Times New Roman', size: 24, bold: true, italic: true, color: '000000' },
                        paragraph: {
                            spacing: { before: 240, after: 120, line: 360, lineRule: LineRuleType.AUTO },
                            indent: { firstLine: 0 },
                            outlineLevel: 2
                        }
                    }
                ]
            },

            sections: [{
                properties: {
                    page: {
                        size: { width: 11906, height: 16838 }, // A4
                        margin: {
                            top:    convertInchesToTwip(1.18), // 3cm
                            bottom: convertInchesToTwip(0.98), // 2.5cm
                            left:   convertInchesToTwip(1.18), // 3cm
                            right:  convertInchesToTwip(0.98), // 2.5cm
                        }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [
                                    new TextRun({
                                        text: (metadata.title || 'MzDocs Pro').slice(0, 60),
                                        font: 'Times New Roman', size: 20, color: '666666'
                                    })
                                ],
                                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } }
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({ text: 'Página ', font: 'Times New Roman', size: 20, color: '666666' }),
                                    new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 20, color: '666666' }),
                                    new TextRun({ text: ' de ', font: 'Times New Roman', size: 20, color: '666666' }),
                                    new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Times New Roman', size: 20, color: '666666' })
                                ],
                                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } }
                            })
                        ]
                    })
                },
                children: sections
            }]
        });

        const buffer = await Packer.toBlob(doc);
        const url    = URL.createObjectURL(buffer);
        const a      = document.createElement('a');
        a.href       = url;
        a.download   = filename?.replace(/\.(doc|md|txt)$/, '.docx') || `mzdocs-${Date.now()}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true };
    }

    // ── Parser de Markdown → elementos docx ──────────────────────────────
    _parseMarkdown(md, metadata, docx) {
        const {
            Paragraph, TextRun, HeadingLevel, AlignmentType,
            PageBreak, LineRuleType
        } = docx;

        const children = [];

        // Capa do documento
        if (metadata.title) {
            children.push(
                new Paragraph({ children: [new PageBreak()] }), // só se não for a primeira página
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 1440, after: 400, line: 360, lineRule: LineRuleType.AUTO },
                    children: [new TextRun({ text: '', font: 'Times New Roman', size: 24 })]
                })
            );
        }

        // Corrige acentuação comum portuguesa (erros frequentes)
        md = this._fixAccents(md);

        const lines = md.split('\n');
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Linha em branco
            if (!line.trim()) { i++; continue; }

            // Quebra de página explícita (--- sozinho)
            if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
                // Separador — linha horizontal em vez de quebra de página
                children.push(new Paragraph({
                    border: { bottom: { style: docx.BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
                    spacing: { before: 200, after: 200 },
                    children: [new TextRun('')]
                }));
                i++; continue;
            }

            // Headings
            const h1 = line.match(/^#\s+(.+)/);
            const h2 = line.match(/^##\s+(.+)/);
            const h3 = line.match(/^###\s+(.+)/);
            const h4 = line.match(/^####\s+(.+)/);

            if (h1) {
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    children: this._inlineRuns(h1[1], docx, { bold: true, size: 28 })
                }));
                i++; continue;
            }
            if (h2) {
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_2,
                    children: this._inlineRuns(h2[1], docx, { bold: true, size: 24 })
                }));
                i++; continue;
            }
            if (h3) {
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_3,
                    children: this._inlineRuns(h3[1], docx, { bold: true, italic: true, size: 24 })
                }));
                i++; continue;
            }
            if (h4) {
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_4,
                    children: this._inlineRuns(h4[1], docx, { bold: true, size: 24 })
                }));
                i++; continue;
            }

            // Tabela markdown
            if (line.includes('|') && lines[i+1] && lines[i+1].includes('|') && /^[\|\-\:\s]+$/.test(lines[i+1])) {
                const tableLines = [];
                while (i < lines.length && lines[i].includes('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                const table = this._buildTable(tableLines, docx);
                if (table) children.push(table);
                continue;
            }

            // Lista com bullets
            const bullet = line.match(/^(\s*)[-*]\s+(.+)/);
            if (bullet) {
                children.push(new Paragraph({
                    numbering: { reference: 'bullets', level: 0 },
                    children: this._inlineRuns(bullet[2], docx)
                }));
                i++; continue;
            }

            // Lista numerada
            const numbered = line.match(/^(\s*)\d+\.\s+(.+)/);
            if (numbered) {
                children.push(new Paragraph({
                    numbering: { reference: 'numbered', level: 0 },
                    children: this._inlineRuns(numbered[2], docx)
                }));
                i++; continue;
            }

            // Parágrafo normal
            children.push(new Paragraph({
                style: 'Normal',
                children: this._inlineRuns(line, docx)
            }));
            i++;
        }

        return children;
    }

    // Converte inline markdown (bold, italic, code) para TextRun[]
    _inlineRuns(text, docx, defaults = {}) {
        const { TextRun } = docx;
        const runs = [];
        const base = { font: 'Times New Roman', size: defaults.size || 24, color: '000000', ...defaults };

        // Regex para capturar bold+italic, bold, italic, code
        const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
        let last = 0, match;

        while ((match = pattern.exec(text)) !== null) {
            if (match.index > last) {
                runs.push(new TextRun({ ...base, text: text.slice(last, match.index) }));
            }
            if (match[2]) runs.push(new TextRun({ ...base, text: match[2], bold: true, italic: true }));
            else if (match[3]) runs.push(new TextRun({ ...base, text: match[3], bold: true }));
            else if (match[4]) runs.push(new TextRun({ ...base, text: match[4], italic: true }));
            else if (match[5]) runs.push(new TextRun({ ...base, text: match[5], font: 'Courier New', size: 22 }));
            last = match.index + match[0].length;
        }
        if (last < text.length) {
            runs.push(new TextRun({ ...base, text: text.slice(last) }));
        }
        return runs.length ? runs : [new TextRun({ ...base, text })];
    }

    // Constrói tabela docx a partir de linhas markdown
    _buildTable(lines, docx) {
        const { Table, TableRow, TableCell, Paragraph, TextRun, BorderStyle, WidthType, ShadingType, AlignmentType, LineRuleType } = docx;
        const rows = lines.filter(l => !/^[\|\-\:\s]+$/.test(l));
        if (!rows.length) return null;

        const border = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' };
        const borders = { top: border, bottom: border, left: border, right: border, insideH: border, insideV: border };

        const numCols = rows[0].split('|').filter(c => c.trim()).length;
        const colW    = Math.floor(8640 / numCols); // A4 content width in DXA

        return new Table({
            width: { size: 8640, type: WidthType.DXA },
            columnWidths: Array(numCols).fill(colW),
            rows: rows.map((row, ri) => {
                const cells = row.split('|').filter(c => c.trim() !== '');
                return new TableRow({
                    children: cells.map(cell => new TableCell({
                        borders,
                        width: { size: colW, type: WidthType.DXA },
                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                        shading: ri === 0 ? { fill: 'D9D9D9', type: ShadingType.CLEAR } : undefined,
                        children: [new Paragraph({
                            alignment: ri === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                            spacing: { before: 0, after: 0, line: 300, lineRule: LineRuleType.AUTO },
                            children: [new TextRun({
                                text: cell.trim(),
                                font: 'Times New Roman',
                                size: 22,
                                bold: ri === 0
                            })]
                        })]
                    }))
                });
            })
        });
    }

    // Corrige erros comuns de acentuação em português
    _fixAccents(text) {
        const fixes = [
            // Erros comuns de maiúsculas sem acento
            [/\bAfrica\b/g, 'África'],
            [/\bAmerica\b/g, 'América'],
            [/\bEuropa\b/g, 'Europa'],
            [/\bAsia\b/g, 'Ásia'],
            [/\bIndice\b/g, 'Índice'],
            [/\bIntroducao\b/gi, 'Introdução'],
            [/\bConclusao\b/gi, 'Conclusão'],
            [/\bReferencias\b/gi, 'Referências'],
            [/\bBibliograficas\b/gi, 'Bibliográficas'],
            [/\bMocambique\b/gi, 'Moçambique'],
            [/\bInformacao\b/gi, 'Informação'],
            [/\bEducacao\b/gi, 'Educação'],
            [/\bGestao\b/gi, 'Gestão'],
            [/\bNacao\b/gi, 'Nação'],
            [/\bSituacao\b/gi, 'Situação'],
            [/\bOrganizacao\b/gi, 'Organização'],
            [/\bComunicacao\b/gi, 'Comunicação'],
            [/\bAvaliacao\b/gi, 'Avaliação'],
            [/\bAnalise\b/gi, 'Análise'],
            [/\bEconomia\b/gi, 'Economia'],
            [/\bnumerous\b/gi, 'numerosas'],
        ];
        fixes.forEach(([from, to]) => { text = text.replace(from, to); });
        return text;
    }

    async _loadDocxLib() {
        return new Promise((resolve, reject) => {
            if (window.docx) return resolve();
            const URLS = [
                'https://unpkg.com/docx@9.0.2/build/index.umd.js',
                'https://cdn.jsdelivr.net/npm/docx@9.0.2/build/index.umd.js',
            ];
            const tryNext = (idx) => {
                if (idx >= URLS.length) return reject(new Error('Falha ao carregar biblioteca docx'));
                const s = document.createElement('script');
                s.src = URLS[idx];
                s.onload = () => window.docx ? resolve() : reject(new Error('docx nao inicializado'));
                s.onerror = () => tryNext(idx + 1);
                document.head.appendChild(s);
            };
            tryNext(0);
        });
    }
}

export const wordExporter = new WordExporter();
export default WordExporter;