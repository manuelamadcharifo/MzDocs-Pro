// assets/js/components/PDFExporter.js
// PDF profissional: capas por tipo de documento, controlo rigoroso de quebras de página,
// widow/orphan control, tabelas que não se partem, índice com numeração correcta

export class PDFExporter {

    async export(markdownContent, filename, metadata = {}) {
        const { jsPDF } = await this._loadJsPDF();

        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const W   = doc.internal.pageSize.getWidth();   // 210
        const H   = doc.internal.pageSize.getHeight();  // 297
        const ML  = 30;   // margem esquerda  (3 cm)
        const MR  = 25;   // margem direita   (2.5 cm)
        const MT  = 30;   // margem topo      (3 cm)
        const MB  = 25;   // margem base      (2.5 cm)
        const CW  = W - ML - MR; // largura útil = 155 mm

        // ── Estado de paginação ────────────────────────────────────────────
        let y          = MT;
        let pageNum    = 0;
        let firstPage  = true; // capa não conta

        const newPage = () => {
            if (pageNum > 0) doc.addPage();
            pageNum++;
            y = MT;
        };

        // Verifica se há espaço; se não, nova página
        // minAfter: linhas mínimas de conteúdo que devem caber após um título
        const checkY = (needed = 10, minAfter = 0) => {
            if (y + needed + minAfter > H - MB) { newPage(); return true; }
            return false;
        };

        // Garante que um título e pelo menos 2 linhas de texto cabem juntos
        const checkHeading = (headingHeight, bodyLineH = 7) => {
            const minBlock = headingHeight + (bodyLineH * 2); // título + 2 linhas mínimo
            if (y + minBlock > H - MB) newPage();
        };

        // ── Helpers tipográficos ──────────────────────────────────────────
        const setFont = (bold, italic, size, color = [0,0,0]) => {
            doc.setFontSize(size);
            doc.setFont('times', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
            doc.setTextColor(...color);
        };

        const writeLines = (text, opts = {}) => {
            const {
                size = 12, bold = false, italic = false,
                align = 'left', color = [0,0,0], indent = 0,
                leading = 7, justify = false,
            } = opts;
            setFont(bold, italic, size, color);
            const x      = ML + indent;
            const usable = CW - indent;
            const lines  = doc.splitTextToSize(text, usable);
            lines.forEach((line, li) => {
                checkY(leading + 1);
                const xPos = align === 'center' ? W / 2 : align === 'right' ? W - MR : x;
                doc.text(line, xPos, y, { align });
                y += leading;
            });
            return lines.length * leading;
        };

        const gap = (mm = 4) => { checkY(mm); y += mm; };

        const hRule = (color = [180,180,180], w = 0.3) => {
            doc.setDrawColor(...color);
            doc.setLineWidth(w);
            doc.line(ML, y, W - MR, y);
        };

        // ── Limpeza de texto markdown inline ─────────────────────────────
        const clean = (t = '') => t
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^\s*[-*]\s+/, '')
            .trim();

        // Remove placeholders visíveis
        const sanitize = (t = '') => t
            .replace(/\[PREENCHER[^\]]*\]/gi, '____________________')
            .replace(/\[escrever[^\]]*\]/gi, '____________________')
            .replace(/\[inserir[^\]]*\]/gi, '____________________');

        const prep = (t) => sanitize(clean(t));

        // ── Capa profissional por tipo ────────────────────────────────────
        const drawCover = (type, meta) => {
            newPage(); // página 1 — não numerada

            const centerX = W / 2;
            const titleColor = [20, 20, 20];
            const accentColor = [60, 100, 160]; // azul discreto

            if (type === 'trabalho' || type === 'academic') {
                // Capa académica formal (sem tabela)
                y = MT + 15;

                // Linha topo decorativa
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.8);
                doc.line(ML, y, W - MR, y);
                y += 8;

                // Instituição
                setFont(false, false, 11, [80,80,80]);
                const inst = prep(meta.instituicao || 'REPÚBLICA DE MOÇAMBIQUE');
                doc.splitTextToSize(inst.toUpperCase(), CW).forEach(l => {
                    doc.text(l, centerX, y, { align: 'center' }); y += 6;
                });

                if (meta.faculdade) {
                    setFont(false, false, 10, [100,100,100]);
                    doc.splitTextToSize(prep(meta.faculdade).toUpperCase(), CW).forEach(l => {
                        doc.text(l, centerX, y, { align: 'center' }); y += 5.5;
                    });
                }

                y += 20;

                // Título principal
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.4);
                doc.line(ML + 10, y - 2, W - MR - 10, y - 2);
                y += 4;

                setFont(true, false, 20, titleColor);
                const titleLines = doc.splitTextToSize(prep(meta.title || 'Trabalho Académico').toUpperCase(), CW - 20);
                titleLines.forEach(l => { doc.text(l, centerX, y, { align: 'center' }); y += 11; });

                if (meta.subtitulo) {
                    y += 3;
                    setFont(false, true, 13, [60,60,60]);
                    doc.splitTextToSize(prep(meta.subtitulo), CW - 20).forEach(l => {
                        doc.text(l, centerX, y, { align: 'center' }); y += 7;
                    });
                }

                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.4);
                doc.line(ML + 10, y + 2, W - MR - 10, y + 2);

                // Bloco de identificação (alinhado à direita - norma APA/ABNT)
                y = H - MB - 80;
                const blockX = W / 2 + 5;
                const blockW = CW / 2 - 5;

                const fields = [
                    meta.disciplina && ['Disciplina:', meta.disciplina],
                    meta.nivel && ['Nível:', meta.nivel],
                    meta.aluno && ['Estudante:', meta.aluno],
                    meta.docente && ['Docente:', meta.docente],
                ].filter(Boolean);

                fields.forEach(([label, value]) => {
                    setFont(true, false, 10, [40,40,40]);
                    doc.text(label, blockX, y);
                    setFont(false, false, 10, [40,40,40]);
                    const vLines = doc.splitTextToSize(prep(value), blockW - 20);
                    vLines.forEach(l => { doc.text(l, blockX + 22, y); y += 5.5; });
                    y += 1;
                });

                // Data e local em baixo
                y = H - MB - 10;
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.8);
                doc.line(ML, y - 3, W - MR, y - 3);
                setFont(false, false, 11, [80,80,80]);
                const ano = meta.ano || new Date().getFullYear();
                doc.text(`${meta.cidade || 'Maputo'}, ${ano}`, centerX, y + 2, { align: 'center' });

            } else if (type === 'planonegocio' || type === 'business') {
                // Capa de plano de negócios
                y = MT + 10;

                // Bloco de cor no topo
                doc.setFillColor(...accentColor);
                doc.rect(0, 0, W, 50, 'F');

                setFont(true, false, 9, [255,255,255]);
                doc.text('PLANO DE NEGÓCIOS', centerX, 20, { align: 'center' });
                setFont(true, false, 22, [255,255,255]);
                const bizLines = doc.splitTextToSize(prep(meta.nomeNegocio || meta.title || 'Negócio'), CW - 10);
                let by = 32;
                bizLines.forEach(l => { doc.text(l, centerX, by, { align: 'center' }); by += 12; });

                y = 60;

                // Sector
                if (meta.sector) {
                    setFont(false, true, 12, [80,80,80]);
                    doc.text(`Sector: ${prep(meta.sector)}`, centerX, y, { align: 'center' });
                    y += 8;
                }

                y += 20;

                // Grid de info
                const infoItems = [
                    meta.proprietario && ['Proprietário', meta.proprietario],
                    meta.local && ['Localização', meta.local],
                    meta.investimento && ['Investimento Inicial', meta.investimento + ' MZN'],
                    meta.retorno && ['Retorno Previsto', meta.retorno],
                ].filter(Boolean);

                infoItems.forEach(([k, v]) => {
                    setFont(true, false, 9, [100,100,100]);
                    doc.text(k.toUpperCase(), ML + 5, y);
                    setFont(false, false, 11, [20,20,20]);
                    doc.text(prep(v), ML + 5, y + 5);
                    doc.setDrawColor(220,220,220);
                    doc.setLineWidth(0.2);
                    doc.line(ML + 5, y + 9, W - MR - 5, y + 9);
                    y += 16;
                });

                // Data
                y = H - MB - 12;
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.6);
                doc.line(ML, y - 4, W - MR, y - 4);
                setFont(false, false, 10, [80,80,80]);
                const d = new Date();
                doc.text(`${meta.cidade || 'Maputo'} · ${d.toLocaleDateString('pt-MZ', { month: 'long', year: 'numeric' })}`, centerX, y + 2, { align: 'center' });

            } else {
                // Capa genérica minimalista
                y = H / 3;
                setFont(true, false, 22, titleColor);
                const tLines = doc.splitTextToSize(prep(meta.title || 'Documento'), CW);
                tLines.forEach(l => { doc.text(l, centerX, y, { align: 'center' }); y += 12; });

                if (meta.subtitulo) {
                    y += 4;
                    setFont(false, true, 13, [80,80,80]);
                    doc.text(prep(meta.subtitulo), centerX, y, { align: 'center' });
                }

                y = H - MB - 12;
                setFont(false, false, 10, [120,120,120]);
                doc.text(`${meta.cidade || 'Maputo'}, ${meta.ano || new Date().getFullYear()}`, centerX, y, { align: 'center' });
            }
        };

        // ── Parse e renderização do markdown ──────────────────────────────
        const lines = markdownContent.split('\n');

        // Detectar se o conteúdo começa com uma capa implícita (tabela)
        // e suprimi-la (a capa já é desenhada aqui)
        let i = 0;
        let coverDrawn = false;
        let isFirstBreak = true;

        // Extrair metadata da capa em tabela se existir no markdown
        const coverMeta = { ...metadata };
        const extractCoverTable = () => {
            // Olha para as primeiras 30 linhas em busca de tabela de capa
            for (let li = 0; li < Math.min(30, lines.length); li++) {
                const m = lines[li].match(/\|\s*\*\*([^*]+)\*\*\s*:\s*\|\s*(.+?)\s*\|/);
                if (m) {
                    const key = m[1].toLowerCase().trim();
                    const val = m[2].trim();
                    if (key.includes('instituiç')) coverMeta.instituicao = val;
                    if (key.includes('disciplina') || key.includes('curso')) coverMeta.disciplina = val;
                    if (key.includes('nível') || key.includes('nivel')) coverMeta.nivel = val;
                    if (key.includes('aluno') || key.includes('nome') || key.includes('estudante')) coverMeta.aluno = val;
                    if (key.includes('docente') || key.includes('professor')) coverMeta.docente = val;
                }
            }
        };
        extractCoverTable();

        // Desenhar capa antes de processar conteúdo
        const docType = metadata.docType || 'generic';
        if (docType !== 'none') {
            drawCover(docType, coverMeta);
            coverDrawn = true;
        } else {
            newPage();
        }

        while (i < lines.length) {
            const raw  = lines[i];
            const line = raw.trim();

            // ── PAGE_BREAK explícito ─────────────────────────────────────
            if (line === '---PAGE_BREAK---') {
                if (isFirstBreak && coverDrawn) {
                    // Primeiro break = depois da capa → nova página (índice ou conteúdo)
                    isFirstBreak = false;
                    newPage();
                } else if (!isFirstBreak) {
                    newPage();
                }
                i++; continue;
            }

            // ── Separador horizontal --- ─────────────────────────────────
            if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
                gap(3);
                hRule();
                gap(4);
                i++; continue;
            }

            // ── Linha vazia ──────────────────────────────────────────────
            if (!line) { y += 3; i++; continue; }

            // ── Tabela de capa (suprimir — já renderizada como capa) ─────
            // Detecta tabela de capa: começa com | e tem ** nos cabeçalhos
            if (line.startsWith('|') && line.includes('**') &&
                i + 1 < lines.length && /^\|[-: ]+\|/.test(lines[i+1]?.trim())) {
                // Pular toda a tabela de capa
                while (i < lines.length && lines[i].trim().startsWith('|')) i++;
                continue;
            }

            // ── Tabela markdown normal ───────────────────────────────────
            if (line.startsWith('|') && i + 1 < lines.length &&
                /^\|[-: ]+\|/.test(lines[i+1]?.trim())) {
                const tableLines = [];
                while (i < lines.length && lines[i].trim().startsWith('|')) {
                    tableLines.push(lines[i].trim());
                    i++;
                }
                this._drawTable(doc, tableLines, ML, y, CW, H, MB, MT, prep);
                const dataRows = tableLines.filter(l => !/^\|[-: ]+\|$/.test(l)).length;
                y += dataRows * 8 + 6;
                if (y > H - MB) newPage();
                continue;
            }

            // ── H1 ──────────────────────────────────────────────────────
            const h1 = line.match(/^#\s+(.+)/);
            if (h1) {
                const text = prep(h1[1]);
                checkHeading(22, 7); // título + mín. 2 linhas de parágrafo
                gap(8);
                setFont(true, false, 18, [0,0,0]);
                const h1Lines = doc.splitTextToSize(text, CW);
                h1Lines.forEach(l => {
                    checkY(11);
                    doc.text(l, W/2, y, { align: 'center' });
                    y += 10;
                });
                gap(4);
                // Linha decorativa sob H1
                doc.setDrawColor(60,100,160);
                doc.setLineWidth(0.5);
                doc.line(ML + CW*0.15, y-2, W - MR - CW*0.15, y-2);
                gap(4);
                i++; continue;
            }

            // ── H2 ──────────────────────────────────────────────────────
            const h2 = line.match(/^##\s+(.+)/);
            if (h2) {
                const text = prep(h2[1]);
                checkHeading(18, 7);
                gap(7);
                setFont(true, false, 14, [0,0,0]);
                const h2Lines = doc.splitTextToSize(text, CW);
                h2Lines.forEach(l => {
                    checkY(10);
                    doc.text(l, ML, y);
                    y += 8;
                });
                // Sublinhado fino
                doc.setDrawColor(80,80,80);
                doc.setLineWidth(0.3);
                const tw = Math.min(doc.getTextWidth(h2Lines[0] || text), CW);
                doc.line(ML, y - 1, ML + tw, y - 1);
                gap(4);
                i++; continue;
            }

            // ── H3 ──────────────────────────────────────────────────────
            const h3 = line.match(/^###\s+(.+)/);
            if (h3) {
                const text = prep(h3[1]);
                checkHeading(14, 7);
                gap(5);
                setFont(true, true, 12, [0,0,0]);
                const h3Lines = doc.splitTextToSize(text, CW);
                h3Lines.forEach(l => { checkY(8); doc.text(l, ML, y); y += 7; });
                gap(3);
                i++; continue;
            }

            // ── H4 ──────────────────────────────────────────────────────
            const h4 = line.match(/^####\s+(.+)/);
            if (h4) {
                const text = prep(h4[1]);
                checkHeading(10, 7);
                gap(3);
                setFont(true, false, 12, [40,40,40]);
                doc.splitTextToSize(text, CW).forEach(l => { checkY(8); doc.text(l, ML, y); y += 7; });
                gap(2);
                i++; continue;
            }

            // ── Citação (blockquote) ─────────────────────────────────────
            const bq = line.match(/^>\s+(.+)/);
            if (bq) {
                checkY(10);
                gap(2);
                doc.setFillColor(245, 245, 245);
                const bqText = prep(bq[1]);
                const bqLines = doc.splitTextToSize(bqText, CW - 12);
                const bqH = bqLines.length * 6.5 + 6;
                checkY(bqH);
                doc.rect(ML, y - 4, CW, bqH, 'F');
                doc.setFillColor(60, 100, 160);
                doc.rect(ML, y - 4, 1.5, bqH, 'F');
                setFont(false, true, 11, [60,60,60]);
                bqLines.forEach(l => { doc.text(l, ML + 5, y); y += 6.5; });
                gap(3);
                i++; continue;
            }

            // ── Lista bullet ────────────────────────────────────────────
            const bullet = line.match(/^[-*]\s+(.+)/);
            if (bullet) {
                const txt    = prep(bullet[1]);
                setFont(false, false, 12);
                const bLines = doc.splitTextToSize(txt, CW - 9);
                const needed = bLines.length * 7 + 2;
                checkY(needed);
                bLines.forEach((bl, bi) => {
                    checkY(7);
                    if (bi === 0) {
                        doc.setFillColor(60, 100, 160);
                        doc.circle(ML + 3.5, y - 1.5, 1, 'F');
                    }
                    setFont(false, false, 12, [20,20,20]);
                    doc.text(bl, ML + 9, y);
                    y += 7;
                });
                i++; continue;
            }

            // ── Lista numerada ───────────────────────────────────────────
            const num = line.match(/^(\d+)\.\s+(.+)/);
            if (num) {
                const txt    = prep(num[2]);
                setFont(false, false, 12);
                const nLines = doc.splitTextToSize(txt, CW - 9);
                const needed = nLines.length * 7 + 2;
                checkY(needed);
                nLines.forEach((nl, ni) => {
                    checkY(7);
                    setFont(true, false, 11, [60,100,160]);
                    if (ni === 0) doc.text(`${num[1]}.`, ML + 1, y);
                    setFont(false, false, 12, [20,20,20]);
                    doc.text(nl, ML + 9, y);
                    y += 7;
                });
                i++; continue;
            }

            // ── Parágrafo normal ─────────────────────────────────────────
            const pText  = this._cleanInlinePDF(prep(line));
            setFont(false, false, 12, [20,20,20]);
            const pLines = doc.splitTextToSize(pText, CW);
            // Widow/orphan: não deixar parágrafo com 1 linha em nova página
            const firstChunk = Math.min(2, pLines.length);
            checkY(firstChunk * 7);
            pLines.forEach(pl => { checkY(7); doc.text(pl, ML, y); y += 7; });
            gap(3);
            i++;
        }

        // ── Numeração de páginas ──────────────────────────────────────────
        const total   = doc.internal.getNumberOfPages();
        const startPg = 2; // página 2 = primeira após a capa
        for (let p = startPg; p <= total; p++) {
            doc.setPage(p);
            setFont(false, false, 9, [140,140,140]);
            const n = p - startPg + 1;
            // Número no centro do rodapé
            doc.text(`— ${n} —`, W / 2, H - 10, { align: 'center' });
        }

        doc.save(filename || `documento-${Date.now()}.pdf`);
        return { success: true };
    }

    // ── Tabela profissional ─────────────────────────────────────────────────
    _drawTable(doc, tableLines, x, startY, cw, H, MB, MT, prep) {
        const dataRows = tableLines
            .filter(l => !/^\|[-: ]+\|$/.test(l))
            .map(l => l.split('|').map(c => c.trim()).filter((_, i, a) => i !== 0 && i !== a.length - 1));

        if (!dataRows.length) return;

        const cols    = dataRows[0].length;
        const colW    = cw / cols;
        const headerH = 10;
        const rowH    = 8;

        // Verifica se a tabela inteira cabe — se não, quebra para nova página
        const tableH = headerH + (dataRows.length - 1) * rowH + 4;
        if (startY + tableH > H - MB && tableH < H - MT - MB) {
            doc.addPage();
            startY = MT;
        }

        let y = startY;

        dataRows.forEach((row, ri) => {
            // Verificar espaço por linha
            const rh = ri === 0 ? headerH : rowH;
            if (y + rh > H - MB) {
                doc.addPage();
                y = MT;
                // Repetir cabeçalho na nova página
                if (ri > 0) {
                    this._drawTableRow(doc, dataRows[0], x, y, colW, cols, headerH, true, prep);
                    y += headerH;
                }
            }
            this._drawTableRow(doc, row, x, y, colW, cols, rh, ri === 0, prep);
            y += rh;
        });

        // Actualizar y global — não temos acesso directo, mas o caller usa o retorno
        return y;
    }

    _drawTableRow(doc, row, x, y, colW, cols, rowH, isHeader, prep) {
        // Fundo
        if (isHeader) {
            doc.setFillColor(40, 80, 140);
            doc.rect(x, y, colW * cols, rowH, 'F');
        } else {
            doc.setFillColor(248, 250, 252);
            doc.rect(x, y, colW * cols, rowH, 'F');
        }

        // Bordas
        doc.setDrawColor(200, 210, 225);
        doc.setLineWidth(0.2);
        doc.rect(x, y, colW * cols, rowH);

        row.forEach((cell, ci) => {
            doc.setFontSize(9.5);
            doc.setFont('times', isHeader ? 'bold' : 'normal');
            doc.setTextColor(...(isHeader ? [255,255,255] : [20,20,20]));
            const cx = x + ci * colW + 3;
            const cellW = colW - 6;
            // Linhas de separação vertical
            if (ci > 0) {
                doc.setDrawColor(200,210,225);
                doc.line(x + ci * colW, y, x + ci * colW, y + rowH);
            }
            const cellText = prep ? prep(cell) : cell;
            const cellLines = doc.splitTextToSize(cellText, cellW);
            const lineH = 3.2;
            const textY = y + (rowH / 2) - ((cellLines.length - 1) * lineH / 2);
            cellLines.forEach((cl, li) => {
                doc.text(cl, cx, textY + li * lineH);
            });
        });
    }

    _cleanInlinePDF(text) {
        return (text || '')
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
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
