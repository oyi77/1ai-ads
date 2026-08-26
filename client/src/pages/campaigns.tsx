import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Loader2, Download, Megaphone, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import { CampaignWizard } from '../components/CampaignWizard';
import type { Column } from '../components/DataTable';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  roas: number | null;
}

interface SyncResult {
  campaigns: number;
  adsets: number;
  ads: number;
}

const btnStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontFamily: 'var(--font)', fontSize: '0.8rem',
  fontWeight: 700, cursor: 'pointer',
};
const syncBtnStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-strong)', borderRadius: 6, fontFamily: 'var(--font)',
  fontSize: '0.8rem', cursor: 'pointer',
};
const smallBtnStyle: CSSProperties = {
  padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
  background: 'transparent', fontSize: '0.65rem', cursor: 'pointer',
};

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get<CampaignsResponse>('/campaigns'),
  });

  let rawCampaigns: Campaign[] = [];
  if (Array.isArray(data)) {
    rawCampaigns = data;
  } else if (data && 'data' in data && Array.isArray(data.data)) {
    rawCampaigns = data.data;
  }

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ data: SyncResult }>('/campaigns/sync'),
    onMutate: () => setSyncing(true),
    onSuccess: (result) => {
      setSyncResult(result.data);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onSettled: () => setSyncing(false),
  });

  const rowAction = async (id: string, action: 'pause' | 'activate' | 'duplicate') => {
    setRowBusy(id + action);
    try {
      if (action === 'duplicate') await api.post(`/campaigns/${id}/duplicate`);
      else await api.post(`/campaigns/${id}/${action}`);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } catch { /* surfaced by refetch */ }
    finally { setRowBusy(null); }
  };

  const columns: Column<Campaign>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 220 },
    { key: 'platform', label: 'Platform', sortable: true, width: 100 },
    {
      key: 'status', label: 'Status', sortable: true, width: 90,
      render: (c) => (
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
          background: c.status?.toUpperCase() === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
          color: c.status?.toUpperCase() === 'ACTIVE' ? 'var(--green)' : 'var(--text-secondary)',
        }}>{c.status}</span>
      ),
    },
    { key: 'budget', label: 'Budget', sortable: true, align: 'right' as const, render: (c) => `Rp ${(c.budget || 0).toLocaleString('id-ID')}` },
    { key: 'spend', label: 'Spend', sortable: true, align: 'right' as const, render: (c) => `Rp ${(c.spend || 0).toLocaleString('id-ID')}` },
    { key: 'impressions', label: 'Impressions', sortable: true, align: 'right' as const, render: (c) => (c.impressions || 0).toLocaleString() },
    { key: 'clicks', label: 'Clicks', sortable: true, align: 'right' as const, render: (c) => (c.clicks || 0).toLocaleString() },
    {
      key: 'roas', label: 'ROAS', sortable: true, align: 'right' as const,
      render: (c) => (
        <span style={{ color: (c.roas || 0) >= 1 ? 'var(--green)' : '#ef4444', fontWeight: 600 }}>
          {(c.roas || 0).toFixed(2)}x
        </span>
      ),
    },
    {
      key: 'actions', label: 'Actions', width: 170,
      render: (c) => (
        <span style={{ display: 'flex', gap: 4 }}>
          {(c.status || '').toUpperCase() === 'ACTIVE' ? (
            <button onClick={() => rowAction(c.id, 'pause')} disabled={rowBusy === c.id + 'pause'}
              style={{ ...smallBtnStyle, color: '#fb923c' }}>
              ⏸ Pause
            </button>
          ) : (
            <button onClick={() => rowAction(c.id, 'activate')} disabled={rowBusy === c.id + 'activate'}
              style={{ ...smallBtnStyle, color: 'var(--green)' }}>
              ▶ Activate
            </button>
          )}
          <button onClick={() => rowAction(c.id, 'duplicate')} disabled={rowBusy === c.id + 'duplicate'}
            title="Duplikat campaign (PAUSED)"
            style={{ ...smallBtnStyle, color: 'var(--text-secondary)' }}>
            ⧉ Copy
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Campaigns</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage your ad campaigns across all platforms
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowWizard(true)} style={btnStyle}>
            <Plus size={14} /> New Campaign
          </button>
          <button onClick={() => syncMutation.mutate()} disabled={syncing} style={syncBtnStyle}>
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid var(--green)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--green)', margin: 0 }}>
            ✅ Synced: {syncResult.campaigns} campaigns, {syncResult.ads} ads
          </p>
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', padding: 12, marginBottom: 12 }}>
          Failed to load campaigns. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rawCampaigns}
        rowKey={(c) => c.id}
        searchKey="name"
        searchPlaceholder="Search campaigns..."
        filterOptions={[
          { key: 'platform', label: 'All Platforms', options: ['meta', 'google', 'tiktok', 'linkedin', 'twitter', 'snapchat', 'pinterest', 'microsoft'] },
          { key: 'status', label: 'All Status', options: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
        ]}
        isLoading={isLoading}
        emptyMessage="No campaigns yet. Click New Campaign to create one, or Sync Now to import."
        emptyIcon={<Megaphone size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />

      {showWizard && (
        <CampaignWizard
          onDone={() => {
            setShowWizard(false);
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          }}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

interface CampaignsResponse {
  success: boolean;
  data: Campaign[];
  total: number;
}
