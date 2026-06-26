const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('1ai-ads_token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !path.includes('/auth/')) {
    localStorage.removeItem('1ai-ads_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json();
  if (!json.success && json.error) throw new Error(json.error);
  return (json.data ?? json) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T,>(path: string) => request<T>('DELETE', path),
};
