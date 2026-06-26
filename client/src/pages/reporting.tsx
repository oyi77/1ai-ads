import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { api } from '../lib/api';

interface PlatformSummary {
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

interface UnifiedReport {
  summary: {
    total_spend: number;
    total_revenue: number;
    avg_roas: number;
    total_conversions: number;
  };
  platforms: PlatformSummary[];
  top_campaigns: {
    id: string;
    name: string;
    platform: string;
    spend: number;
    revenue: number;
    roas: number;
    status: string;
  }[];
}

export function ReportingPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporting-unified'],
    queryFn: () => api.get<UnifiedReport>('/reporting/unified'),
  });

  const handleExport = async () => {
    try {
      const res = await fetch('/api/reports/export/csv', {
        headers: { Authorization: `Bearer ${localStorage.getItem('1ai-ads_token')}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
  };

  const summary = data?.summary;
  const platforms: PlatformSummary[] = Array.isArray(data?.platforms) ? data.platforms : [];
  const topCampaigns = Array.isArray(data?.top_campaigns) ? data.top_campaigns : [];

  const metrics = [
    { label: 'Total Spend', value: summary ? `Rp ${summary.total_spend.toLocaleString('id-ID')}` : '—', icon: DollarSign, color: 'var(--accent)' },
    { label: 'Total Revenue', value: summary ? `Rp ${summary.total_revenue.toLocaleString('id-ID')}` : '—', icon: TrendingUp, color: 'var(--green)' },
    { label: 'Avg ROAS', value: summary ? `${summary.avg_roas.toFixed(2)}x` : '—', icon: Activity, color: 'var(--purple)' },
    { label: 'Conversions', value: summary ? summary.total_conversions.toLocaleString() : '—', icon: BarChart3, color: 'var(--amber)' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Unified Reporting</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cross-platform performance in one view</p>
        </div>
        <button
          onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load reporting data
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: m.color }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <m.icon size={14} style={{ color: m.color }} />
              {m.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, marginTop: 8, letterSpacing: '-0.02em' }}>
              {isLoading ? '—' : m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Platform breakdown */}
      {platforms.length > 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem' }}>Platform Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
            <thead>
              <tr>
                {['Platform', 'Spend', 'Revenue', 'ROAS', 'Impressions', 'Clicks', 'Conversions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platforms.map(p => (
                <tr key={p.platform} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, textTransform: 'capitalize' }}>{p.platform}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(p.spend || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(p.revenue || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: (p.roas || 0) >= 1 ? 'var(--green)' : 'var(--red)' }}>{(p.roas || 0).toFixed(2)}x</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(p.impressions || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(p.clicks || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(p.conversions || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top campaigns */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem' }}>Top Campaigns</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
          <thead>
            <tr>
              {['Campaign', 'Platform', 'Status', 'Spend', 'Revenue', 'ROAS'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : topCampaigns.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No campaigns data</td></tr>
            ) : (
              topCampaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name || c.id}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{c.platform || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                      background: c.status === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
                      color: c.status === 'ACTIVE' ? 'var(--green)' : 'var(--text-secondary)',
                    }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(c.spend || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(c.revenue || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: (c.roas || 0) >= 1 ? 'var(--green)' : 'var(--red)' }}>{(c.roas || 0).toFixed(2)}x</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
