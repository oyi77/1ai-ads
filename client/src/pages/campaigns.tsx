import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function CampaignsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<any>('/campaigns'),
  });

  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : Array.isArray(data) ? data : [];


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Campaigns</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manage your ad campaigns</p>
        </div>
        <button style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
          + New Campaign
        </button>
      </div>

      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
          <thead>
            <tr>
              {['Name', 'Platform', 'Status', 'Budget', 'Spend', 'ROAS'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No campaigns yet</td></tr>
            ) : (
              campaigns.map((c: any) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name || c.id}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{c.platform || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: c.status === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)', color: c.status === 'ACTIVE' ? 'var(--green)' : 'var(--text-secondary)' }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(c.budget || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(c.spend || 0).toLocaleString('id-ID')}</td>
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
