import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)',
      fontFamily: 'var(--font)',
    }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>404</div>
        <h1 style={{ fontSize: '1.2rem', marginBottom: 8 }}>Page not found</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.85rem' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/app"
          style={{
            display: 'inline-block', padding: '10px 24px', background: 'var(--accent)',
            color: 'var(--bg-deep)', borderRadius: 6, fontWeight: 700, textDecoration: 'none',
            fontFamily: 'var(--font)', fontSize: '0.85rem',
          }}
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
