const BASE = '/api';

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };

  const token = localStorage.getItem('adforge_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
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
    localStorage.setItem('adforge_user', res.data.user.username);
    return res;
  },

  async register(username, password, email) {
    const res = await request('POST', '/auth/register', { username, password, email });
    localStorage.setItem('adforge_token', res.data.accessToken);
    localStorage.setItem('adforge_user', res.data.user.username);
    return res;
  },

  logout() {
    localStorage.removeItem('adforge_token');
    localStorage.removeItem('adforge_user');
  },

  isAuthenticated() {
    return !!localStorage.getItem('adforge_token');
  },
};
