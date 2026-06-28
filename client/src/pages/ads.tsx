import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Play, Pause, Trash2, RefreshCw, Filter } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface Ad {
  id: string;
  name: string;
  campaign_id: string;
  adset_id: string;
  status: string;
  creative: {
    title: string;
    body: string;
    image_url: string;
    link_url: string;
  };
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
    cpc: number;
  };
  created_at: string;
}

export function AdsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, error, refetch } = useQuery<{ ads?: Ad[]; data?: Ad[] } | Ad[]>({
    queryKey: ['ads'],
    queryFn: () => api.get<{ ads?: Ad[]; data?: Ad[] } | Ad[]>('/ads'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/ads/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/ads/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads'] }),
  });

  let ads: Ad[] = [];
  if (Array.isArray(data)) ads = data;
  else if (data && 'ads' in data && Array.isArray(data.ads)) ads = data.ads;
  else if (data && 'data' in data && Array.isArray(data.data)) ads = data.data;

  const filtered = statusFilter === 'all' ? ads : ads.filter(a => a.status === statusFilter);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Ads Manager</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Create, manage, and monitor all your ads across platforms.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => refetch()} style={outlineBtn}><RefreshCw size={14} /></button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 16 }}>
          Failed to load data. Please try again.
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Filter size={14} style={{ color: 'var(--text-tertiary)', alignSelf: 'center' }} />
        {['all', 'ACTIVE', 'PAUSED', 'ARCHIVED'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            ...tabBtn,
            background: statusFilter === s ? 'var(--accent)' : 'transparent',
            color: statusFilter === s ? 'var(--bg-deep)' : 'var(--text-secondary)',
          }}>{s === 'all' ? 'All' : s}</button>
        ))}
      </div>

      {/* Ads Table */}
      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading ads...</p>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>
          <Megaphone size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            No ads found. Create ads through the Campaigns page.
          </p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
            <thead>
              <tr>
                {['Name', 'Status', 'Impressions', 'Clicks', 'Spend', 'CTR', 'CPC', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ad => (
                <tr key={ad.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{ad.name || ad.id}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                      background: ad.status === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : ad.status === 'PAUSED' ? 'rgba(245,158,11,0.1)' : 'rgba(139,146,168,0.1)',
                      color: ad.status === 'ACTIVE' ? 'var(--green)' : ad.status === 'PAUSED' ? 'var(--amber)' : 'var(--text-secondary)',
                    }}>{ad.status}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(ad.insights?.impressions ?? 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(ad.insights?.clicks ?? 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(ad.insights?.spend ?? 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(ad.insights?.ctr ?? 0).toFixed(2)}%</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(ad.insights?.cpc ?? 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', display: 'flex', gap: 4 }}>
                    <button onClick={() => statusMutation.mutate({ id: ad.id, status: ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })} style={iconBtn} title={ad.status === 'ACTIVE' ? 'Pause' : 'Activate'}>
                      {ad.status === 'ACTIVE' ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button onClick={() => { if (confirm('Delete this ad?')) deleteMutation.mutate(ad.id); }} style={iconBtn} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const outlineBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 12px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
};

const tabBtn: CSSProperties = {
  padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6,
  fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 40, textAlign: 'center',
};

const iconBtn: CSSProperties = {
  padding: '4px 8px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
};
