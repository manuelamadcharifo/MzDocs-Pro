// assets/js/components/HTMLWordExporter.js
// Converte HTML de template (flexbox, sidebar, 2 colunas) → Word/LibreOffice
// usando tabelas HTML + bgcolor + mso-shading (Word não suporta display:flex).

// ── Helpers ──────────────────────────────────────────────────────────────────

function toHex(color) {
  if (!color) return null;
  color = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [,r,g,b] = color.match(/^#(.)(.)(.)$/);
    return (r+r+g+g+b+b).toUpperCase();
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('').toUpperCase();
  const named = {white:'FFFFFF',black:'000000',transparent:null};
  return named[color.toLowerCase()] || null;
}

function cleanText(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1')
    .replace(/^---+$/gm,'').replace(/---$/g,'')
    .replace(/^\s*[*+]\s+/gm,'• ').trim();
}

function cleanHtmlForWord(html) {
  return html
    .replace(/\s*contenteditable="[^"]*"/gi,'')
    .replace(/\s*spellcheck="[^"]*"/gi,'')
    .replace(/\s*data-[a-z-]+=["'][^"']*["']/gi,'')
    .replace(/>---</g,'><')
    .replace(/\s*---\s*<\/p>/g,'</p>')
    .replace(/\s*---\s*<\/div>/g,'</div>')
    .replace(/(<br\s*\/?>\s*){3,}/gi,'<br>')
    .replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi,'');
}

// ── Estilos por classe de template ──────────────────────────────────────────

const CLASS_STYLES = {
  'cv-sidebar':        { bgHex:'1E3A5F', color:'FFFFFF' },
  'cv-main':           { bgHex:'FFFFFF', color:'1A1A1A' },
  'cv-sidebar-title':  { bold:true, color:'93C5FD', size:'9pt', upper:true, borderBottom:true },
  'cv-sidebar-text':   { color:'D4E4F7', size:'9pt' },
  'cv-sidebar-list':   { color:'D4E4F7', size:'9pt' },
  'cv-photo-placeholder': { align:'center', bold:true, size:'20pt', color:'FFFFFF', bgHex:'2D4D78', isPhoto:true },
  'cv-name':           { bold:true, size:'22pt', color:'1E3A5F' },
  'cv-cargo':          { size:'11pt', color:'4B5563' },
  'cv-section-title':  { bold:true, size:'10pt', color:'1E3A5F', upper:true, borderBottom:true },
  'cv-text':           { size:'9.5pt', color:'374151' },
  'cv-entry-title':    { bold:true, size:'10pt', color:'1E3A5F' },
  'cv-entry-company':  { bold:true, size:'9.5pt', color:'1A1A1A' },
  'cv-entry-sub':      { size:'9.5pt', color:'6B7280' },
  'cv-entry-date':     { size:'8.5pt', color:'6B7280' },
  'cv-header':         { bgHex:'059669', color:'FFFFFF' },
  'cv-sidebar-block':  { mb:'8pt' },
  'doc-header':        { bgHex:'1E3A5F', color:'FFFFFF', align:'center' },
  'doc-title':         { bold:true, size:'16pt', color:'1E3A5F', upper:true, align:'center' },
  'doc-section-title': { bold:true, size:'11pt', color:'1E3A5F', upper:true },
};

// ── Exportador principal ─────────────────────────────────────────────────────

export class HTMLWordExporter {

