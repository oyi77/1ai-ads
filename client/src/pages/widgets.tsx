import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../lib/api';

interface Widget {
  id: string;
  name: string;
  description: string;
  type: string;
  enabled: boolean;
  position: number;
  size: 'small' | 'medium' | 'large';
}

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

  const sizeLabel = (s: string) => {
    const map: Record<string, string> = { small: '1×1', medium: '2×1', large: '2×2' };
    return map[s] || s;
  };

  const typeColor = (t: string) => {
    const map: Record<string, string> = {
      metric: 'var(--accent)',
      chart: 'var(--green)',
      table: 'var(--purple)',
      list: 'var(--amber)',
    };
    return map[t] || 'var(--text-tertiary)';
  };

  const enabledCount = widgets.filter(w => w.enabled).length;

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

      {/* Widget grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>Loading widgets...</div>
      ) : widgets.length === 0 ? (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 48, textAlign: 'center' }}>
          <LayoutGrid size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>No widgets configured</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: 4 }}>Widgets will appear here once available</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {widgets.map(w => (
            <div
              key={w.id}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20,
                opacity: w.enabled ? 1 : 0.55, transition: 'opacity 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                    background: w.enabled ? 'var(--green)' : 'var(--border)',
                  }} />
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{w.name}</span>
                </div>
                {w.enabled ? (
                  <ToggleRight size={22} onClick={() => toggleMutation.mutate(w)} style={{ color: 'var(--green)', cursor: 'pointer', flexShrink: 0 }} />
                ) : (
                  <ToggleLeft size={22} onClick={() => toggleMutation.mutate(w)} style={{ color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }} />
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
                {w.description || 'No description'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600,
                  background: `${typeColor(w.type)}15`, color: typeColor(w.type),
                }}>{w.type}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600,
                  background: 'rgba(139,146,168,0.1)', color: 'var(--text-tertiary)',
                }}>{sizeLabel(w.size)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
