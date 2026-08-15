import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Loader2, Layers, Plus, X, Trash2, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface AdSet {
  id: string;
  campaign_id: string;
  platform: string;
  name: string;
  status: string;
  daily_budget: number;
  optimization_goal: string | null;
  billing_event: string | null;
  created_at: string;
}

interface AdsetsResponse {
  success: boolean;
  data: AdSet[];
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

export function AdsetsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdSet | null>(null);
  const [form, setForm] = useState({ campaignId: '', name: '', status: 'PAUSED', dailyBudget: '' });

  const { data, isLoading, error } = useQuery<AdsetsResponse>({
    queryKey: ['adsets'],
    queryFn: () => api.get<AdsetsResponse>('/adsets'),
  });

  const rawAdSets: AdSet[] = Array.isArray(data) ? data as AdSet[] : (data?.data || []);

  const saveMutation = useMutation({
    mutationFn: (payload: { campaignId: string; name: string; status: string; dailyBudget: number }) => {
      if (editing) return api.put<AdSet>(`/adsets/${editing.id}`, payload);
      return api.post<AdSet>('/adsets', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adsets'] });
      closeForm();
    },
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.del(`/adsets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adsets'] }),
  });

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ campaignId: '', name: '', status: 'PAUSED', dailyBudget: '' });
    setShowForm(true);
  }, []);

  const openEdit = useCallback((a: AdSet) => {
    setEditing(a);
    setForm({
      campaignId: a.campaign_id,
      name: a.name,
      status: a.status || 'PAUSED',
      dailyBudget: String(a.daily_budget || ''),
    });
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setForm({ campaignId: '', name: '', status: 'PAUSED', dailyBudget: '' });
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaignId || !form.name) return;
    saveMutation.mutate({
      campaignId: form.campaignId,
      name: form.name,
      status: form.status,
      dailyBudget: Number(form.dailyBudget) || 0,
    });
  };

  const columns: Column<AdSet>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 200 },
    { key: 'campaign_id', label: 'Campaign ID', sortable: true, width: 180 },
    {
      key: 'status', label: 'Status', sortable: true, width: 110,
      render: (a) => (
        <span style={{
          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12,
          background: a.status === 'ACTIVE' ? 'rgba(52,211,153,0.15)' : 'rgba(248,81,73,0.15)',
          color: a.status === 'ACTIVE' ? 'var(--green)' : 'var(--red)',
        }}>{a.status}</span>
      ),
    },
    {
      key: 'daily_budget', label: 'Daily Budget', sortable: true, align: 'right', width: 120,
      render: (a) => `Rp ${(a.daily_budget || 0).toLocaleString('id-ID')}`,
    },
    { key: 'optimization_goal', label: 'Optimization', sortable: true, width: 140, render: (a) => a.optimization_goal || '—' },
    {
      key: 'actions', label: '', width: 90, align: 'right',
      render: (a) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(a); }} style={iconBtn} title="Edit"><Pencil size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); delMutation.mutate(a.id); }} style={iconBtnDanger} title="Delete"><Trash2 size={14} /></button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Ad Sets</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage ad sets under your campaigns
          </p>
        </div>
        <button onClick={openCreate} style={btnStyle}>
          <Plus size={14} /> New Ad Set
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{editing ? 'Edit Ad Set' : 'New Ad Set'}</h2>
            <button type="button" onClick={closeForm} style={iconBtn}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Campaign ID *
              <input style={inputStyle} value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })} placeholder="e.g. 120245609300050428" />
            </label>
            <label style={labelStyle}>
              Name *
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ad set name" />
            </label>
            <label style={labelStyle}>
              Status
              <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="PAUSED">PAUSED</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label style={labelStyle}>
              Daily Budget (IDR)
              <input style={inputStyle} type="number" min="0" value={form.dailyBudget} onChange={(e) => setForm({ ...form, dailyBudget: e.target.value })} placeholder="0" />
            </label>
          </div>
          {saveMutation.isError && (
            <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.8rem' }}>{(saveMutation.error as Error).message}</div>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saveMutation.isPending} style={btnStyle}>
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Ad Set'}
            </button>
            <button type="button" onClick={closeForm} style={{ ...btnStyle, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Cancel</button>
          </div>
        </form>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 12 }}>
          Failed to load ad sets. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rawAdSets}
        rowKey={(a) => a.id}
        searchKey="name"
        searchPlaceholder="Search ad sets..."
        isLoading={isLoading}
        emptyMessage="No ad sets found. Create one to get started."
        emptyIcon={<Layers size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
