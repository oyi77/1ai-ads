import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasePlatformApiClient } from '../../../server/lib/base-platform-api.js';

describe('BasePlatformApiClient', () => {
  let client;
  let mockSettingsRepo;

  beforeEach(() => {
    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };
    client = new BasePlatformApiClient('test-platform', mockSettingsRepo);
  });

  describe('_getToken', () => {
    it('should return access token from credentials', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'test-token' });
      const token = client._getToken();
      expect(token).toBe('test-token');
    });

    it('should throw if no credentials', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => client._getToken()).toThrow('not configured');
    });

    it('should throw if no access_token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({});
      expect(() => client._getToken()).toThrow('not configured');
    });
  });

  describe('_get', () => {
    it('should make GET request with token', async () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'test-token' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{"data":"test"}'),
        json: () => Promise.resolve({ data: 'test' }),
      });
      global.fetch = mockFetch;

      const result = await client._get('https://api.example.com', '/test', { key: 'value' });

      expect(result).toEqual({ data: 'test' });
      delete global.fetch;
    });
  });

  describe('_post', () => {
    it('should make POST request with token and body', async () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'test-token' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{"success":true}'),
        json: () => Promise.resolve({ success: true }),
      });
      global.fetch = mockFetch;

      const result = await client._post('https://api.example.com', '/test', { data: 'value' });

      expect(result).toEqual({ success: true });
      delete global.fetch;
    });
  });

  describe('constructor', () => {
    it('should set platformName and settingsRepo', () => {
      expect(client.platformName).toBe('test-platform');
      expect(client.settingsRepo).toBe(mockSettingsRepo);
    });
  });
});
