// @vitest-environment jsdom
// Regression: client MUST read auth envelope tokens from body.data.*
// and persist them under 1ai-ads_* localStorage keys. api.ts never
// returns an unauthenticated state when the server nests tokens in data.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const TOKEN_KEY = '1ai-ads_token';
const REFRESH_KEY = '1ai-ads_refresh_token';
const USER_KEY = '1ai-ads_user';
const API_BASE = '/api';

const DATA_ACCESS = 'data-access-token';
const DATA_REFRESH = 'data-refresh-token';
const TOP_ACCESS = 'top-access-token';
const TOP_REFRESH = 'top-refresh-token';
const USER = { id: 'u1', username: 'tester', email: 'tester@example.com' };

type Envelope = {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  data: {
    accessToken: string;
    refreshToken?: string;
    user?: typeof USER;
  };
};

function installEnvelope(env: Envelope) {
  const text = JSON.stringify(env);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
    })) as unknown as typeof fetch,
  );
}

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('1ai-ads_api_base');
}

describe('client auth envelope contract', () => {
  beforeEach(() => {
    clearStorage();
    localStorage.setItem('1ai-ads_api_base', API_BASE);
  });

  it('login reads envelope.data.* and stores under 1ai-ads_* keys', async () => {
    const { api } = await import('../../../client/src/lib/api.ts');
    installEnvelope({
      success: true,
      accessToken: TOP_ACCESS,
      refreshToken: TOP_REFRESH,
      data: { accessToken: DATA_ACCESS, refreshToken: DATA_REFRESH, user: USER },
    });

    await api.login('tester', 'secret123');

    expect(localStorage.getItem(TOKEN_KEY)).toBe(DATA_ACCESS);
    expect(localStorage.getItem(REFRESH_KEY)).toBe(DATA_REFRESH);
    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(USER));
    // Must ignore top-level tokens (historical bug class).
    expect(localStorage.getItem(TOKEN_KEY)).not.toBe(TOP_ACCESS);
  });

  it('telegramLogin reads envelope.data.* and stores under 1ai-ads_* keys', async () => {
    const { api } = await import('../../../client/src/lib/api.ts');
    installEnvelope({
      success: true,
      data: { accessToken: DATA_ACCESS, refreshToken: DATA_REFRESH, user: USER },
    });

    await api.telegramLogin('mock-init-data');

    expect(localStorage.getItem(TOKEN_KEY)).toBe(DATA_ACCESS);
    expect(localStorage.getItem(REFRESH_KEY)).toBe(DATA_REFRESH);
    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(USER));
  });
});
