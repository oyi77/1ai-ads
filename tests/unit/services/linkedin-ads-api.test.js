import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInAdsAPI } from '../../../server/services/linkedin/index.js';

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('LinkedInAdsAPI', () => {
  let api;
  let mockSettingsRepo;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };
    api = new LinkedInAdsAPI(mockSettingsRepo);
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('accepts explicit token', () => {
      const api2 = new LinkedInAdsAPI('test-token');
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('_getToken', () => {
    it('returns explicit token when set', () => {
      const api2 = new LinkedInAdsAPI('test-token');
      expect(api2._getToken()).toBe('test-token');
    });

    it('returns token from settings repo', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'repo-token' });
      expect(api._getToken()).toBe('repo-token');
    });

    it('throws ConfigurationError when no token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('LinkedIn Ads access token not configured');
    });
  });

  describe('static withToken', () => {
    it('creates instance with explicit token', () => {
      const api2 = LinkedInAdsAPI.withToken('test-token');
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('setActiveAccount', () => {
    it('sets explicit token and userScoped', () => {
      api.setActiveAccount('acc-123', 'token-123', true);
      expect(api._explicitToken).toBe('token-123');
      expect(api._activeAccountId).toBe('acc-123');
      expect(api._userScoped).toBe(true);
    });
  });

  describe('clearActiveAccount', () => {
    it('clears account context', () => {
      api.setActiveAccount('acc-123', 'token-123', true);
      api.clearActiveAccount();
      expect(api._explicitToken).toBeNull();
      expect(api._activeAccountId).toBeNull();
      expect(api._userScoped).toBe(false);
    });
  });

  describe('getMe', () => {
    it('returns placeholder account', async () => {
      const result = await api.getMe();
      expect(result).toEqual({ id: 'me', name: 'LinkedIn Ads Account' });
    });
  });

  describe('getAdAccounts', () => {
    it('returns empty array (scaffold)', async () => {
      const result = await api.getAdAccounts();
      expect(result).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('returns empty array (scaffold)', async () => {
      const result = await api.getCampaigns('acc-123');
      expect(result).toEqual([]);
    });
  });

  describe('getCampaignInsights', () => {
    it('returns null (scaffold)', async () => {
      const result = await api.getCampaignInsights('camp-123');
      expect(result).toBeNull();
    });
  });

  describe('getMultiCampaignInsights', () => {
    it('returns empty object (scaffold)', async () => {
      const result = await api.getMultiCampaignInsights(['camp-1', 'camp-2']);
      expect(result).toEqual({});
    });
  });

  describe('getAccountInsights', () => {
    it('returns null (scaffold)', async () => {
      const result = await api.getAccountInsights('acc-123');
      expect(result).toBeNull();
    });
  });

  describe('updateCampaign', () => {
    it('returns not-updated (scaffold)', async () => {
      const result = await api.updateCampaign('camp-123', { status: 'PAUSED' });
      expect(result).toEqual({ id: 'camp-123', updated: false });
    });
  });

  describe('isExpiredToken', () => {
    it('detects 401/403 errors', () => {
      expect(api.isExpiredToken({ code: 401 })).toBe(true);
      expect(api.isExpiredToken({ code: 403 })).toBe(true);
      expect(api.isExpiredToken({ message: 'Unauthorized' })).toBe(true);
      expect(api.isExpiredToken({ message: 'Token expired' })).toBe(true);
      expect(api.isExpiredToken({ message: 'Some other error' })).toBe(false);
    });
  });
});
