// assets/js/components/HTMLWordExporter.js
// Converte HTML de template (com flexbox, sidebar, 2 colunas) para Word/LibreOffice
// compatível, usando tabelas HTML em vez de flexbox e atributos mso-* para cores.
//
// O Word não suporta:  display:flex, display:grid, CSS backgrounds em <aside>/<div>
// O Word SUPORTA:      tabelas HTML, bgcolor="", mso-shading, border, cellpadding

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Converte #rrggbb / rgb() / rgba() para RRGGBB (sem #) para mso */
function toHex(color) {
  if (!color) return null;
  color = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/);
    return (r+r+g+g+b+b).toUpperCase();
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('').toUpperCase();
  // Mapa de nomes CSS comuns
  const named = { white:'FFFFFF', black:'000000', red:'FF0000', blue:'0000FF',
    navy:'000080', gray:'808080', grey:'808080', transparent:null };
  return named[color.toLowerCase()] || null;
}

/** Extrai valor de uma propriedade CSS de uma string de style */
function cssVal(style, prop) {
  const m = style && new RegExp(`(?:^|;|\\s)${prop.replace('-','[-]?')}\\s*:\\s*([^;]+)`,'i').exec(style);
  return m ? m[1].trim() : null;
}

/** Limpa markdown residual (***, **, ---, ---) do texto */
function cleanMarkdown(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^\s*\*\s+/gm, '• ')
    .replace(/^\s*\+\s+/gm, '• ')
    .trim();
}

// ── CSS-classe → estilo Word para classes conhecidas dos templates ─────────

const CLASS_STYLES = {
  // ── CV Executivo / sidebar ───────────────────────────────────────────
  'cv-sidebar':       { bgHex: '1E3A5F', color: 'FFFFFF', padding: '14pt', vAlign: 'top' },
  'cv-main':          { bgHex: 'FFFFFF', padding: '18pt', vAlign: 'top' },
  'cv-sidebar-title': { bold: true, color: '93C5FD', size: '9pt', upper: true, border: 'bottom:#334E7A' },
  'cv-sidebar-text':  { color: 'E0E8F0', size: '9pt' },
  'cv-sidebar-list':  { color: 'E0E8F0', size: '9pt' },
  'cv-photo-placeholder': { align: 'center', bold: true, size: '22pt', color: 'FFFFFF', bgHex: '2D4D78' },
  'cv-name':          { bold: true, size: '22pt', color: '1E3A5F' },
  'cv-cargo':         { size: '11pt', color: '4B5563' },
  'cv-section-title': { bold: true, size: '10pt', color: '1E3A5F', upper: true, border: 'bottom:#1E3A5F' },
  'cv-text':          { size: '9.5pt', color: '374151' },
  'cv-entry-title':   { bold: true, size: '10pt', color: '1E3A5F' },
  'cv-entry-company': { bold: true, size: '9.5pt' },
  'cv-entry-sub':     { size: '9.5pt', color: '6B7280' },
  'cv-entry-date':    { size: '8.5pt', color: '6B7280' },
  // ── CV Jovem / verde ────────────────────────────────────────────────
  'cv-header':        { bgHex: '059669', color: 'FFFFFF', padding: '14pt' },
  // ── CV Academia ─────────────────────────────────────────────────────
  'cv-sidebar-block': { marginBottom: '10pt' },
  // ── Carta / requerimento ────────────────────────────────────────────
  'doc-header':       { bgHex: '1E3A5F', color: 'FFFFFF', padding: '14pt', align: 'center' },
  'doc-title':        { bold: true, size: '16pt', color: '1E3A5F', upper: true, align: 'center' },
  'doc-section-title':{ bold: true, size: '11pt', color: '1E3A5F', upper: true },
  'doc-body':         { size: '11pt' },
};

// ── Conversor principal ──────────────────────────────────────────────────────

export class HTMLWordExporter {

