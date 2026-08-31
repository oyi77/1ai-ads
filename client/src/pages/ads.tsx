import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Ad {
  id: string;
  name: string;
  platform: string;
  status: string;
  hook: string;
  body: string;
  cta: string;
  created_at: string;
}

interface Creative {
  id: string;
  hook: string;
  body: string;
  cta: string;
  tags: string[];
}

interface CreativeResponse {
  success: boolean;
  data: Creative[];
}

const columns: Column<Ad>[] = [
  { key: 'name', label: 'Name', sortable: true, width: 200 },
  { key: 'platform', label: 'Platform', sortable: true, width: 100 },
  { key: 'status', label: 'Status', sortable: true, width: 90, render: (ad) => (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
      background: ad.status === 'active' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
      color: ad.status === 'active' ? 'var(--green)' : 'var(--text-secondary)',
    }}>{ad.status}</span>
  )},
  { key: 'hook', label: 'Hook', sortable: false, width: 250, render: (ad) => (
    <span style={{ color: 'var(--text-secondary)' }}>{ad.hook || '—'}</span>
  )},
  { key: 'cta', label: 'CTA', sortable: true, width: 120, render: (ad) => (
    <span style={{ padding: '2px 6px', background: 'rgba(88,166,255,0.1)', borderRadius: 4, fontSize: '0.72rem' }}>
      {ad.cta || '—'}
    </span>
  )},
  { key: 'created_at', label: 'Created', sortable: true, width: 120, render: (ad) => (
    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
      {ad.created_at ? new Date(ad.created_at).toLocaleDateString() : '—'}
    </span>
  )},
];

export function AdsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ ads?: Ad[]; data?: Ad[] } | Ad[]>({
    queryKey: ['ads'],
    queryFn: () => api.get('/ads'),
  });

  const _statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/ads/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads'] }),
  });

  const _deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/ads/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads'] }),
  });

  let ads: Ad[] = [];
  if (Array.isArray(data)) ads = data;
  else if (data && 'ads' in data && Array.isArray(data.ads)) ads = data.ads;
  else if (data && 'data' in data && Array.isArray(data.data)) ads = data.data;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Ads Manager</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage your ad creatives across all platforms
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 12 }}>
          Failed to load ads. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={ads}
        rowKey={a => a.id}
        searchKey="name"
        searchPlaceholder="Search ads..."
        filterOptions={[
          { key: 'platform', label: 'All Platforms', options: ['meta', 'google', 'tiktok'] },
          { key: 'status', label: 'All Status', options: ['active', 'paused'] },
        ]}
        isLoading={isLoading}
        emptyMessage="No ads found. Create your first ad from the Creative Library."
        emptyIcon={<Megaphone size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
