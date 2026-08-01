// assets/js/utils/Sanitizer.js
// Sanitização de HTML para prevenir XSS no preview do editor

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 'strike', 'del',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'div', 'span', 'a', 'img',
  // Tags semânticas HTML5 usadas pelos templates (cv-executivo, etc.)
  'header', 'footer', 'main', 'aside', 'section', 'article',
  'nav', 'figure', 'figcaption', 'address',
  // CORRIGIDO (auditoria Jul/2026): muitos templates — incluindo os
  // OFICIAIS da própria biblioteca — embutem um <style> dentro do próprio
  // HTML para escoparem o seu CSS. Antes disto ser permitido, a tag era
  // "desembrulhada" (removida mas o texto CSS lá dentro ficava como texto
  // visível na página — é isto que causava fragmentos estranhos tipo
  // "99926" a aparecer nos cartões do marketplace). O conteúdo do <style>
  // é sanitizado à parte, ver sanitizeStyleContent() abaixo.
  'style',
]);

// Tags cujo conteúdo NUNCA deve sobrar como texto visível se a própria tag
// for removida — ao contrário das tags "estruturais" acima (que são
// desembrulhadas, mantendo o texto dos filhos), estas são eliminadas por
// inteiro, incluindo o conteúdo.
const REMOVE_ENTIRELY_TAGS = new Set(['script', 'noscript', 'template', 'iframe', 'object', 'embed']);

// Padrões de CSS historicamente usados para execução de código ou para
// exfiltração de dados via propriedades pouco comuns. CSS moderno não
// executa JavaScript, mas isto é uma camada extra de defesa.
const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/gi,        // IE antigo: CSS expression() executava JS
  /-moz-binding\s*:/gi,       // Firefox antigo: podia carregar XML/XBL remoto
  /behavior\s*:/gi,           // IE antigo: .htc behaviors
  /javascript\s*:/gi,
  /@import/gi,                // impede carregar folhas de estilo externas
];

function sanitizeStyleContent(css) {
  let safe = String(css || '');
  for (const pattern of DANGEROUS_CSS_PATTERNS) safe = safe.replace(pattern, '');
  return safe;
}

const ALLOWED_ATTRS = new Set([
  'href', 'title', 'alt', 'src', 'class', 'id', 'style',
  'colspan', 'rowspan', 'target',
]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

  // SEGURANÇA/ROBUSTEZ (auditoria Jul/2026): um erro imprevisto aqui não
  // deve deixar a página num estado partido/sobreposto (foi o que
  // aconteceu com o bug do Set.some() acima). Em caso de falha, cai para
  // uma versão totalmente escapada (texto visível, sem HTML nenhum) em
  // vez de deixar o erro propagar-se e interromper a renderização a meio.
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirtyHtml, 'text/html');
    const body = doc.body;

    sanitizeNode(body);

    return body.innerHTML;
  } catch (err) {
    console.error('[sanitizeHtml] Falha a sanitizar, a devolver texto simples:', err.message);
    return escapeHtml(dirtyHtml);
  }
}

function sanitizeNode(node) {
  const children = Array.from(node.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();

      // Tags cujo conteúdo nunca deve sobrar como texto visível (script,
      // iframe, etc.) — remove-se o nó inteiro, não só a tag.
      if (REMOVE_ENTIRELY_TAGS.has(tag)) {
        node.removeChild(child);
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        const parent = child.parentNode;
        while (child.firstChild) {
          parent.insertBefore(child.firstChild, child);
        }
        parent.removeChild(child);
        continue;
      }

      // <style>: preserva a tag (para o CSS continuar a aplicar-se), mas
      // sanitiza o texto lá dentro contra padrões perigosos conhecidos.
      if (tag === 'style') {
        child.textContent = sanitizeStyleContent(child.textContent);
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
          // CORRIGIDO (auditoria Jul/2026): ALLOWED_PROTOCOLS é um Set, e
          // Set não tem o método .some() (isso é de Array) — isto estava a
          // lançar "TypeError: ... .some is not a function" sempre que o
          // sanitizador encontrava QUALQUER elemento com href/src (ou seja,
          // praticamente sempre, em qualquer template real com links ou
          // imagens). O erro não apanhado interrompia a sanitização a meio,
          // o que explica conteúdo cortado/sobreposto no marketplace.
          const isProtocolOk = [...ALLOWED_PROTOCOLS].some(p => url.startsWith(p));
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

        // style="..." (atributo inline, diferente da tag <style>): mesma
        // sanitização de padrões perigosos.
        if (attrName === 'style') {
          child.setAttribute('style', sanitizeStyleContent(attr.value));
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
