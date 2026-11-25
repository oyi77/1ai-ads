import { Link } from 'react-router-dom';

const FEATURES = [
  'Generator copy & visual iklan dengan AI',
  'Manajemen kampanye Meta Ads dalam satu dashboard',
  'Analitik, fatigue creative, dan A/B test',
  'Landing page & audience intelligence',
  'Akses penuh selamanya — bayar sekali',
];

export function PricingPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '4rem 1.25rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em', fontSize: '0.8rem', textTransform: 'uppercase' }}>
          AdForge
        </p>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '0.5rem 0' }}>
          Paket Lifetime — Rp 99.000
        </h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 2rem' }}>
          Bayar sekali, pakai selamanya. Cocok untuk owner bisnis dan marketer yang ingin menjalankan iklan Meta tanpa langganan bulanan.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto 2rem', maxWidth: 420, textAlign: 'left' }}>
          {FEATURES.map((f) => (
            <li key={f} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-color, #2a2a3a)' }}>
              ✓ {f}
            </li>
          ))}
        </ul>
        <Link
          to="/login?next=%2Fbilling"
          style={{
            display: 'inline-block',
            padding: '0.9rem 2.2rem',
            borderRadius: 999,
            background: 'var(--accent, #f5a623)',
            color: '#111',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Masuk &amp; Beli Sekarang
        </Link>
        <p style={{ marginTop: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted, #8888aa)' }}>
          Setelah masuk, pilih paket Pro di halaman Billing untuk menyelesaikan pembayaran QRIS.
        </p>
      </div>
    </main>
  );
}
