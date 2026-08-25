/**
 * API Client — Typed fetch wrapper with full auth lifecycle.
 *
 * - Bearer token auth for all /api/ requests
 * - 401 auto-retry with refresh token
 * - Login, register, refreshToken, logout
 * - All string constants extracted to top-of-file config
 */

// ── Config ────────────────────────────────────────────────────

const TOKEN_KEY = '1ai-ads_token';
const REFRESH_KEY = '1ai-ads_refresh_token';
const USER_KEY = '1ai-ads_user';
const API_BASE = '/api';

// ── Token helpers ─────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Refresh token logic ───────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.success && data.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── Core request ──────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 handling: try refresh once, then force login
  if (res.status === 401 && !retried && !path.includes('/auth/')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(method, path, body, true);
    }
    clearAuth();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json();
  if (!json.success && json.error) throw new Error(json.error);
  return (json.data ?? json) as T;
}

// ── Public API ────────────────────────────────────────────────

export const api = {
  // Generic CRUD
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T,>(path: string) => request<T>('DELETE', path),

  // Auth lifecycle
  login: async (username: string, password: string) => {
    const data = await request<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; username: string; email: string; role: string; plan: string };
    }>('POST', '/auth/login', { username, password });

    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  },

  register: async (username: string, password: string, email: string) => {
    const data = await request<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; username: string; email: string; role: string; plan: string };
    }>('POST', '/auth/register', { username, password, email });

    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  },

  // Telegram Mini App SSO — exchanges validated initData for our JWT
  telegramLogin: async (initData: string) => {
    const data = await request<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; username: string; email: string; role: string; plan: string };
    }>('POST', '/auth/telegram-webapp', { initData });

    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  },

  logout: () => {
    clearAuth();
    window.location.href = '/login';
  },

  isAuthenticated: (): boolean => !!localStorage.getItem(TOKEN_KEY),

  getUser: (): { id: string; username: string; email: string; role: string; plan: string } | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};
