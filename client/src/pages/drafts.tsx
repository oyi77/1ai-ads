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
    mutationFn: (id: string) => api.post(`/drafts/${id}/publish`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drafts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/drafts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drafts'] }),
  });

  const list = Array.isArray(drafts) ? drafts : [];
  const filtered = filter === 'all' ? list : list.filter(d => d.type === filter);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Drafts</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Manage your draft campaigns, ads, and content before publishing.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'campaign', 'ad', 'content'].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            ...tabBtn,
            background: filter === t ? 'var(--accent)' : 'transparent',
            color: filter === t ? 'var(--bg-deep)' : 'var(--text-secondary)',
          }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* Drafts */}
      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading drafts...</p>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>
          <FileText size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No drafts found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(draft => (
            <div key={draft.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{draft.name || 'Untitled Draft'}</span>
                  <span style={{
                    padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                    background: 'rgba(245,158,11,0.1)', color: 'var(--amber)',
                  }}>{draft.type || 'draft'}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} /> Updated {draft.updated_at ? new Date(draft.updated_at).toLocaleDateString() : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => publishMutation.mutate(draft.id)} disabled={publishMutation.isPending} style={actionBtn} title="Publish">
                  <Send size={12} /> Publish
                </button>
                <button onClick={() => { if (confirm('Delete draft?')) deleteMutation.mutate(draft.id); }} style={iconBtn} title="Delete">
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
  padding: '4px 10px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
};

const iconBtn: CSSProperties = {
  padding: '4px 8px', background: 'transparent', color: 'var(--text-tertiary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
};
