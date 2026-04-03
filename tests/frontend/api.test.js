import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../client/src/lib/api.js';

global.fetch = vi.fn();
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
global.window = {
  dispatchEvent: vi.fn(),
};
global.CustomEvent = class {};

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds auth header if token exists', async () => {
    localStorage.getItem.mockReturnValue('fake-token');
    fetch.mockResolvedValue({
      json: async () => ({ success: true, data: {} })
    });

    await api.get('/test');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer fake-token'
        })
      })
    );
  });

  it('retries request on 401 using refresh token', async () => {
    localStorage.getItem.mockImplementation(key => {
      if (key === 'adforge_token') return 'old-token';
      if (key === 'adforge_refresh_token') return 'refresh-token';
      return null;
    });

    fetch.mockResolvedValueOnce({
      status: 401,
      json: async () => ({ success: false, error: 'Unauthorized' })
    });

    fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: { accessToken: 'new-token', refreshToken: 'new-refresh' }
      })
    });

    fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: { ok: true } })
    });

    const result = await api.get('/secure');

    expect(result.data.ok).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('adforge_token', 'new-token');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('logs out if refresh token fails', async () => {
    localStorage.getItem.mockImplementation(key => {
      if (key === 'adforge_token') return 'old-token';
      if (key === 'adforge_refresh_token') return 'refresh-token';
      return null;
    });

    fetch.mockResolvedValueOnce({
      status: 401,
      json: async () => ({ success: false, error: 'Unauthorized' })
    });

    fetch.mockResolvedValueOnce({
      status: 401,
      json: async () => ({ success: false, error: 'Refresh failed' })
    });

    await expect(api.get('/secure')).rejects.toThrow('Unauthorized');
    expect(localStorage.removeItem).toHaveBeenCalledWith('adforge_token');
  });
});