import type { ReactNode } from 'react';
import { api } from '../lib/api';

const boxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
  textAlign: 'center',
  gap: 16,
};

/**
 * Route guard untuk fitur add-on (LP, Content + Social Bridge).
 * Entitlement datang dari /auth/me (server-side); requireAddon tetap
 * otoritatif di API — ini cuma navigasi/upsell, bukan keamanan.
 */
export function RequireAddon({ addon, children }: { addon: string; children: ReactNode }) {
  const user = api.getUser();
  if (user?.role === 'admin' || (user?.addons || []).includes(addon)) {
    return <>{children}</>;
  }
  return (
    <div style={boxStyle}>
      <div style={{ fontSize: '2.5rem' }}>🔒</div>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Fitur Add-on
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 400 }}>
        Ini fitur tambahan di luar paket manage ads. Bos bisa aktifkan add-on-nya
        lewat billing atau hubungi admin, nanti langsung saya bukain.
      </p>
      <a
        href="/billing"
        style={{
          display: 'inline-block',
          padding: '10px 28px',
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: '0.85rem',
          textDecoration: 'none',
          marginTop: 8,
        }}
      >
        Aktifkan Add-on
      </a>
    </div>
  );
}
