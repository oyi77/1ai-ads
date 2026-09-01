// @vitest-environment jsdom
// Regression: client MUST read auth envelope tokens from body.data.*
// (never top-level), store ONLY the user profile in localStorage, and
// NEVER persist access/refresh JWTs to localStorage (they live in httpOnly
// cookies after the auth rewrite — XSS-exfiltration surface removed).
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

  it('login reads envelope.data.* and stores only the user profile (tokens stay in httpOnly cookies)', async () => {
    const { api } = await import('../../../client/src/lib/api.ts');
    installEnvelope({
      success: true,
      accessToken: TOP_ACCESS,
      refreshToken: TOP_REFRESH,
      data: { accessToken: DATA_ACCESS, refreshToken: DATA_REFRESH, user: USER },
    });

    await api.login('tester', 'secret123');

    // User profile IS stored for synchronous display.
    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(USER));
    // Access + refresh JWTs MUST NOT be persisted to localStorage — they live
    // in httpOnly cookies (adforge_access / adforge_refresh) after the rewrite.
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    // Must ignore top-level tokens (historical bug class) — even if a top-level
    // token were present, the client never writes it to localStorage.
    expect(localStorage.getItem(TOKEN_KEY)).not.toBe(TOP_ACCESS);
  });

  it('telegramLogin reads envelope.data.* and stores only the user profile', async () => {
    const { api } = await import('../../../client/src/lib/api.ts');
    installEnvelope({
      success: true,
      data: { accessToken: DATA_ACCESS, refreshToken: DATA_REFRESH, user: USER },
    });

    await api.telegramLogin('mock-init-data');

    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(USER));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});
