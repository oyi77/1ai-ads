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
      const response = await fetch(`${API_BASE}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const envelope = await response.json();
      setTokens(envelope.data.accessToken, envelope.data.refreshToken);
      // refresh envelope carries no user payload; preserve existing USER_KEY
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
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !retried) {
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

    const { accessToken, refreshToken, user } = envelope.data;
    setTokens(accessToken, refreshToken);
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

    const { accessToken, refreshToken, user } = envelope.data;
    setTokens(accessToken, refreshToken);
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

    setTokens(envelope.data.accessToken, envelope.data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(envelope.data.user));
    return envelope.data;
  },

  logout: () => {
    clearAuth();
    window.location.href = '/login';
  },

  isAuthenticated: (): boolean => !!localStorage.getItem(TOKEN_KEY),

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