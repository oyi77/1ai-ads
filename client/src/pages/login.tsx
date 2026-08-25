import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function postAuthRedirect() {
    // Skip onboarding if user already has data or previously completed it
    const onboarded = localStorage.getItem('adforge_onboarded');
    if (onboarded) {
      navigate('/app');
      return;
    }
    // Check if user already has connected accounts or campaigns
    try {
      const [accounts, campaigns] = await Promise.all([
        api.get('/settings/accounts'),
        api.get('/campaigns'),
      ]);
      const hasAccounts = Array.isArray(accounts) && accounts.length > 0;
      const hasCampaigns = campaigns && typeof campaigns === 'object' && 'data' in campaigns
        ? (campaigns as { data: unknown[] }).data.length > 0
        : Array.isArray(campaigns) && campaigns.length > 0;
      if (hasAccounts || hasCampaigns) {
        localStorage.setItem('adforge_onboarded', 'true');
        navigate('/app');
      } else {
        navigate('/onboarding');
      }
    } catch {
      // If check fails, go to onboarding
      navigate('/onboarding');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
        setNotice(res?.message || 'If that email is registered, a reset link has been sent.');
        return;
      }
      if (mode === 'register') {
        await api.register(username, password, email);
      } else {
        await api.login(username, password);
      }
      await postAuthRedirect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-deep)', position: 'relative' }}>
      <Link to="/" style={{
        position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center', gap: 6,
        color: 'var(--text-secondary)', fontSize: '0.8rem', textDecoration: 'none', fontFamily: 'var(--font)',
      }}>← Back to AdForge</Link>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 40, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, marginBottom: 12 }}>A</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>Ad<span style={{ color: 'var(--accent)' }}>Forge</span></div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, marginBottom: 20 }}>
              {(['login', 'register'] as const).map(m => (
                <button key={m} type="button" onClick={() => { setMode(m); setError(''); }}
                  style={{ flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 700,
                    background: mode === m ? 'var(--accent-soft)' : 'transparent', color: mode === m ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          {notice && <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 16 }}>{notice}</div>}
          {error && <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 16 }}>{error}</div>}

          {mode === 'forgot' ? (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Account email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required minLength={3}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
              </div>

              {mode === 'register' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
            </>
          )}

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: 11, background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Please wait...' : (mode === 'register' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In')}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          {mode === 'forgot' ? (
            <button type="button" onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font)' }}>
              ← Back to sign in
            </button>
          ) : (
            <button type="button" onClick={() => { setMode('forgot'); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font)' }}>
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
