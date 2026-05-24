// assets/js/academic/AcademicEngine.js
// Motor académico: APA 7, citações, bibliografia, índice, extracção de referências

export class AcademicEngine {

  // ════════════════════════════════════════════════════════════════════════
  // APA 7 — GERADOR DE CITAÇÕES E REFERÊNCIAS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gera referência bibliográfica APA 7 completa
   * @param {Object} source - dados da fonte
   * @returns {string} referência formatada
   */
  static generateAPA7(source) {
    if (!source || !source.type) return '';
    switch (source.type.toLowerCase()) {
      case 'book':         return AcademicEngine._apaBook(source);
      case 'article':      return AcademicEngine._apaArticle(source);
      case 'website':      return AcademicEngine._apaWebsite(source);
      case 'thesis':       return AcademicEngine._apaThesis(source);
      case 'chapter':      return AcademicEngine._apaChapter(source);
      case 'conference':   return AcademicEngine._apaConference(source);
      case 'report':       return AcademicEngine._apaReport(source);
      case 'newspaper':    return AcademicEngine._apaNewspaper(source);
      default:             return AcademicEngine._apaGeneric(source);
    }
  }

  // Livro: Apelido, I. (Ano). *Título*. Editora.
  static _apaBook({ authors = [], year = 'n.d.', title = '', publisher = '', edition, city }) {
    const auth = AcademicEngine._formatAuthors(authors);
    const ed   = edition ? ` (${edition} ed.)` : '';
    const loc  = city ? `${city}: ` : '';
    return `${auth} (${year}). *${title}*${ed}. ${loc}${publisher}.`;
  }

  // Artigo científico: Apelido, I. (Ano). Título. *Revista*, *Volume*(Número), pp–pp. https://doi
  static _apaArticle({ authors = [], year = 'n.d.', title = '', journal = '', volume, issue, pages, doi, url }) {
    const auth  = AcademicEngine._formatAuthors(authors);
    const vol   = volume ? `, *${volume}*` : '';
    const iss   = issue  ? `(${issue})`   : '';
    const pgs   = pages  ? `, ${pages}`   : '';
    const src   = doi    ? ` https://doi.org/${doi}` : (url ? ` ${url}` : '');
    return `${auth} (${year}). ${title}. *${journal}*${vol}${iss}${pgs}.${src}`;
  }

  // Website
  static _apaWebsite({ authors = [], year = 'n.d.', title = '', siteName = '', url = '', accessDate }) {
    const auth  = authors.length ? AcademicEngine._formatAuthors(authors) : (siteName || 'Autor desconhecido');
    const date  = accessDate ? ` Recuperado em ${accessDate},` : '';
    const site  = siteName   ? ` ${siteName}.` : '';
    return `${auth} (${year}). ${title}.${site}${date} ${url}`;
  }

  // Dissertação / Tese
  static _apaThesis({ authors = [], year = 'n.d.', title = '', degree = 'Dissertação de mestrado', university = '', country = '' }) {
    const auth = AcademicEngine._formatAuthors(authors);
    const loc  = country ? `, ${country}` : '';
    return `${auth} (${year}). *${title}* [${degree}, ${university}${loc}].`;
  }

  // Capítulo de livro
  static _apaChapter({ authors = [], year = 'n.d.', title = '', editors = [], bookTitle = '', pages, publisher = '' }) {
    const auth  = AcademicEngine._formatAuthors(authors);
    const eds   = editors.length ? `In ${AcademicEngine._formatEditors(editors)}, ` : '';
    const pgs   = pages ? ` (pp. ${pages})` : '';
    return `${auth} (${year}). ${title}. ${eds}*${bookTitle}*${pgs}. ${publisher}.`;
  }

  // Comunicação em conferência
  static _apaConference({ authors = [], year = 'n.d.', title = '', conference = '', location = '', url }) {
    const auth = AcademicEngine._formatAuthors(authors);
    const loc  = location ? `, ${location}` : '';
    const link = url ? ` ${url}` : '';
    return `${auth} (${year}). ${title}. *${conference}*${loc}.${link}`;
  }

