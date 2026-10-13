import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isMetaAppRateLimit, safeFetch } from '../../../server/lib/platform-client.js';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

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

describe('safeFetch — Meta app rate limit is retried, not thrown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retries a 403 code 4 / 1504022 then succeeds', async () => {
    const rateLimited = {
      status: 403,
      ok: false,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify({ error: { code: 4, error_subcode: 1504022, is_transient: true } })),
    };
    const okResp = { status: 200, ok: true, headers: { get: () => null } };
    const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(okResp);
    global.fetch = fetchMock;

    const res = await safeFetch('meta', 'https://graph.facebook.com/v22.0/me/adaccounts?access_token=x', {}, 2);
    expect(res).toBe(okResp);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still throws after the retry budget is exhausted', async () => {
    const rateLimited = {
      status: 403,
      ok: false,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify({ error: { code: 4, error_subcode: 1504022 } })),
    };
    global.fetch = vi.fn().mockResolvedValue(rateLimited);

    await expect(
      safeFetch('meta', 'https://graph.facebook.com/v22.0/me/adaccounts?access_token=x', {}, 1)
    ).rejects.toMatchObject({ code: 'META_RATE_LIMIT' });
  });
});
