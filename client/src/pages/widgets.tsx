import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface Widget {
  id: string;
  name: string;
  description: string;
  type: string;
  enabled: boolean;
  position: number;
  size: 'small' | 'medium' | 'large';
}

const SIZE_LABELS: Record<string, string> = { small: '1×1', medium: '2×1', large: '2×2' };

const TYPE_COLORS: Record<string, string> = {
  metric: 'var(--accent)',
  chart: 'var(--green)',
  table: 'var(--purple)',
  list: 'var(--amber)',
};

export function WidgetsPage() {
  const queryClient = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: (w: Widget) => api.put(`/reporting/widgets/${w.id}`, { enabled: !w.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reporting-widgets'] }),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporting-widgets'],
    queryFn: () => api.get<Widget[]>('/reporting/widgets'),
  });

  const widgets: Widget[] = Array.isArray(data) ? data : [];
  const enabledCount = widgets.filter(w => w.enabled).length;

  const columns: Column<Widget>[] = [
    { key: 'name', label: 'Name', sortable: true, width: 200, render: (w) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: w.enabled ? 'var(--green)' : 'var(--border)' }} />
        <span style={{ fontWeight: 700 }}>{w.name}</span>
      </div>
    )},
    { key: 'type', label: 'Type', sortable: true, width: 100, render: (w) => (
      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, background: `${TYPE_COLORS[w.type] || 'var(--text-tertiary)'}15`, color: TYPE_COLORS[w.type] || 'var(--text-tertiary)' }}>{w.type}</span>
    )},
    { key: 'description', label: 'Description', width: 250, render: (w) => (
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{w.description || 'No description'}</span>
    )},
    { key: 'enabled', label: 'Enabled', width: 80, render: (w) => (
      <span onClick={() => toggleMutation.mutate(w)} style={{ cursor: 'pointer' }}>
        {w.enabled ? <ToggleRight size={22} style={{ color: 'var(--green)' }} /> : <ToggleLeft size={22} style={{ color: 'var(--text-tertiary)' }} />}
      </span>
    )},
    { key: 'size', label: 'Size', width: 80, render: (w) => (
      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(139,146,168,0.1)', color: 'var(--text-tertiary)' }}>{SIZE_LABELS[w.size] || w.size}</span>
    )},
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Widget Configuration</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Enable, disable, and arrange dashboard widgets</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load widget configuration
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Total</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700 }}>{widgets.length}</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Enabled</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--green)' }}>{enabledCount}</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Disabled</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700 }}>{widgets.length - enabledCount}</div>
        </div>
      </div>

      {/* Widget table */}
      <DataTable
        columns={columns}
        data={widgets}
        rowKey={w => w.id}
        searchKey="name"
        searchPlaceholder="Search widgets..."
        filterOptions={[{ key: 'type', label: 'All Types', options: ['metric', 'chart', 'table', 'list'] }]}
        isLoading={isLoading}
        emptyMessage="No widgets configured. Widgets will appear here once available."
        emptyIcon={<LayoutGrid size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