  export(templateHtml, templateCss, filename, title = 'MzDocs Pro') {
    const cleaned  = cleanHtmlForWord(templateHtml);
    const wordHtml = this._build(cleaned, templateCss, title);
    const blob = new Blob(['\uFEFF', wordHtml], { type:'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: (filename||`mzdocs-${Date.now()}`).replace(/\.(doc|docx|pdf|md)$/,'') + '.doc',
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  _build(html, css, title) {
    const hasTwoCol = /cv-two-col|cv-sidebar|two-col/i.test(html);
    const body = hasTwoCol ? this._twoCol(html, css) : this._linear(html, css);

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>${this._e(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument>
  <w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/>
</w:WordDocument></xml><![endif]-->
<style>
body{margin:0;padding:0;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;}
table{border-collapse:collapse;} td{vertical-align:top;}
p{margin:0 0 4pt;} h1,h2,h3,h4{margin:0 0 4pt;page-break-after:avoid;}
ul,ol{margin:2pt 0 4pt 14pt;padding:0;} li{margin-bottom:2pt;}
@page{size:210mm 297mm;margin:0;}
</style></head>
<body>${body}</body></html>`;
  }

  // ── Layout 2 colunas ────────────────────────────────────────────────────

  _twoCol(html, css) {
    const doc     = new DOMParser().parseFromString(html, 'text/html');
    const sidebar = doc.querySelector('.cv-sidebar,[class*="sidebar"],aside');
    const main    = doc.querySelector('.cv-main,main,.cv-body,[class*="-main"]');
    if (!sidebar || !main) return this._linear(html, css);

    const sbBg   = this._bgFromCss(css, '.cv-sidebar') || '1E3A5F';
    const mainBg = this._bgFromCss(css, '.cv-main,body') || 'FFFFFF';
    const sbHtml = this._nodes(sidebar.childNodes, css, 'sidebar');
    const mnHtml = this._nodes(main.childNodes,    css, 'main');

    return `<table width="794" cellpadding="0" cellspacing="0" border="0"
  style="width:794px;border-collapse:collapse;table-layout:fixed;">
  <colgroup><col style="width:219px;"><col style="width:575px;"></colgroup>
  <tr>
    <td width="219" bgcolor="#${sbBg}"
        style="width:219px;background:#${sbBg};padding:24px 12px 24px 14px;vertical-align:top;mso-shading:${sbBg};">
      ${sbHtml}
    </td>
    <td bgcolor="#${mainBg}"
        style="background:#${mainBg};padding:28px 20px 24px 20px;vertical-align:top;">
      ${mnHtml}
    </td>
  </tr>
</table>`;
  }

  _linear(html, css) {
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.body.firstElementChild || doc.body;
    return this._nodes(root.childNodes, css, 'main');
  }

  // ── Renderizador de nós ──────────────────────────────────────────────────

  _nodes(nodes, css, ctx) {
    return Array.from(nodes).map(n => this._node(n, css, ctx)).join('');
  }

  _node(node, css, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = cleanText(node.textContent);
      return t ? this._e(t) : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag     = node.tagName.toLowerCase();
    if (['script','style','meta','link'].includes(tag)) return '';

    const cls     = node.className || '';
    const clsList = cls.split(/\s+/).filter(Boolean);
    const cs      = clsList.reduce((a,c) => ({...a,...(CLASS_STYLES[c]||{})}), {});

    const color = cs.color || (ctx === 'sidebar' ? 'D4E4F7' : '1A1A1A');
    const bgHex = cs.bgHex || null;
    const bold  = cs.bold  || false;
    const size  = cs.size  || (ctx === 'sidebar' ? '9pt' : '10.5pt');
    const upper = cs.upper || false;
    const align = cs.align || 'left';

    const iStyle = [
      `color:#${color}`,
      bgHex  ? `background:#${bgHex};mso-shading:${bgHex}` : '',
      bold   ? 'font-weight:bold' : '',
      size   ? `font-size:${size}` : '',
      upper  ? 'text-transform:uppercase' : '',
      align !== 'left' ? `text-align:${align}` : '',
    ].filter(Boolean).join(';');

    const kids = this._nodes(node.childNodes, css, ctx);

    switch (tag) {
      // Semânticas → div
      case 'aside': case 'header': case 'footer':
      case 'main':  case 'section': case 'article': case 'nav':
        if (!kids.trim()) return '';
        return `<div style="${iStyle};margin-bottom:${cs.mb||'8pt'};">${kids}</div>`;

      case 'div': {
        // Foto/iniciais — tabela quadrada Word-safe (sem border-radius)
        if (cs.isPhoto || clsList.includes('cv-photo-placeholder')) {
          const initials = this._e(node.textContent.trim().slice(0,2).toUpperCase() || 'XX');
          return `<p style="text-align:center;margin:0 0 10pt;">
<table width="60" border="2" cellpadding="0" cellspacing="0" align="center"
       style="width:60pt;background:#2D4D78;mso-shading:2D4D78;border:2pt solid #4A6FA8;">
<tr><td height="60" width="60" align="center" valign="middle" bgcolor="#2D4D78"
        style="height:60pt;width:60pt;font-size:20pt;font-weight:800;color:#FFFFFF;
               text-align:center;vertical-align:middle;mso-shading:2D4D78;">
${initials}</td></tr></table></p>`;
        }
        if (!kids.trim()) return '';
        return `<div style="${iStyle};margin-bottom:${cs.mb||'6pt'};">${kids}</div>`;
      }

      case 'h1':
        return `<h1 style="font-size:${cs.size||'22pt'};font-weight:bold;color:#${color};${upper?'text-transform:uppercase;':''}margin:0 0 4pt;page-break-after:avoid;">${kids}</h1>`;

      case 'h2': {
        const border = cs.borderBottom ? `border-bottom:1.5pt solid #${color};padding-bottom:2pt;` : '';
        return `<h2 style="font-size:${cs.size||'12pt'};font-weight:bold;color:#${color};${upper?'text-transform:uppercase;':''}${border}margin:10pt 0 5pt;page-break-after:avoid;">${kids}</h2>`;
      }

      case 'h3': {
        const border = cs.borderBottom || clsList.includes('cv-sidebar-title')
          ? 'border-bottom:0.75pt solid #334E7A;padding-bottom:2pt;' : '';
        const c3 = clsList.includes('cv-sidebar-title') ? '93C5FD' : color;
        return `<h3 style="font-size:${cs.size||'10pt'};font-weight:bold;color:#${c3};${upper?'text-transform:uppercase;':''}${border}margin:0 0 5pt;page-break-after:avoid;">${kids}</h3>`;
      }

      case 'h4': case 'h5': case 'h6':
        return `<${tag} style="font-size:10pt;font-weight:bold;color:#${color};margin:5pt 0 3pt;">${kids}</${tag}>`;

      case 'p': {
        const t = node.textContent.trim();
        if (!t || /^-{2,}$/.test(t)) return '';
        const ps = [`color:#${color}`, bold?'font-weight:bold':'', `font-size:${size}`,
          align!=='left'?`text-align:${align}`:'', 'margin:0 0 4pt'].filter(Boolean).join(';');
        return `<p style="${ps}">${kids}</p>`;
      }

      case 'ul':
        return `<ul style="padding-left:14pt;margin:2pt 0 4pt;color:#${color};font-size:${size};">${kids}</ul>`;
      case 'ol':
        return `<ol style="padding-left:14pt;margin:2pt 0 4pt;font-size:${size};">${kids}</ol>`;
      case 'li':
        return `<li style="color:#${color};font-size:${size};margin-bottom:2pt;">${kids}</li>`;

      case 'strong': case 'b': return `<strong style="color:#${color};">${kids}</strong>`;
      case 'em': case 'i':    return `<em>${kids}</em>`;
      case 'u':               return `<u>${kids}</u>`;
      case 'br':              return '<br>';
      case 'hr':
        return `<hr style="border:none;border-top:0.75pt solid #${ctx==='sidebar'?'334E7A':'D1D5DB'};margin:5pt 0;">`;

      case 'span': {
        const ss = [color?`color:#${color}`:'', bold?'font-weight:bold':'', size?`font-size:${size}`:''].filter(Boolean).join(';');
        return ss ? `<span style="${ss}">${kids}</span>` : kids;
      }

      case 'table':
        return `<table style="width:100%;border-collapse:collapse;margin:4pt 0;font-size:${size};">${kids}</table>`;
      case 'thead': return `<thead>${kids}</thead>`;
      case 'tbody': return `<tbody>${kids}</tbody>`;
      case 'tr':    return `<tr>${kids}</tr>`;
      case 'th':    return `<th style="border:0.75pt solid #334E7A;padding:4pt 6pt;background:#1e3a5f;color:#fff;font-weight:bold;font-size:9pt;">${kids}</th>`;
      case 'td':    return `<td style="border:0.75pt solid #D1D5DB;padding:4pt 6pt;font-size:9pt;">${kids}</td>`;

      case 'a':     return `<a href="${node.getAttribute('href')||'#'}" style="color:#3B82F6;">${kids}</a>`;

      case 'img': {
        const src = node.getAttribute('src')||'';
        return src.startsWith('data:') ? `<img src="${src}" style="max-width:160pt;height:auto;display:block;">` : '';
      }

      case 'pre': case 'code':
        return `<code style="font-family:'Courier New',monospace;font-size:9pt;color:#374151;">${kids}</code>`;

      case 'blockquote':
        return `<blockquote style="border-left:2pt solid #D1D5DB;padding-left:10pt;margin:5pt 0;color:#6B7280;font-style:italic;">${kids}</blockquote>`;

      default:
        return kids;
    }
  }

  // ── Extractores de CSS ───────────────────────────────────────────────────

  _bgFromCss(css, selector) {
    if (!css) return null;
    for (const sel of selector.split(',').map(s=>s.trim())) {
      const esc = sel.replace(/[.[\]]/g, c=>'\\'+c);
      const m = new RegExp(esc+'\\s*\\{[^}]*background(?:-color)?\\s*:\\s*([^;}]+)','i').exec(css);
      if (m) return toHex(m[1].trim());
    }
    return null;
  }

  _e(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

export const htmlWordExporter = new HTMLWordExporter();
