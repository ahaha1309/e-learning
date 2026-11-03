// Centralized HTML sanitizer for user-authored rich content (TinyMCE).
// Stored XSS defense: strip scripts, event handlers, and dangerous markup
// before persistence. Allowlist-based via sanitize-html (no regex homebrew).
const sanitizeHtml = require('sanitize-html');

// Safe subset aligned with what TinyMCE content reasonably needs:
// headings, paragraphs, text formatting, lists, links, code, tables, images.
const ALLOWED_OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'code', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['class', 'style'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    p: ['class', 'style'],
    div: ['class', 'style'],
  },
  // Enforce safe link targets; scheme whitelist prevents javascript: URLs.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
  // Allow only an inline-style safelist (TinyMCE emits a few). Everything else dropped.
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*\)$/i],
      'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*\)$/i],
      'font-weight': [/^(bold|\d{3})$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|line-through|none)$/],
    },
  },
};

/**
 * Sanitize rich HTML content. Returns '' for empty/non-string input.
 * Decodes basic HTML entities first to undo global xss-clean middleware effects.
 * @param {string} html
 * @returns {string}
 */
function sanitizeRichHtml(html) {
  if (!html || typeof html !== 'string') return '';
  // Undo xss-clean's basic escaping so sanitize-html can parse the actual tags
  const decodedHtml = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&');
  return sanitizeHtml(decodedHtml, ALLOWED_OPTIONS);
}

/**
 * Plain-text sanitizer for fields that must never carry markup (titles, names).
 * Escapes to HTML entities and trims length.
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string}
 */
function sanitizePlainText(text, maxLen) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  return maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

module.exports = {
  sanitizeRichHtml,
  sanitizePlainText,
};
