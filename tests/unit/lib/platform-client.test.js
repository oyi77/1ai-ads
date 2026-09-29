import { describe, it, expect } from 'vitest';
import { isMetaAppRateLimit } from '../../../server/lib/platform-client.js';

describe('isMetaAppRateLimit', () => {
  it('detects Meta app call-load limit (403 + code 4)', () => {
    expect(isMetaAppRateLimit({ error: { code: 4, error_subcode: 1504022, is_transient: true } })).toBe(true);
  });

  it('detects it by subcode alone', () => {
    expect(isMetaAppRateLimit({ error: { error_subcode: 1504022 } })).toBe(true);
  });

  it('does not flag a permission error (code 200 / 803)', () => {
    expect(isMetaAppRateLimit({ error: { code: 200 } })).toBe(false);
    expect(isMetaAppRateLimit({ error: { code: 803 } })).toBe(false);
    expect(isMetaAppRateLimit(undefined)).toBe(false);
    expect(isMetaAppRateLimit({})).toBe(false);
  });
});
