import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [state, setState] = useState<'verifying' | 'ok' | 'error'>(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(token ? '' : 'Missing verification token.');

  useEffect(() => {
    if (!token) return;
    api.post('/auth/verify-email', { token })
      .then(() => { setState('ok'); localStorage.setItem('adforge_onboarded', 'true'); })
      .catch((err) => { setState('error'); setMessage(err instanceof Error ? err.message : 'Verification failed'); });
  }, [token]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 40, maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 12 }}>
          {state === 'verifying' && 'Verifying your email...'}
          {state === 'ok' && '\u2705 Email verified!'}
          {state === 'error' && '\u26a0\ufe0f Verification problem'}
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>{state === 'ok' ? 'Your account is now active. Sign in to continue.' : message}</p>
        <Link to="/login" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--accent)', color: 'var(--bg-deep)', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>
          Go to Sign In
        </Link>
      </div>
    </div>
  );
}
