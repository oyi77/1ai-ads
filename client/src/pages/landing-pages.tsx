import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, ExternalLink, Eye, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

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
  const [form, setForm] = useState({ name: '', headline: '', subheadline: '', body: '', cta_text: '', cta_url: '' });

  const { data: pages, isLoading } = useQuery<LandingPage[]>({
    queryKey: ['landing'],
    queryFn: () => api.get<LandingPage[]>('/landing'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/landing', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing'] });
      setShowCreate(false);
      setForm({ name: '', headline: '', subheadline: '', body: '', cta_text: '', cta_url: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/landing/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landing'] }),
  });

  const list = Array.isArray(pages) ? pages : [];

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
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Create Landing Page</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Page name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
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

      {/* Pages List */}
      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading...</p>
      ) : list.length === 0 ? (
        <div style={cardStyle}>
          <Globe size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No landing pages yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {list.map(page => (
            <div key={page.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                  background: page.status === 'published' ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
                  color: page.status === 'published' ? 'var(--green)' : 'var(--text-tertiary)',
                }}>{page.status || 'draft'}</span>
                <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(page.id); }} style={iconBtn}>
                  <Trash2 size={12} />
                </button>
              </div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>{page.name}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{page.headline || 'No headline'}</p>
              <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                <span><Eye size={10} /> {page.views ?? 0} views</span>
                <span>{page.conversions ?? 0} conversions</span>
              </div>
              {page.slug && (
                <a href={`/t/${page.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ExternalLink size={10} /> View Page
                </a>
              )}
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

const inputStyle: CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', width: '100%',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 20,
};

const iconBtn: CSSProperties = {
  padding: '4px 6px', background: 'transparent', color: 'var(--text-tertiary)',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};
