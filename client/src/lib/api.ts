/**
 * API Client — Typed fetch wrapper with full auth lifecycle.
 *
 * - Bearer token auth for all /api/ requests
 * - 401 auto-retry with refresh token
 * - Login, register, refreshToken, logout
 * - All string constants extracted to top-of-file config
 */

// ── Config ────────────────────────────────────────────────────

// Tokens live in httpOnly cookies (adforge_access / adforge_refresh) — never in
// localStorage. USER_KEY is kept for synchronous user profile display (non-sensitive).
const USER_KEY = '1ai-ads_user';
const API_BASE = '/api';

// ── Token helpers ─────────────────────────────────────────────

// Tokens are in httpOnly cookies — no JS-side getToken/setTokens needed.

function clearAuth(): void {
  localStorage.removeItem(USER_KEY);
}

// ── Refresh token logic ───────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      // Refresh token is sent automatically via the httpOnly refresh cookie
      // (Path=/api/auth). No body needed — the server reads the cookie.
      const response = await fetch(`${API_BASE}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) return false;

      // Tokens arrive in Set-Cookie headers — nothing to store locally.
      return true;
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',  // send httpOnly auth cookies automatically
  });

  // A 401 on the login endpoint means bad credentials, NOT an expired token —
  // don't run the refresh-redirect flow there (it would wipe the error message
  // and bounce the user back to /login with no feedback).
  const isAuthEndpoint = path === '/auth/login' || path === '/auth/register';
  if (response.status === 401 && !retried && !isAuthEndpoint) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return request<T>(method, path, body, true);
    clearAuth();
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// ── Public API ────────────────────────────────────────────────

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  plan: string;
}

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCampaigns: number;
  totalSpend: number;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  plan: string;
  is_active: number;
  created_at: string;
}

interface AdminUsersResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

interface ImpersonateResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface BillingOverrideData {
  plan?: string;
  expiry?: string;
}

export const api = {
  // Generic CRUD
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  // Auth lifecycle
  login: async (username: string, password: string) => {
    const envelope = await request<{
      data: {
        accessToken: string;
        refreshToken: string;
        user: User;
      };
    }>('POST', '/auth/login', { username, password });

    // Tokens arrive via Set-Cookie (httpOnly). Only store the user profile
    // for synchronous display (name, role, plan — not a credential).
    const { user } = envelope.data;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return envelope.data;
  },

  register: async (username: string, password: string, email: string) => {
    const envelope = await request<{
      data: {
        accessToken: string;
        refreshToken: string;
        user: User;
      };
    }>('POST', '/auth/register', { username, password, email });

    // Tokens arrive via Set-Cookie (httpOnly). Only store the user profile.
    const { user } = envelope.data;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return envelope.data;
  },

  // Telegram Mini App SSO — exchanges validated initData for our JWT
  telegramLogin: async (initData: string) => {
    const envelope = await request<{
      data: {
        accessToken: string;
        refreshToken: string;
        user: User;
      };
    }>('POST', '/auth/telegram-webapp', { initData });

    // Tokens arrive via Set-Cookie (httpOnly). Only store the user profile.
    localStorage.setItem(USER_KEY, JSON.stringify(envelope.data.user));
    return envelope.data;
  },

  logout: async () => {
    // Revoke the server-side refresh token (sent automatically via the httpOnly
    // refresh cookie on Path=/api/auth), then clear local state.
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch {
      // Best-effort — local clear still proceeds even if the server is down.
    }
    clearAuth();
    window.location.href = '/login';
  },

  // USER_KEY is set on login/register/telegram and cleared on logout.
  // The actual auth is the httpOnly cookie — this is a synchronous UX proxy.
  isAuthenticated: (): boolean => !!localStorage.getItem(USER_KEY),

  getUser: (): User | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // Admin methods
  admin: {
    getStats: () => request<AdminStats>('GET', '/admin/stats'),
    listUsers: (params?: { page?: number; limit?: number; search?: string }) =>
      request<AdminUsersResponse>('GET', `/admin/users?${new URLSearchParams(params as Record<string, string>).toString()}`),
    getUser: (id: string) => request<AdminUser>('GET', `/admin/users/${id}`),
    updateUser: (id: string, data: { role?: string; is_active?: number; email?: string }) =>
      request<AdminUser>('PUT', `/admin/users/${id}`, data),
    deactivateUser: (id: string) => request<AdminUser>('DELETE', `/admin/users/${id}`),
    impersonate: (userId: string) => request<ImpersonateResponse>('POST', `/admin/impersonate/${userId}`),
    billingOverride: (userId: string, data: BillingOverrideData) =>
      request<{ success: boolean; data: { plan: string; expiry: string } }>('POST', `/admin/billing/${userId}`, data),
  },
};