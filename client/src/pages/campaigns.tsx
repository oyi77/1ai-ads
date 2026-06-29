import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Loader2, Download, Megaphone } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

interface CampaignsResponse {
  success: boolean;
  data: Campaign[];
  total: number;
}

interface SyncResult {
  campaigns: number;
  adsets: number;
  ads: number;
  accounts: { id: string; name: string }[];
}

const columns: Column<Campaign>[] = [
  { key: 'name', label: 'Name', sortable: true, width: 220 },
  { key: 'platform', label: 'Platform', sortable: true, width: 100 },
  { key: 'status', label: 'Status', sortable: true, width: 90, render: (c) => (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
      background: c.status?.toUpperCase() === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
      color: c.status?.toUpperCase() === 'ACTIVE' ? 'var(--green)' : 'var(--text-secondary)',
    }}>{c.status}</span>
  )},
  { key: 'budget', label: 'Budget', sortable: true, align: 'right', render: (c) => `Rp ${(c.budget || 0).toLocaleString('id-ID')}` },
  { key: 'spend', label: 'Spend', sortable: true, align: 'right', render: (c) => `Rp ${(c.spend || 0).toLocaleString('id-ID')}` },
  { key: 'impressions', label: 'Impressions', sortable: true, align: 'right', render: (c) => (c.impressions || 0).toLocaleString() },
  { key: 'clicks', label: 'Clicks', sortable: true, align: 'right', render: (c) => (c.clicks || 0).toLocaleString() },
  { key: 'roas', label: 'ROAS', sortable: true, align: 'right', render: (c) => (
    <span style={{ color: (c.roas || 0) >= 1 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
      {(c.roas || 0).toFixed(2)}x
    </span>
  )},
];

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const { data, isLoading, error } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get<CampaignsResponse>('/campaigns'),
  });

  const rawCampaigns: Campaign[] = Array.isArray(data) ? data as Campaign[] : (data && typeof data === 'object' && 'data' in data) ? (data as CampaignsResponse).data || [] : [];

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ data: SyncResult }>('/campaigns/sync'),
    onMutate: () => setSyncing(true),
    onSuccess: (result) => {
      setSyncResult(result.data);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onSettled: () => setSyncing(false),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Campaigns</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage your ad campaigns across all platforms
          </p>
        </div>
        <button onClick={() => syncMutation.mutate()} disabled={syncing} style={btnStyle}>
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {syncResult && (
        <div style={{ ...cardStyle, marginBottom: 12, background: 'rgba(52,211,153,0.05)', borderColor: 'var(--green)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--green)' }}>
            ✅ Synced: {syncResult.campaigns} campaigns, {syncResult.ads} ads
          </p>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 12 }}>
          Failed to load campaigns. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rawCampaigns}
        rowKey={c => c.id}
        searchKey="name"
        searchPlaceholder="Search campaigns..."
        filterOptions={[
          { key: 'platform', label: 'All Platforms', options: ['meta', 'google', 'tiktok', 'linkedin', 'twitter', 'snapchat', 'pinterest', 'microsoft'] },
          { key: 'status', label: 'All Status', options: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
        ]}
        isLoading={isLoading}
        emptyMessage="No campaigns found. Click Sync Now to load your campaigns."
        emptyIcon={<Megaphone size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 16,
};
