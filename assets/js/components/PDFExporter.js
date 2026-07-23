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

        // CORRIGIDO (bug: espaçamento grande a mais entre títulos/parágrafos no
        // download, fazendo o documento "crescer" para mais páginas do que as
        // que o preview mostra): esta é a MESMA conversão que o preview usa —
        // DEFAULT_PAGE_CSS (A4Renderer.js) define corpo a 12pt com
        // line-height:1.5, ou seja 18pt de altura de linha real por linha de
        // texto. 18pt convertido para mm (1pt = 0.352778mm) dá ~6.35mm — não
        // os 7mm fixos que este ficheiro usava em cada parágrafo/bullet/lista.
        // Essa diferença de 0.65mm é pequena numa linha, mas um CV típico tem
        // 30-40 linhas de texto corrido: 30 × 0.65mm ≈ 2cm de espaço a mais só
        // aí, suficiente para empurrar o fim do documento para uma folha extra
        // mesmo com os marcadores ---PAGE_BREAK--- já a ser respeitados.
        const PT_TO_MM = 0.352778;
        const LEAD     = Math.round(12 * 1.5 * PT_TO_MM * 100) / 100; // ≈6.35mm — altura de linha real do corpo de texto

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
                leading = LEAD, justify = false,
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

        // ── Ícones de contacto (vectores, não texto) ───────────────────────
        // CORRIGIDO (bug: "os ícones não aparecem no documento baixado"):
        // antes, o emojiMap mais abaixo convertia 📞/✉️/📍 em texto simples
        // ("Tel." "Email:" "Local:"), porque as fontes core do jsPDF (times/
        // helvetica) não sabem desenhar emoji — mostravam "Ø=ÛÞ". Isso fazia
        // o PDF exibir palavras que NUNCA estiveram no documento tal como
        // visto no preview da webapp (que é HTML normal e mostra o emoji
        // sem problema). Em vez de substituir por texto, desenhamos os 3
        // ícones como pequenas formas vectoriais — o mesmo resultado visual
        // que o preview, sem depender de nenhuma fonte de emoji.
        const CONTACT_ICON_RX = /^(📞|☎|📱|📧|✉️|✉|📍|📌)\s*/;
        const contactIconType = (ch) => {
            if (ch === '📞' || ch === '☎' || ch === '📱') return 'phone';
            if (ch === '📧' || ch === '✉️' || ch === '✉') return 'mail';
            if (ch === '📍' || ch === '📌') return 'pin';
            return null;
        };
        const drawContactIcon = (type, cx, cy, s, color) => {
            doc.setDrawColor(...color);
            doc.setFillColor(...color);
            doc.setLineWidth(Math.max(0.25, s * 0.28));
            if (type === 'phone') {
                doc.line(cx - s * 0.4, cy + s * 0.4, cx + s * 0.4, cy - s * 0.4);
                doc.circle(cx - s * 0.4, cy + s * 0.4, s * 0.16, 'F');
                doc.circle(cx + s * 0.4, cy - s * 0.4, s * 0.16, 'F');
            } else if (type === 'mail') {
                const w2 = s * 1.2, h2 = s * 0.86, x0 = cx - w2 / 2, y0 = cy - h2 / 2;
                doc.rect(x0, y0, w2, h2);
                doc.line(x0, y0, cx, y0 + h2 * 0.58);
                doc.line(cx, y0 + h2 * 0.58, x0 + w2, y0);
            } else if (type === 'pin') {
                doc.circle(cx, cy - s * 0.14, s * 0.32, 'F');
                doc.triangle(cx - s * 0.22, cy + s * 0.04, cx + s * 0.22, cy + s * 0.04, cx, cy + s * 0.52, 'F');
                doc.setFillColor(255, 255, 255);
                doc.circle(cx, cy - s * 0.14, s * 0.12, 'F');
            }
        };
        // Desenha uma linha "📞 X | ✉️ Y | 📍 Z" com ícones reais entre os
        // segmentos, preservando a mesma disposição do preview. Se a linha
        // não couber na largura útil (CW), devolve false e o chamador cai
        // para o parágrafo normal (com o fallback de texto do emojiMap).
        const writeContactLine = (rawLine, size = 12, color = [20,20,20]) => {
            const parts = rawLine.split('|').map(s => s.trim()).filter(Boolean);
            setFont(false, false, size, color);
            const iconS = size * 0.11; // ~mm, proporcional ao tamanho do texto
            // Pré-calcular a largura total para decidir se cabe numa linha
            let total = 0;
            const segs = parts.map((part, idx) => {
                const m = part.match(CONTACT_ICON_RX);
                const type = m ? contactIconType(m[1]) : null;
                const text = this._cleanInlinePDF(type ? part.slice(m[0].length).trim() : part);
                const w = (type ? iconS * 1.6 + 1.4 : 0) + doc.getTextWidth(text) + (idx > 0 ? doc.getTextWidth('|') + 3.2 : 0);
                total += w;
                return { type, text };
            });
            if (total > CW) return false;

            checkY(LEAD);
            let x = ML;
            segs.forEach((seg, idx) => {
                if (idx > 0) {
                    doc.text('|', x, y);
                    x += doc.getTextWidth('|') + 1.6;
                }
                if (seg.type) {
                    drawContactIcon(seg.type, x + iconS * 0.6, y - size * 0.09, iconS * 1.6, color);
                    x += iconS * 1.6 + 1.4;
                }
                doc.text(seg.text, x, y);
                x += doc.getTextWidth(seg.text) + 1.6;
            });
            y += LEAD;
            gap(3);
            return true;
        };

        // ── Justificação de parágrafos ──────────────────────────────────────
        // CORRIGIDO (bug: texto do PDF alinhado só à esquerda, com a margem
        // direita irregular, enquanto o preview mostra texto justificado —
        // CSS do preview tem p{text-align:justify}). Distribui o espaço extra
        // de cada linha entre as palavras, tal como o browser faz, deixando
        // apenas a ÚLTIMA linha do parágrafo alinhada à esquerda (é assim que
        // justify se comporta em qualquer motor de texto, incl. o do preview).
        const justifyLine = (text, x, yPos, width) => {
            const words = text.split(' ').filter(Boolean);
            if (words.length <= 1) { doc.text(text, x, yPos); return; }
            const wordWidths = words.map(w => doc.getTextWidth(w));
            const totalWordsWidth = wordWidths.reduce((a, b) => a + b, 0);
            const spaceWidth = (width - totalWordsWidth) / (words.length - 1);
            let cx = x;
            words.forEach((w, idx) => {
                doc.text(w, cx, yPos);
                cx += wordWidths[idx] + spaceWidth;
            });
        };

        // ── Limpeza de texto markdown inline ─────────────────
        // CORRIGIDO: remover emojis/unicode que o jsPDF renderiza como 'Ø=ÛÞ'.
        const emojiMap = {
            '📞':'Tel.','☎':'Tel.','📱':'Tel.',
            '📧':'Email:','✉':'Email:','📍':'Local:',
            '📌':'Local:','🔗':'','🌐':'Web:',
            '💼':'','🎓':'','📅':'','🏠':'',
            '🚀':'','✅':'','❌':'','⚡':'',
            '🔑':'','💡':'','📝':'','📄':'',
        };
        const stripUnicode = (t = '') => {
            let r = t;
            for (const [emoji, sub] of Object.entries(emojiMap)) r = r.split(emoji).join(sub);
            return r.replace(/[^\x00-\xFF\u0100-\u024F]/g, '');
        };
        const clean = (t = '') => stripUnicode(t)
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
                    meta.turma && ['Turma/Classe:', meta.turma],
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
        // NORMALIZAÇÃO: converter variantes de "Nova Página" para o marcador canónico
        const normalizeContent = (raw) => {
            return raw
                // "— Nova Página —" (com travessões e variações de espaço/dash)
                .replace(/^[ \t]*[—–-]{0,3}[ \t]*Nova P[aá]gina[ \t]*[—–-]{0,3}[ \t]*$/gim, '---PAGE_BREAK---')
                // "**Nova Página**" e variantes em negrito
                .replace(/\*{1,2}Nova P[aá]gina\*{1,2}/gi, '---PAGE_BREAK---')
                // Duplo break acidental (colapsar em único)
                .replace(/(---PAGE_BREAK---\s*){2,}/g, '---PAGE_BREAK---\n');
        };
        const lines = normalizeContent(markdownContent).split('\n');

        // Detectar se o conteúdo começa com uma capa implícita (tabela)
        // e suprimi-la (a capa já é desenhada aqui)
        let i = 0;
        let coverDrawn = false;

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
                // CORRIGIDO (bug: CV/carta/recibo a ganhar uma página extra quase em
                // branco no download, apesar do preview mostrar o nº certo de páginas):
                // este marcador vem sempre do Paginator.js — o MESMO motor que já
                // decidiu, medindo no browser, onde cada folha A4 termina no preview.
                // Tem de forçar SEMPRE uma nova página aqui, com ou sem capa desenhada;
                // a condição antiga só disparava quando havia capa (coverDrawn=true),
                // fazendo o jsPDF ignorar todos os breaks — e decidir a paginação
                // sozinho, com métricas de linha diferentes das do preview — em
                // qualquer documento sem capa (docType 'none': CV, carta, recibo,
                // recomendação).
                newPage();
                // Look-ahead: se há parágrafos antes de um H2/H3 logo a seguir,
                // saltar esses parágrafos "órfãos" que o LLM coloca por engano
                // antes do título do capítulo (só salta 1 parágrafo no máximo)
                {
                    let j = i + 1;
                    while (j < lines.length && lines[j].trim() === '') j++;
                    const nextMeaningful = lines[j]?.trim() || '';
                    // Se a próxima linha com conteúdo NÃO é um heading, não faz nada
                    // Se for um heading, verificar se i+1..j-1 tem um parágrafo solto
                    if (/^#{1,3}\s/.test(nextMeaningful)) {
                        // Mover o cursor para j (saltar linhas vazias)
                        i = j;
                        continue;
                    }
                }
                i++; continue;
            }

            // ── Separador horizontal --- ─────────────────────────────────
            if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
                // CORRIGIDO (fidelidade ao preview da webapp): o "---" que a IA
                // insere entre o cabeçalho (nome/cargo/contacto) e cada secção,
                // e entre o conteúdo de uma secção e o título seguinte, É o
                // único separador visual do documento — exactamente como no
                // preview (A4Renderer.js: <hr> depois do parágrafo/lista,
                // nunca colado ao título). Os títulos (H1/H2) já NÃO desenham
                // o seu próprio sublinhado (ver blocos abaixo), por isso não
                // há mais risco de "2 linhas seguidas": desenhamos esta régua
                // sempre, sem excepção, para que a linha apareça sempre no
                // fim do parágrafo/lista da secção anterior — nunca por baixo
                // do título — tal como no preview.
                const HR_MARGIN = Math.round(10 * PT_TO_MM * 100) / 100; // ≈3.53mm — espaçamento igual ao CSS do preview (hr{margin:10pt 0})
                gap(HR_MARGIN);
                hRule();
                gap(HR_MARGIN);
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
                const nonSepLines = tableLines.filter(l => !/^\|[-: ]+\|$/.test(l)).length; // inclui o cabeçalho
                const pureDataRows = nonSepLines - 1; // exclui o cabeçalho
                if (pureDataRows <= 0) {
                    // Tabela "cabeçalho apenas" (sem linhas de dados) — quase
                    // sempre a IA a tentar destacar um único campo (email,
                    // instituição, etc.) com sintaxe de tabela markdown. Uma
                    // caixa isolada à volta de uma linha de texto confunde
                    // mais do que ajuda — trata-se antes como texto normal.
                    const headerCells = tableLines[0].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
                    const pText = this._cleanInlinePDF(prep(headerCells.join('   ')));
                    setFont(false, false, 12, [20,20,20]);
                    const pLines = doc.splitTextToSize(pText, CW);
                    checkY(Math.min(2, pLines.length) * LEAD);
                    pLines.forEach(pl => { checkY(LEAD); doc.text(pl, ML, y); y += LEAD; });
                    gap(3);
                    continue;
                }
                this._drawTable(doc, tableLines, ML, y, CW, H, MB, MT, prep);
                y += nonSepLines * 8 + 6;
                if (y > H - MB) newPage();
                continue;
            }

            // ── H1 ──────────────────────────────────────────────────────
            const h1 = line.match(/^#\s+(.+)/);
            if (h1) {
                const text = prep(h1[1]);
                checkHeading(22, 7); // título + mín. 2 linhas de parágrafo
                // CORRIGIDO: CSS do preview não dá margem no topo do H1 (margin:0
                // 0 8pt) — o gap(8) antigo só existia aqui, empurrando o título
                // bem mais para baixo do que no preview a cada H1.
                gap(2);
                setFont(true, false, 18, [0,0,0]);
                const h1Lines = doc.splitTextToSize(text, CW);
                h1Lines.forEach(l => {
                    checkY(11);
                    doc.text(l, W/2, y, { align: 'center' });
                    y += 10;
                });
                gap(4);
                // CORRIGIDO (fidelidade ao preview): removida a linha decorativa
                // que era desenhada aqui, directamente sob o H1 (nome). No preview
                // da webapp (A4Renderer.js DEFAULT_PAGE_CSS) o h1 NUNCA tem
                // border-bottom — a única linha que aparece no cabeçalho é a do
                // separador "---" logo a seguir ao cargo/contacto/localização,
                // desenhada pelo bloco "Separador horizontal" acima. Manter esta
                // linha extra aqui fazia o PDF mostrar uma linha por baixo do
                // nome que a webapp nunca mostra.
                i++; continue;
            }

            // ── H2 ──────────────────────────────────────────────────────
            const h2 = line.match(/^##\s+(.+)/);
            if (h2) {
                const text = prep(h2[1]);

                // Capítulos numerados (ex: "1. Introdução", "2. Metodologia")
                // SEMPRE começam numa nova página — é estrutura académica obrigatória.
                // CORRIGIDO (bug reportado: CV/currículo a ganhar uma 3ª página só com
                // "Referências" isolada, com o resto da folha em branco): esta regra
                // só faz sentido para documentos académicos com capítulos ("trabalho").
                // Antes aplicava-se a QUALQUER documento — um CV, carta, recibo, etc.
                // cuja secção final se chamasse "Referências" (comum em currículos:
                // "Referências: Disponíveis mediante solicitação.") era
                // automaticamente empurrada para uma página nova, mesmo havendo
                // espaço de sobra na página anterior.
                const isNumberedChapter = (docType === 'trabalho' || docType === 'academic') && (
                    /^\d+[\.\)]\s/.test(text) ||
                    /^(Introdução|Conclusão|Referências|Índice|Abstract|Resumo|Metodologia)/i.test(text)
                );

                if (isNumberedChapter) {
                    // Só adicionar nova página se já há conteúdo na página actual
                    if (y > MT + 5) newPage();
                } else {
                    checkHeading(18, 7);
                }
                // CORRIGIDO: CSS do preview usa margin-top:14pt (≈4.94mm) no H2 —
                // o gap(7) antigo era ~2mm a mais em CADA secção (Formação
                // Académica, Experiência Profissional, etc.), somando vários
                // milímetros extra num CV com várias secções.
                gap(5);
                setFont(true, false, 14, [0,0,0]);
                const h2Lines = doc.splitTextToSize(text, CW);
                h2Lines.forEach(l => {
                    checkY(10);
                    doc.text(l, ML, y);
                    y += 8;
                });
                // CORRIGIDO (fidelidade ao preview): removido o "sublinhado fino"
                // que era desenhado aqui, directamente sob o título. No preview da
                // webapp o h2 não tem border-bottom — a linha de separação de
                // secção só aparece no FIM do parágrafo/lista da secção (via o
                // "---" que a IA coloca antes do título seguinte, desenhado pelo
                // bloco "Separador horizontal" acima), nunca colada ao título.
                gap(4);
                i++; continue;
            }

            // ── H3 ──────────────────────────────────────────────────────
            const h3 = line.match(/^###\s+(.+)/);
            if (h3) {
                const text = prep(h3[1]);
                // H3 precisa de pelo menos: própria altura + 3 linhas de parágrafo abaixo
                checkHeading(14, 21);
                // CORRIGIDO: CSS margin-top do H3 é 10pt (≈3.53mm), não 5mm.
                gap(3.5);
                setFont(true, true, 12, [0,0,0]);
                const h3Lines = doc.splitTextToSize(text, CW);
                h3Lines.forEach(l => { checkY(LEAD); doc.text(l, ML, y); y += LEAD; });
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
                doc.splitTextToSize(text, CW).forEach(l => { checkY(LEAD); doc.text(l, ML, y); y += LEAD; });
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
                const needed = bLines.length * LEAD + 2;
                checkY(needed);
                bLines.forEach((bl, bi) => {
                    checkY(LEAD);
                    if (bi === 0) {
                        doc.setFillColor(60, 100, 160);
                        doc.circle(ML + 3.5, y - 1.5, 1, 'F');
                    }
                    setFont(false, false, 12, [20,20,20]);
                    doc.text(bl, ML + 9, y);
                    y += LEAD;
                });
                i++; continue;
            }

            // ── Lista numerada ───────────────────────────────────────────
            const num = line.match(/^(\d+)\.\s+(.+)/);
            if (num) {
                const txt    = prep(num[2]);
                setFont(false, false, 12);
                const nLines = doc.splitTextToSize(txt, CW - 9);
                const needed = nLines.length * LEAD + 2;
                checkY(needed);
                nLines.forEach((nl, ni) => {
                    checkY(LEAD);
                    setFont(true, false, 11, [60,100,160]);
                    if (ni === 0) doc.text(`${num[1]}.`, ML + 1, y);
                    setFont(false, false, 12, [20,20,20]);
                    doc.text(nl, ML + 9, y);
                    y += LEAD;
                });
                i++; continue;
            }

            // ── Linha de contacto com ícones (📞 / ✉️ / 📍) ───────────────
            if (/(📞|☎|📱|📧|✉️|✉|📍|📌)/.test(line) && writeContactLine(line)) {
                i++; continue;
            }

            // ── Parágrafo normal ─────────────────────────────────────────
            const pText  = this._cleanInlinePDF(prep(line));
            setFont(false, false, 12, [20,20,20]);
            const pLines = doc.splitTextToSize(pText, CW);
            // Widow/orphan: não deixar parágrafo com 1 linha em nova página
            const firstChunk = Math.min(2, pLines.length);
            checkY(firstChunk * LEAD);
            // CORRIGIDO: LEAD (~6.35mm) em vez dos 7mm fixos — é o maior
            // contribuinte cumulativo do "espaçamento a mais" reportado, por
            // se repetir em CADA linha de texto corrido do documento inteiro.
            // CORRIGIDO: parágrafo agora justificado (ver justifyLine acima),
            // tal como o CSS do preview (p{text-align:justify}) — só a última
            // linha do parágrafo fica alinhada à esquerda, como em qualquer
            // motor de texto justificado.
            pLines.forEach((pl, plIdx) => {
                checkY(LEAD);
                if (plIdx < pLines.length - 1) justifyLine(pl, ML, y, CW);
                else doc.text(pl, ML, y);
                y += LEAD;
            });
            gap(3);
            i++;
        }

        // ── Numeração de páginas ──────────────────────────────────────────
        const total   = doc.internal.getNumberOfPages();
        // CORRIGIDO: só saltar a numeração da página 1 quando ela é mesmo uma capa
        // (coverDrawn). Sem capa, a página 1 já é conteúdo real e deve começar em
        // "— 1 —", tal como o preview — antes ficava sempre fixo em 2, fazendo a
        // 2ª página mostrar "— 1 —" por engano em CV/carta/recibo/recomendação.
        const startPg = coverDrawn ? 2 : 1;
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
