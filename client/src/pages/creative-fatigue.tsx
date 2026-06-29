import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface FatiguedCreative {
  creative_id: string;
  campaign_name: string;
  platform: string;
  severity: 'critical' | 'warning';
  signals: string[];
  recommended_action: string;
  ctr_drop: number;
  frequency: number;
  days_running: number;
}

const severityColor = (s: string) => s === 'critical' ? 'var(--red)' : 'var(--amber)';
const severityBg = (s: string) => s === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';

const columns: Column<FatiguedCreative>[] = [
  { key: 'campaign_name', label: 'Campaign', sortable: true, width: 180, render: (c) => (
    <span style={{ fontWeight: 600 }}>{c.campaign_name || c.creative_id}</span>
  )},
  { key: 'platform', label: 'Platform', sortable: true, width: 100, render: (c) => (
    <span style={{ color: 'var(--text-secondary)' }}>{c.platform || '—'}</span>
  )},
  { key: 'severity', label: 'Severity', sortable: true, width: 100, render: (c) => (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: severityBg(c.severity), color: severityColor(c.severity) }}>{c.severity}</span>
  )},
  { key: 'ctr_drop', label: 'CTR Drop', sortable: true, align: 'right', render: (c) => (
    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{c.ctr_drop != null ? `${c.ctr_drop.toFixed(1)}%` : '—'}</span>
  )},
  { key: 'frequency', label: 'Frequency', sortable: true, align: 'right', render: (c) => (
    <span style={{ fontFamily: 'var(--font-mono)' }}>{c.frequency?.toFixed(1) ?? '—'}</span>
  )},
  { key: 'days_running', label: 'Days', sortable: true, align: 'right', render: (c) => (
    <span style={{ fontFamily: 'var(--font-mono)' }}>{c.days_running ?? '—'}</span>
  )},
  { key: 'signals', label: 'Signals', width: 200, render: (c) => (
    <span>
      {(c.signals || []).slice(0, 2).map((s, j) => (
        <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: 'rgba(139,146,168,0.1)', color: 'var(--text-secondary)', fontSize: '0.68rem', marginRight: 4, marginBottom: 2 }}>{s}</span>
      ))}
    </span>
  )},
  { key: 'recommended_action', label: 'Action', width: 150, render: (c) => (
    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.recommended_action || '—'}</span>
  )},
];

export function CreativeFatiguePage() {
  const [accountId, setAccountId] = useState('');
  const [searched, setSearched] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['creative-fatigue', accountId],
    queryFn: () => api.get<FatiguedCreative[]>(`/creative/fatigue/detect/${accountId}`),
    enabled: false,
  });

  const handleDetect = () => {
    if (!accountId.trim()) return;
    setSearched(true);
    refetch();
  };

  const fatigued: FatiguedCreative[] = Array.isArray(data) ? data : [];
  const critical = fatigued.filter(c => c.severity === 'critical');
  const warnings = fatigued.filter(c => c.severity === 'warning');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Creative Fatigue</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Detect underperforming creatives before they drain budget</p>
        </div>
      </div>

      {/* Snapshot trigger */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Account ID</label>
            <input
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              placeholder="Enter Meta/Google account ID"
              onKeyDown={e => e.key === 'Enter' && handleDetect()}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={handleDetect}
            disabled={!accountId.trim() || isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: !accountId.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            <Zap size={14} /> {isFetching ? 'Scanning...' : 'Run Snapshot'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to detect fatigue. Check account ID and try again.
        </div>
      )}

      {/* Summary cards */}
      {searched && !isLoading && fatigued.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--red)' }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Critical</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, marginTop: 8, color: 'var(--red)' }}>{critical.length}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--amber)' }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Warning</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, marginTop: 8, color: 'var(--amber)' }}>{warnings.length}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--accent)' }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Flagged</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, marginTop: 8 }}>{fatigued.length}</div>
          </div>
        </div>
      )}

      {searched && !isLoading && !error && fatigued.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
          <AlertTriangle size={32} style={{ marginBottom: 8 }} />
          <p style={{ fontSize: '0.85rem' }}>No fatigue detected. Your creatives are performing well.</p>
        </div>
      )}

      {/* Table */}
      {searched && (
        <DataTable
          columns={columns}
          data={fatigued}
          rowKey={c => c.creative_id}
          searchKey="campaign_name"
          searchPlaceholder="Search campaigns..."
          filterOptions={[{ key: 'severity', label: 'All Severity', options: ['critical', 'warning'] }, { key: 'platform', label: 'All Platforms', options: [...new Set(fatigued.map(c => c.platform).filter(Boolean))] }]}
          isLoading={isLoading || isFetching}
          emptyMessage="No fatigued creatives detected"
          emptyIcon={<AlertTriangle size={32} style={{ color: 'var(--text-tertiary)' }} />}
        />
      )}
    </div>
  );
}
