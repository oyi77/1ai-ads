import { useQuery } from '@tanstack/react-query';
import { BarChart3, Link2, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';

interface AttributionSummary {
  total_conversions: number;
  total_revenue: number;
  attributed_conversions: number;
  unattributed_conversions: number;
  top_sources: { source: string; conversions: number; revenue: number }[];
  top_mediums: { medium: string; conversions: number; revenue: number }[];
}

interface AttributionMatch {
  id: string;
  campaign_name: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  conversion_type: string;
  conversion_value: number;
  attributed_at: string;
  touchpoints: number;
}

export function AttributionPage() {
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['attribution-summary'],
    queryFn: async () => { try { return await api.get<AttributionSummary>('/attribution/dashboard?campaign_id=default'); } catch { return { total_conversions: 0, total_revenue: 0, attributed_conversions: 0, unattributed_conversions: 0, top_sources: [], top_mediums: [] }; } },
  });

  const { data: matchesData, isLoading: matchesLoading, error: matchesError } = useQuery({
    queryKey: ['attribution-matches'],
    queryFn: () => api.get<{ matches: AttributionMatch[] }>('/attribution/matches'),
  });

  const summary = summaryData;
  const matches: AttributionMatch[] = Array.isArray(matchesData?.matches) ? matchesData.matches : Array.isArray(matchesData) ? matchesData : [];
  const topSources = Array.isArray(summary?.top_sources) ? summary.top_sources : [];
  const topMediums = Array.isArray(summary?.top_mediums) ? summary.top_mediums : [];

  const attributionRate = summary && summary.total_conversions > 0
    ? ((summary.attributed_conversions / summary.total_conversions) * 100).toFixed(1)
    : '0.0';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Attribution</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>UTM-based conversion attribution and touchpoint tracking</p>
      </div>

      {(summaryError || matchesError) && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load attribution data
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Conversions', value: summary?.total_conversions?.toLocaleString() ?? '—', color: 'var(--accent)' },
          { label: 'Attributed', value: summary?.attributed_conversions?.toLocaleString() ?? '—', color: 'var(--green)' },
          { label: 'Unattributed', value: summary?.unattributed_conversions?.toLocaleString() ?? '—', color: 'var(--red)' },
          { label: 'Attribution Rate', value: `${attributionRate}%`, color: 'var(--purple)' },
          { label: 'Total Revenue', value: summary ? `Rp ${summary.total_revenue.toLocaleString('id-ID')}` : '—', color: 'var(--amber)' },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: m.color }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, marginTop: 8 }}>{summaryLoading ? '—' : m.value}</div>
          </div>
        ))}
      </div>

      {/* Source / Medium breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={14} style={{ color: 'var(--accent)' }} /> Top Sources
          </div>
          {summaryLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Loading...</div>
          ) : topSources.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>No source data</div>
          ) : (
            <div>
              {topSources.map(s => (
                <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                  <span style={{ fontWeight: 600 }}>{s.source}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{s.conversions} conv &middot; Rp {s.revenue?.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={14} style={{ color: 'var(--purple)' }} /> Top Mediums
          </div>
          {summaryLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Loading...</div>
          ) : topMediums.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>No medium data</div>
          ) : (
            <div>
              {topMediums.map(m => (
                <div key={m.medium} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                  <span style={{ fontWeight: 600 }}>{m.medium}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{m.conversions} conv &middot; Rp {m.revenue?.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attribution matches table */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={14} style={{ color: 'var(--green)' }} /> Conversion Matches
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
          <thead>
            <tr>
              {['Campaign', 'Source', 'Medium', 'UTM Campaign', 'Type', 'Value', 'Touchpoints', 'Date'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matchesLoading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : matches.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No attribution matches</td></tr>
            ) : (
              matches.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{m.campaign_name || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--accent)' }}>{m.utm_source || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{m.utm_medium || '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{m.utm_campaign || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}>{m.conversion_type || '—'}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(m.conversion_value || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{m.touchpoints ?? '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{m.attributed_at ? new Date(m.attributed_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
