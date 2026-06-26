import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, Activity, Megaphone } from 'lucide-react';
import { api } from '../lib/api';

interface Campaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<any>('/campaigns'),
  });

  const campaigns: Campaign[] = Array.isArray(data?.campaigns) ? data.campaigns : Array.isArray(data) ? data : [];

  const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
  const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';
  const active = campaigns.filter(c => c.status === 'ACTIVE').length;

  const metrics = [
    { label: 'Total Spend', value: `Rp ${totalSpend.toLocaleString('id-ID')}`, icon: DollarSign, color: 'var(--accent)' },
    { label: 'Revenue', value: `Rp ${totalRevenue.toLocaleString('id-ID')}`, icon: TrendingUp, color: 'var(--green)' },
    { label: 'ROAS', value: `${avgRoas}x`, icon: Activity, color: 'var(--purple)' },
    { label: 'Active Campaigns', value: String(active), icon: Megaphone, color: 'var(--amber)' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Command Center</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>Real-time ad performance overview</p>

      {/* Metric Cards */}
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

      {/* Campaigns Table */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem' }}>
          Recent Campaigns
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
          <thead>
            <tr>
              {['Name', 'Status', 'Spend', 'Revenue', 'ROAS'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No campaigns yet</td></tr>
            ) : (
              campaigns.slice(0, 10).map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name || c.id}</td>
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
