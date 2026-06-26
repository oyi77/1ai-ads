import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Zap } from 'lucide-react';
import { api } from '../lib/api';

interface AutomationRule {
  id: string;
  name: string;
  is_active: boolean;
  trigger_metric: string;
  trigger_operator: string;
  trigger_value: number;
  action: string;
  created_at: string;
}

export function AutomationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    trigger_metric: 'spend',
    trigger_operator: 'greater_than',
    trigger_value: '',
    action: 'pause',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: () => api.get<AutomationRule[]>('/automation'),
  });

  const createMut = useMutation({
    mutationFn: (payload: Omit<AutomationRule, 'id' | 'created_at' | 'is_active'>) =>
      api.post('/automation', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      setForm({ name: '', trigger_metric: 'spend', trigger_operator: 'greater_than', trigger_value: '', action: 'pause' });
      setShowForm(false);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.post(`/automation/toggle/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-rules'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.post(`/automation/delete/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-rules'] }),
  });

  const rules: AutomationRule[] = Array.isArray(data) ? data : [];

  const metrics = [
    { value: 'spend', label: 'Spend' },
    { value: 'roas', label: 'ROAS' },
    { value: 'ctr', label: 'CTR' },
    { value: 'cpa', label: 'CPA' },
    { value: 'cpc', label: 'CPC' },
    { value: 'impressions', label: 'Impressions' },
  ];

  const operators = [
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'equals', label: '=' },
    { value: 'greater_equal', label: '>=' },
    { value: 'less_equal', label: '<=' },
  ];

  const actions = [
    { value: 'pause', label: 'Pause Campaign' },
    { value: 'alert', label: 'Send Alert' },
    { value: 'reduce_budget', label: 'Reduce Budget' },
    { value: 'increase_budget', label: 'Increase Budget' },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Automation Rules</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Set conditions that trigger actions automatically</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <Plus size={14} /> New Rule
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Create Rule</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Rule Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="High spend alert" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Action</label>
              <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} style={inputStyle}>
                {actions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, background: 'var(--bg-deep)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>WHEN</span>
            <select value={form.trigger_metric} onChange={e => setForm({ ...form, trigger_metric: e.target.value })} style={{ ...inputStyle, width: 'auto', flex: 1 }}>
              {metrics.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={form.trigger_operator} onChange={e => setForm({ ...form, trigger_operator: e.target.value })} style={{ ...inputStyle, width: 70 }}>
              {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input value={form.trigger_value} onChange={e => setForm({ ...form, trigger_value: e.target.value })} placeholder="100000" type="number" style={{ ...inputStyle, width: 120 }} />
            <span style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>THEN</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 700 }}>{actions.find(a => a.value === form.action)?.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
            <button
              onClick={() => createMut.mutate({
                name: form.name,
                trigger_metric: form.trigger_metric,
                trigger_operator: form.trigger_operator,
                trigger_value: Number(form.trigger_value),
                action: form.action,
              })}
              disabled={!form.name || !form.trigger_value || createMut.isPending}
              style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: !form.name || !form.trigger_value ? 0.5 : 1 }}
            >{createMut.isPending ? 'Creating...' : 'Create Rule'}</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load automation rules
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 48, textAlign: 'center' }}>
          <Zap size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>No automation rules</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: 4 }}>Rules let you automate campaign management</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: rule.is_active ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                <div
                  onClick={() => toggleMut.mutate({ id: rule.id, is_active: !rule.is_active })}
                  style={{
                    width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', flexShrink: 0,
                    background: rule.is_active ? 'var(--green)' : 'var(--border)', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 8, background: 'white', position: 'absolute', top: 3,
                    left: rule.is_active ? 21 : 3, transition: 'left 0.2s',
                  }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>{rule.name}</div>
                  <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)' }}>
                    WHEN <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{rule.trigger_metric}</span>{' '}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{operators.find(o => o.value === rule.trigger_operator)?.label || rule.trigger_operator}</span>{' '}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{rule.trigger_value?.toLocaleString()}</span>
                    {' '}THEN <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{rule.action?.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { if (confirm('Delete this rule?')) deleteMut.mutate(rule.id); }}
                style={{ padding: '6px 8px', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}
                title="Delete rule"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
