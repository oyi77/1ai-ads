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
  cleaned = cleaned.replace(/\s*connected for Meta.*$/i, '');
  cleaned = cleaned.replace(/\s*You can manage this account from the web dashboard.*$/i, '');
  cleaned = cleaned.replace(/\s*Selesai.*cek \/status.*$/i, '');
  return cleaned.trim();
}

export function sanitizeCredentialAccessToken(credentials) {
  if (typeof credentials === 'string') return sanitizeAccessToken(credentials);
  if (credentials && typeof credentials === 'object' && typeof credentials.access_token === 'string') {
    return { ...credentials, access_token: sanitizeAccessToken(credentials.access_token) };
  }
  return credentials;
}