  /**
   * Exporta HTML de template como .doc compatível com Word/LibreOffice.
   * @param {string} templateHtml  — HTML estruturado (já preenchido com dados)
   * @param {string} templateCss   — CSS do template (para extrair cores)
   * @param {string} filename      — nome do ficheiro sem extensão
   * @param {string} [title]       — título para metadata
   */
  export(templateHtml, templateCss, filename, title = 'MzDocs Pro') {
    const wordHtml = this._buildWordHtml(templateHtml, templateCss, title);

    const blob = new Blob(['\uFEFF', wordHtml], { type: 'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: (filename || `mzdocs-${Date.now()}`).replace(/\.(doc|docx|pdf|md)$/, '') + '.doc',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  _buildWordHtml(templateHtml, templateCss, title) {
    // Detectar se tem layout de 2 colunas (sidebar) ou linear
    const hasTwoCol = /cv-two-col|cv-sidebar|two-col/i.test(templateHtml);

    let bodyContent;
    if (hasTwoCol) {
      bodyContent = this._convertTwoColLayout(templateHtml, templateCss);
    } else {
      bodyContent = this._convertLinearLayout(templateHtml, templateCss);
    }

    // Extrair cor de fundo global do CSS
    const bgColorMatch = templateCss && templateCss.match(/body[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/);
    const bodyBg = bgColorMatch ? toHex(bgColorMatch[1]) : null;
    const bodyBgAttr = bodyBg ? ` bgcolor="#${bodyBg}"` : '';

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>${this._esc(title)}</title>
<!--[if gte mso 9]>
<xml><w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument></xml>
<![endif]-->
<style>
/* Word-safe reset */
body { margin: 0; padding: 0; font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000; }
table { border-collapse: collapse; }
td { vertical-align: top; }
p { margin: 0 0 6pt; }
h1, h2, h3, h4 { margin: 0 0 6pt; page-break-after: avoid; }
ul { margin: 2pt 0 6pt 16pt; padding: 0; }
li { margin-bottom: 3pt; }
/* Suprimir page break extra */
@page { size: 210mm 297mm; margin: 0; }
</style>
</head>
<body${bodyBgAttr}>
${bodyContent}
</body>
</html>`;
  }

  // ── Layout de 2 colunas (sidebar + main) ────────────────────────────────

  _convertTwoColLayout(html, css) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Extrair sidebar e main
    const sidebar = doc.querySelector('.cv-sidebar, [class*="sidebar"], aside');
    const main    = doc.querySelector('.cv-main, main, .cv-body, [class*="-main"]');

    if (!sidebar || !main) {
      // Fallback: layout linear
      return this._convertLinearLayout(html, css);
    }

    // Extrair larguras do CSS
    const sidebarW = this._extractWidthFromCss(css, '.cv-sidebar') || '58mm';
    const sidebarBg = this._extractBgFromCss(css, '.cv-sidebar') || '1E3A5F';
    const mainBg   = this._extractBgFromCss(css, '.cv-main, body') || 'FFFFFF';

    // Converter conteúdo de cada coluna
    const sidebarContent = this._renderNodes(sidebar.childNodes, css, 'sidebar');
    const mainContent    = this._renderNodes(main.childNodes, css, 'main');

    // Tabela Word com 2 colunas — margens A4 zeradas para permitir sidebar full-height
    return `
<table width="794" cellpadding="0" cellspacing="0" border="0"
       style="width:794px; border-collapse:collapse; table-layout:fixed;">
  <colgroup>
    <col style="width:${sidebarW};">
    <col style="width:auto;">
  </colgroup>
  <tr>
    <td width="219" bgcolor="#${sidebarBg}"
        style="width:219px; background:#${sidebarBg}; padding:28px 14px; vertical-align:top;
               mso-shading:${sidebarBg};">
      ${sidebarContent}
    </td>
    <td bgcolor="#${mainBg}"
        style="background:#${mainBg}; padding:28px 18px; vertical-align:top;">
      ${mainContent}
    </td>
  </tr>
</table>`.trim();
  }

  // ── Layout linear ────────────────────────────────────────────────────────

  _convertLinearLayout(html, css) {
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.body.firstElementChild || doc.body;
    return this._renderNodes(root.childNodes, css, 'main');
  }

  // ── Renderizador de nós DOM → HTML Word-safe ─────────────────────────────

  _renderNodes(nodes, css, ctx) {
    return Array.from(nodes).map(n => this._renderNode(n, css, ctx)).join('');
  }

  _renderNode(node, css, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      return this._esc(cleanMarkdown(node.textContent));
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag   = node.tagName.toLowerCase();
    const cls   = node.className || '';
    const clsList = cls.split(/\s+/).filter(Boolean);
    const style = node.getAttribute('style') || '';

    // Resolver estilos da classe
    const cs   = clsList.reduce((acc, c) => ({ ...acc, ...(CLASS_STYLES[c] || {}) }), {});
    const color = cs.color || this._extractColorFromCss(css, cls) || (ctx === 'sidebar' ? 'E0E8F0' : '000000');
    const bgHex = cs.bgHex || this._extractBgFromCss(css, `.${clsList.join(', .')}`) || null;
    const bold  = cs.bold || false;
    const size  = cs.size || (ctx === 'sidebar' ? '9pt' : '10.5pt');
    const upper = cs.upper || false;
    const align = cs.align || (ctx === 'sidebar' ? 'left' : 'left');

    // Calcular estilo inline Word-safe
    const inlineStyle = [
      `color:#${color}`,
      bgHex ? `background:#${bgHex}; mso-shading:${bgHex}` : '',
      bold ? 'font-weight:bold' : '',
      size ? `font-size:${size}` : '',
      upper ? 'text-transform:uppercase' : '',
      align !== 'left' ? `text-align:${align}` : '',
    ].filter(Boolean).join('; ');

    const children = this._renderNodes(node.childNodes, css, ctx);

    // Tags especiais
    switch (tag) {
      case 'aside':
      case 'header':
      case 'footer':
      case 'main':
      case 'section':
      case 'article':
      case 'nav':
        // Tags semânticas → div com estilos
        return this._wrapDiv(children, inlineStyle, cs);

      case 'div':
        // Photo placeholder circular → caixa centrada
        if (clsList.includes('cv-photo-placeholder')) {
          return `<p style="text-align:center; margin:0 0 12pt;">
            <span style="display:inline-block; width:56pt; height:56pt;
              background:#2D4D78; border-radius:50%; border:2px solid rgba(255,255,255,.4);
              font-size:20pt; font-weight:800; color:#fff; line-height:56pt;
              text-align:center; mso-shading:2D4D78; padding:0;">
              ${children}
            </span>
          </p>`;
        }
        return this._wrapDiv(children, inlineStyle, cs);

      case 'h1':
        return `<h1 style="font-size:${cs.size || (ctx === 'sidebar' ? '11pt' : '22pt')}; font-weight:bold; color:#${color}; ${upper?'text-transform:uppercase;':''} margin:0 0 4pt; page-break-after:avoid;">${children}</h1>`;
      case 'h2':
        if (cs.border || clsList.includes('cv-section-title')) {
          return `<h2 style="font-size:${cs.size||'10pt'}; font-weight:bold; color:#${color}; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1.5pt solid #${color}; padding-bottom:2pt; margin:12pt 0 5pt; page-break-after:avoid;">${children}</h2>`;
        }
        return `<h2 style="font-size:${cs.size||'12pt'}; font-weight:bold; color:#${color}; margin:10pt 0 5pt; page-break-after:avoid;">${children}</h2>`;
      case 'h3':
        if (clsList.includes('cv-sidebar-title')) {
          return `<h3 style="font-size:9pt; font-weight:bold; color:#93C5FD; text-transform:uppercase; letter-spacing:0.8px; border-bottom:1pt solid rgba(255,255,255,.25); padding-bottom:3pt; margin:0 0 6pt; page-break-after:avoid;">${children}</h3>`;
        }
        return `<h3 style="font-size:${cs.size||'10pt'}; font-weight:bold; color:#${color}; margin:8pt 0 3pt; page-break-after:avoid;">${children}</h3>`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `<${tag} style="font-size:10pt; font-weight:bold; color:#${color}; margin:6pt 0 3pt;">${children}</${tag}>`;

      case 'p': {
        const pStyle = [
          `color:#${color}`,
          bold ? 'font-weight:bold' : '',
          `font-size:${size}`,
          align !== 'left' ? `text-align:${align}` : '',
          'margin:0 0 4pt',
        ].filter(Boolean).join('; ');
        return `<p style="${pStyle}">${children}</p>`;
      }

      case 'ul': {
        const liColor = ctx === 'sidebar' ? '#D4E4F7' : '#374151';
        return `<ul style="padding-left:14pt; margin:2pt 0 6pt; color:${liColor}; font-size:${size};">${children}</ul>`;
      }
      case 'ol':
        return `<ol style="padding-left:14pt; margin:2pt 0 6pt; font-size:${size};">${children}</ol>`;
      case 'li':
        return `<li style="color:#${color}; font-size:${size}; margin-bottom:2pt;">${children}</li>`;

      case 'strong':
      case 'b':
        return `<strong style="color:#${color};">${children}</strong>`;
      case 'em':
      case 'i':
        return `<em>${children}</em>`;
      case 'u':
        return `<u>${children}</u>`;
      case 'br':
        return '<br>';
      case 'hr':
        return `<hr style="border:none; border-top:1pt solid #${ctx === 'sidebar' ? '334E7A' : 'D1D5DB'}; margin:8pt 0;">`;

      case 'span': {
        const spanStyle = [
          color ? `color:#${color}` : '',
          bold ? 'font-weight:bold' : '',
          size ? `font-size:${size}` : '',
        ].filter(Boolean).join('; ');
        return spanStyle ? `<span style="${spanStyle}">${children}</span>` : children;
      }

      case 'table':
        return `<table style="width:100%; border-collapse:collapse; margin:6pt 0; font-size:${size};">${children}</table>`;
      case 'thead': return `<thead>${children}</thead>`;
      case 'tbody': return `<tbody>${children}</tbody>`;
      case 'tr':    return `<tr>${children}</tr>`;
      case 'th':
        return `<th style="border:1pt solid #334E7A; padding:4pt 6pt; background:#1e3a5f; color:#fff; font-weight:bold; font-size:9pt;">${children}</th>`;
      case 'td':
        return `<td style="border:1pt solid #D1D5DB; padding:4pt 6pt; font-size:9pt;">${children}</td>`;

      case 'a':
        return `<a href="${node.getAttribute('href') || '#'}" style="color:#3B82F6;">${children}</a>`;

      case 'img': {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        // Base64 data URI (assinatura) — preservar
        if (src.startsWith('data:')) {
          return `<img src="${src}" alt="${this._esc(alt)}" style="max-width:180pt; height:auto; display:block;">`;
        }
        return '';
      }

      case 'pre':
      case 'code':
        return `<code style="font-family:'Courier New',monospace; font-size:9pt; color:#374151;">${children}</code>`;

      case 'blockquote':
        return `<blockquote style="border-left:3pt solid #D1D5DB; padding-left:10pt; margin:6pt 0; color:#6B7280; font-style:italic;">${children}</blockquote>`;

      default:
        return children;
    }
  }

  _wrapDiv(children, style, cs) {
    if (!children.trim()) return '';
    const marginBottom = cs.marginBottom ? ` margin-bottom:${cs.marginBottom};` : ' margin-bottom:10pt;';
    return `<div style="${style};${marginBottom}">${children}</div>`;
  }

  // ── Extractores de CSS ───────────────────────────────────────────────────

  _extractWidthFromCss(css, selector) {
    if (!css) return null;
    const escaped = selector.replace(/[.[\]]/g, c => '\\'+c);
    const m = new RegExp(escaped + '\\s*\\{[^}]*width\\s*:\\s*([^;\\}]+)', 'i').exec(css);
    if (!m) return null;
    const val = m[1].trim();
    // Converter mm→px para tabela Word (96dpi: 1mm = 3.7795px)
    const mmMatch = val.match(/^([\d.]+)mm$/);
    if (mmMatch) return Math.round(parseFloat(mmMatch[1]) * 3.7795) + 'px';
    return val;
  }

  _extractBgFromCss(css, selector) {
    if (!css) return null;
    const parts = selector.split(',').map(s => s.trim());
    for (const sel of parts) {
      const escaped = sel.replace(/[.[\]]/g, c => '\\'+c);
      const m = new RegExp(escaped + '\\s*\\{[^}]*background(?:-color)?\\s*:\\s*([^;\\}]+)', 'i').exec(css);
      if (m) return toHex(m[1].trim());
    }
    return null;
  }

  _extractColorFromCss(css, cls) {
    if (!css || !cls) return null;
    const parts = cls.split(/\s+/).filter(Boolean);
    for (const c of parts) {
      const escaped = `.${c}`.replace(/[.[\]]/g, x => '\\'+x);
      const m = new RegExp(escaped + '\\s*\\{[^}]*(?:^|\\s)color\\s*:\\s*([^;\\}]+)', 'i').exec(css);
      if (m) return toHex(m[1].trim());
    }
    return null;
  }

  _esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const htmlWordExporter = new HTMLWordExporter();
