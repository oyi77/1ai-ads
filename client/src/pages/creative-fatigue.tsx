import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { api } from '../lib/api';

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

      {/* Table */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />
          Fatigued Creatives
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
          <thead>
            <tr>
              {['Campaign', 'Platform', 'Severity', 'CTR Drop', 'Frequency', 'Days', 'Signals', 'Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading || isFetching ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Scanning creatives...</td></tr>
            ) : !searched ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Enter an account ID and run a snapshot</td></tr>
            ) : fatigued.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--green)' }}>No fatigued creatives detected</td></tr>
            ) : (
              fatigued.map(c => (
                <tr key={c.creative_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.campaign_name || c.creative_id}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{c.platform || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: severityBg(c.severity), color: severityColor(c.severity) }}>{c.severity}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{c.ctr_drop != null ? `${c.ctr_drop.toFixed(1)}%` : '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{c.frequency?.toFixed(1) ?? '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{c.days_running ?? '—'}</td>
                  <td style={{ padding: '10px 16px', maxWidth: 200 }}>
                    {(c.signals || []).slice(0, 2).map((s, i) => (
                      <span key={i} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: 'rgba(139,146,168,0.1)', color: 'var(--text-secondary)', fontSize: '0.68rem', marginRight: 4, marginBottom: 2 }}>{s}</span>
                    ))}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.recommended_action || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
