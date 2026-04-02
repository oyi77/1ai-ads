const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

const DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript):/i;

export function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (DANGEROUS_PROTOCOLS.test(trimmed)) return false;
  return true;
}
