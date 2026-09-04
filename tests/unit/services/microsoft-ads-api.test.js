import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MicrosoftAdsAPI } from '../../../server/services/microsoft/index.js';

describe('MicrosoftAdsAPI', () => {
  let api;
  let mockSettingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsRepo = { getCredentials: vi.fn(() => ({ access_token: 'test-token' })) };
    api = new MicrosoftAdsAPI(mockSettingsRepo, { developerToken: 'dev-token', customerId: 'cust-123' });
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('accepts explicit token', () => {
      const api2 = new MicrosoftAdsAPI('test-token', { developerToken: 'dev' });
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('_getToken', () => {
    it('returns explicit token when set', () => {
      const api2 = new MicrosoftAdsAPI('test-token');
      expect(api2._getToken()).toBe('test-token');
    });

    it('returns token from settings repo', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'repo-token' });
      expect(api._getToken()).toBe('repo-token');
    });

    it('throws ConfigurationError when no token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('Microsoft Ads access token not configured');
    });
  });

  describe('getAdAccounts', () => {
    it('returns empty array (SOAP client required)', async () => {
      const result = await api.getAdAccounts();
      expect(result).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('returns empty array (SOAP client required)', async () => {
      const result = await api.getCampaigns('acc-123');
      expect(result).toEqual([]);
    });
  });

  describe('isExpiredToken', () => {
    it('returns true for 401', () => {
      expect(api.isExpiredToken({ code: 401 })).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(api.isExpiredToken({ code: 500 })).toBe(false);
    });
  });
});