  // Relatório
  static _apaReport({ authors = [], year = 'n.d.', title = '', institution = '', reportNumber, url }) {
    const auth = AcademicEngine._formatAuthors(authors);
    const num  = reportNumber ? ` (Relatório n.º ${reportNumber})` : '';
    const link = url ? ` ${url}` : '';
    return `${auth} (${year}). *${title}*${num}. ${institution}.${link}`;
  }

  // Jornal / Notícia
  static _apaNewspaper({ authors = [], year = 'n.d.', title = '', newspaper = '', url }) {
    const auth = AcademicEngine._formatAuthors(authors);
    const link = url ? ` ${url}` : '';
    return `${auth} (${year}). ${title}. *${newspaper}*.${link}`;
  }

  // Genérico
  static _apaGeneric({ authors = [], year = 'n.d.', title = '', source = '', url }) {
    const auth = AcademicEngine._formatAuthors(authors);
    const src  = source ? `. ${source}` : '';
    const link = url ? ` ${url}` : '';
    return `${auth} (${year}). ${title}${src}.${link}`;
  }

  // ── Formatação de autores APA 7 ──────────────────────────────────────
  static _formatAuthors(authors) {
    if (!authors || !authors.length) return 'Autor desconhecido';
    const fmt = a => {
      if (typeof a === 'string') return a;
      const { last = '', first = '', middle = '' } = a;
      const initials = [first, middle].filter(Boolean).map(n => `${n[0]}.`).join(' ');
      return `${last}, ${initials}`;
    };
    if (authors.length === 1) return fmt(authors[0]);
    if (authors.length <= 20) {
      const all = authors.map(fmt);
      return all.slice(0, -1).join(', ') + ', & ' + all[all.length - 1];
    }
    // Mais de 20 autores — primeiros 19 + ... + último
    return authors.slice(0, 19).map(fmt).join(', ') + ', … ' + fmt(authors[authors.length - 1]);
  }

