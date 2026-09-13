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
    it('returns the explicit token set via setActiveAccount', () => {
      client.setActiveAccount(null, 'test-token', true);
      expect(client._getToken()).toBe('test-token');
    });

    it('throws when no explicit token (no system fallback)', () => {
      expect(() => client._getToken()).toThrow('not configured');
    });

    it('never consults settingsRepo.getCredentials', () => {
      expect(() => client._getToken()).toThrow('not configured');
      expect(mockSettingsRepo.getCredentials).not.toHaveBeenCalled();
    });
  });

  describe('_get', () => {
    it('should make GET request with token', async () => {
      client.setActiveAccount(null, 'test-token', true);
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
      client.setActiveAccount(null, 'test-token', true);
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
