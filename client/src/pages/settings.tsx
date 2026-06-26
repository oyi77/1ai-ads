import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PlatformAccount {
  id: string;
  platform: string;
  account_name: string;
  is_active: boolean;
  health_status: string;
  created_at: string;
}

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery<PlatformAccount[]>({
    queryKey: ['settings', 'accounts'],
    queryFn: () => api.get<PlatformAccount[]>('/settings/accounts'),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.post('/platforms/meta/connect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'accounts'] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.del(`/settings/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'accounts'] }),
  });

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Settings</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Manage your account and integrations
      </p>

      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Connected Accounts</h3>
          <button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'var(--bg-deep)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
              opacity: connectMutation.isPending ? 0.6 : 1,
            }}
          >
            {connectMutation.isPending ? 'Connecting...' : 'Connect Meta Account'}
          </button>
        </div>

        {connectMutation.isError && (
          <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.8rem', marginBottom: 12 }}>
            Failed to connect. Please try again.
          </p>
        )}

        {isLoading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Loading accounts...</p>
        ) : accounts && accounts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((account) => (
              <div
                key={account.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--bg-surface, #1a1a2e)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{account.account_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {account.platform} · {account.health_status === 'ok' ? '✅ Healthy' : `⚠️ ${account.health_status}`}
                  </div>
                </div>
                <button
                  onClick={() => disconnectMutation.mutate(account.id)}
                  disabled={disconnectMutation.isPending}
                  style={{
                    padding: '4px 12px',
                    background: 'transparent',
                    color: 'var(--error, #ef4444)',
                    border: '1px solid var(--error, #ef4444)',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
            No accounts connected. Connect your ad platform accounts to start managing campaigns.
          </p>
        )}
      </div>

      {/* Account Info */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginTop: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Account</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Status</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>Active</span>
          </div>
          <button
            onClick={() => api.logout()}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: '0.85rem',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
