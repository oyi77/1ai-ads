import { describe, expect, it } from 'vitest';
import { sanitizeAccessToken, sanitizeCredentialAccessToken } from '../../../../server/lib/token-sanitize.js';

describe('token sanitizer', () => {
  it('leaves ordinary tokens unchanged', () => {
    expect(sanitizeAccessToken('EAAvalidToken123')).toBe('EAAvalidToken123');
  });

  it('removes UI prefixes and bot success text spanning multiple lines', () => {
    const dirty = '✅ EAAvalidToken123 connected for Meta (Facebook/Instagram)!\n\nYou can manage this account from the web dashboard or /status.';
    expect(sanitizeAccessToken(dirty)).toBe('EAAvalidToken123');
  });

  it('keeps only the token when unseen bot text trails it on a later line', () => {
    expect(sanitizeAccessToken('✅ EAAvalidToken123\n\nSome future bot copy.')).toBe('EAAvalidToken123');
  });

  it('removes localized bot help text', () => {
    expect(sanitizeAccessToken('EAAvalidToken123 Selesai, cek /status ya')).toBe('EAAvalidToken123');
  });

  it('sanitizes credential objects without mutating other fields', () => {
    const input = { access_token: '✅ EAAvalidToken123', user_id: 'fb-1' };
    expect(sanitizeCredentialAccessToken(input)).toEqual({ access_token: 'EAAvalidToken123', user_id: 'fb-1' });
    expect(input.access_token).toBe('✅ EAAvalidToken123');
  });
});
