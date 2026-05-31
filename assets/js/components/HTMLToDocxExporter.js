// assets/js/components/HTMLToDocxExporter.js
// Gera um .docx REAL (OOXML verdadeiro) a partir do HTML+CSS do template.
// Abordagem: em vez de converter o DOM genericamente (que perde flexbox/grid),
// lê o CSS do template para extrair cores/fontes e constrói directamente a
// estrutura OOXML correcta com docx-js — tabela de 2 colunas para sidebar,
// parágrafos para texto, shading para fundos coloridos.

// ── Carregador da biblioteca docx-js ────────────────────────────────────────
async function loadDocxLib() {
  if (window.docx) return;
  const URLS = [
    'https://unpkg.com/docx@9.0.2/build/index.umd.js',
    'https://cdn.jsdelivr.net/npm/docx@9.0.2/build/index.umd.js',
  ];
  await new Promise((resolve, reject) => {
    const tryNext = (idx) => {
      if (idx >= URLS.length) return reject(new Error('Falha ao carregar docx-js'));
      const s = document.createElement('script');
      s.src = URLS[idx];
      s.onload = () => window.docx ? resolve() : reject(new Error('docx não inicializado'));
      s.onerror = () => tryNext(idx + 1);
      document.head.appendChild(s);
    };
    tryNext(0);
  });
}

// ── Utilitários ─────────────────────────────────────────────────────────────

function toHex(color) {
  if (!color) return null;
  color = color.trim().replace(/\s*!important\s*$/, '');
  if (color === 'transparent' || color === 'inherit' || color === 'none') return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [,r,g,b] = color.match(/^#(.)(.)(.)$/);
    return (r+r+g+g+b+b).toUpperCase();
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('').toUpperCase();
  const named = { white:'FFFFFF', black:'000000', red:'FF0000', blue:'0000FF',
    green:'008000', navy:'000080', gray:'808080', grey:'808080', silver:'C0C0C0' };
  return named[color.toLowerCase()] || null;
}

function parseCssVar(css, prop) {
  // Extrai o primeiro valor de uma propriedade CSS do bloco de estilos
  const rx = new RegExp(prop.replace('-', '\\-') + '\\s*:\\s*([^;\\n}]+)', 'i');
  const m = css.match(rx);
  return m ? m[1].trim() : null;
}

function parseCssBlock(css, selector) {
  // Extrai propriedades de um bloco CSS por selector
  // Suporta: .classe, .classe1 .classe2
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'i');
  const m = css.match(rx);
  if (!m) return {};
  const result = {};
  for (const decl of m[1].split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 1) continue;
    const k = decl.slice(0, colon).trim().toLowerCase();
    const v = decl.slice(colon + 1).trim().replace(/\s*!important\s*$/, '');
    if (k && v) result[k] = v;
  }
  return result;
}

function ptToDxa(pt) { return Math.round(pt * 20); }
function mmToDxa(mm) { return Math.round(mm * 56.69); }
function pxToDxa(px) { return Math.round(px * 14.4); }

function cssSizeToDxa(val, containerDxa = 11906) {
  if (!val) return null;
  val = val.trim().replace(/\s*!important\s*$/, '');
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  if (val.endsWith('mm'))  return mmToDxa(n);
  if (val.endsWith('cm'))  return Math.round(n * 566.93);
  if (val.endsWith('pt'))  return ptToDxa(n);
  if (val.endsWith('px'))  return pxToDxa(n);
  if (val.endsWith('%'))   return Math.round(containerDxa * n / 100);
  if (val.endsWith('in'))  return Math.round(n * 1440);
  return null;
}

function cssSizeToHalfPt(val) {
  if (!val) return null;
  val = val.trim().replace(/\s*!important\s*$/, '');
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  if (val.endsWith('pt'))  return Math.round(n * 2);
  if (val.endsWith('px'))  return Math.round(n * 0.75 * 2);
  if (val.endsWith('em'))  return Math.round(n * 10 * 2);
  if (val.endsWith('rem')) return Math.round(n * 10 * 2);
  return null;
}

