const BASE = '/api';

async function request(method, path, body, isRetry = false) {
  const headers = { 'Content-Type': 'application/json' };

  const token = localStorage.getItem('adforge_token');
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
    localStorage.setItem('adforge_token', res.data.accessToken);
    localStorage.setItem('adforge_refresh_token', res.data.refreshToken);
    localStorage.setItem('adforge_user', res.data.user.username);
    window.dispatchEvent(new CustomEvent('auth-change'));
    return res;
  },

  async register(username, password, email) {
    const res = await request('POST', '/auth/register', { username, password, email });
    localStorage.setItem('adforge_token', res.data.accessToken);
    localStorage.setItem('adforge_refresh_token', res.data.refreshToken);
    localStorage.setItem('adforge_user', res.data.user.username);
    window.dispatchEvent(new CustomEvent('auth-change'));
    return res;
  },

  async refreshToken() {
    const refreshToken = localStorage.getItem('adforge_refresh_token');
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
        localStorage.setItem('adforge_token', data.data.accessToken);
        localStorage.setItem('adforge_refresh_token', data.data.refreshToken);
        return true;
      }
    } catch (e) {
      console.error('Refresh token failed', e);
    }

    this.logout();
    return false;
  },

  logout() {
    localStorage.removeItem('adforge_token');
    localStorage.removeItem('adforge_refresh_token');
    localStorage.removeItem('adforge_user');
    window.dispatchEvent(new CustomEvent('auth-change'));
  },

  isAuthenticated() {
    return !!localStorage.getItem('adforge_token');
  },
};
