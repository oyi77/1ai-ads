import { useQuery } from '@tanstack/react-query';
import { Link2, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

/** Matches the backend attributionRepo.getDashboard() response */
interface AttributionDashboard {
  campaign_id: string;
  total_ad_spend: number;
  total_revenue: number;
  total_attributions: number;
  roas: number;
}

/** Matches the backend attribution table row from SELECT * */
interface AttributionMatch {
  id: string;
  ad_id?: string;
  campaign_id?: string;
  shopee_order_id?: string;
  shopee_revenue?: number;
  ad_spend?: number;
  match_method?: string;
  matched_at?: string;
}

const matchColumns: Column<AttributionMatch>[] = [
  { key: 'campaign_id', label: 'Campaign', sortable: true, width: 150, render: (m) => (
    <span style={{ fontWeight: 600 }}>{m.campaign_id || '—'}</span>
  )},
  { key: 'shopee_order_id', label: 'Shopee Order', width: 150, render: (m) => (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{m.shopee_order_id || '—'}</span>
  )},
  { key: 'ad_spend', label: 'Ad Spend', sortable: true, align: 'right', render: (m) => `Rp ${(m.ad_spend || 0).toLocaleString('id-ID')}` },
  { key: 'shopee_revenue', label: 'Revenue', sortable: true, align: 'right', render: (m) => `Rp ${(m.shopee_revenue || 0).toLocaleString('id-ID')}` },
  { key: 'roas', label: 'ROAS', align: 'right', render: (m) => {
    const spend = m.ad_spend || 0;
    const rev = m.shopee_revenue || 0;
    return `${spend > 0 ? (rev / spend).toFixed(2) : '0.00'}x`;
  }},
  { key: 'match_method', label: 'Method', width: 100, render: (m) => (
    <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}>{m.match_method || '—'}</span>
  )},
  { key: 'matched_at', label: 'Matched', sortable: true, width: 110, render: (m) => (
    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{m.matched_at ? new Date(m.matched_at).toLocaleDateString() : '—'}</span>
  )},
];

export function AttributionPage() {
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<AttributionDashboard>({
    queryKey: ['attribution-summary'],
    queryFn: async () => {
      try {
        return await api.get<AttributionDashboard>('/attribution/dashboard?campaign_id=default');
      } catch {
        return { campaign_id: 'default', total_ad_spend: 0, total_revenue: 0, total_attributions: 0, roas: 0 };
      }
    },
  });

  const { data: matchesData, isLoading: matchesLoading, error: matchesError } = useQuery({
    queryKey: ['attribution-matches'],
    queryFn: () => api.get<{ matches: AttributionMatch[] }>('/attribution/matches'),
  });

  const matches: AttributionMatch[] = Array.isArray(matchesData?.matches) ? matchesData!.matches : Array.isArray(matchesData) ? matchesData as unknown as AttributionMatch[] : [];
  const totalSpend = summary?.total_ad_spend ?? 0;
  const totalRevenue = summary?.total_revenue ?? 0;
  const totalAttributions = summary?.total_attributions ?? 0;
  const roas = summary?.roas ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Attribution</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Shopee order-to-ad attribution and ROAS tracking</p>
      </div>

      {(summaryError || matchesError) && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load attribution data
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Attributions', value: totalAttributions.toLocaleString(), color: 'var(--accent)', icon: Link2 },
          { label: 'Ad Spend', value: `Rp ${totalSpend.toLocaleString('id-ID')}`, color: 'var(--amber)', icon: DollarSign },
          { label: 'Revenue', value: `Rp ${totalRevenue.toLocaleString('id-ID')}`, color: 'var(--green)', icon: TrendingUp },
          { label: 'ROAS', value: `${roas.toFixed(2)}x`, color: 'var(--purple)', icon: BarChart3 },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: m.color }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <m.icon size={14} style={{ color: m.color }} /> {m.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, marginTop: 8 }}>{summaryLoading ? '—' : m.value}</div>
          </div>
        ))}
      </div>

      {/* Attribution matches table */}
      <DataTable
        columns={matchColumns}
        data={matches}
        rowKey={m => m.id}
        searchKey="campaign_id"
        searchPlaceholder="Search by campaign..."
        isLoading={matchesLoading}
        emptyMessage="No attribution matches yet. Orders matched to ads will appear here."
        emptyIcon={<Link2 size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
