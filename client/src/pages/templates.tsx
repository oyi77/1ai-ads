import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, Search, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface Template {
  id: string;
  name: string;
  type: 'campaign' | 'adset' | 'audience';
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'campaign' | 'adset' | 'audience'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<{ name: string; type: 'campaign' | 'adset' | 'audience'; data: string }>({ name: '', type: 'campaign', data: '{}' });

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/templates'),
  });

  const createMutation = useMutation({
    mutationFn: (tpl: { name: string; type: string; data: Record<string, unknown> }) =>
      api.post('/templates', tpl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowCreate(false);
      setNewTemplate({ name: '', type: 'campaign', data: '{}' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const list = Array.isArray(templates) ? templates : [];
  const filtered = filter === 'all' ? list : list.filter(t => t.type === filter);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Templates</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Reusable templates for campaigns, ad sets, and audiences.
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={btnStyle}>
          <Plus size={14} /> New Template
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'campaign', 'adset', 'audience'] as const).map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            ...tabBtn,
            background: filter === t ? 'var(--accent)' : 'transparent',
            color: filter === t ? 'var(--bg-deep)' : 'var(--text-secondary)',
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Create Template</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Template name"
              value={newTemplate.name}
              onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })}
              style={inputStyle}
            />
            <select
              value={newTemplate.type}
              onChange={e => setNewTemplate({ ...newTemplate, type: e.target.value as 'campaign' | 'adset' | 'audience' })}
              style={selectStyle}
            >
              <option value="campaign">Campaign Template</option>
              <option value="adset">Ad Set Template</option>
              <option value="audience">Audience Template</option>
            </select>
            <textarea
              placeholder='Template data (JSON) — e.g. {"objective":"CONVERSIONS","budget":50000}'
              value={newTemplate.data}
              onChange={e => setNewTemplate({ ...newTemplate, data: e.target.value })}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                try {
                  const parsed = JSON.parse(newTemplate.data);
                  createMutation.mutate({ name: newTemplate.name, type: newTemplate.type, data: parsed });
                } catch {
                  alert('Invalid JSON in template data');
                }
              }} disabled={createMutation.isPending || !newTemplate.name} style={btnStyle}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
              </button>
              <button onClick={() => setShowCreate(false)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            </div>
            {createMutation.isError && (
              <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.8rem' }}>{(createMutation.error as Error).message}</p>
            )}
          </div>
        </div>
      )}

      {/* Templates List */}
      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading templates...</p>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>
          <FileText size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            No templates yet. Create one to reuse campaign configurations.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(tpl => (
            <div key={tpl.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                    background: tpl.type === 'campaign' ? 'rgba(99,102,241,0.1)' :
                      tpl.type === 'adset' ? 'rgba(245,158,11,0.1)' : 'rgba(52,211,153,0.1)',
                    color: tpl.type === 'campaign' ? 'var(--accent)' :
                      tpl.type === 'adset' ? 'var(--amber)' : 'var(--green)',
                  }}>{tpl.type}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => deleteMutation.mutate(tpl.id)} style={iconBtn}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>{tpl.name}</h3>
              <pre style={{
                fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)',
                background: 'var(--bg-deep)', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 100,
                margin: 0,
              }}>
                {JSON.stringify(tpl.data, null, 2)}
              </pre>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
                Updated: {tpl.updated_at ? new Date(tpl.updated_at).toLocaleDateString() : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const tabBtn: CSSProperties = {
  padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6,
  fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem',
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

const iconBtn: CSSProperties = {
  padding: '4px 6px', background: 'transparent', color: 'var(--text-tertiary)',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};
