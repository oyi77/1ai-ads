import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Loader2, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Template {
  id: string;
  name: string;
  type: 'campaign' | 'adset' | 'audience';
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  campaign: { bg: 'rgba(99,102,241,0.1)', color: 'var(--accent)' },
  adset: { bg: 'rgba(245,158,11,0.1)', color: 'var(--amber)' },
  audience: { bg: 'rgba(52,211,153,0.1)', color: 'var(--green)' },
};

export function TemplatesPage() {
  const queryClient = useQueryClient();
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

  const columns: Column<Template>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 200, render: (t) => (
      <span style={{ fontWeight: 600 }}>{t.name}</span>
    )},
    { key: 'type', label: 'Type', sortable: true, width: 110, render: (t) => {
      const ts = TYPE_STYLE[t.type] || { bg: 'rgba(139,146,168,0.1)', color: 'var(--text-tertiary)' };
      return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600, background: ts.bg, color: ts.color }}>{t.type}</span>;
    }},
    { key: 'category', label: 'Category', width: 120, render: (t) => (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{t.type}</span>
    )},
    { key: 'industry', label: 'Industry', width: 100, render: () => (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>—</span>
    )},
    { key: 'created_at', label: 'Created', sortable: true, width: 110, render: (t) => (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}</span>
    )},
    { key: '_actions', label: '', width: 50, render: (t) => (
      <button onClick={() => deleteMutation.mutate(t.id)} style={{ padding: '4px 6px', background: 'transparent', color: 'var(--text-tertiary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
        <Trash2 size={12} />
      </button>
    )},
  ];

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

      {/* Create Form */}
      {showCreate && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
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
      <DataTable
        columns={columns}
        data={list}
        rowKey={t => t.id}
        searchKey="name"
        searchPlaceholder="Search templates..."
        filterOptions={[{ key: 'type', label: 'All Types', options: ['campaign', 'adset', 'audience'] }]}
        isLoading={isLoading}
        emptyMessage="No templates yet. Create one to reuse campaign configurations."
        emptyIcon={<FileText size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}

const btnStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const inputStyle = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', width: '100%',
};

const selectStyle = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem',
};
