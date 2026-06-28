// assets/js/components/WordExporter.js
// Gera .docx REAL com formatação académica profissional via docx-js
// Times New Roman 12pt, margens normalizadas, espaçamento 1.5, widow/orphan control
// Capas por tipo de documento (sem tabelas para layout)

export class WordExporter {

    async export(markdownContent, filename, metadata = {}) {
        if (!window.docx) await this._loadDocxLib();

        const {
            Document, Packer, Paragraph, TextRun, HeadingLevel,
            AlignmentType, PageNumber, Header, Footer,
            TableOfContents, LevelFormat, NumberFormat,
            BorderStyle, PageBreak, Tab, TabStopType, TabStopPosition,
            WidthType, Table, TableRow, TableCell, ShadingType,
            LineRuleType, convertInchesToTwip, UnderlineType,
            KeepLines, KeepNext
        } = window.docx;

        // ── Helpers ─────────────────────────────────────────────────────────
        const twip = (cm) => Math.round(cm * 567); // cm → twip

        const clean = (t = '') => t
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();

        // Remove placeholders visíveis — substitui por linha de preenchimento
        const sanitize = (t = '') => t
            .replace(/\[PREENCHER[^\]]*\]/gi, '____________________')
            .replace(/\[escrever[^\]]*\]/gi, '____________________')
            .replace(/\[inserir[^\]]*\]/gi, '____________________');

        const prep = (t) => sanitize(clean(t));

        const baseFont  = 'Times New Roman';
        const baseSize  = 24; // half-points (12pt)
        const lineSpace = { line: 360, lineRule: LineRuleType.AUTO }; // 1.5 espacamento

        // TextRun base
        const TR = (text, opts = {}) => new TextRun({
            text: prep(text),
            font: opts.font || baseFont,
            size: opts.size || baseSize,
            color: opts.color || '000000',
            bold:      opts.bold      || false,
            italic:    opts.italic    || false,
            underline: opts.underline || undefined,
        });

        // Parágrafo base com widow/orphan
        const Para = (children, opts = {}) => new Paragraph({
            children: Array.isArray(children) ? children : [children],
            alignment: opts.align || AlignmentType.JUSTIFIED,
            spacing: {
                ...lineSpace,
                before: opts.before || 0,
                after:  opts.after  || 200,
            },
            indent: opts.indent !== false ? { firstLine: opts.firstLine || 720 } : {},
            style: opts.style || 'Normal',
            heading: opts.heading,
            keepLines: true,    // widow/orphan: mantém parágrafo junto
            keepNext:  opts.keepNext || false, // mantém junto com parágrafo seguinte
            pageBreakBefore: opts.pageBreak || false,
        });

        // ── Converter inline markdown em TextRun[] ──────────────────────────
        const inlineRuns = (text, defaults = {}) => {
            const runs  = [];
            const base  = { font: baseFont, size: defaults.size || baseSize, color: '000000', ...defaults };
            const clean_text = prep(text);
            const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
            let last = 0, match;

            while ((match = pattern.exec(clean_text)) !== null) {
                if (match.index > last) {
                    runs.push(new TextRun({ ...base, text: clean_text.slice(last, match.index) }));
                }
                if (match[2]) runs.push(new TextRun({ ...base, text: match[2], bold: true, italic: true }));
                else if (match[3]) runs.push(new TextRun({ ...base, text: match[3], bold: true }));
                else if (match[4]) runs.push(new TextRun({ ...base, text: match[4], italic: true }));
                else if (match[5]) runs.push(new TextRun({ ...base, text: match[5], font: 'Courier New', size: 22 }));
                last = match.index + match[0].length;
            }
            if (last < clean_text.length) runs.push(new TextRun({ ...base, text: clean_text.slice(last) }));
            return runs.length ? runs : [new TextRun({ ...base, text: clean_text })];
        };

        // ── Capa por tipo de documento ──────────────────────────────────────
        const buildCover = (type, meta) => {
            const elements = [];

            const emptyLine = (n = 1) => Array(n).fill(null).map(() =>
                new Paragraph({ children: [new TextRun('')], spacing: { line: 360, lineRule: LineRuleType.AUTO, before: 0, after: 0 } })
            );

            if (type === 'trabalho' || type === 'academic') {
                // ── Capa Académica Formal (norma moçambicana) ───────────────
                // Sem tabelas — alinhamento puro por espaçamento e indentação

                // Instituição centralizada no topo
                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 360, lineRule: LineRuleType.AUTO, before: twip(2.5), after: 100 },
                    children: [new TextRun({
                        text: (prep(meta.instituicao) || 'REPÚBLICA DE MOÇAMBIQUE').toUpperCase(),
                        font: baseFont, size: 22, bold: true, color: '000000',
                    })]
                }));

                if (meta.faculdade) {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: 320, lineRule: LineRuleType.AUTO, before: 0, after: 80 },
                        children: [new TextRun({ text: prep(meta.faculdade).toUpperCase(), font: baseFont, size: 20, color: '333333' })]
                    }));
                }

                if (meta.curso) {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: 320, lineRule: LineRuleType.AUTO, before: 0, after: 200 },
                        children: [new TextRun({ text: prep(meta.curso), font: baseFont, size: 20, color: '333333' })]
                    }));
                }

                // Espaço no meio
                elements.push(...emptyLine(3));

                // Título principal
                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 400, lineRule: LineRuleType.AUTO, before: twip(1.5), after: 200 },
                    children: [new TextRun({
                        text: prep(meta.title || 'Trabalho Académico').toUpperCase(),
                        font: baseFont, size: 32, bold: true, color: '000000',
                    })]
                }));

                if (meta.subtitulo) {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: 360, lineRule: LineRuleType.AUTO, before: 100, after: 300 },
                        children: [new TextRun({ text: prep(meta.subtitulo), font: baseFont, size: 22, italic: true, color: '444444' })]
                    }));
                }

                // Espaço antes do bloco de identificação
                elements.push(...emptyLine(4));

                // Bloco de identificação (alinhado à direita — norma APA)
                const idFields = [
                    meta.disciplina && ['Disciplina', meta.disciplina],
                    meta.nivel && ['Nível', meta.nivel],
                    meta.aluno && ['Estudante', meta.aluno],
                    meta.turma && ['Turma/Classe', meta.turma],
                    meta.numero && ['N.º de Estudante', meta.numero],
                    meta.docente && ['Docente', meta.docente],
                ].filter(Boolean);

                idFields.forEach(([label, value]) => {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { line: 300, lineRule: LineRuleType.AUTO, before: 0, after: 80 },
                        children: [
                            new TextRun({ text: `${label}: `, font: baseFont, size: 22, bold: true }),
                            new TextRun({ text: prep(value), font: baseFont, size: 22 }),
                        ]
                    }));
                });

                // Espaço final + data
                elements.push(...emptyLine(3));
                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 360, lineRule: LineRuleType.AUTO, before: twip(1), after: 0 },
                    children: [new TextRun({
                        text: `${prep(meta.cidade) || 'Maputo'}, ${meta.ano || new Date().getFullYear()}`,
                        font: baseFont, size: 22, color: '444444',
                    })]
                }));

            } else if (type === 'planonegocio' || type === 'business') {
                // ── Capa Plano de Negócios ──────────────────────────────────
                elements.push(...emptyLine(5));

                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 360, lineRule: LineRuleType.AUTO, before: 0, after: 100 },
                    children: [new TextRun({ text: 'PLANO DE NEGÓCIOS', font: baseFont, size: 20, bold: false, color: '666666' })]
                }));

                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 400, lineRule: LineRuleType.AUTO, before: 100, after: 300 },
                    children: [new TextRun({
                        text: prep(meta.nomeNegocio || meta.title || 'Negócio').toUpperCase(),
                        font: baseFont, size: 36, bold: true, color: '000000',
                    })]
                }));

                if (meta.sector) {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: 360, lineRule: LineRuleType.AUTO, before: 0, after: 200 },
                        children: [new TextRun({ text: `Sector: ${prep(meta.sector)}`, font: baseFont, size: 22, italic: true })]
                    }));
                }

                elements.push(...emptyLine(5));

                const bizFields = [
                    meta.proprietario && ['Proprietário', meta.proprietario],
                    meta.local && ['Localização', meta.local],
                    meta.investimento && ['Investimento Inicial', `${meta.investimento} MZN`],
                    meta.retorno && ['Prazo de Retorno', meta.retorno],
                ].filter(Boolean);

                bizFields.forEach(([label, value]) => {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: 300, lineRule: LineRuleType.AUTO, before: 0, after: 100 },
                        children: [
                            new TextRun({ text: `${label}: `, font: baseFont, size: 22, bold: true }),
                            new TextRun({ text: prep(value), font: baseFont, size: 22 }),
                        ]
                    }));
                });

                elements.push(...emptyLine(3));
                const d = new Date();
                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 360, lineRule: LineRuleType.AUTO, before: twip(1), after: 0 },
                    children: [new TextRun({
                        text: `${prep(meta.cidade) || 'Maputo'} · ${d.toLocaleDateString('pt-MZ', { month: 'long', year: 'numeric' })}`,
                        font: baseFont, size: 22, color: '666666',
                    })]
                }));

            } else {
                // ── Capa Genérica ───────────────────────────────────────────
                elements.push(...emptyLine(8));
                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 400, lineRule: LineRuleType.AUTO, before: 0, after: 300 },
                    children: [new TextRun({ text: prep(meta.title || 'Documento').toUpperCase(), font: baseFont, size: 32, bold: true })]
                }));
                if (meta.subtitulo) {
                    elements.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: 360, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
                        children: [new TextRun({ text: prep(meta.subtitulo), font: baseFont, size: 22, italic: true, color: '555555' })]
                    }));
                }
                elements.push(...emptyLine(8));
                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: `${prep(meta.cidade) || 'Maputo'}, ${meta.ano || new Date().getFullYear()}`, font: baseFont, size: 22, color: '666666' })]
                }));
            }

            // Page break no fim da capa
            elements.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));
            return elements;
        };

        // ── Construir tabela .docx ──────────────────────────────────────────
        const buildTable = (tableLines) => {
            const dataRows = tableLines
                .filter(l => !/^\|[-: ]+\|$/.test(l.trim()))
                .map(l => l.split('|').map(c => c.trim()).filter((_, i, a) => i !== 0 && i !== a.length - 1));

            if (!dataRows.length) return null;
            const numCols = dataRows[0].length;
            const colW    = Math.floor(8640 / numCols);
            const border  = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' };
            const borders = { top: border, bottom: border, left: border, right: border, insideH: border, insideV: border };

            return new Table({
                width: { size: 8640, type: WidthType.DXA },
                columnWidths: Array(numCols).fill(colW),
                margins: { top: 80, bottom: 80, left: 80, right: 80 },
                rows: dataRows.map((row, ri) =>
                    new TableRow({
                        tableHeader: ri === 0,
                        children: row.map(cell =>
                            new TableCell({
                                borders,
                                width: { size: colW, type: WidthType.DXA },
                                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                                shading: ri === 0 ? { fill: '283C64', type: ShadingType.CLEAR } : (ri % 2 === 0 ? { fill: 'F5F8FF', type: ShadingType.CLEAR } : undefined),
                                children: [new Paragraph({
                                    alignment: ri === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                                    spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.AUTO },
                                    children: [new TextRun({
                                        text: prep(cell),
                                        font: baseFont, size: 20,
                                        bold: ri === 0,
                                        color: ri === 0 ? 'FFFFFF' : '000000',
                                    })]
                                })]
                            })
                        )
                    })
                )
            });
        };

        // ── Parser principal ────────────────────────────────────────────────
        const parseMarkdown = () => {
            const children = [];

            // Capa
            const docType = metadata.docType || 'generic';

            // Extrair metadata de tabela de capa se existir no markdown
            const coverMeta = { ...metadata };
            const mdLines = markdownContent.split('\n');
            for (let li = 0; li < Math.min(30, mdLines.length); li++) {
                const m = mdLines[li].match(/\|\s*\*\*([^*]+)\*\*\s*:\s*\|\s*(.+?)\s*\|/);
                if (m) {
                    const key = m[1].toLowerCase().trim();
                    const val = m[2].trim();
                    if (key.includes('instituiç')) coverMeta.instituicao = val;
                    if (key.includes('disciplina') || key.includes('curso')) coverMeta.disciplina = val;
                    if (key.includes('nível') || key.includes('nivel')) coverMeta.nivel = val;
                    if (key.includes('aluno') || key.includes('nome') || key.includes('estudante')) coverMeta.aluno = val;
                    if (key.includes('docente') || key.includes('professor')) coverMeta.docente = val;
                    if (key.includes('faculdade') || key.includes('departament')) coverMeta.faculdade = val;
                }
            }

            if (docType !== 'none') {
                children.push(...buildCover(docType, coverMeta));
            }

            // Processar markdown linha a linha
            // Normalizar variantes de "Nova Página" para o marcador canónico
            const normalizePageBreaks = (raw) => raw
                .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
                .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---')
                .replace(/(---PAGE_BREAK---\s*){2,}/g, '---PAGE_BREAK---\n');
            const lines = normalizePageBreaks(this._fixAccents(markdownContent)).split('\n');
            let i = 0;
            let skipCoverTable = true; // suprimir a tabela de capa do markdown

            while (i < lines.length) {
                const line = lines[i];
                const t    = line.trim();

                // Linha vazia
                if (!t) { i++; continue; }

                // PAGE_BREAK
                if (t === '---PAGE_BREAK---') {
                    children.push(new Paragraph({
                        children: [new PageBreak()],
                        spacing: { before: 0, after: 0 }
                    }));
                    i++; continue;
                }

                // Separador ---
                if (/^---+$/.test(t) || /^\*\*\*+$/.test(t)) {
                    children.push(new Paragraph({
                        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
                        spacing: { before: 200, after: 200 },
                        children: [new TextRun('')]
                    }));
                    i++; continue;
                }

                // Headings
                const h1 = t.match(/^#\s+(.+)/);
                const h2 = t.match(/^##\s+(.+)/);
                const h3 = t.match(/^###\s+(.+)/);
                const h4 = t.match(/^####\s+(.+)/);

                if (h1) {
                    children.push(new Paragraph({
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        spacing: { ...lineSpace, before: 480, after: 240 },
                        keepLines: true, keepNext: true, // nunca ficar sozinho
                        indent: { firstLine: 0 },
                        pageBreakBefore: false,
                        children: inlineRuns(h1[1], { bold: true, size: 28 })
                    }));
                    i++; continue;
                }
                if (h2) {
                    const isNumberedChapter = /^\d+[\.\)]\s/.test(h2[1]) ||
                        /^(Introdução|Conclusão|Referências|Índice|Abstract|Resumo|Metodologia)/i.test(h2[1]);
                    children.push(new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        spacing: { ...lineSpace, before: 360, after: 180 },
                        keepLines: true, keepNext: true,
                        indent: { firstLine: 0 },
                        pageBreakBefore: isNumberedChapter,
                        children: inlineRuns(h2[1], { bold: true, size: 24 })
                    }));
                    i++; continue;
                }
                if (h3) {
                    children.push(new Paragraph({
                        heading: HeadingLevel.HEADING_3,
                        spacing: { ...lineSpace, before: 240, after: 120 },
                        keepLines: true, keepNext: true,
                        indent: { firstLine: 0 },
                        children: inlineRuns(h3[1], { bold: true, italic: true, size: 24 })
                    }));
                    i++; continue;
                }
                if (h4) {
                    children.push(new Paragraph({
                        heading: HeadingLevel.HEADING_4,
                        spacing: { ...lineSpace, before: 200, after: 100 },
                        keepLines: true, keepNext: true,
                        indent: { firstLine: 0 },
                        children: inlineRuns(h4[1], { bold: true, size: 22 })
                    }));
                    i++; continue;
                }

                // Tabela de capa (suprimir — já renderizada)
                if (skipCoverTable && t.startsWith('|') && t.includes('**') &&
                    lines[i+1] && /^\|[-: ]+\|/.test(lines[i+1]?.trim())) {
                    while (i < lines.length && lines[i].trim().startsWith('|')) i++;
                    skipCoverTable = false; // só suprimir a primeira
                    continue;
                }

                // Tabela markdown
                if (t.startsWith('|') && lines[i+1] && /^\|[-: ]+\|/.test(lines[i+1]?.trim())) {
                    const tableLines = [];
                    while (i < lines.length && lines[i].trim().startsWith('|')) {
                        tableLines.push(lines[i].trim());
                        i++;
                    }
                    const table = buildTable(tableLines);
                    if (table) {
                        children.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 100, after: 100 } }));
                        children.push(table);
                        children.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 100, after: 200 } }));
                    }
                    continue;
                }

                // Citação blockquote
                const bq = t.match(/^>\s+(.+)/);
                if (bq) {
                    children.push(new Paragraph({
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { ...lineSpace, before: 160, after: 160 },
                        indent: { left: 720, right: 360 },
                        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '3C64AC', space: 10 } },
                        keepLines: true,
                        children: inlineRuns(bq[1], { italic: true, size: 22, color: '444444' })
                    }));
                    i++; continue;
                }

                // Lista bullet
                const bullet = t.match(/^[-*]\s+(.+)/);
                if (bullet) {
                    children.push(new Paragraph({
                        numbering: { reference: 'bullets', level: 0 },
                        spacing: { ...lineSpace, before: 0, after: 80 },
                        keepLines: true,
                        children: inlineRuns(bullet[1])
                    }));
                    i++; continue;
                }

                // Lista numerada
                const numbered = t.match(/^(\d+)\.\s+(.+)/);
                if (numbered) {
                    children.push(new Paragraph({
                        numbering: { reference: 'numbered', level: 0 },
                        spacing: { ...lineSpace, before: 0, after: 80 },
                        keepLines: true,
                        children: inlineRuns(numbered[2])
                    }));
                    i++; continue;
                }

                // Parágrafo normal
                children.push(new Paragraph({
                    style: 'Normal',
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { ...lineSpace, before: 0, after: 200 },
                    indent: { firstLine: 720 },
                    keepLines: true,
                    children: inlineRuns(t)
                }));
                i++;
            }

            return children;
        };

        // ── Construir documento ─────────────────────────────────────────────
        const docChildren = parseMarkdown();

        const doc = new Document({
            title: prep(metadata.title || 'Documento'),
            numbering: {
                config: [
                    {
                        reference: 'bullets',
                        levels: [{
                            level: 0, format: LevelFormat.BULLET, text: '•',
                            alignment: AlignmentType.LEFT,
                            style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: 'Symbol', size: 24 } }
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
                        run: { font: baseFont, size: baseSize, color: '000000' },
                        paragraph: { spacing: { ...lineSpace, after: 200 } }
                    }
                },
                paragraphStyles: [
                    {
                        id: 'Normal', name: 'Normal', quickFormat: true,
                        run: { font: baseFont, size: baseSize, color: '000000' },
                        paragraph: {
                            spacing: { ...lineSpace, after: 200 },
                            indent: { firstLine: 720 },
                            contextualSpacing: true,
                        }
                    },
                    {
                        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: baseFont, size: 28, bold: true, color: '000000' },
                        paragraph: {
                            spacing: { ...lineSpace, before: 480, after: 240 },
                            indent: { firstLine: 0 },
                            outlineLevel: 0,
                            alignment: AlignmentType.CENTER,
                            keepLines: true, keepNext: true,
                        }
                    },
                    {
                        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: baseFont, size: 24, bold: true, color: '000000' },
                        paragraph: {
                            spacing: { ...lineSpace, before: 360, after: 180 },
                            indent: { firstLine: 0 },
                            outlineLevel: 1,
                            keepLines: true, keepNext: true,
                        }
                    },
                    {
                        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: baseFont, size: 24, bold: true, italic: true, color: '000000' },
                        paragraph: {
                            spacing: { ...lineSpace, before: 240, after: 120 },
                            indent: { firstLine: 0 },
                            outlineLevel: 2,
                            keepLines: true, keepNext: true,
                        }
                    },
                    {
                        id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                        run: { font: baseFont, size: 22, bold: true, color: '000000' },
                        paragraph: {
                            spacing: { ...lineSpace, before: 200, after: 100 },
                            indent: { firstLine: 0 },
                            outlineLevel: 3,
                            keepLines: true, keepNext: true,
                        }
                    },
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
                footers: {
                    default: new Footer({
                        children: [new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 0, after: 0 },
                            children: [
                                new TextRun({ text: '— ', font: baseFont, size: 18, color: '888888' }),
                                new TextRun({ children: [PageNumber.CURRENT], font: baseFont, size: 18, color: '888888' }),
                                new TextRun({ text: ' —', font: baseFont, size: 18, color: '888888' }),
                            ]
                        })]
                    })
                },
                children: docChildren
            }]
        });

        const buffer = await Packer.toBlob(doc);
        const url    = URL.createObjectURL(buffer);
        const a      = document.createElement('a');
        a.href       = url;
        a.download   = (filename || `mzdocs-${Date.now()}`).replace(/\.(doc|md|txt|pdf)$/, '') + '.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true };
    }

    // Corrige erros comuns de acentuação em português
    _fixAccents(text) {
        const fixes = [
            [/\bAfrica\b/g, 'África'], [/\bAsia\b/g, 'Ásia'],
            [/\bIndice\b/g, 'Índice'], [/\bMocambique\b/gi, 'Moçambique'],
            [/\bIntroducao\b/gi, 'Introdução'], [/\bConclusao\b/gi, 'Conclusão'],
            [/\bReferencias\b/gi, 'Referências'], [/\bBibliograficas\b/gi, 'Bibliográficas'],
            [/\bInformacao\b/gi, 'Informação'], [/\bEducacao\b/gi, 'Educação'],
            [/\bGestao\b/gi, 'Gestão'], [/\bSituacao\b/gi, 'Situação'],
            [/\bOrganizacao\b/gi, 'Organização'], [/\bAvaliacao\b/gi, 'Avaliação'],
            [/\bAnalise\b/gi, 'Análise'], [/\bComunicacao\b/gi, 'Comunicação'],
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
