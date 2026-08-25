import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Lightbulb, Wrench, ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from '../lib/api';

interface Insights {
  spend: number;
  impressions: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  cpr: number | null;
  roas: number | null;
}
interface Report {
  accountId: string;
  accountName: string;
  summary: Insights;
  comparison: {
    yesterdayFullDay: Insights;
    avg7d: { spend: number; purchases: number; cpr: number | null; roas: number | null };
  };
  ai: { source: string; strengths: string; weaknesses: string; opportunities: string; actions: string; risk: string };
}

interface AdAccount { id: string; name: string; status: string }

const fmtIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n: number) => (n || 0).toLocaleString('id-ID');
const fmtRoas = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}x`);
const fmtCpr = (v: number | null) => (v == null ? '—' : fmtIDR(v));

function Delta({ value, base, invert }: { value: number | null; base: number | null; invert?: boolean }) {
  if (value == null || base == null || base === 0 || value === 0) return <span style={{ color: 'var(--text-tertiary)', fontSize: '0.68rem' }}><Minus size={10} /> no baseline</span>;
  const pct = ((value - base) / Math.abs(base)) * 100;
  const good = invert ? pct < 0 : pct > 0;
  const color = Math.abs(pct) < 5 ? 'var(--text-tertiary)' : good ? 'var(--green)' : 'var(--red)';
  const Icon = Math.abs(pct) < 5 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span style={{ color, fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Icon size={10} /> {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

function MetricCard({ label, value, today, yesterday, avg7d, invert }: {
  label: string; value: string; today: number | null; yesterday: number | null; avg7d?: number | null; invert?: boolean;
}) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, margin: '6px 0 8px' }}>{value}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>vs kemarin <Delta value={today} base={yesterday} invert={invert} /></span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>vs 7d avg <Delta value={today ?? null} base={avg7d ?? null} invert={invert} /></span>
      </div>
    </div>
  );
}

const AI_SECTIONS = [
  { key: 'strengths', icon: ThumbsUp, color: 'var(--green)', title: 'Kekuatan' },
  { key: 'weaknesses', icon: ThumbsDown, color: 'var(--red)', title: 'Kelemahan' },
  { key: 'opportunities', icon: Lightbulb, color: '#fbbf24', title: 'Peluang' },
  { key: 'actions', icon: Wrench, color: 'var(--accent)', title: 'Tindakan yang Disarankan' },
  { key: 'risk', icon: AlertTriangle, color: '#fb923c', title: 'Catatan Risiko' },
] as const;

export function AccountReportsPage() {
  const [accountId, setAccountId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['ad-accounts'],
    queryFn: () => api.get<AdAccount[]>('/campaigns/accounts'),
  });
  const accountList = Array.isArray(accounts) ? accounts : [];
  const selected = accountId || String(accountList[0]?.id ?? '');

  const { data: report, isLoading, error, isFetching } = useQuery({
    queryKey: ['account-report', selected, refreshKey],
    queryFn: () => api.get<Report>(`/reporting/accounts/${selected}/report`),
    enabled: !!selected,
  });

  const sel = accountList.find(a => String(a.id) === selected);

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Account Reports</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Detailed per-account performance with AI analysis. Read-only.
          </p>
        </div>
        <select
          value={selected}
          onChange={e => setAccountId(e.target.value)}
          style={{ padding: '9px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.82rem', outline: 'none', minWidth: 220 }}
        >
          {accountsLoading && <option>Loading accounts…</option>}
          {!accountsLoading && !accountList.length && <option value="">No ad accounts connected</option>}
          {accountList.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
        </select>
      </div>

      {!accountList.length && !accountsLoading && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Connect your Meta account in <a href="/settings" style={{ color: 'var(--accent)' }}>Settings</a> to see reports here.
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '12px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
          {(error as Error).message}
        </div>
      )}

      {(isLoading || isFetching) && !report && selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.85rem', padding: 32, justifyContent: 'center' }}>
          <RefreshCw size={14} className="animate-spin" /> Compiling report + asking the AI analyst…
        </div>
      )}

      {report && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{sel?.name || report.accountName}</h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>act_{report.accountId} · hari ini sampai sekarang (WIB)</span>
            </div>
            <button onClick={() => setRefreshKey(k => k + 1)} disabled={isFetching}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* Metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MetricCard label="Spend" value={fmtIDR(report.summary.spend)} today={report.summary.spend} yesterday={report.comparison.yesterdayFullDay.spend} avg7d={report.comparison.avg7d.spend} />
            <MetricCard label="Link Clicks" value={fmtNum(report.summary.linkClicks)} today={report.summary.linkClicks} yesterday={report.comparison.yesterdayFullDay.linkClicks} />
            <MetricCard label="CTR" value={`${report.summary.ctr.toFixed(2)}%`} today={report.summary.ctr} yesterday={report.comparison.yesterdayFullDay.ctr} />
            <MetricCard label="CPC" value={fmtIDR(report.summary.cpc)} today={report.summary.cpc} yesterday={report.comparison.yesterdayFullDay.cpc} avg7d={null} invert />
            <MetricCard label="Purchases" value={fmtNum(report.summary.purchases)} today={report.summary.purchases} yesterday={report.comparison.yesterdayFullDay.purchases} avg7d={report.comparison.avg7d.purchases} />
            <MetricCard label="CPR" value={fmtCpr(report.summary.cpr)} today={report.summary.cpr} yesterday={report.comparison.yesterdayFullDay.cpr} avg7d={report.comparison.avg7d.cpr} invert />
            <MetricCard label="ROAS" value={fmtRoas(report.summary.roas)} today={report.summary.roas} yesterday={report.comparison.yesterdayFullDay.roas} avg7d={report.comparison.avg7d.roas} />
          </div>

          {/* AI panel */}
          <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.02))', border: '1px solid var(--accent)', borderRadius: 14, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sparkles size={16} color="var(--accent)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Analisis & Rekomendasi AI</h3>
              <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 99, background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                {report.ai.source === 'ai' ? 'AI Generated' : 'Rules Engine'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {AI_SECTIONS.map(({ key, icon: Icon, color, title }) => (
                <div key={key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Icon size={13} color={color} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{title}</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-secondary)', margin: 0 }}>{report.ai[key]}</p>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
            Read-only · Tidak ada iklan yang diubah · Data hari ini belum lengkap (jam berjalan).
          </p>
        </div>
      )}
    </div>
  );
}
