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

// Telegram legacy-Markdown escaper for dynamic text (rule names, account
// labels, action types). An unescaped `_` (e.g. increase_budget) opens an
// entity Telegram can't close → 400 "can't parse entities" (proven live
// 2026-09-14: Monitor died at byte offset 109 for one underscore action).
export function escapeMarkdown(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[_*[\]()~`>#+\-=|.!{}]/g, '\\$&');
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
