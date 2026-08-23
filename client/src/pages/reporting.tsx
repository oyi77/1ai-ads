import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Download, DollarSign, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface ReportingData {
  totals: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number; overallROAS: number };
  byPlatform: { platform: string; spend: number; revenue: number; roas: number; impressions: number; clicks: number; conversions: number; connected: boolean }[];
}

type PlatformRow = ReportingData['byPlatform'][number];

const platformColumns: Column<PlatformRow>[] = [
  { key: 'platform', label: 'Platform', sortable: true, width: 160, render: (p) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{p.platform}</span>
      {!p.connected && (
        <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>Coming soon</span>
      )}
    </span>
  )},
  { key: 'spend', label: 'Spend', sortable: true, align: 'right', render: (p) => `Rp ${(p.spend || 0).toLocaleString('id-ID')}` },
  { key: 'revenue', label: 'Revenue', sortable: true, align: 'right', render: (p) => `Rp ${(p.revenue || 0).toLocaleString('id-ID')}` },
  { key: 'roas', label: 'ROAS', sortable: true, align: 'right', render: (p) => `${(p.roas || 0).toFixed(2)}x` },
  { key: 'impressions', label: 'Impressions', sortable: true, align: 'right', render: (p) => (p.impressions || 0).toLocaleString() },
  { key: 'clicks', label: 'Clicks', sortable: true, align: 'right', render: (p) => (p.clicks || 0).toLocaleString() },
];

export function ReportingPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporting-unified'],
    queryFn: () => api.get<ReportingData>('/reporting/unified/dashboard'),
  });

  const handleExport = async () => {
    const token = localStorage.getItem('1ai-ads_token');
    const res = await fetch('/api/reports/export/csv', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'report.csv'; a.click();
  };

  const totals = data?.totals;
  const platforms = Array.isArray(data?.byPlatform) ? data.byPlatform : [];

  const metrics = [
    { label: 'Total Spend', value: totals ? `Rp ${totals.spend.toLocaleString('id-ID')}` : '—', icon: DollarSign, color: 'var(--accent)' },
    { label: 'Total Revenue', value: totals ? `Rp ${totals.revenue.toLocaleString('id-ID')}` : '—', icon: TrendingUp, color: 'var(--green)' },
    { label: 'Avg ROAS', value: totals ? `${(totals.overallROAS || 0).toFixed(2)}x` : '—', icon: Activity, color: 'var(--purple)' },
    { label: 'Conversions', value: totals ? totals.conversions.toLocaleString() : '—', icon: BarChart3, color: 'var(--amber)' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Unified Reporting</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cross-platform performance in one view</p>
        </div>
        <button onClick={handleExport} style={btnStyle}><Download size={14} /> Export CSV</button>
      </div>

      {error && <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.85rem', marginBottom: 16 }}>Failed to load: {(error as Error).message}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: m.color }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <m.icon size={14} style={{ color: m.color }} /> {m.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, marginTop: 8 }}>{isLoading ? '—' : m.value}</div>
          </div>
        ))}
      </div>

      <DataTable
        columns={platformColumns}
        data={platforms}
        rowKey={p => p.platform}
        searchKey="platform"
        searchPlaceholder="Search platforms..."
        filterOptions={[{ key: 'platform', label: 'All Platforms', options: platforms.map(p => p.platform) }]}
        isLoading={isLoading}
        emptyMessage="No platform data"
      />
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};
