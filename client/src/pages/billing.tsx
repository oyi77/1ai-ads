import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Zap, Loader2, ExternalLink, CreditCard, Receipt } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

// ── Types ─────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  tier: number;
  maxAds: number;
  maxCampaigns: number;
  maxPlatformAccounts: number;
  features: string[];
  amount: number | null;
  currency: string;
}

interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  statusDisplayText?: string;
  checkout_url?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PaymentCreateResponse {
  paymentId: string;
  orderId: string;
  checkoutUrl: string;
  providerOrderId?: string;
  planName: string;
  amount: number;
}

// ── Helpers ───────────────────────────────────────────────────

const fmtIDR = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'completed':
    case 'paid':
      return 'var(--green)';
    case 'pending':
    case 'processing':
      return 'var(--accent)';
    case 'failed':
    case 'cancelled':
      return 'var(--red, #ef4444)';
    default:
      return 'var(--text-tertiary)';
  }
};

const formatLimit = (n: number) => (n === -1 ? 'Tak terbatas' : String(n));

// ── Component ─────────────────────────────────────────────────

export function BillingPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  const currentUser = api.getUser() || { plan: 'free' };
  const currentPlan = (currentUser.plan || 'free').toLowerCase();
  const expiresRaw = (currentUser as { plan_expires_at?: string | null }).plan_expires_at || null;
  const expiryDate = expiresRaw ? new Date(String(expiresRaw)) : null;
  const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000) : null;
  const expirySoon = daysLeft !== null && daysLeft <= 7;
  const expiryText =
    daysLeft !== null && daysLeft >= 0
      ? `berlaku sampai ${expiryDate?.toLocaleDateString('id-ID')} (${daysLeft} hari lagi)`
      : daysLeft !== null
        ? 'segera berakhir'
        : '';

  // ── Queries ─────────────────────────────────────────────────
  // api.get<T> returns the full envelope { success, data }; unwrap via .data

  const { data: plansEnvelope, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ success: boolean; data: Plan[] }>('/payments/plans'),
  });

  const { data: paymentsEnvelope, isLoading: paymentsLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => api.get<{ success: boolean; data: Payment[] }>('/payments'),
  });

  const planList = plansEnvelope?.success && Array.isArray(plansEnvelope.data) ? plansEnvelope.data : [];
  const history = paymentsEnvelope?.success && Array.isArray(paymentsEnvelope.data) ? paymentsEnvelope.data : [];

  // ── Mutation ────────────────────────────────────────────────

  const upgrade = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ success: boolean; data: PaymentCreateResponse }>('/payments', { planId }),
    onSuccess: (envelope) => {
      const data = envelope?.data;
      if (data?.checkoutUrl) {
        setRedirecting(true);
        queryClient.invalidateQueries({ queryKey: ['my-payments'] });
        window.location.href = data.checkoutUrl;
      } else {
        setError('Checkout URL tidak dikembalikan oleh payment provider.');
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Pembayaran gagal'),
  });

  // ── Render ──────────────────────────────────────────────────

  return (
    <div>
      <header style={headerStyle}>
        <div style={titleRowStyle}>
          <CreditCard size={22} color="var(--accent)" />
          <h1 style={titleStyle}>Billing & Subscription</h1>
        </div>
        <p style={subtitleStyle}>
          Plan saat ini:{' '}
          <strong style={{ color: 'var(--accent)', textTransform: 'capitalize' }}>{currentPlan}</strong>
          {expiryText && (
            <span style={{ color: expirySoon ? '#fb923c' : 'var(--text-tertiary)' }}> · {expiryText}</span>
          )}
        </p>
      </header>

      {error && (
        <div role="alert" style={alertErrorStyle}>
          {error}
        </div>
      )}
      {redirecting && (
        <div style={alertInfoStyle}>
          Mengalihkan ke halaman checkout yang aman...
        </div>
      )}

      {/* ── Plan Cards ─────────────────────────────────────────── */}
      <div style={gridStyle}>
        {plansLoading ? (
          <div style={loadingContainerStyle}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Memuat paket...
            </span>
          </div>
        ) : planList.length === 0 ? (
          <div style={loadingContainerStyle}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              Belum ada paket tersedia.
            </span>
          </div>
        ) : (
          planList.map((plan) => {
            const isCurrent = plan.id === `plan_${currentPlan}` || plan.name.toLowerCase() === currentPlan;
            const isPriceable = plan.amount !== null && plan.amount > 0;
            const isEnterprise = plan.tier >= 3;

            return (
              <div
                key={plan.id}
                style={{
                  ...cardStyle,
                  ...(isCurrent ? cardCurrentStyle : {}),
                }}
              >
                <div style={cardHeaderStyle}>
                  {plan.tier >= 2 && <Zap size={18} color="var(--accent)" />}
                  <span style={planNameStyle}>{plan.name}</span>
                  {isCurrent && <span style={currentBadgeStyle}>Aktif</span>}
                </div>

                <div style={priceStyle}>
                  {isPriceable ? fmtIDR(plan.amount as number) : 'Custom'}
                  {isPriceable && <span style={perMonthStyle}>/mo</span>}
                </div>

                <div style={limitsContainerStyle}>
                  <div style={limitRowStyle}>
                    <span style={limitLabelStyle}>Iklan</span>
                    <span style={limitValueStyle}>{formatLimit(plan.maxAds)}</span>
                  </div>
                  <div style={limitRowStyle}>
                    <span style={limitLabelStyle}>Kampanye</span>
                    <span style={limitValueStyle}>{formatLimit(plan.maxCampaigns)}</span>
                  </div>
                  <div style={limitRowStyle}>
                    <span style={limitLabelStyle}>Akun Platform</span>
                    <span style={limitValueStyle}>{formatLimit(plan.maxPlatformAccounts)}</span>
                  </div>
                </div>

                {plan.features.length > 0 && (
                  <ul style={featuresListStyle}>
                    {plan.features.map((f) => (
                      <li key={f} style={featureItemStyle}>
                        <Check size={13} color="var(--green)" style={{ flexShrink: 0 }} />
                        <span>{f.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div style={spacerStyle} />

                {isCurrent ? (
                  <button disabled style={btnActiveStyle}>
                    Paket Aktif
                  </button>
                ) : isPriceable ? (
                  <button
                    onClick={() => {
                      setError('');
                      upgrade.mutate(plan.id);
                    }}
                    disabled={upgrade.isPending || redirecting}
                    style={{
                      ...btnUpgradeStyle,
                      opacity: upgrade.isPending || redirecting ? 0.6 : 1,
                      cursor: upgrade.isPending || redirecting ? 'wait' : 'pointer',
                    }}
                  >
                    {upgrade.isPending ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Memproses...
                      </>
                    ) : (
                      <>
                        <Zap size={14} /> Upgrade ke {plan.name}
                      </>
                    )}
                  </button>
                ) : isEnterprise ? (
                  <a
                    href="https://t.me/adforge_support"
                    target="_blank"
                    rel="noreferrer"
                    style={btnContactStyle}
                  >
                    <ExternalLink size={14} /> Hubungi Sales
                  </a>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* ── Payment History ────────────────────────────────────── */}
      <section style={historySectionStyle}>
        <div style={historyTitleRowStyle}>
          <Receipt size={18} color="var(--text-secondary)" />
          <h2 style={historyTitleStyle}>Riwayat Pembayaran</h2>
        </div>

        {paymentsLoading ? (
          <div style={emptyHistoryStyle}>
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : history.length === 0 ? (
          <div style={emptyHistoryStyle}>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
              Belum ada riwayat pembayaran.
            </p>
          </div>
        ) : (
          <div style={historyContainerStyle}>
            {/* Table Header */}
            <div style={historyHeaderStyle}>
              <span style={{ ...historyCellStyle, flex: '2' }}>Order ID</span>
              <span style={{ ...historyCellStyle, flex: '1.5' }}>Plan</span>
              <span style={{ ...historyCellStyle, flex: '1' }}>Jumlah</span>
              <span style={{ ...historyCellStyle, flex: '1' }}>Tanggal</span>
              <span style={{ ...historyCellStyle, flex: '1', textAlign: 'right' }}>Status</span>
            </div>
            {history.slice(0, 10).map((pay, i) => (
              <div
                key={pay.order_id || pay.id || i}
                style={{
                  ...historyRowStyle,
                  borderBottom: i < Math.min(history.length, 10) - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span
                  style={{
                    ...historyCellStyle,
                    flex: '2',
                    fontFamily: 'monospace',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {pay.order_id}
                </span>
                <span style={{ ...historyCellStyle, flex: '1.5', color: 'var(--text-primary)' }}>
                  {pay.plan_name || pay.plan_id}
                </span>
                <span
                  style={{
                    ...historyCellStyle,
                    flex: '1',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  {fmtIDR(pay.amount)}
                </span>
                <span style={{ ...historyCellStyle, flex: '1', color: 'var(--text-tertiary)' }}>
                  {fmtDate(pay.created_at)}
                </span>
                <span
                  style={{
                    ...historyCellStyle,
                    flex: '1',
                    textAlign: 'right',
                    color: statusColor(pay.status),
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'capitalize',
                  }}
                >
                  {pay.statusDisplayText || pay.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const headerStyle: CSSProperties = { marginBottom: 24 };

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  margin: 0,
};

const alertErrorStyle: CSSProperties = {
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid rgba(248,113,113,0.2)',
  color: 'var(--red, #ef4444)',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: '0.82rem',
  marginBottom: 16,
};

const alertInfoStyle: CSSProperties = {
  background: 'var(--accent-soft)',
  border: '1px solid var(--border)',
  color: 'var(--accent)',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: '0.82rem',
  marginBottom: 16,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
};

const loadingContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '24px 0',
  gridColumn: '1 / -1',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
};

const cardCurrentStyle: CSSProperties = {
  borderColor: 'var(--accent)',
  boxShadow: '0 0 0 1px var(--accent)',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
};

const planNameStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: '1.1rem',
  color: 'var(--text-primary)',
};

const currentBadgeStyle: CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: 'var(--accent)',
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 4,
  background: 'var(--accent-soft)',
  marginLeft: 'auto',
};

const priceStyle: CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: 800,
  color: 'var(--text-primary)',
  marginBottom: 16,
};

const perMonthStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 400,
  color: 'var(--text-tertiary)',
  marginLeft: 4,
};

const limitsContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 16,
  padding: '12px 0',
  borderTop: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
};

const limitRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const limitLabelStyle: CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-secondary)',
};

const limitValueStyle: CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const featuresListStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '0 0 16px',
};

const featureItemStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  fontSize: '0.78rem',
  color: 'var(--text-secondary)',
  marginBottom: 6,
  lineHeight: 1.4,
};

const spacerStyle: CSSProperties = { flex: 1 };

const btnActiveStyle: CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'default',
};

const btnUpgradeStyle: CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--bg-deep)',
  fontWeight: 700,
  fontSize: '0.82rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const btnContactStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '10px 16px',
  borderRadius: 6,
  border: '1px solid var(--border-strong)',
  color: 'var(--text-secondary)',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
};

const historySectionStyle: CSSProperties = { marginTop: 36 };

const historyTitleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
};

const historyTitleStyle: CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: 0,
};

const emptyHistoryStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '24px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const historyContainerStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
};

const historyHeaderStyle: CSSProperties = {
  display: 'flex',
  padding: '10px 16px',
  background: 'var(--bg-surface)',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const historyRowStyle: CSSProperties = {
  display: 'flex',
  padding: '12px 16px',
  fontSize: '0.8rem',
  alignItems: 'center',
};

const historyCellStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
