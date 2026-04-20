// utils/Formatter.js
export const Formatter = {
  phone(raw) {
    const clean = raw.replace(/\D/g, '');
    return clean.startsWith('258') ? clean : `258${clean}`;
  },
  markdownToHTML(md = '') {
    if (!md) return '';
    let html = md
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      // Tables
      .replace(/^\|(.+)\|$/gm, line => {
        const cells = line.slice(1,-1).split('|').map(c => c.trim());
        return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      })
      .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, m => `<table>${m}</table>`)
      // Separators
      .replace(/^-{3,}$/gm, '<hr/>')
      // Headings
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
      .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
      // Bold / italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      // Lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      // Paragraphs
      .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
    return `<p>${html}</p>`;
  }
};
