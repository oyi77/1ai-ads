import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trophy, FlaskConical } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Variant {
  id: string;
  name: string;
  creative_id: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  spend: number;
}

interface ABTest {
  id: string;
  name: string;
  status: string;
  metric: string;
  variants: Variant[];
  winner_id?: string;
  created_at: string;
  confidence?: number;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  running: { bg: 'rgba(52,211,153,0.1)', color: 'var(--green)' },
  completed: { bg: 'rgba(99,102,241,0.1)', color: 'var(--accent)' },
  draft: { bg: 'rgba(139,146,168,0.1)', color: 'var(--text-secondary)' },
  paused: { bg: 'rgba(245,158,11,0.1)', color: 'var(--amber)' },
};

export function ABTestsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', metric: 'ctr', variant_a: '', variant_b: '' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['ab-tests'],
    queryFn: () => api.get<ABTest[]>('/testing/ab-tests'),
  });

  const createMut = useMutation({
    mutationFn: (payload: { name: string; metric: string; variants: { name: string }[] }) =>
      api.post('/testing/ab-tests', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
      setForm({ name: '', metric: 'ctr', variant_a: '', variant_b: '' });
      setShowForm(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' }) =>
      api.post(`/testing/ab-tests/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ab-tests'] }),
  });

  const tests: ABTest[] = Array.isArray(data) ? data : [];

  const columns: Column<ABTest>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 180, render: (t) => (
      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.name}</span>
    )},
    { key: 'metric', label: 'Metric', sortable: true, width: 110 },
    { key: 'status', label: 'Status', sortable: true, width: 100, render: (t) => {
      const ss = STATUS_STYLES[t.status] || STATUS_STYLES.draft;
      return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: ss.bg, color: ss.color, textTransform: 'capitalize' }}>{t.status}</span>;
    }},
    { key: 'winner', label: 'Winner', width: 150, render: (t) => {
      if (!t.winner_id) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
      const winner = t.variants?.find(v => v.id === t.winner_id);
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: 'var(--green)', fontSize: '0.7rem', fontWeight: 600 }}>
          <Trophy size={10} /> {winner?.name || t.winner_id}
        </span>
      );
    }},
    { key: 'created_at', label: 'Created', sortable: true, width: 100, render: (t) => (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</span>
    )},
    { key: '_actions', label: 'Actions', width: 80, render: (t) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {t.status === 'running' && (
          <button onClick={() => updateMut.mutate({ id: t.id, action: 'stop' })} style={{ padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--amber)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>Pause</button>
        )}
        {t.status === 'paused' && (
          <button onClick={() => updateMut.mutate({ id: t.id, action: 'start' })} style={{ padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--green)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>Resume</button>
        )}
      </div>
    )},
    { key: '_details', label: 'Variants', width: 380, render: (t) => (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', minWidth: 360 }}>
          <thead>
            <tr>
              {['Variant', 'Impr.', 'Clicks', 'Conv.', 'CTR', 'Spend'].map(h => (
                <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', fontSize: '0.65rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(t.variants || []).map(v => (
              <tr key={v.id} style={{ background: t.winner_id === v.id ? 'rgba(52,211,153,0.04)' : undefined }}>
                <td style={{ padding: '3px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {t.winner_id === v.id && <Trophy size={10} style={{ color: 'var(--green)', marginRight: 4, verticalAlign: 'middle' }} />}
                  {v.name || v.id}
                </td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)' }}>{(v.impressions || 0).toLocaleString()}</td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)' }}>{(v.clicks || 0).toLocaleString()}</td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)' }}>{(v.conversions || 0).toLocaleString()}</td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{(v.ctr || 0).toFixed(2)}%</td>
                <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)' }}>Rp {(v.spend || 0).toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {t.confidence != null && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
            Confidence: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{t.confidence.toFixed(1)}%</span>
          </div>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>A/B Tests</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Run controlled experiments and pick winners with confidence</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <Plus size={14} /> New Test
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Create A/B Test</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Test Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Headline test v1"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Success Metric</label>
              <select
                value={form.metric}
                onChange={e => setForm({ ...form, metric: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              >
                <option value="ctr">CTR</option>
                <option value="conversion_rate">Conversion Rate</option>
                <option value="cpa">CPA</option>
                <option value="roas">ROAS</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Variant A</label>
              <input
                value={form.variant_a}
                onChange={e => setForm({ ...form, variant_a: e.target.value })}
                placeholder="Control creative"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Variant B</label>
              <input
                value={form.variant_b}
                onChange={e => setForm({ ...form, variant_b: e.target.value })}
                placeholder="Challenger creative"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
            <button
              onClick={() => createMut.mutate({
                name: form.name,
                metric: form.metric,
                variants: [
                  { name: form.variant_a || 'Variant A' },
                  { name: form.variant_b || 'Variant B' },
                ],
              })}
              disabled={!form.name || createMut.isPending}
              style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: !form.name ? 0.5 : 1 }}
            >{createMut.isPending ? 'Creating...' : 'Create Test'}</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load A/B tests
        </div>
      )}

      <DataTable
        columns={columns}
        data={tests}
        rowKey={t => t.id}
        searchKey="name"
        searchPlaceholder="Search tests..."
        filterOptions={[{ key: 'status', label: 'All Status', options: ['running', 'completed', 'draft', 'paused'] }]}
        isLoading={isLoading}
        emptyMessage="No A/B tests yet. Create your first test to start optimizing."
        emptyIcon={<FlaskConical size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
