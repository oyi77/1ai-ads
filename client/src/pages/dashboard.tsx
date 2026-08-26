import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { DollarSign, TrendingUp, Activity, Megaphone, Wifi, WifiOff, Rocket } from 'lucide-react';
import { api } from '../lib/api';
import { GettingStarted } from '../components/GettingStarted';
import { useRealtime } from '../hooks/useRealtime';
import { ScrollableTable, StickyTh, HoverTr } from '../components/ScrollableTable';

interface Campaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
}

function MetricCard({ m, isLoading }: { m: { label: string; value: string; icon: React.ElementType; color: string }; isLoading: boolean }) {
  const [hovered, setHovered] = useState(false);
  const Icon = m.icon;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
        cursor: 'default',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: m.color }} />
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={14} style={{ color: m.color }} />
        {m.label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, marginTop: 8, letterSpacing: '-0.02em' }}>
        {isLoading ? '—' : m.value}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<unknown>('/campaigns'),
  });

  const { connected, lastUpdate, metricCount } = useRealtime();

  const raw: unknown = data;
  let campaigns: Campaign[] = [];
  if (Array.isArray(raw)) campaigns = raw as Campaign[];
  else if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as Record<string, unknown>).data)) campaigns = (raw as Record<string, Campaign[]>).data;
  else if (raw && typeof raw === 'object' && 'campaigns' in raw && Array.isArray((raw as Record<string, unknown>).campaigns)) campaigns = (raw as Record<string, Campaign[]>).campaigns;
  campaigns = [...campaigns].sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));

  const totalSpend = campaigns.reduce((s, c) => s + Number(c.spend || 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + Number(c.revenue || 0), 0);
  const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';
  const active = campaigns.filter(c => c.status?.toUpperCase() === 'ACTIVE').length;

  const metrics = [
    { label: 'Total Spend', value: `Rp ${totalSpend.toLocaleString('id-ID')}`, icon: DollarSign, color: 'var(--accent)' },
    { label: 'Revenue', value: `Rp ${totalRevenue.toLocaleString('id-ID')}`, icon: TrendingUp, color: 'var(--green)' },
    { label: 'ROAS', value: `${avgRoas}x`, icon: Activity, color: 'var(--purple)' },
    { label: 'Active Campaigns', value: String(active), icon: Megaphone, color: 'var(--amber)' },
  ];
  const [showGuide, setShowGuide] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Command Center</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Real-time ad performance overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: connected ? 'var(--green)' : 'var(--text-tertiary)' }}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{connected ? `Live — ${metricCount} campaigns tracked` : 'Connecting...'}</span>
          {lastUpdate && <span style={{ color: 'var(--text-tertiary)' }}>· {new Date(lastUpdate).toLocaleTimeString()}</span>}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 16 }}>
          Failed to load data. Please try again.
        </div>
      )}

      {(showGuide || (campaigns.length === 0 && !localStorage.getItem('adforge_guide_dismissed'))) && <GettingStarted />}

      {/* Tutorial button — always visible so users can re-access guidance */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -16 }}>
        <button
          onClick={() => setShowGuide(true)}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
            fontSize: '0.65rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font)',
          }}
          title="Tampilkan panduan memulai"
        >
          📖 Panduan Memulai
        </button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {metrics.map(m => (
          <MetricCard key={m.label} m={m} isLoading={isLoading} />
        ))}
      </div>

      {/* Campaigns Table */}
      <ScrollableTable>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Top Campaigns by Spend</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{campaigns.length} total</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem', minWidth: 800 }}>
          <thead>
            <tr>
              {['Name', 'Status', 'Spend', 'Revenue', 'Impressions', 'Clicks', 'ROAS'].map(h => (
                <StickyTh key={h}>{h}</StickyTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No campaigns yet</td></tr>
            ) : (
              campaigns.slice(0, 15).map((c, i) => (
                <HoverTr key={c.id} even={i % 2 === 0}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name || c.id}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                      background: c.status?.toUpperCase() === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
                      color: c.status?.toUpperCase() === 'ACTIVE' ? 'var(--green)' : 'var(--text-secondary)',
                    }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {Number(c.spend || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {Number(c.revenue || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(c.impressions || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(c.clicks || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: (Number(c.roas) || 0) >= 1 ? 'var(--green)' : 'var(--red)' }}>{(Number(c.roas) || 0).toFixed(2)}x</td>
                </HoverTr>
              ))
            )}
          </tbody>
        </table>
      </ScrollableTable>
    </div>
  );
}
