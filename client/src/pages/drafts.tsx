import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, Send, Clock } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface Draft {
  id: string;
  name: string;
  type: string;
  content: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export function DraftsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data: drafts, isLoading } = useQuery<Draft[]>({
    queryKey: ['drafts'],
    queryFn: () => api.get<Draft[]>('/drafts'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.post(`/drafts/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drafts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/drafts/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drafts'] }),
  });

  const list = Array.isArray(drafts) ? drafts : [];
  const filtered = filter === 'all' ? list : list.filter(d => d.type === filter);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Drafts</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Review and manage your ad drafts</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'ad', 'creative', 'campaign'].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            ...tabBtn,
            background: filter === t ? 'var(--accent)' : 'transparent',
            color: filter === t ? 'var(--bg-deep)' : 'var(--text-secondary)',
          }}>{t === 'all' ? 'All' : t}</button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading drafts...</p>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>
          <FileText size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No drafts found</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(draft => (
            <div key={draft.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                  background: 'rgba(139,146,168,0.1)', color: 'var(--text-tertiary)',
                }}>{draft.type}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} /> {new Date(draft.updated_at || draft.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>{draft.name || 'Untitled Draft'}</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                Status: {draft.status || 'draft'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => publishMutation.mutate(draft.id)} style={actionBtn}>
                  <Send size={12} /> Publish
                </button>
                <button onClick={() => { if (confirm('Remove this draft?')) deleteMutation.mutate(draft.id); }} style={iconBtn}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const tabBtn: CSSProperties = {
  padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6,
  fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 20,
};

const actionBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem',
};

const iconBtn: CSSProperties = {
  padding: '6px 8px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
};
