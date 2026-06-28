import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.login(username, password);
      const onboarded = localStorage.getItem('adforge_onboarded');
      navigate(onboarded ? '/app' : '/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 40, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, marginBottom: 12 }}>A</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>Ad<span style={{ color: 'var(--accent)' }}>Forge</span></div>
        </div>

        {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: 11, background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
