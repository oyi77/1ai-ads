import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, Send, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Draft {
  id: string;
  name: string;
  type: string;
  content: Record<string, unknown>;
  status: string;
  proposed_by?: string;
  created_at: string;
  updated_at: string;
}

export function DraftsPage() {
  const queryClient = useQueryClient();

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

  const columns: Column<Draft>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 200, render: (d) => (
      <span style={{ fontWeight: 600 }}>{d.name || 'Untitled Draft'}</span>
    )},
    { key: 'type', label: 'Type', sortable: true, width: 100, render: (d) => (
      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600, background: 'rgba(139,146,168,0.1)', color: 'var(--text-tertiary)' }}>{d.type}</span>
    )},
    { key: 'status', label: 'Status', sortable: true, width: 100, render: (d) => (
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{d.status || 'draft'}</span>
    )},
    { key: 'proposed_by', label: 'Proposed By', width: 120, render: (d) => (
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{d.proposed_by || '—'}</span>
    )},
    { key: 'created_at', label: 'Created', sortable: true, width: 110, render: (d) => (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Clock size={10} /> {new Date(d.updated_at || d.created_at).toLocaleDateString()}
      </span>
    )},
    { key: '_actions', label: 'Actions', width: 100, render: (d) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => publishMutation.mutate(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: '0.68rem' }}>
          <Send size={10} /> Publish
        </button>
        <button onClick={() => { if (confirm('Remove this draft?')) deleteMutation.mutate(d.id); }} style={{ padding: '3px 6px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
          <Trash2 size={10} />
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Drafts</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Review and manage your ad drafts</p>
      </div>

      <DataTable
        columns={columns}
        data={list}
        rowKey={d => d.id}
        searchKey="name"
        searchPlaceholder="Search drafts..."
        filterOptions={[{ key: 'type', label: 'All Types', options: ['ad', 'creative', 'campaign'] }, { key: 'status', label: 'All Status', options: ['draft', 'pending', 'approved', 'rejected'] }]}
        isLoading={isLoading}
        emptyMessage="No drafts found"
        emptyIcon={<FileText size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
