/**
 * DOMPurify module for TruthBeacon UI.
 * Sanitizes untrusted HTML inputs to prevent Cross-Site Scripting (XSS).
 */

const ALLOWED_TAGS = new Set([
  'a', 'article', 'aside', 'b', 'blockquote', 'button', 'code', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd', 'li', 'mark',
  'nav', 'ol', 'p', 'pre', 'section', 'small', 'span', 'strong', 'sub', 'sup',
  'svg', 'path', 'polyline', 'line', 'circle', 'rect', 'ellipse',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
]);

const ALLOWED_ATTRS = new Set([
  'alt', 'aria-describedby', 'aria-hidden', 'aria-label', 'aria-live', 'class',
  'data-action', 'data-id', 'data-incident-id', 'data-platform', 'data-tab',
  'data-verify-tab', 'data-showcase', 'data-hash', 'fill', 'height', 'href',
  'id', 'points', 'radius', 'rel', 'role', 'src', 'stroke', 'stroke-linecap',
  'stroke-linejoin', 'stroke-width', 'style', 'title', 'type', 'viewbox',
  'width', 'x1', 'x2', 'y1', 'y2'
]);

function cleanNode(node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      node.remove();
      return;
    }

    // Strip disallowed or dangerous attributes
    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      const attrName = attr.name.toLowerCase();
      const attrVal = attr.value.trim().toLowerCase();

      if (attrName.startsWith('on') || attrVal.startsWith('javascript:') || attrVal.startsWith('data:text/html')) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (!ALLOWED_ATTRS.has(attrName) && !attrName.startsWith('data-') && !attrName.startsWith('aria-')) {
        node.removeAttribute(attr.name);
      }
    }
  }

  const children = Array.from(node.childNodes);
  for (const child of children) {
    cleanNode(child);
  }
}

export const DOMPurify = {
  sanitize(dirty) {
    if (dirty === null || dirty === undefined) return '';
    if (typeof dirty !== 'string') dirty = String(dirty);

    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, 'text/html');
    cleanNode(doc.body);
    return doc.body.innerHTML;
  }
};

if (typeof window !== 'undefined') {
  window.DOMPurify = DOMPurify;
}

export default DOMPurify;
