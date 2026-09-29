/**
 * Shared access-token sanitizer.
 *
 * Users sometimes paste Meta tokens copied from bot UI together with UI
 * artifacts such as a leading check mark or trailing bot success/help text.
 * Cleaning is deterministic and preserves genuine token characters.
 */
export function sanitizeAccessToken(token) {
  if (!token || typeof token !== 'string') return token;
  let cleaned = token.trim();
  cleaned = cleaned.replace(/^✅\s*/, '');
  cleaned = cleaned.replace(/\s*connected for Meta.*$/is, '');
  cleaned = cleaned.replace(/\s*You can manage this account from the web dashboard.*$/is, '');
  cleaned = cleaned.replace(/\s*Selesai.*cek \/status.*$/is, '');
  cleaned = cleaned.trim();
  // Meta tokens never contain whitespace. If bot text the rules above did not
  // predict is still glued to a token-shaped value, keep only the token.
  const shaped = cleaned.match(/^EAA[A-Za-z0-9_-]+/);
  if (shaped && shaped[0] !== cleaned) cleaned = shaped[0];
  return cleaned;
}

export function sanitizeCredentialAccessToken(credentials) {
  if (typeof credentials === 'string') return sanitizeAccessToken(credentials);
  if (credentials && typeof credentials === 'object' && typeof credentials.access_token === 'string') {
    return { ...credentials, access_token: sanitizeAccessToken(credentials.access_token) };
  }
  return credentials;
}


/**
 * Guard a user-supplied account label against being a pasted access token.
 *
 * `account_name` reaches storage straight from request bodies and bot wizard
 * state, so a user who pastes the token into the name field instead of the
 * token field gets a live credential written to a plaintext, widely-rendered
 * column (proven live 2026-09-29: platform_accounts.account_name held a 201
 * char EAA token, shown in every account list and log line).
 *
 * Returns '' when the value looks like a token, so callers fall back to a
 * real label (Meta `me.name`, platform default).
 */
export function sanitizeAccountName(name) {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  // A Meta token in the label is never a real display name.
  if (/^EAA[A-Za-z0-9_-]{40,}$/.test(trimmed)) return '';
  // Same, buried in copied bot text ("✅ EAA... connected for Meta").
  if (/EAA[A-Za-z0-9_-]{40,}/.test(trimmed) && trimmed.length > 80) return '';
  return trimmed;
}
