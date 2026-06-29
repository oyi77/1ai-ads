import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, ExternalLink, Eye, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  headline: string;
  subheadline: string;
  body: string;
  cta_text: string;
  cta_url: string;
  status: string;
  views: number;
  conversions: number;
  created_at: string;
}

export function LandingPagesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', product_name: '', headline: '', subheadline: '', body: '', cta_text: '', cta_url: '' });

  const { data: pages, isLoading } = useQuery<LandingPage[]>({
    queryKey: ['landing'],
    queryFn: () => api.get<LandingPage[]>('/landing'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/landing', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing'] });
      setShowCreate(false);
      setForm({ name: '', product_name: '', headline: '', subheadline: '', body: '', cta_text: '', cta_url: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/landing/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landing'] }),
  });

  const list = Array.isArray(pages) ? pages : [];

  const columns: Column<LandingPage>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 200, render: (p) => (
      <span style={{ fontWeight: 600 }}>{p.name}</span>
    )},
    { key: 'status', label: 'Status', sortable: true, width: 100, render: (p) => (
      <span style={{
        padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
        background: p.status === 'published' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
        color: p.status === 'published' ? 'var(--green)' : 'var(--text-tertiary)',
      }}>{p.status || 'draft'}</span>
    )},
    { key: 'headline', label: 'Template', width: 200, render: (p) => (
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.headline || 'No headline'}</span>
    )},
    { key: 'created_at', label: 'Created', sortable: true, width: 120, render: (p) => (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
    )},
    { key: '_actions', label: 'Actions', width: 140, render: (p) => (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
        <span><Eye size={10} /> {p.views ?? 0}</span>
        {p.slug && (
          <a href={`/t/${p.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
            <ExternalLink size={10} /> View
          </a>
        )}
        <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(p.id); }} style={{ padding: '2px 4px', background: 'transparent', color: 'var(--text-tertiary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          <Trash2 size={10} />
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Landing Pages</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Build and manage landing pages for your ad campaigns.
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={btnStyle}>
          <Plus size={14} /> New Landing Page
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Create Landing Page</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Page name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Product name" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} style={inputStyle} />
            <input placeholder="CTA URL (https://...)" value={form.cta_url} onChange={e => setForm({ ...form, cta_url: e.target.value })} style={inputStyle} />
            <input placeholder="Headline" value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })} style={inputStyle} />
            <input placeholder="CTA Button Text" value={form.cta_text} onChange={e => setForm({ ...form, cta_text: e.target.value })} style={inputStyle} />
            <textarea placeholder="Subheadline" value={form.subheadline} onChange={e => setForm({ ...form, subheadline: e.target.value })} rows={2} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <textarea placeholder="Body content" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={4} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.name} style={btnStyle}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
              </button>
              <button onClick={() => setShowCreate(false)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
            </div>
          </div>
          {createMutation.isError && <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.8rem', marginTop: 8 }}>{(createMutation.error as Error).message}</p>}
        </div>
      )}

      {/* Pages Table */}
      <DataTable
        columns={columns}
        data={list}
        rowKey={p => p.id}
        searchKey="name"
        searchPlaceholder="Search landing pages..."
        isLoading={isLoading}
        emptyMessage="No landing pages yet."
        emptyIcon={<Globe size={32} style={{ color: 'var(--text-tertiary)' }} />}
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
