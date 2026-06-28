import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Key, User, Bot, Save } from 'lucide-react';
import { api } from '../lib/api';
import { PLATFORMS } from '../lib/platforms';

interface PlatformAccount {
  id: string;
  platform: string;
  account_name: string;
  is_active: boolean;
  health_status: string;
  created_at: string;
}

interface AiConfigData {
  url: string;
  model: string;
  apiKey: string;
}

const inputStyle = {
  flex: 1, maxWidth: 400,
  padding: '8px 12px',
  background: 'var(--bg-deep)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontFamily: 'var(--font-mono)',
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [aiForm, setAiForm] = useState<AiConfigData>({ url: '', model: '', apiKey: '' });
  const [aiInitialized, setAiInitialized] = useState(false);

  const { data: accounts, isLoading } = useQuery<PlatformAccount[]>({
    queryKey: ['settings', 'accounts'],
    queryFn: () => api.get<PlatformAccount[]>('/settings/accounts'),
  });

  const connectMutation = useMutation({
    mutationFn: ({ platform, token }: { platform: string; token: string }) =>
      api.post('/settings/accounts/connect-token', { platform, access_token: token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'accounts'] });
      setTokenInputs({});
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.del(`/settings/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'accounts'] }),
  });

  const { data: aiConfig } = useQuery<{ success: boolean; data: AiConfigData }>({
    queryKey: ['settings', 'ai'],
    queryFn: () => api.get<{ success: boolean; data: AiConfigData }>('/settings/ai'),
  });

  // Initialize form from fetched config (once)
  if (aiConfig?.data && !aiInitialized) {
    setAiForm({ url: aiConfig.data.url || '', model: aiConfig.data.model || '', apiKey: '' });
    setAiInitialized(true);
  }

  const saveAiMutation = useMutation({
    mutationFn: () => api.put('/settings/ai', aiForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai'] });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => api.post('/settings/ai/test-connection', aiForm),
  });

  const ai = aiConfig?.data;
  const connectedList = Array.isArray(accounts) ? accounts : [];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Settings</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Manage your account and integrations
      </p>

      {/* Platform Connections */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={14} style={{ color: 'var(--accent)' }} />
          Platform Connections
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PLATFORMS.map(p => {
            const existing = connectedList.find(a => a.platform === p.key);
            const token = tokenInputs[p.key] || '';

            return (
              <div
                key={p.key}
                style={{
                  background: 'var(--bg-surface, #1a1a2e)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: existing ? 'var(--green, #34d399)' : 'var(--text-tertiary)',
                    }} />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.label}</span>
                    {existing && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--green, #34d399)' }}>
                        {existing.account_name || 'Connected'}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>
                    {p.desc}
                  </p>

                  {!existing && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                      <input
                        type="password"
                        placeholder={`Paste ${p.label.split(' ')[0]} access token`}
                        value={token}
                        onChange={e => setTokenInputs(prev => ({ ...prev, [p.key]: e.target.value }))}
                        style={inputStyle}
                      />
                      <button
                        onClick={() => connectMutation.mutate({ platform: p.key, token })}
                        disabled={!token || connectMutation.isPending}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px',
                          background: 'var(--accent)',
                          color: 'var(--bg-deep)',
                          border: 'none',
                          borderRadius: 6,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          opacity: !token ? 0.5 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        Connect
                      </button>
                    </div>
                  )}
                </div>

                {existing && (
                  <button
                    onClick={() => disconnectMutation.mutate(existing.id)}
                    disabled={disconnectMutation.isPending}
                    style={{
                      padding: '4px 12px',
                      background: 'transparent',
                      color: 'var(--error, #ef4444)',
                      border: '1px solid var(--error, #ef4444)',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      marginLeft: 12,
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Accounts Summary */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Connected Accounts</h3>

        {isLoading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Loading accounts...</p>
        ) : connectedList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connectedList.map((account) => (
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
                    {account.platform} · {account.health_status === 'ok' ? 'Healthy' : `⚠️ ${account.health_status}`}
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
            No accounts connected. Add your access tokens above to get started.
          </p>
        )}
      </div>

      {/* AI Configuration — Editable */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginTop: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={14} style={{ color: 'var(--accent)' }} />
          AI Configuration
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Endpoint URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Endpoint URL</label>
            <input
              type="text"
              placeholder={ai?.url || 'https://api.example.com/v1'}
              value={aiForm.url}
              onChange={e => setAiForm(prev => ({ ...prev, url: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Model */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Model</label>
            <input
              type="text"
              placeholder={ai?.model || 'gpt-4o-mini'}
              value={aiForm.model}
              onChange={e => setAiForm(prev => ({ ...prev, model: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* API Key */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              API Key {ai?.apiKey && ai.apiKey !== '••••••••' ? '(configured)' : '(not set)'}
            </label>
            <input
              type="password"
              placeholder="Enter new API key to update"
              value={aiForm.apiKey}
              onChange={e => setAiForm(prev => ({ ...prev, apiKey: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => saveAiMutation.mutate()}
              disabled={saveAiMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                background: 'var(--accent)',
                color: 'var(--bg-deep)',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {saveAiMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Configuration
            </button>

            <button
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {testConnectionMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
              Test Connection
            </button>

            {saveAiMutation.isSuccess && (
              <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>✓ Saved</span>
            )}
            {saveAiMutation.isError && (
              <span style={{ fontSize: '0.8rem', color: '#f85149' }}>✗ Save failed</span>
            )}
            {testConnectionMutation.isSuccess && (
              <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>✓ Connection OK</span>
            )}
            {testConnectionMutation.isError && (
              <span style={{ fontSize: '0.8rem', color: '#f85149' }}>✗ Connection failed</span>
            )}
          </div>

          {/* Current Config Summary */}
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg-surface, #1a1a2e)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>Currently active:</div>
            <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {ai?.url || '(default)'} · {ai?.model || '(default)'} · Key: {ai?.apiKey && ai.apiKey !== '••••••••' ? '••••••••' : 'not set'}
            </div>
          </div>
        </div>
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
