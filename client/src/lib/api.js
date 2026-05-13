// LocalStorage key migration: support old 'adforge_*' keys for existing sessions
function migrateLSKey(oldKey, newKey) {
  const val = localStorage.getItem(oldKey);
  if (val) {
    localStorage.setItem(newKey, val);
    localStorage.removeItem(oldKey);
  }
  return localStorage.getItem(newKey);
}

const LS = {
  TOKEN: '1ai-ads_token',
  REFRESH: '1ai-ads_refresh_token',
  USER: '1ai-ads_user',
};

// One-time migration on load
migrateLSKey('adforge_token', LS.TOKEN);
migrateLSKey('adforge_refresh_token', LS.REFRESH);
migrateLSKey('adforge_user', LS.USER);

const BASE = '/api';

async function request(method, path, body, isRetry = false) {
  const headers = { 'Content-Type': 'application/json' };

  const token = localStorage.getItem(LS.TOKEN);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  
  if (res.status === 401 && !isRetry && !path.includes('/auth/')) {
    const refreshed = await api.refreshToken();
    if (refreshed) {
      return request(method, path, body, true);
    }
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),

  async login(username, password) {
    const res = await request('POST', '/auth/login', { username, password });
    localStorage.setItem(LS.TOKEN, res.data.accessToken);
    localStorage.setItem(LS.REFRESH, res.data.refreshToken);
    localStorage.setItem(LS.USER, res.data.user.username);
    window.dispatchEvent(new CustomEvent('auth-change'));
    return res;
  },

  async register(username, password, email) {
    const res = await request('POST', '/auth/register', { username, password, email });
    localStorage.setItem(LS.TOKEN, res.data.accessToken);
    localStorage.setItem(LS.REFRESH, res.data.refreshToken);
    localStorage.setItem(LS.USER, res.data.user.username);
    window.dispatchEvent(new CustomEvent('auth-change'));
    return res;
  },

  async refreshToken() {
    const refreshToken = localStorage.getItem(LS.REFRESH);
    if (!refreshToken) {
      this.logout();
      return false;
    }

    try {
      const res = await fetch(`${BASE}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem(LS.TOKEN, data.data.accessToken);
        localStorage.setItem(LS.REFRESH, data.data.refreshToken);
        return true;
      }
    } catch (e) {
      console.error('Refresh token failed', e);
    }

    this.logout();
    return false;
  },

  logout() {
    localStorage.removeItem(LS.TOKEN);
    localStorage.removeItem(LS.REFRESH);
    localStorage.removeItem(LS.USER);
    window.dispatchEvent(new CustomEvent('auth-change'));
  },

  isAuthenticated() {
    return !!localStorage.getItem(LS.TOKEN);
  },
};