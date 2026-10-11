import type { ReactNode } from 'react';
import { api } from '../lib/api';

const upgradeBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
  textAlign: 'center',
  gap: 16,
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: 6,
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

/**
 * Paid = pro OR enterprise. Lifetime buyers are granted `enterprise`, so a
 * bare `plan === 'pro'` check locked them out of every Pro surface they paid
 * for. Mirrors the server rule in middleware/rbac.js requirePlan (hierarchical
 * rank: enterprise 2 > pro 1 > free 0).
 */
export function isPaidPlan(user: { plan?: string } | null | undefined) {
  return user?.plan === 'pro' || user?.plan === 'enterprise';
}

export function ProBadge({ compact }: { compact?: boolean }) {
  return (
    <span style={{ ...badgeStyle, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
      {compact ? 'PRO' : 'Pro'}
    </span>
  );
}

export function AdminBadge() {
  return (
    <span style={{ ...badgeStyle, background: 'rgba(234,179,8,0.15)', color: '#facc15' }}>
      Admin
    </span>
  );
}

export function PlanBadge() {
  const user = api.getUser();
  if (!user) return null;
  if (user.role === 'admin') return <AdminBadge />;
  if (user.plan === 'enterprise') {
    return (
      <span style={{ ...badgeStyle, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
        Lifetime
      </span>
    );
  }
  if (user.plan === 'pro') return <ProBadge />;
  return (
    <span style={{ ...badgeStyle, background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
      Free
    </span>
  );
}

export function RequirePro({ children }: { children: ReactNode }) {
  const user = api.getUser();
  if (user?.role === 'admin' || isPaidPlan(user)) {
    return <>{children}</>;
  }
  return (
    <div style={upgradeBox}>
      <div style={{ fontSize: '2.5rem' }}>🔒</div>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Pro Feature
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 400 }}>
        This feature requires a Pro plan. Upgrade to unlock AI agent, automation rules,
        A/B testing, attribution, and audience intelligence.
      </p>
      <a
        href="/settings"
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
        Upgrade to Pro
      </a>
    </div>
  );
}
