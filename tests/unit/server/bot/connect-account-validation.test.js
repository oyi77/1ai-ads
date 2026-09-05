import { describe, expect, it, vi } from 'vitest';
import { validateMetaAccessToken } from '../../../../server/bot/scenes/connect-account.js';

describe('connect-account Meta token validation', () => {
  it('accepts a token verified by Meta', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ id: 'fb-123', name: 'QA User' }),
    }));
    await expect(validateMetaAccessToken('valid-token', fetchImpl)).resolves.toEqual({
      id: 'fb-123',
      name: 'QA User',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a token Meta reports as invalid', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
    }));
    await expect(validateMetaAccessToken('bad-token', fetchImpl)).rejects.toThrow('Invalid Meta token');
  });

  it('does not accept a token when verification cannot complete', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Network error');
    });
    await expect(validateMetaAccessToken('any-token', fetchImpl)).rejects.toThrow('Network error');
  });
});
