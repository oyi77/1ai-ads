import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trophy, FlaskConical } from 'lucide-react';
import { api } from '../lib/api';
import { StickyTh, HoverTr } from '../components/ScrollableTable';

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

  const statusStyle = (s: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      running: { bg: 'rgba(52,211,153,0.1)', color: 'var(--green)' },
      completed: { bg: 'rgba(99,102,241,0.1)', color: 'var(--accent)' },
      draft: { bg: 'rgba(139,146,168,0.1)', color: 'var(--text-secondary)' },
      paused: { bg: 'rgba(245,158,11,0.1)', color: 'var(--amber)' },
    };
    return map[s] || map.draft;
  };

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

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>Loading tests...</div>
      ) : tests.length === 0 ? (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 48, textAlign: 'center' }}>
          <FlaskConical size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>No A/B tests yet</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: 4 }}>Create your first test to start optimizing</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tests.map(test => {
            const ss = statusStyle(test.status);
            return (
              <div key={test.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{test.name}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: ss.bg, color: ss.color, textTransform: 'capitalize' }}>{test.status}</span>
                    {test.winner_id && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: 'var(--green)', fontSize: '0.7rem', fontWeight: 600 }}>
                        <Trophy size={10} /> Winner detected
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {test.status === 'running' && (
                      <button onClick={() => updateMut.mutate({ id: test.id, action: 'stop' })} style={{ padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--amber)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Pause</button>
                    )}
                    {test.status === 'paused' && (
                      <button onClick={() => updateMut.mutate({ id: test.id, action: 'start' })} style={{ padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--green)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Resume</button>
                    )}
                  </div>
                </div>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem', minWidth: 600 }}>
                    <thead>
                      <tr>
                        {['Variant', 'Impressions', 'Clicks', 'Conversions', 'CTR', 'Spend'].map(h => (
                          <StickyTh key={h} style={{ padding: '10px 20px' }}>{h}</StickyTh>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(test.variants || []).map((v, vi) => (
                        <HoverTr
                          key={v.id}
                          even={vi % 2 === 0}
                          style={{ background: test.winner_id === v.id ? 'rgba(52,211,153,0.04)' : undefined }}
                        >
                          <td style={{ padding: '10px 20px', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {test.winner_id === v.id && <Trophy size={12} style={{ color: 'var(--green)' }} />}
                              {v.name || v.id}
                            </div>
                          </td>
                          <td style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)' }}>{(v.impressions || 0).toLocaleString()}</td>
                          <td style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)' }}>{(v.clicks || 0).toLocaleString()}</td>
                          <td style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)' }}>{(v.conversions || 0).toLocaleString()}</td>
                          <td style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{(v.ctr || 0).toFixed(2)}%</td>
                          <td style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)' }}>Rp {(v.spend || 0).toLocaleString('id-ID')}</td>
                        </HoverTr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {test.confidence != null && (
                  <div style={{ padding: '8px 20px', fontSize: '0.72rem', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)' }}>
                    Statistical confidence: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{test.confidence.toFixed(1)}%</span> &middot; Metric: {test.metric}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
