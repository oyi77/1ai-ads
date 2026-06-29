import { useQuery } from '@tanstack/react-query';
import { BarChart3, Link2, TrendingUp, DollarSign } from 'lucide-react';
import { api } from '../lib/api';
import { ScrollableTable, StickyTh, HoverTr } from '../components/ScrollableTable';

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
      <ScrollableTable>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={14} style={{ color: 'var(--green)' }} /> Attribution Matches
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem', minWidth: 800 }}>
          <thead>
            <tr>
              {['Campaign', 'Shopee Order', 'Ad Spend', 'Revenue', 'ROAS', 'Method', 'Matched'].map(h => (
                <StickyTh key={h}>{h}</StickyTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {matchesLoading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : matches.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No attribution matches yet. Orders matched to ads will appear here.</td></tr>
            ) : (
              matches.map((m, i) => {
                const spend = m.ad_spend || 0;
                const rev = m.shopee_revenue || 0;
                const rowRoas = spend > 0 ? (rev / spend).toFixed(2) : '0.00';
                return (
                  <HoverTr key={m.id} even={i % 2 === 0}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{m.campaign_id || '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{m.shopee_order_id || '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {spend.toLocaleString('id-ID')}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {rev.toLocaleString('id-ID')}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{rowRoas}x</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}>{m.match_method || '—'}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{m.matched_at ? new Date(m.matched_at).toLocaleDateString() : '—'}</td>
                  </HoverTr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollableTable>
    </div>
  );
}
