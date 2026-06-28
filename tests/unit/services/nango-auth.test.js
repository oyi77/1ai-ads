import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateConnection, mockGetConnection, MockNango } = vi.hoisted(() => {
  const mockCreateConnection = vi.fn();
  const mockGetConnection = vi.fn();
  class MockNango {
    constructor() {
      this.createConnection = mockCreateConnection;
      this.getConnection = mockGetConnection;
    }
  }
  return { mockCreateConnection, mockGetConnection, MockNango };
});

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../server/config/index.js', () => ({
  default: {
    nangoSecretKey: 'test-nango-key',
  },
}));

vi.mock('@nangohq/node', () => ({
  Nango: MockNango,
}));

import { NangoAuthService } from '../../../server/services/nango-auth.js';

describe('NangoAuthService', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateConnection.mockResolvedValue({});
    mockGetConnection.mockResolvedValue({
      credentials: { access_token: 'tok_123', refresh_token: 'ref_456', expires_at: 999999999 },
    });
    service = new NangoAuthService();
  });

  it('should be enabled when config has secret key', () => {
    expect(service.enabled).toBe(true);
    expect(service.nango).toBeDefined();
  });

  describe('storeCredentials', () => {
    it('should store credentials in Nango', async () => {
      const result = await service.storeCredentials('user_1', 'meta', {
        access_token: 'tok_abc',
        refresh_token: 'ref_xyz',
        expires_at: 1234567890,
      });

      expect(result).toBe(true);
      expect(mockCreateConnection).toHaveBeenCalledWith('user_1-meta', 'meta', {
        credentials: {
          access_token: 'tok_abc',
          refresh_token: 'ref_xyz',
          expires_at: 1234567890,
        },
      });
    });

    it('should handle credentials without optional fields', async () => {
      const result = await service.storeCredentials('user_1', 'google', {
        access_token: 'tok_only',
      });

      expect(result).toBe(true);
      expect(mockCreateConnection).toHaveBeenCalledWith('user_1-google', 'google', {
        credentials: { access_token: 'tok_only' },
      });
    });

    it('should return false on failure', async () => {
      mockCreateConnection.mockRejectedValue(new Error('API error'));

      const result = await service.storeCredentials('user_1', 'meta', {
        access_token: 'tok',
      });
      expect(result).toBe(false);
    });
  });

  describe('getCredentials', () => {
    it('should return credentials from Nango', async () => {
      const result = await service.getCredentials('user_1', 'meta');
      expect(result).toEqual({
        access_token: 'tok_123',
        refresh_token: 'ref_456',
        expires_at: 999999999,
      });
      expect(mockGetConnection).toHaveBeenCalledWith('user_1-meta', 'meta');
    });

    it('should return null when connection not found', async () => {
      mockGetConnection.mockResolvedValue(null);
      const result = await service.getCredentials('user_1', 'meta');
      expect(result).toBeNull();
    });

    it('should return null when connection has no credentials', async () => {
      mockGetConnection.mockResolvedValue({});
      const result = await service.getCredentials('user_1', 'meta');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockGetConnection.mockRejectedValue(new Error('Not found'));
      const result = await service.getCredentials('user_1', 'meta');
      expect(result).toBeNull();
    });
  });

  describe('getFreshToken', () => {
    it('should return fresh access token', async () => {
      const token = await service.getFreshToken('user_1', 'meta');
      expect(token).toBe('tok_123');
    });

    it('should return null when no connection', async () => {
      mockGetConnection.mockResolvedValue(null);
      const token = await service.getFreshToken('user_1', 'meta');
      expect(token).toBeNull();
    });

    it('should return null on error', async () => {
      mockGetConnection.mockRejectedValue(new Error('fail'));
      const token = await service.getFreshToken('user_1', 'meta');
      expect(token).toBeNull();
    });

    it('should return null when no access_token in credentials', async () => {
      mockGetConnection.mockResolvedValue({ credentials: {} });
      const token = await service.getFreshToken('user_1', 'meta');
      expect(token).toBeNull();
    });
  });

  describe('disabled state', () => {
    it('should return false for storeCredentials when disabled', async () => {
      service.enabled = false;
      const result = await service.storeCredentials('user_1', 'meta', { access_token: 'tok' });
      expect(result).toBe(false);
    });

    it('should return null for getCredentials when disabled', async () => {
      service.enabled = false;
      const result = await service.getCredentials('user_1', 'meta');
      expect(result).toBeNull();
    });

    it('should return null for getFreshToken when disabled', async () => {
      service.enabled = false;
      const token = await service.getFreshToken('user_1', 'meta');
      expect(token).toBeNull();
    });
  });
});
