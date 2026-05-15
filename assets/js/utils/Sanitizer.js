// assets/js/utils/Sanitizer.js
// Sanitização de HTML para prevenir XSS no preview do editor

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 'strike', 'del',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'div', 'span', 'a', 'img',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'title', 'alt', 'src', 'class', 'id', 'style',
  'colspan', 'rowspan', 'target',
]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(dirtyHtml, 'text/html');
  const body = doc.body;

  sanitizeNode(body);

  return body.innerHTML;
}

function sanitizeNode(node) {
  const children = Array.from(node.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        const parent = child.parentNode;
        while (child.firstChild) {
          parent.insertBefore(child.firstChild, child);
        }
        parent.removeChild(child);
        continue;
      }

      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase();
        if (!ALLOWED_ATTRS.has(attrName)) {
          child.removeAttribute(attr.name);
          continue;
        }

        if (attrName === 'href' || attrName === 'src') {
          const url = attr.value.trim().toLowerCase();
          const isProtocolOk = ALLOWED_PROTOCOLS.some(p => url.startsWith(p));
          const isRelative = url.startsWith('/') || url.startsWith('#');
          if (!isProtocolOk && !isRelative && url !== '') {
            child.removeAttribute(attr.name);
          }
        }

        if (attrName.startsWith('on')) {
          child.removeAttribute(attr.name);
        }

        if (attr.value.toLowerCase().includes('javascript:')) {
          child.removeAttribute(attr.name);
        }
      }

      sanitizeNode(child);
    }
  }
}

export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isSafeHtml(html) {
  if (!html) return true;
  const dangerous = /<script|javascript:|on\w+\s*=|data:text\/html/i;
  return !dangerous.test(html);
}
