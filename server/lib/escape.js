const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

const DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript):/i;

export function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  // Strip control chars (incl. tabs/newlines) + whitespace before the scheme
  // check — browsers normalize them, so 'java\tscript:' must be rejected.
  const normalized = url.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (!normalized) return false;
  if (DANGEROUS_PROTOCOLS.test(normalized)) return false;
  return true;
}
