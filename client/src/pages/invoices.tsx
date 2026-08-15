import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Loader2, FileText, Plus, X, CheckCircle2, Ban } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Invoice {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

interface InvoicesResponse {
  success: boolean;
  data: Invoice[];
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--amber)', paid: 'var(--green)', overdue: 'var(--red)', cancelled: 'var(--text-tertiary)',
};

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const iconBtn: CSSProperties = {
  display: 'inline-flex', padding: 6, background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
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

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '' });

  const { data, isLoading, error } = useQuery<InvoicesResponse>({
    queryKey: ['invoices'],
    queryFn: () => api.get<InvoicesResponse>('/invoices'),
  });

  const rawInvoices: Invoice[] = Array.isArray(data) ? data as Invoice[] : (data?.data || []);

  const createMutation = useMutation({
    mutationFn: (payload: { amount: number; description?: string }) => api.post<Invoice>('/invoices', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); closeForm(); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'paid' | 'cancel' }) =>
      api.post<Invoice>(`/invoices/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const closeForm = useCallback(() => {
    setShowForm(false);
    setForm({ amount: '', description: '' });
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount) return;
    createMutation.mutate({ amount: Number(form.amount), description: form.description || undefined });
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'amount', label: 'Amount', sortable: true, align: 'right', width: 130,
      render: (inv) => `Rp ${(inv.amount || 0).toLocaleString('id-ID')} ${inv.currency || ''}`,
    },
    {
      key: 'status', label: 'Status', sortable: true, width: 110,
      render: (inv) => (
        <span style={{
          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12,
          background: `rgba(${inv.status === 'paid' ? '52,211,153' : inv.status === 'cancelled' ? '75,85,99' : inv.status === 'overdue' ? '248,81,73' : '251,191,36'},0.15)`,
          color: STATUS_COLORS[inv.status] || 'var(--text-secondary)',
        }}>{inv.status}</span>
      ),
    },
    { key: 'description', label: 'Description', sortable: true, width: 240, render: (inv) => inv.description || '—' },
    {
      key: 'due_date', label: 'Due', sortable: true, width: 120,
      render: (inv) => inv.due_date || '—',
    },
    {
      key: 'actions', label: '', width: 120, align: 'right',
      render: (inv) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
            <button onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: inv.id, action: 'paid' }); }} style={{ ...iconBtn, color: 'var(--green)', borderColor: 'rgba(52,211,153,0.3)' }} title="Mark paid"><CheckCircle2 size={14} /></button>
          )}
          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
            <button onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: inv.id, action: 'cancel' }); }} style={{ ...iconBtn, color: 'var(--red)', borderColor: 'rgba(248,81,73,0.3)' }} title="Cancel"><Ban size={14} /></button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Invoices</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Generate and track billing invoices
          </p>
        </div>
        <button onClick={() => { setForm({ amount: '', description: '' }); setShowForm(true); }} style={btnStyle}>
          <Plus size={14} /> New Invoice
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>New Invoice</h2>
            <button type="button" onClick={closeForm} style={iconBtn}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <label style={labelStyle}>
              Amount (IDR) *
              <input style={inputStyle} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </label>
            <label style={labelStyle}>
              Description
              <input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional note" />
            </label>
          </div>
          {createMutation.isError && (
            <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.8rem' }}>{(createMutation.error as Error).message}</div>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button type="submit" disabled={createMutation.isPending} style={btnStyle}>
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Create Invoice
            </button>
            <button type="button" onClick={closeForm} style={{ ...btnStyle, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Cancel</button>
          </div>
        </form>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 12 }}>
          Failed to load invoices. Please try again.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rawInvoices}
        rowKey={(inv) => inv.id}
        searchKey="description"
        searchPlaceholder="Search invoices..."
        filterOptions={[{ key: 'status', label: 'All Status', options: ['pending', 'paid', 'overdue', 'cancelled'] }]}
        isLoading={isLoading}
        emptyMessage="No invoices found. Create one to get started."
        emptyIcon={<FileText size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
