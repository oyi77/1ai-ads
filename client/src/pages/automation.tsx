import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Zap, Settings, Play, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface Rule {
  id: string;
  name: string;
  type: string;
  condition: unknown;
  action: unknown;
  is_active: number | boolean;
  last_triggered: string | null;
  created_at: string;
}

export function AutomationPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', type: 'auto_pause', condition: '', action: '' });
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [condRows, setCondRows] = useState<Array<{ metric: string; operator: string; value: string }>>([
    { metric: 'roas', operator: '<', value: '1' },
  ]);

  const addCondRow = () => setCondRows(rows => [...rows, { metric: 'spend', operator: '>', value: '' }]);
  const removeCondRow = (i: number) => setCondRows(rows => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows));
  const buildCompound = () => {
    const leaves = condRows
      .filter(r => r.value !== '')
      .map(r => ({ type: r.metric, operator: r.operator, value: isNaN(Number(r.value)) ? r.value : Number(r.value) }));
    return leaves.length === 1 ? leaves[0] : { [matchMode]: leaves };
  };

  // GET /api/automation returns { success, rules: [...] }
  const { data: automationData, isLoading } = useQuery({
    queryKey: ['automation'],
    queryFn: () => api.get<{ success: boolean; rules: Rule[] }>('/automation'),
  });

  // GET /api/optimizer/rules returns { success, data: [...] }
  const { data: optimizerData } = useQuery({
    queryKey: ['optimizer'],
    queryFn: () => api.get<{ success: boolean; data: Rule[] }>('/optimizer/rules'),
  });

  // GET /api/autonomous returns { service, endpoints: [...] }
  const { data: autonomousData } = useQuery({
    queryKey: ['autonomous'],
    queryFn: () => api.get<{ service: string; endpoints: string[] }>('/autonomous'),
  });

  const ruleList: Rule[] = Array.isArray(automationData?.rules) ? automationData.rules : [];

  // API returns condition/action as structured objects ({type, operator, value});
  // rendering an object as a React child crashes the whole page.
  const describeField = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };
  const optimizerRules = Array.isArray(optimizerData?.data) ? optimizerData.data : [];
  const autonomousEnabled = !!autonomousData?.service;

  const createMutation = useMutation({
    mutationFn: (vars: { name: string; type: string; action: string; compound: unknown }) =>
      api.post('/automation/create', { name: vars.name, type: vars.type, action: vars.action, condition: vars.compound }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      setShowCreate(false);
      setNewRule({ name: '', type: 'auto_pause', condition: '', action: '' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/automation/toggle/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation'] }),
  });

  const triggerMutation = useMutation({
    mutationFn: () => api.post('/optimizer/evaluate'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['optimizer'] }),
  });

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Automation & Optimization</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Set rules, auto-optimize campaigns, and enable autonomous mode.
      </p>

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatusCard icon={<Zap size={14} />} label="Auto Optimizer" value={optimizerRules.length > 0 ? 'Active' : 'Ready'} color="var(--accent)" />
        <StatusCard icon={<Settings size={14} />} label="Active Rules" value={String(ruleList.filter(r => r.is_active).length)} color="var(--accent)" />
        <StatusCard icon={<TrendingUp size={14} />} label="Autonomous Mode" value={autonomousEnabled ? 'Available' : 'Disabled'} color={autonomousEnabled ? 'var(--green)' : 'var(--text-tertiary)'} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowCreate(!showCreate)} style={btnStyle}>+ New Rule</button>
        <button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending} style={{ ...btnStyle, background: 'var(--green)' }}>
          {triggerMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run Optimizer Now
        </button>
      </div>

      {/* Create Rule Form */}
      {showCreate && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Create Automation Rule</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Rule name" value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} style={inputStyle} />
            <select value={newRule.type} onChange={e => setNewRule({ ...newRule, type: e.target.value })} style={selectStyle}>
              <option value="auto_pause">Auto Pause Underperformers</option>
              <option value="auto_scale">Auto Scale Winners</option>
              <option value="budget_shift">Budget Shift</option>
              <option value="bid_adjust">Bid Adjustment</option>
              <option value="fatigue_alert">Fatigue Alert</option>
            </select>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>MATCH</span>
                {(['all', 'any'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setMatchMode(m)}
                    style={{ padding: '3px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700,
                      background: matchMode === m ? 'var(--accent-soft)' : 'transparent', color: matchMode === m ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {m === 'all' ? 'ALL (AND)' : 'ANY (OR)'}
                  </button>
                ))}
              </div>
              {condRows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 1fr auto', gap: 6, marginBottom: 6 }}>
                  <select value={row.metric} onChange={e => setCondRows(rows => rows.map((r, j) => j === i ? { ...r, metric: e.target.value } : r))} style={selectStyle}>
                    {['roas', 'spend', 'cpm', 'ctr', 'clicks', 'impressions', 'frequency', 'purchases', 'cpc'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={row.operator} onChange={e => setCondRows(rows => rows.map((r, j) => j === i ? { ...r, operator: e.target.value } : r))} style={selectStyle}>
                    {['<', '<=', '>', '>=', '==', '!='].map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input placeholder="value" value={row.value} onChange={e => setCondRows(rows => rows.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} style={inputStyle} />
                  <button type="button" onClick={() => removeCondRow(i)} disabled={condRows.length <= 1}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: condRows.length <= 1 ? 'default' : 'pointer', fontSize: '0.9rem' }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={addCondRow} style={{ background: 'transparent', border: '1px dashed var(--border-strong)', borderRadius: 6, color: 'var(--accent)', fontSize: '0.72rem', padding: '5px 12px', cursor: 'pointer' }}>
                + Add condition
              </button>
            </div>
            <input placeholder="Action (e.g. pause_adset)" value={newRule.action} onChange={e => setNewRule({ ...newRule, action: e.target.value })} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                  const missing = condRows.some(r => r.value === '');
                  if (missing) return;
                  createMutation.mutate({ ...newRule, compound: buildCompound() });
                }} disabled={createMutation.isPending || !newRule.name || condRows.some(r => r.value === '')} style={btnStyle}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Create Rule
              </button>
              <button onClick={() => setShowCreate(false)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
            </div>
            {createMutation.isError && <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.8rem' }}>{(createMutation.error as Error).message}</p>}
          </div>
        </div>
      )}

      {/* Rules List */}
      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading rules...</p>
      ) : ruleList.length === 0 ? (
        <div style={cardStyle}>
          <AlertTriangle size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No automation rules yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ruleList.map(rule => (
            <div key={rule.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{rule.name}</span>
                  <span style={{
                    padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                    background: rule.is_active ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
                    color: rule.is_active ? 'var(--green)' : 'var(--text-tertiary)',
                  }}>{rule.type || 'rule'}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {describeField(rule.condition) || 'No condition set'}
                  {rule.last_triggered ? ` · Last triggered: ${new Date(rule.last_triggered).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button
                onClick={() => toggleMutation.mutate(rule.id)}
                style={{
                  padding: '4px 12px', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer',
                  background: rule.is_active ? 'rgba(52,211,153,0.1)' : 'transparent',
                  color: rule.is_active ? 'var(--green)' : 'var(--text-tertiary)',
                  border: `1px solid ${rule.is_active ? 'var(--green)' : 'var(--border)'}`,
                }}
              >
                {rule.is_active ? 'Active' : 'Paused'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color }} />
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, marginTop: 8, color }}>{value}</div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const inputStyle: CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', width: '100%',
};

const selectStyle: CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 20,
};
