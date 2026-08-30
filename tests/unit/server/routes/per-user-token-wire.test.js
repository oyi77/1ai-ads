import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { GoogleAdsAPI } from '../../../../server/services/google/index.js';
import { TikTokAdsAPI } from '../../../../server/services/tiktok/index.js';
import { LinkedInAdsAPI } from '../../../../server/services/linkedin/index.js';

const USER_TOK = 'USER_BOUND_TOKEN_123';
const SYS_TOK = 'SYSTEM_FALLBACK_TOKEN_999';

function makeRepos() {
  return {
    settingsRepo: {
      getCredentials: () => ({ access_token: SYS_TOK, oauth_token: SYS_TOK, developer_token: 'DEV_TOK_777' }),
    },
    platformAccountsRepo: {
      getByPlatform: (userId, platform) =>
        userId === 'u1' ? { id: 'acc-1', access_token: USER_TOK } : null,
      getAccounts: () => [],
    },
  };
}

describe('per-user token scoping (scaffold)', () => {
  const repos = makeRepos();

  describe('google', () => {
    it('uses user token when set via setActiveAccount', () => {
      const api = new GoogleAdsAPI(repos.settingsRepo);
      api.setActiveAccount(null, USER_TOK, true);
      expect(api._getToken()).toBe(USER_TOK);
    });

    it('falls back to system token when not user-scoped', () => {
      const api = new GoogleAdsAPI(repos.settingsRepo);
      expect(api._getToken()).toBe(SYS_TOK);
    });
  });

  describe('tiktok', () => {
    it('uses user token when set via setActiveAccount', () => {
      const api = new TikTokAdsAPI(repos.settingsRepo);
      api.setActiveAccount(null, USER_TOK, true);
      expect(api._getToken()).toBe(USER_TOK);
    });

    it('falls back to system token when not user-scoped', () => {
      const api = new TikTokAdsAPI(repos.settingsRepo);
      expect(api._getToken()).toBe(SYS_TOK);
    });
  });

  describe('linkedin', () => {
    it('uses user token when set via setActiveAccount', () => {
      const api = new LinkedInAdsAPI(repos.settingsRepo);
      api.setActiveAccount(null, USER_TOK, true);
      expect(api._getToken()).toBe(USER_TOK);
    });

    it('falls back to system token when not user-scoped', () => {
      const api = new LinkedInAdsAPI(repos.settingsRepo);
      expect(api._getToken()).toBe(SYS_TOK);
    });
  });
});
