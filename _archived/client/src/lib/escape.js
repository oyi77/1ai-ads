const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const RE = /[&<>"']/g;

export function esc(str) {
  if (str == null) return '';
  return String(str).replace(RE, ch => MAP[ch]);
}
