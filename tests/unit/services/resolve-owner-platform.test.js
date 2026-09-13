import { describe, it, expect, vi } from 'vitest';

import { resolveOwnerPlatformToken } from '../../../server/lib/resolve-owner-platform.js';

describe('resolveOwnerPlatformToken', () => {
  const platform = 'meta';

  function makeRepos({ boundToken, systemToken, getByPlatformThrows = false }) {
    const platformAccountsRepo = {
      getByPlatform: vi.fn((userId, p) => {
        if (getByPlatformThrows) throw new Error('db down');
        if (boundToken) return { user_id: userId, platform: p, access_token: boundToken };
        return null;
      }),
      findAllActiveByUserAndPlatform: vi.fn((userId, p) => {
        if (getByPlatformThrows) throw new Error('db down');
        if (boundToken) return [{ user_id: userId, platform: p, access_token: boundToken }];
        return [];
      }),
    };
    const settingsRepo = {
      getCredentials: vi.fn(() => (systemToken ? { access_token: systemToken } : null)),
    };
    return { platformAccountsRepo, settingsRepo };
  }

  it('returns the owner-bound token when the owner has a connected account', () => {
    const repos = makeRepos({ boundToken: 'owner-tok-123' });
    const token = resolveOwnerPlatformToken(platform, 'user-9', repos);
    expect(token).toBe('owner-tok-123');
    expect(repos.platformAccountsRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('user-9', 'meta');
  });

  it('returns null when the owner has no bound account (no system fallback)', () => {
    const repos = makeRepos({ systemToken: 'sys-tok-456' });
    const token = resolveOwnerPlatformToken(platform, 'user-9', repos);
    expect(token).toBeNull();
    // owner lookup ran; system credential must never be consulted
    expect(repos.platformAccountsRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('user-9', 'meta');
    expect(repos.settingsRepo.getCredentials).not.toHaveBeenCalled();
  });

  it('returns null when the owner lookup throws (no system fallback)', () => {
    const repos = makeRepos({ systemToken: 'sys-tok-456', getByPlatformThrows: true });
    const token = resolveOwnerPlatformToken(platform, 'user-9', repos);
    expect(token).toBeNull();
  });

  it('returns null when neither owner nor system token is configured', () => {
    const repos = makeRepos({});
    const token = resolveOwnerPlatformToken(platform, 'user-9', repos);
    expect(token).toBeNull();
  });

  it('returns null when ownerId is absent (no cross-user leakage)', () => {
    const repos = makeRepos({ systemToken: 'sys-tok-456' });
    const token = resolveOwnerPlatformToken(platform, null, repos);
    // Without an ownerId the owner lookup is skipped and no fallback applies
    expect(repos.platformAccountsRepo.findAllActiveByUserAndPlatform).not.toHaveBeenCalled();
    expect(token).toBeNull();
  });

  it('ignores a bare string system credential', () => {
    const platformAccountsRepo = { getByPlatform: vi.fn(() => null), findAllActiveByUserAndPlatform: vi.fn(() => []) };
    const settingsRepo = { getCredentials: vi.fn(() => 'bare-sys-tok') };
    const token = resolveOwnerPlatformToken(platform, 'user-1', { platformAccountsRepo, settingsRepo });
    expect(token).toBeNull();
  });
});
