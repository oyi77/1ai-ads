import { describe, it, expect } from 'vitest';
import { resolveUserPlatformToken } from '../../../server/lib/resolve-user-platform.js';

// In-memory stubs
function makePlatformAccountsRepo(row) {
  return {
    getByPlatform(userId, platform) {
      if (row && row.userId === userId && row.platform === platform) return row;
      return null;
    },
  };
}
function makeSettingsRepo(creds) {
  return { getCredentials: (p) => creds?.[p] ?? null };
}

describe('resolveUserPlatformToken', () => {
  it('prefers the requesting user\'s bound token', () => {
    const repo = makePlatformAccountsRepo({ userId: 'u1', platform: 'linkedin', access_token: 'USER_TOK' });
    const settings = makeSettingsRepo({ linkedin: { access_token: 'SYS_TOK' } });
    const req = { user: { id: 'u1' } };
    expect(resolveUserPlatformToken('linkedin', req, repo, settings)).toBe('USER_TOK');
  });

  it('returns null when the user has no bound token (no system fallback)', () => {
    const repo = makePlatformAccountsRepo(null);
    const settings = makeSettingsRepo({ linkedin: { access_token: 'SYS_TOK' } });
    const req = { user: { id: 'u1' } };
    expect(resolveUserPlatformToken('linkedin', req, repo, settings)).toBeNull();
  });

  it('returns null for a raw-string system token (no cross-user borrow)', () => {
    const repo = makePlatformAccountsRepo(null);
    const settings = makeSettingsRepo({ twitter: 'SYS_TOK' });
    const req = { user: { id: 'u1' } };
    expect(resolveUserPlatformToken('twitter', req, repo, settings)).toBeNull();
  });

  it('returns null when neither user nor system has a token', () => {
    const repo = makePlatformAccountsRepo(null);
    const settings = makeSettingsRepo({});
    const req = { user: { id: 'u1' } };
    expect(resolveUserPlatformToken('linkedin', req, repo, settings)).toBeNull();
  });

  it('returns null when req.user is missing (no implicit admin borrow)', () => {
    const repo = makePlatformAccountsRepo(null);
    const settings = makeSettingsRepo({ linkedin: { access_token: 'SYS_TOK' } });
    const req = {};
    expect(resolveUserPlatformToken('linkedin', req, repo, settings)).toBeNull();
  });

  it('never crosses users — a different user\'s token is not returned', () => {
    const repo = makePlatformAccountsRepo({ userId: 'u2', platform: 'linkedin', access_token: 'OTHER_TOK' });
    const settings = makeSettingsRepo({});
    const req = { user: { id: 'u1' } };
    expect(resolveUserPlatformToken('linkedin', req, repo, settings)).toBeNull();
  });
});
