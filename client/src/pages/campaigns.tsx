import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { RefreshCw, Loader2, Download } from 'lucide-react';
import { api } from '../lib/api';

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

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const { data, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get<CampaignsResponse>('/campaigns'),
  });

  const rawCampaigns: Campaign[] = Array.isArray(data) ? data as Campaign[] : (data && typeof data === 'object' && 'data' in data) ? (data as CampaignsResponse).data || [] : [];
  const campaigns = [...rawCampaigns].sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ data: SyncResult }>('/campaigns/sync'),
    onMutate: () => setSyncing(true),
    onSuccess: (result) => {
      setSyncResult(result.data);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSyncing(false);
    },
    onError: () => setSyncing(false),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Campaigns</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage your ad campaigns — synced from Meta Ads Manager
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncing}
            style={btnStyle}
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {syncing ? 'Syncing from Meta...' : 'Sync from Meta'}
          </button>
        </div>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div style={{ ...cardStyle, marginBottom: 16, background: 'rgba(52,211,153,0.05)', borderColor: 'var(--green)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 600 }}>
            ✅ Synced: {syncResult.campaigns} campaigns, {syncResult.adsets} ad sets, {syncResult.ads} ads
            {syncResult.accounts?.length > 0 && ` from ${syncResult.accounts.map(a => a.name).join(', ')}`}
          </p>
        </div>
      )}

      {syncMutation.isError && (
        <div style={{ ...cardStyle, marginBottom: 16, background: 'rgba(239,68,68,0.05)', borderColor: 'var(--error, #ef4444)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--error, #ef4444)' }}>
            ❌ Sync failed: {(syncMutation.error as Error).message}
          </p>
        </div>
      )}

      {/* Campaigns Table */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
          <thead>
            <tr>
              {['Name', 'Platform', 'Status', 'Budget', 'Spend', 'Impressions', 'Clicks', 'ROAS'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: 12 }}>
                    No campaigns found. Click &quot;Sync from Meta&quot; to load your campaigns.
                  </p>
                  <button onClick={() => syncMutation.mutate()} disabled={syncing} style={btnStyle}>
                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    {syncing ? 'Syncing...' : 'Sync from Meta'}
                  </button>
                </td>
              </tr>
            ) : (
              campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name || c.id}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{c.platform || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                      background: c.status?.toUpperCase() === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
                      color: c.status?.toUpperCase() === 'ACTIVE' ? 'var(--green)' : 'var(--text-secondary)',
                    }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(c.budget || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>Rp {(c.spend || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(c.impressions || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{(c.clicks || 0).toLocaleString()}</td>
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

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 16,
};
