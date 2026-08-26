import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Loader2, Bookmark, Plus, X, Trash2, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface SavedAudience {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  description: string | null;
  targeting_json: string | null;
  size_estimate: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface SavedAudiencesResponse {
  success: boolean;
  data: SavedAudience[];
  total: number;
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const iconBtn: CSSProperties = {
  display: 'inline-flex', padding: 6, background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
};

const iconBtnDanger: CSSProperties = {
  ...iconBtn, color: 'var(--red)', borderColor: 'rgba(248,81,73,0.3)',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 16,
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: '0.85rem', outline: 'none',
};

const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)',
};

export function AudiencesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SavedAudience | null>(null);
  const [form, setForm] = useState({ name: '', description: '', platform: 'meta' });
  const [interestQuery, setInterestQuery] = useState('');
  const [interestResults, setInterestResults] = useState<Array<{ id: string; name: string }>>([]);
  const [stackedInterests, setStackedInterests] = useState<Array<{ id: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);

  const searchInterests = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setInterestResults([]); return; }
    setSearching(true);
    try {
      const res = await api.get<Array<{ id: string; name: string }>>(`/campaigns/targeting/search?q=${encodeURIComponent(q)}&type=interest`);
      setInterestResults(Array.isArray(res) ? res : []);
    } catch { setInterestResults([]); }
    finally { setSearching(false); }
  }, []);

  const onInterestQueryChange = (q: string) => {
    setInterestQuery(q);
    window.setTimeout(() => { searchInterests(q); }, 400);
  };

  const stackInterest = (i: { id: string; name: string }) => {
    if (!stackedInterests.some(s => s.id === i.id)) setStackedInterests(s => [...s, i]);
    setInterestResults([]);
    setInterestQuery('');
  };

  const { data, isLoading, error } = useQuery<SavedAudiencesResponse>({
    queryKey: ['saved-audiences'],
    queryFn: () => api.get<SavedAudiencesResponse>('/audiences/saved'),
  });

  const rawAudiences: SavedAudience[] = Array.isArray(data) ? data as SavedAudience[] : (data?.data || []);

  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string; platform: string; targeting?: { interests: Array<{ id: string; name: string }> } }) => {
      if (editing) return api.put<SavedAudience>(`/audiences/saved/${editing.id}`, payload);
      return api.post<SavedAudience>('/audiences/saved', payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saved-audiences'] }); closeForm(); },
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.del(`/audiences/saved/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-audiences'] }),
  });

  const closeForm = useCallback(() => {
    setShowForm(false); setEditing(null);
    setForm({ name: '', description: '', platform: 'meta' });
    setStackedInterests([]); setInterestQuery(''); setInterestResults([]);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    saveMutation.mutate({
      name: form.name,
      description: form.description || undefined,
      platform: form.platform,
      ...(stackedInterests.length ? { targeting: { interests: stackedInterests } } : {}),
    });
  };

  const columns: Column<SavedAudience>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 200 },
    { key: 'platform', label: 'Platform', sortable: true, width: 110 },
    {
      key: 'size_estimate', label: 'Est. Size', sortable: true, align: 'right', width: 110,
      render: (a) => (a.size_estimate != null ? a.size_estimate.toLocaleString('id-ID') : '—'),
    },
    { key: 'source', label: 'Source', sortable: true, width: 100 },
    { key: 'description', label: 'Description', sortable: true, width: 220, render: (a) => a.description || '—' },
    {
      key: 'actions', label: '', width: 90, align: 'right',
      render: (a) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={(e) => { e.stopPropagation(); setEditing(a); setForm({ name: a.name, description: a.description || '', platform: a.platform }); setShowForm(true); }} style={iconBtn} title="Edit"><Pencil size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); delMutation.mutate(a.id); }} style={iconBtnDanger} title="Delete"><Trash2 size={14} /></button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Saved Audiences</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Reusable audience definitions for your campaigns
          </p>
        </div>
        <button onClick={() => { setForm({ name: '', description: '', platform: 'meta' }); setEditing(null); setShowForm(true); }} style={btnStyle}>
          <Plus size={14} /> New Audience
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{editing ? 'Edit Audience' : 'New Audience'}</h2>
            <button type="button" onClick={closeForm} style={iconBtn}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Name *
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Audience name" />
            </label>
            <label style={labelStyle}>
              Platform
              <select style={inputStyle} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </label>
            <label style={labelStyle}>
              Description
              <input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional note" />
            </label>
            <label style={{ ...labelStyle, display: 'block' }}>
              Interest Stack (cari & tumpuk minat audiens)
              <input style={inputStyle} value={interestQuery} onChange={(e) => onInterestQueryChange(e.target.value)} placeholder="Ketik min 3 huruf — mis. fitness, skincare…" />
            </label>
            {searching && <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '-4px 0 6px' }}>Searching…</p>}
            {interestResults.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 140, overflowY: 'auto', marginBottom: 8 }}>
                {interestResults.map(i => (
                  <button key={i.id} type="button" onClick={() => stackInterest(i)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.75rem', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {i.name}
                  </button>
                ))}
              </div>
            )}
            {stackedInterests.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {stackedInterests.map(i => (
                  <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 600 }}>
                    {i.name}
                    <X size={11} style={{ cursor: 'pointer' }} onClick={() => setStackedInterests(s => s.filter(x => x.id !== i.id))} />
                  </span>
                ))}
              </div>
            )}
          </div>
          {saveMutation.isError && (
            <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.8rem' }}>{(saveMutation.error as Error).message}</div>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saveMutation.isPending} style={btnStyle}>
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Audience'}
            </button>
            <button type="button" onClick={closeForm} style={{ ...btnStyle, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Cancel</button>
          </div>
        </form>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 12 }}>
          Failed to load audiences. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rawAudiences}
        rowKey={(a) => a.id}
        searchKey="name"
        searchPlaceholder="Search audiences..."
        isLoading={isLoading}
        emptyMessage="No saved audiences found. Create one to get started."
        emptyIcon={<Bookmark size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