  static _formatEditors(editors) {
    if (!editors.length) return '';
    const fmt = e => typeof e === 'string' ? e : `${e.first ? e.first[0] + '. ' : ''}${e.last}`;
    const ed  = editors.map(fmt);
    return ed.length === 1 ? `${ed[0]} (Ed.)` : `${ed.slice(0, -1).join(', ')} & ${ed[ed.length - 1]} (Eds.)`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // CITAÇÃO IN-TEXT APA 7
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gera citação in-text APA 7
   * @param {Object} source - fonte (authors, year)
   * @param {string} page - número de página (opcional)
   * @returns {string} ex: (Machel, 2023, p. 45)
   */
  static generateCitation(source, page = null) {
    if (!source) return '';
    const { authors = [], year = 'n.d.' } = source;

    let authorPart = '';
    if (!authors.length) {
      authorPart = source.title ? `"${source.title.slice(0, 30)}"` : 'Autor desconhecido';
    } else if (authors.length === 1) {
      const a = authors[0];
      authorPart = typeof a === 'string' ? a.split(',')[0] : a.last || a;
    } else if (authors.length === 2) {
      const a0 = authors[0], a1 = authors[1];
      const l0 = typeof a0 === 'string' ? a0.split(',')[0] : a0.last;
      const l1 = typeof a1 === 'string' ? a1.split(',')[0] : a1.last;
      authorPart = `${l0} & ${l1}`;
    } else {
      const a = authors[0];
      authorPart = (typeof a === 'string' ? a.split(',')[0] : a.last) + ' et al.';
    }

    const pagePart = page ? `, p. ${page}` : '';
    return `(${authorPart}, ${year}${pagePart})`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // BIBLIOGRAFIA COMPLETA — ordenada alfabeticamente
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gera secção de referências bibliográficas completa
   * @param {Array} sources - lista de fontes
   * @returns {string} Markdown com referências
   */
  static generateBibliography(sources) {
    if (!sources || !sources.length) return '';

    const refs = sources
      .map(s => AcademicEngine.generateAPA7(s))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));

    return `## Referências Bibliográficas\n\n${refs.map(r => r).join('\n\n')}`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ÍNDICE AUTOMÁTICO
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gera índice a partir de conteúdo Markdown
   * @param {string} markdown
   * @returns {string} Markdown com índice
   */
  static generateTableOfContents(markdown) {
    if (!markdown) return '';

    const headings = [];
    const lines = markdown.split('\n');
    let pageEst = 1;
    let charCount = 0;

    lines.forEach(line => {
      charCount += line.length + 1;
      pageEst = Math.ceil(charCount / 2800);

      const h1 = line.match(/^# (.+)/);
      const h2 = line.match(/^## (.+)/);
      const h3 = line.match(/^### (.+)/);

      if (h1) headings.push({ level: 1, text: h1[1], page: pageEst });
      if (h2) headings.push({ level: 2, text: h2[1], page: pageEst });
      if (h3) headings.push({ level: 3, text: h3[1], page: pageEst });
    });

    if (!headings.length) return '';

    const lines_out = headings.map(h => {
      const indent = '  '.repeat(h.level - 1);
      const dots   = '.'.repeat(Math.max(2, 50 - h.text.length - indent.length));
      return `${indent}${h.text} ${dots} ${h.page}`;
    });

    return `## Índice\n\n\`\`\`\n${lines_out.join('\n')}\n\`\`\``;
  }

  // ════════════════════════════════════════════════════════════════════════
  // EXTRACÇÃO DE REFERÊNCIAS DE PDF
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Extrai referências de texto de PDF (já extraído como string)
   * @param {string} pdfText - texto bruto do PDF
   * @returns {Array} lista de fontes parcialmente estruturadas
   */
  static extractReferencesFromPDF(pdfText) {
    if (!pdfText) return [];

    // Tentar encontrar a secção de referências
    const refSection = AcademicEngine._findRefSection(pdfText);
    const text = refSection || pdfText;

    // Dividir em entradas individuais (separadas por nova linha ou numeração)
    const raw = text
      .replace(/\r\n/g, '\n')
      .split(/\n(?=[A-Z\[])/)
      .map(s => s.replace(/\n/g, ' ').trim())
      .filter(s => s.length > 30 && s.length < 800);

    return raw.map(r => AcademicEngine._parseRawReference(r));
  }

  static _findRefSection(text) {
    const markers = [
      /referências\s+bibliográficas?/i,
      /bibliography/i,
      /references/i,
      /obras\s+citadas/i,
      /fontes\s+consultadas/i,
    ];
    for (const marker of markers) {
      const idx = text.search(marker);
      if (idx !== -1) return text.slice(idx + 30);
    }
    return null;
  }

  static _parseRawReference(raw) {
    // Tentar extrair autor, ano, título de forma heurística
    const yearMatch = raw.match(/\((\d{4}[a-z]?)\)/);
    const year = yearMatch ? yearMatch[1] : null;

    // Autor antes do ano
    const beforeYear = yearMatch ? raw.slice(0, raw.indexOf(yearMatch[0])).trim() : '';
    const authors = beforeYear ? [beforeYear] : [];

    // Título (entre ano e ponto final ou . )
    let title = raw;
    if (yearMatch) {
      const afterYear = raw.slice(raw.indexOf(yearMatch[0]) + yearMatch[0].length).trim();
      const dotIdx = afterYear.indexOf('. ');
      title = dotIdx > 0 ? afterYear.slice(0, dotIdx) : afterYear.slice(0, 100);
    }

    // Detectar tipo
    const isWeb = /https?:\/\//.test(raw);
    const isJournal = /[Jj]ournal|[Rr]evista|[Vv]ol\.|[Nn]\.º/.test(raw);
    const type = isWeb ? 'website' : isJournal ? 'article' : 'book';

    const url = raw.match(/https?:\/\/[^\s]+/)?.[0] || null;

    return { type, authors, year, title: title.trim(), raw, url };
  }

  // ════════════════════════════════════════════════════════════════════════
  // EXTRACÇÃO DE REFERÊNCIA POR URL
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gera referência APA 7 básica a partir de um URL
   * (não faz fetch — apenas formata o que se sabe do URL)
   * @param {string} url
   * @param {Object} extra - {title, authors, year, siteName}
   * @returns {Object} source estruturada
   */
  static extractReferencesFromURL(url, extra = {}) {
    if (!url) return null;
    let siteName = '';
    try {
      const u = new URL(url);
      siteName = u.hostname.replace('www.', '');
    } catch (_) {
      siteName = url.split('/')[2] || '';
    }

    const today = new Date();
    const accessDate = today.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });

    const source = {
      type:       'website',
      authors:    extra.authors || [],
      year:       extra.year || today.getFullYear().toString(),
      title:      extra.title || 'Título não disponível',
      siteName:   extra.siteName || siteName,
      url,
      accessDate,
    };

    return source;
  }

  // ════════════════════════════════════════════════════════════════════════
  // GERADOR DE TRABALHO CIENTÍFICO COMPLETO
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Gera prompt expandido para trabalho científico com estrutura APA 7
   * @param {Object} params - campos do formulário
   * @param {Array} sources - fontes bibliográficas
   * @returns {string} prompt para IA
   */
  static generateScientificPaper(params, sources = []) {
    const { tema, nivel, disciplina, paginas = 10, requisitos = '' } = params;

    const bibSection = sources.length
      ? `\n\nFONTES BIBLIOGRÁFICAS A CITAR (use citações in-text APA 7):\n${sources.map((s, i) => `${i + 1}. ${AcademicEngine.generateAPA7(s)}`).join('\n')}`
      : '';

    const levelGuide = {
      'Licenciatura':             'Nível universitário avançado. Use linguagem científica formal. Inclua revisão de literatura, metodologia e conclusões fundamentadas.',
      'Mestrado/Doutoramento':    'Nível pós-graduado. Revisão crítica da literatura, contribuição original, metodologia rigorosa, limitações e estudos futuros.',
      'Pré-Universitário':        'Nível académico elevado mas acessível. Estrutura formal com introdução, desenvolvimento por secções e conclusão.',
      'Ensino Secundário (2º Ciclo)': 'Linguagem formal e clara. Estrutura organizada com introdução, corpo e conclusão.',
    }[nivel] || 'Linguagem formal e clara, adequada ao nível de ensino.';

    return `Escreva um trabalho académico COMPLETO em português (variante moçambicana) com as seguintes especificações:

TEMA: ${tema}
DISCIPLINA: ${disciplina}
NÍVEL: ${nivel}
PÁGINAS PRETENDIDAS: ~${paginas} páginas
INSTRUÇÕES ADICIONAIS: ${requisitos || 'Nenhuma'}

ORIENTAÇÕES ACADÉMICAS:
${levelGuide}

ESTRUTURA OBRIGATÓRIA:
1. Capa (título, autor [PREENCHER], data, instituição [PREENCHER])
2. Índice automático
3. Introdução (contextualização, objectivos, relevância)
4. Desenvolvimento (mínimo 3 secções numeradas com subsecções)
5. Conclusão
6. Referências Bibliográficas (formato APA 7)${bibSection}

REGRAS DE FORMATAÇÃO:
- Use Markdown: ## para secções, ### para subsecções
- Citações in-text no formato (Autor, Ano) ou (Autor, Ano, p. XX)
- Nunca invente dados pessoais — use [PREENCHER] para nome, BI, data, etc.
- Linguagem formal, sem coloquialismos
- Parágrafos com indent (simulado por nova linha)
- Gere o documento COMPLETO, não um esboço

Gere agora o trabalho completo:`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // GESTÃO DE REFERÊNCIAS (state local no browser)
  // ════════════════════════════════════════════════════════════════════════

  static _refs = [];

  static addReference(source) {
    if (!source) return null;
    const ref = {
      ...source,
      id: source.id || crypto.randomUUID(),
      apa: AcademicEngine.generateAPA7(source),
      citation: AcademicEngine.generateCitation(source),
    };
    // Evitar duplicados por URL ou título+autores
    const isDupe = AcademicEngine._refs.some(
      r => (r.url && r.url === ref.url) || (r.title === ref.title && r.year === ref.year)
    );
    if (!isDupe) AcademicEngine._refs.push(ref);
    return ref;
  }

  static getReferences() { return [...AcademicEngine._refs]; }
  static clearReferences() { AcademicEngine._refs = []; }
  static removeReference(id) { AcademicEngine._refs = AcademicEngine._refs.filter(r => r.id !== id); }
}