function parsePadding(val, containerDxa = 11906) {
  if (!val) return { top: 397, bottom: 397, left: 454, right: 454 };
  const parts = val.trim().split(/\s+/);
  const d = (v) => cssSizeToDxa(v, containerDxa) || 397;
  if (parts.length === 1) { const v = d(parts[0]); return { top:v,bottom:v,left:v,right:v }; }
  if (parts.length === 2) { const tb=d(parts[0]),lr=d(parts[1]); return {top:tb,bottom:tb,left:lr,right:lr}; }
  if (parts.length === 3) { return {top:d(parts[0]),left:d(parts[1]),bottom:d(parts[2]),right:d(parts[1])}; }
  return { top:d(parts[0]),right:d(parts[1]),bottom:d(parts[2]),left:d(parts[3]) };
}

// ── Classe principal ─────────────────────────────────────────────────────────

export class HTMLToDocxExporter {

  async export(templateHtml, templateCss, filename) {
    await loadDocxLib();

    const {
      Document, Packer, Paragraph, TextRun,
      Table, TableRow, TableCell,
      AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
      TableLayoutType,
    } = window.docx;

    this._lib = window.docx;
    this._css = templateCss || '';

    // Parsear HTML para DOM
    const dom  = new DOMParser().parseFromString(templateHtml, 'text/html');
    const root = dom.body.firstElementChild || dom.body;

    // Detectar layout
    const sidebarEl = root.querySelector('.cv-sidebar, aside');
    const mainEl    = root.querySelector('.cv-main, main');
    const isTwoCol  = !!(sidebarEl && mainEl);

    const A4_W = 11906;
    const A4_H = 16838;
    const noBd = { style: BorderStyle.NONE, size: 0, color: 'auto' };
    const noBorders = { top: noBd, bottom: noBd, left: noBd, right: noBd };

    let children;

    if (isTwoCol) {
      // ── Layout duas colunas: sidebar + main ──────────────────────────
      const sbStyles  = parseCssBlock(this._css, '.cv-sidebar');
      const mainStyles = parseCssBlock(this._css, '.cv-main');

      // Largura da sidebar (CSS → DXA, default 68mm)
      const sbW = cssSizeToDxa(sbStyles['width'] || sbStyles['min-width']) || mmToDxa(68);
      const mainW = A4_W - sbW;

      // Cores
      const sbBg   = toHex(sbStyles['background-color'] || sbStyles['background']) || '1E3A5F';
      const mainBg = toHex(mainStyles['background-color'] || mainStyles['background']) || 'FFFFFF';
      const sbText = toHex(sbStyles['color']) || 'FFFFFF';
      const mainText = toHex(mainStyles['color']) || '1A1A1A';

      // Padding
      const sbPad   = parsePadding(sbStyles['padding']  || '14mm 8mm',  sbW);
      const mainPad = parsePadding(mainStyles['padding'] || '14mm 10mm', mainW);

      // Construir conteúdo das colunas
      const sbItems   = this._buildSidebarContent(sidebarEl, sbBg, sbText, sbW);
      const mainItems = this._buildMainContent(mainEl, mainText, mainW);

      const ensure = arr => arr.length ? arr : [new Paragraph({ children: [new TextRun('')] })];

      const tbl = new Table({
        width:        { size: A4_W, type: WidthType.DXA },
        columnWidths: [sbW, mainW],
        layout:       TableLayoutType.FIXED,
        borders:      noBorders,
        rows: [new TableRow({
          children: [
            new TableCell({
              width:         { size: sbW, type: WidthType.DXA },
              borders:       noBorders,
              shading:       { fill: sbBg, type: ShadingType.CLEAR, color: 'auto' },
              margins:       sbPad,
              verticalAlign: VerticalAlign.TOP,
              children:      ensure(sbItems),
            }),
            new TableCell({
              width:         { size: mainW, type: WidthType.DXA },
              borders:       noBorders,
              shading:       { fill: mainBg, type: ShadingType.CLEAR, color: 'auto' },
              margins:       mainPad,
              verticalAlign: VerticalAlign.TOP,
              children:      ensure(mainItems),
            }),
          ],
        })],
      });

      children = [tbl];

    } else {
      // ── Layout coluna única / top-bar ────────────────────────────────
      children = this._buildLinearContent(root, A4_W);
      if (!children.length) children = [new Paragraph({ children: [new TextRun('')] })];
    }

    // Criar e descarregar documento
    const wordDoc = new Document({
      sections: [{
        properties: {
          page: {
            size:   { width: A4_W, height: A4_H },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(wordDoc);
    const blob   = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href:     url,
      download: (filename || `mzdocs-${Date.now()}`).replace(/\.(doc|docx|pdf|md)$/i, '') + '.docx',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  // ── Conteúdo da sidebar ───────────────────────────────────────────────────
  _buildSidebarContent(sidebarEl, bgColor, textColor, colWidthDxa) {
    const { Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType } = this._lib;
    const result = [];

    // Cor do accent (títulos de secção na sidebar)
    const accentSb = this._cssColor('.cv-sidebar .cv-section-title', 'color') || 'AABBD0';

    // Recursão pelo DOM da sidebar
    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      const tag = el.tagName.toLowerCase();
      const cls = el.className || '';

      // Avatar / iniciais
      if (cls.includes('avatar') || cls.includes('iniciais')) {
        const text = el.textContent.trim().slice(0, 2).toUpperCase();
        const avatarBg    = this._cssColor('.cv-avatar', 'background-color') || '2D4D78';
        const avatarColor = this._cssColor('.cv-avatar', 'color') || 'FFFFFF';
        result.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, font: 'Calibri', size: 44, bold: true, color: avatarColor })],
          spacing: { before: 0, after: 142 },
          shading:  { fill: avatarBg, type: ShadingType.CLEAR, color: 'auto' },
        }));
        return;
      }

      // Nome na sidebar
      if (cls.includes('sidebar-name') || cls.includes('cv-name') && el.closest?.('.cv-sidebar')) {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: t, font: 'Calibri', size: 25, bold: true, color: textColor })],
          spacing: { after: 57 },
        }));
        return;
      }

      // Cargo na sidebar
      if (cls.includes('sidebar-cargo') || cls.includes('cv-cargo')) {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: t, font: 'Calibri', size: 17, color: 'BBCCDD' })],
          spacing: { after: 170 },
        }));
        return;
      }

      // Divisor
      if (cls.includes('divider')) {
        result.push(new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '3D6080', space: 1 } },
          spacing: { before: 57, after: 170 },
        }));
        return;
      }

      // Título de secção da sidebar
      if (tag === 'h2' || tag === 'h3' || cls.includes('section-title')) {
        const t = el.textContent.trim().toUpperCase();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 14, bold: true, color: accentSb })],
          spacing: { before: 170, after: 85 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '3D5F80', space: 2 } },
        }));
        return;
      }

      // Item de contacto
      if (cls.includes('contact-item') || cls.includes('cv-contact')) {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 17, color: 'DDECF5' })],
          spacing: { after: 57 },
        }));
        return;
      }

      // Lista de habilidades / competências
      if (tag === 'ul' && (cls.includes('skills') || cls.includes('habilidades'))) {
        for (const li of el.querySelectorAll('li')) {
          const t = li.textContent.trim();
          if (t) result.push(new Paragraph({
            children: [new TextRun({ text: '• ' + t, font: 'Calibri', size: 17, color: 'DDECF5' })],
            spacing: { after: 43 },
          }));
        }
        return;
      }

      // Língua item
      if (cls.includes('lang-item')) {
        const nameEl  = el.querySelector('.cv-lang-name');
        const levelEl = el.querySelector('.cv-lang-level');
        const name    = nameEl  ? nameEl.textContent.trim()  : el.textContent.trim();
        const level   = levelEl ? levelEl.textContent.trim() : '';
        if (name) result.push(new Paragraph({
          children: [
            new TextRun({ text: name,  font: 'Calibri', size: 17, bold: true,  color: textColor }),
            ...(level ? [new TextRun({ text: ' — ' + level, font: 'Calibri', size: 15, color: 'AABBD0' })] : []),
          ],
          spacing: { after: 57 },
        }));
        return;
      }

      // Parágrafo genérico de sidebar
      if (tag === 'p') {
        const t = el.textContent.trim();
        if (t && !/^-{2,}$/.test(t)) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 17, color: 'DDECF5' })],
          spacing: { after: 57 },
        }));
        return;
      }

      // Recursão para containers
      for (const child of el.childNodes) walk(child);
    };

    for (const child of sidebarEl.childNodes) walk(child);
    return result;
  }

  // ── Conteúdo do main ─────────────────────────────────────────────────────
  _buildMainContent(mainEl, textColor, colWidthDxa) {
    const { Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType } = this._lib;
    const result = [];

    const accentColor = this._cssColor('.cv-section-title', 'color')
                     || this._cssColor('.cv-main .cv-section-title', 'color')
                     || '1E3A5F';

    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      const tag = el.tagName.toLowerCase();
      const cls = el.className || '';

      // Nome principal (h1 ou .cv-name)
      if (tag === 'h1' || cls.includes('cv-name')) {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 44, bold: true, color: accentColor })],
          spacing: { after: 57 },
        }));
        return;
      }

      // Cargo / subtítulo (p.cv-cargo, p.cv-subtitle)
      if (cls.includes('cv-cargo') || cls.includes('subtitle') || cls.includes('cargo')) {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 20, color: '6B7280' })],
          spacing: { after: 170 },
        }));
        return;
      }

      // Título de secção (h2 com border-bottom = separador de secção)
      if (tag === 'h2' || cls.includes('section-title')) {
        const t = el.textContent.trim().toUpperCase();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 20, bold: true, color: accentColor })],
          spacing: { before: 227, after: 113 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: accentColor, space: 2 } },
        }));
        return;
      }

      // h3 — título de sub-secção
      if (tag === 'h3') {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 19, bold: true, color: accentColor })],
          spacing: { before: 142, after: 57 },
        }));
        return;
      }

      // cv-entry — bloco de experiência/formação
      if (cls.includes('cv-entry')) {
        const dateEl    = el.querySelector('.cv-entry-date');
        const titleEl   = el.querySelector('.cv-entry-title');
        const companyEl = el.querySelector('.cv-entry-company');
        const bulletsEl = el.querySelector('.cv-entry-bullets');

        // Data
        const dateText = dateEl?.textContent.trim();
        if (dateText) result.push(new Paragraph({
          children: [new TextRun({ text: dateText, font: 'Calibri', size: 16, italic: true, color: '6B7280' })],
          spacing: { before: 113, after: 28 },
        }));

        // Título da entrada
        const titleText = titleEl?.textContent.trim();
        if (titleText) result.push(new Paragraph({
          children: [new TextRun({ text: titleText, font: 'Calibri', size: 20, bold: true, color: '111827' })],
          spacing: { after: 28 },
        }));

        // Empresa/instituição
        const companyText = companyEl?.textContent.trim();
        if (companyText) result.push(new Paragraph({
          children: [new TextRun({ text: companyText, font: 'Calibri', size: 18, color: '4B5563' })],
          spacing: { after: 28 },
        }));

        // Bullets
        if (bulletsEl) {
          for (const li of bulletsEl.querySelectorAll('li')) {
            const t = li.textContent.trim();
            if (t) result.push(new Paragraph({
              children: [new TextRun({ text: t, font: 'Calibri', size: 18, color: '374151' })],
              bullet: { level: 0 },
              spacing: { after: 28 },
            }));
          }
        }

        result.push(new Paragraph({ children: [new TextRun('')], spacing: { after: 57 } }));
        return;
      }

      // Lista de skills (ul.cv-skills-list)
      if (tag === 'ul' && cls.includes('skills')) {
        for (const li of el.querySelectorAll('li')) {
          const t = li.textContent.trim();
          if (t) result.push(new Paragraph({
            children: [new TextRun({ text: '• ' + t, font: 'Calibri', size: 18, color: textColor })],
            spacing: { after: 43 },
          }));
        }
        return;
      }

      // Lista genérica
      if (tag === 'ul' || tag === 'ol') {
        for (const li of el.querySelectorAll(':scope > li')) {
          const t = li.textContent.trim();
          if (t) result.push(new Paragraph({
            children: [new TextRun({ text: '• ' + t, font: 'Calibri', size: 18, color: textColor })],
            indent:  { left: 227, hanging: 227 },
            spacing: { after: 43 },
          }));
        }
        return;
      }

      // Parágrafo de texto
      if (tag === 'p') {
        const t = el.textContent.trim();
        if (!t || /^-{2,}$/.test(t)) return;
        result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 19, color: '374151' })],
          spacing: { after: 85 },
        }));
        return;
      }

      // Span de contacto
      if (tag === 'span' && el.closest?.('.cv-contacts, .cv-header')) {
        const t = el.textContent.trim();
        if (t) result.push(new Paragraph({
          children: [new TextRun({ text: t, font: 'Calibri', size: 17, color: '4B5563' })],
          spacing: { after: 28 },
        }));
        return;
      }

      // HR / separador
      if (tag === 'hr') {
        result.push(new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 1 } },
          spacing: { before: 85, after: 85 },
        }));
        return;
      }

      // Recursão para containers (section, div, article, etc.)
      for (const child of el.childNodes) walk(child);
    };

    for (const child of mainEl.childNodes) walk(child);
    return result;
  }

  // ── Layout linear (top-bar / single col) ─────────────────────────────────
  _buildLinearContent(root, containerDxa) {
    const {
      Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
      TableLayoutType,
    } = this._lib;
    const result = [];

    const headerEl = root.querySelector('header, .cv-header');
    const bodyEl   = root.querySelector('.cv-body, .cv-content, main') || root;
    const accentColor = this._cssColor('.cv-section-title', 'color') || '1D4ED8';

    // Header colorido
    if (headerEl) {
      const hStyles = parseCssBlock(this._css, '.cv-header');
      const hBg = toHex(hStyles['background-color'] || hStyles['background']) || '1D4ED8';
      const hText = toHex(hStyles['color']) || 'FFFFFF';
      const hPad = parsePadding(hStyles['padding'] || '10mm 12mm', containerDxa);

      const noBd = { style: BorderStyle.NONE, size: 0, color: 'auto' };
      const noBorders = { top: noBd, bottom: noBd, left: noBd, right: noBd };

      const headerItems = this._buildHeaderItems(headerEl, hText);
      result.push(new Table({
        width:        { size: containerDxa, type: WidthType.DXA },
        columnWidths: [containerDxa],
        layout:       TableLayoutType.FIXED,
        borders:      noBorders,
        rows: [new TableRow({
          children: [new TableCell({
            width:    { size: containerDxa, type: WidthType.DXA },
            borders:  noBorders,
            shading:  { fill: hBg, type: ShadingType.CLEAR, color: 'auto' },
            margins:  hPad,
            verticalAlign: VerticalAlign.CENTER,
            children: headerItems.length ? headerItems : [new Paragraph({ children: [new TextRun('')] })],
          })],
        })],
      }));
    }

    // Corpo
    const bodyEl2 = root.querySelector('.cv-body') || root;
    const bodyItems = this._buildMainContent(bodyEl2, '1A1A1A', containerDxa);
    result.push(...bodyItems);

    return result;
  }

  _buildHeaderItems(headerEl, textColor) {
    const { Paragraph, TextRun, AlignmentType } = this._lib;
    const result = [];
    const nameEl  = headerEl.querySelector('h1, .cv-name');
    const cargoEl = headerEl.querySelector('.cv-cargo, p');
    const avEl    = headerEl.querySelector('.cv-avatar');

    if (avEl) result.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: avEl.textContent.trim(), font: 'Calibri', size: 44, bold: true, color: textColor })],
      spacing: { after: 113 },
    }));

    if (nameEl) result.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: nameEl.textContent.trim(), font: 'Calibri', size: 44, bold: true, color: textColor })],
      spacing: { after: 57 },
    }));

    if (cargoEl) result.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cargoEl.textContent.trim(), font: 'Calibri', size: 20, color: 'DDECF5' })],
      spacing: { after: 113 },
    }));

    // Contactos
    for (const span of headerEl.querySelectorAll('.cv-contacts span, .cv-contact')) {
      const t = span.textContent.trim();
      if (t) result.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: t, font: 'Calibri', size: 17, color: 'DDECF5' })],
        spacing: { after: 28 },
      }));
    }

    return result;
  }

  // ── Extrair cor CSS de um selector ───────────────────────────────────────
  _cssColor(selector, prop) {
    const block = parseCssBlock(this._css, selector);
    return toHex(block[prop] || block['background-color'] || null);
  }
}

export const htmlToDocxExporter = new HTMLToDocxExporter();
