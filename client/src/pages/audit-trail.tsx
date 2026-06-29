import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

const columns: Column<AuditEntry>[] = [
  {
    key: 'action',
    label: 'Action',
    sortable: true,
    width: 100,
    render: (e) => {
      const method = e.action?.split(' ')[0] ?? '';
      const bg = method === 'DELETE'
        ? 'rgba(248,81,73,0.1)'
        : method === 'POST'
          ? 'rgba(52,211,153,0.1)'
          : 'rgba(88,166,255,0.1)';
      const color = method === 'DELETE'
        ? '#f85149'
        : method === 'POST'
          ? 'var(--green)'
          : 'var(--accent)';
      return (
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
          background: bg, color,
        }}>{method}</span>
      );
    },
  },
  { key: 'resource_type', label: 'Resource', sortable: true, width: 150 },
  { key: 'resource_id', label: 'Resource ID', width: 200 },
  { key: 'ip_address', label: 'IP', width: 120 },
  {
    key: 'created_at',
    label: 'Time',
    sortable: true,
    width: 160,
    render: (e) => new Date(e.created_at).toLocaleString(),
  },
];

function isAuditResponse(value: unknown): value is AuditResponse {
  return (
    value !== null &&
    typeof value === 'object' &&
    'data' in value &&
    Array.isArray((value as Record<string, unknown>).data)
  );
}

export function AuditTrailPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<unknown>('/audit'),
  });

  const entries: AuditEntry[] = isAuditResponse(data) ? data.data : [];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 20 }}>Audit Trail</h1>
      <DataTable
        columns={columns}
        data={entries}
        rowKey={e => e.id}
        searchKey="resource_type"
        searchPlaceholder="Search audit logs..."
        filterOptions={[{ key: 'action', label: 'All Actions', options: ['GET', 'POST', 'PUT', 'DELETE'] }]}
        isLoading={isLoading}
        emptyMessage="No audit entries found."
        emptyIcon={<Shield size={32} style={{ color: 'var(--text-tertiary)' }} />}
      />
    </div>
  );
}
