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
