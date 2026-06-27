import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Key, User } from 'lucide-react';
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
  const [metaToken, setMetaToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  const { data: accounts, isLoading } = useQuery<PlatformAccount[]>({
    queryKey: ['settings', 'accounts'],
    queryFn: () => api.get<PlatformAccount[]>('/settings/accounts'),
  });

  const connectMutation = useMutation({
    mutationFn: (token: string) =>
      api.post('/settings/accounts/connect-token', { platform: 'meta', access_token: token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'accounts'] });
      setMetaToken('');
      setShowTokenInput(false);
    },
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

      {/* Meta Access Token Section */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Key size={14} style={{ color: 'var(--accent)' }} />
              Meta Access Token
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
              Paste your Facebook/Meta long-lived access token to connect your ad accounts.
            </p>
          </div>
          <button
            onClick={() => setShowTokenInput(!showTokenInput)}
            style={{
              padding: '8px 16px',
              background: showTokenInput ? 'transparent' : 'var(--accent)',
              color: showTokenInput ? 'var(--text-secondary)' : 'var(--bg-deep)',
              border: showTokenInput ? '1px solid var(--border)' : 'none',
              borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {showTokenInput ? 'Cancel' : 'Add Token'}
          </button>
        </div>

        {showTokenInput && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Access Token
              </label>
              <input
                type="password"
                placeholder="Paste your EAA... token here"
                value={metaToken}
                onChange={e => setMetaToken(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg-deep)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => connectMutation.mutate(metaToken)}
                disabled={!metaToken.trim() || connectMutation.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
                  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
                  opacity: !metaToken.trim() ? 0.5 : 1,
                }}
              >
                {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                Connect Meta Account
              </button>
            </div>
            {connectMutation.isError && (
              <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.8rem', marginTop: 4 }}>
                Failed to connect: {(connectMutation.error as Error).message}
              </p>
            )}
            {connectMutation.isSuccess && (
              <p style={{ color: 'var(--green)', fontSize: '0.8rem', marginTop: 4 }}>
                ✅ Meta account connected successfully!
              </p>
            )}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              Get your token from <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Facebook Graph API Explorer</a>.
              Select your app, generate a long-lived token with <code>ads_management</code>, <code>ads_read</code>, and <code>business_management</code> permissions.
            </p>
          </div>
        )}
      </div>

      {/* Connected Accounts */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Connected Accounts</h3>

        {isLoading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Loading accounts...</p>
        ) : accounts && accounts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((account) => (
              <div
                key={account.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: 'var(--bg-surface, #1a1a2e)',
                  borderRadius: 8, border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{account.account_name || account.platform}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {account.platform} · {account.health_status === 'ok' ? '✅ Healthy' : `⚠️ ${account.health_status}`}
                  </div>
                </div>
                <button
                  onClick={() => disconnectMutation.mutate(account.id)}
                  disabled={disconnectMutation.isPending}
                  style={{
                    padding: '4px 12px', background: 'transparent',
                    color: 'var(--error, #ef4444)', border: '1px solid var(--error, #ef4444)',
                    borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
            No accounts connected. Add your Meta access token above to get started.
          </p>
        )}
      </div>

      {/* Account Info */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginTop: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={14} /> Account
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Status</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>Active</span>
          </div>
          <button
            onClick={() => api.logout()}
            style={{
              marginTop: 8, padding: '8px 16px',
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 6,
              fontSize: '0.85rem', cursor: 'pointer', alignSelf: 'flex-start',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
