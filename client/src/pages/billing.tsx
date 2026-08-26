import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Zap } from 'lucide-react';
import { api } from '../lib/api';

interface Plan {
  id: string;
  name: string;
  tier: number;
  maxCampaigns: number;
  features: string[];
  amount: number | null;
  currency: string;
}

const fmtIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

interface Payment {
  order_id: string;
  status: string;
  amount: number;
}

export function BillingPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  const currentUser = api.getUser() || { plan: 'free' };
  const currentPlan = (currentUser.plan || 'free').toLowerCase();
  const expiresRaw = (currentUser as { plan_expires_at?: string | null }).plan_expires_at || null;
  // plan_expires_at rides on the user record; api.getUser returns the stored copy —
  // refresh via /auth/me equivalent is unnecessary for display purposes here.
  const expiryDate = expiresRaw ? new Date(String(expiresRaw)) : null;
  const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000) : null;
  const expirySoon = daysLeft !== null && daysLeft <= 7;
  const expiryText = daysLeft !== null && daysLeft >= 0
    ? `berlaku sampai ${expiryDate?.toLocaleDateString('id-ID')} (${daysLeft} hari lagi)`
    : daysLeft !== null ? 'segera berakhir' : '';

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/payments/plans'),
  });

  const { data: payments } = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => api.get<Payment[]>('/payments'),
  });

  const upgrade = useMutation({
    mutationFn: (planId: string) => api.post<{ checkoutUrl: string; orderId: string }>('/payments', { planId }),
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        setRedirecting(true);
        window.location.href = data.checkoutUrl;
      } else {
        setError('Checkout URL not returned by payment provider.');
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Payment failed'),
  });

  const planList = Array.isArray(plans) ? plans : [];
  const history = Array.isArray(payments) ? payments : [];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Billing</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          You are on the <strong style={{ color: 'var(--accent)' }}>{currentPlan}</strong> plan.
          {expiryText && <span style={{ color: expirySoon ? '#fb923c' : 'var(--text-tertiary)' }}> · {expiryText}</span>}
        </p>
      </div>

      {error && <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, fontSize: '0.82rem', marginBottom: 16 }}>{error}</div>}
      {redirecting && <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '10px 14px', borderRadius: 6, fontSize: '0.82rem', marginBottom: 16 }}>Redirecting to secure checkout...</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {(planList.length > 0 ? planList : [{ id: 'plan_pro', name: 'Pro', tier: 2, maxCampaigns: 10, features: [], amount: null, currency: 'IDR' }]).map(p => {
          const isCurrent = p.id === `plan_${currentPlan}`;
          const priceable = p.amount != null && p.amount > 0;
          return (
            <div key={p.id} style={{
              background: 'var(--bg-elevated)', border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 12, padding: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {p.tier >= 2 && <Zap size={16} color="var(--accent)" />}
                <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.name}</span>
                {isCurrent && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Current</span>}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0' }}>
                {priceable ? fmtIDR(p.amount as number) : 'Custom'}
                {priceable && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>/mo</span>}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 20px', minHeight: 60 }}>
                {p.features.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <Check size={12} color="var(--green)" /> {f.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled style={{ width: '100%', padding: 9, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '0.8rem', cursor: 'default' }}>
                  Active
                </button>
              ) : priceable && p.tier > (currentPlan === 'free' ? 1 : 0) && p.id !== 'plan_free' ? (
                <button
                  onClick={() => upgrade.mutate(p.id)}
                  disabled={upgrade.isPending || redirecting}
                  style={{ width: '100%', padding: 9, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 700, fontSize: '0.8rem', cursor: upgrade.isPending ? 'wait' : 'pointer' }}
                >
                  {upgrade.isPending ? 'Preparing checkout...' : `Upgrade to ${p.name}`}
                </button>
              ) : p.tier === 3 ? (
                <a href="https://t.me/adforge_support" target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: 9, borderRadius: 6, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: '0.8rem', textDecoration: 'none' }}>
                  Contact sales
                </a>
              ) : null}
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Payment history</h2>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {history.slice(0, 10).map((pay, i) => (
              <div key={pay.order_id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < Math.min(history.length, 10) - 1 ? '1px solid var(--border)' : 'none', fontSize: '0.8rem' }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{pay.order_id}</span>
                <span>{fmtIDR(pay.amount)}</span>
                <span style={{ color: pay.status === 'completed' || pay.status === 'paid' ? 'var(--green)' : 'var(--text-tertiary)' }}>{pay.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
