import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 40, width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 20 }}>Set a new password</h1>

        {!token && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>Missing reset token. Use the link from your email.</p>}

        {done ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 20 }}>Password updated. Sign in with your new password.</p>
            <Link to="/login" style={{ display: 'block', textAlign: 'center', padding: 10, background: 'var(--accent)', color: 'var(--bg-deep)', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>Go to Sign In</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 16 }}>{error}</div>}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
            <button type="submit" disabled={loading || !token}
              style={{ width: '100%', padding: 11, background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', cursor: loading ? 'wait' : 'pointer', opacity: loading || !token ? 0.7 : 1 }}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
