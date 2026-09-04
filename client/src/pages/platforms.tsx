import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, CheckCircle, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { PLATFORMS } from '../lib/platforms';
import type { CSSProperties } from 'react';

interface Platform {
  id: string;
  health_status?: string | null;
  last_error?: string | null;
  name: string;
  platform: string;
  connected: boolean;
  status: string;
  account_id?: string;
  account_name?: string;
}

export function PlatformsPage() {
  const queryClient = useQueryClient();
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [searchParams] = useSearchParams();
  const highlightPlatform = searchParams.get('platform');
  const justConnected = searchParams.get('connected');

  useEffect(() => {
    if (highlightPlatform) {
      document.getElementById(`platform-card-${highlightPlatform}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightPlatform]);

  useEffect(() => {
    if (justConnected) {
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  }, [justConnected, queryClient]);

  const { data: accounts } = useQuery<Platform[]>({
    queryKey: ['platforms', 'accounts'],
    queryFn: () => api.get<Platform[]>('/settings/accounts'),
  });

  const connectMutation = useMutation({
    mutationFn: ({ platform, token }: { platform: string; token: string }) =>
      api.post('/settings/accounts/connect-token', { platform, access_token: token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setTokenInputs({});
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.del(`/settings/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // OAuth for Meta
  const oauthMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get<{ data: { fb_url: string } }>('/auth/facebook/login');
      return res?.data?.fb_url;
    },
    onSuccess: (fbUrl) => {
      if (fbUrl) window.location.href = fbUrl;
    },
  });

  const connectedList = Array.isArray(accounts) ? accounts : [];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Platform Integrations</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Connect your ad platform accounts to manage all campaigns from one place.
      </p>

      {/* Connected Accounts Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {PLATFORMS.map(p => {
          const connected = connectedList.filter(a => a.platform === p.key);
          return (
            <div key={p.key} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center',
              borderColor: connected.length > 0 ? 'var(--green)' : 'var(--border)',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>{p.label.split(' ')[0]}</div>
              {connected.length > 0 ? <CheckCircle size={16} style={{ color: 'var(--green)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--text-tertiary)' }} />}
              <div style={{ fontSize: '0.68rem', color: connected.length > 0 ? 'var(--green)' : 'var(--text-tertiary)', marginTop: 4 }}>
                {connected.length > 0 ? `${connected.length} connected` : 'Not connected'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {PLATFORMS.map(p => {
          const existingList = connectedList.filter(a => a.platform === p.key);
const _existing = existingList[0];
          const token = tokenInputs[p.key] || '';

          return (
            <div
              id={`platform-card-${p.key}`}
              key={p.key}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 20,
                ...(p.key === highlightPlatform
                  ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }
                  : {}),
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>{p.label}</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.desc}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {existingList.length > 0 && existingList.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                        background: e.health_status === 'invalid_token'
                          ? 'rgba(239,68,68,0.12)'
                          : e.health_status === 'ok'
                            ? 'rgba(52,211,153,0.1)'
                            : 'rgba(139,146,168,0.1)',
                        color: e.health_status === 'invalid_token'
                          ? '#ef4444'
                          : e.health_status === 'ok'
                            ? 'var(--green)'
                            : 'var(--text-tertiary)',
                      }} title={e.last_error || undefined}>
                        {e.health_status === 'invalid_token'
                          ? `⚠️ Token expired — reconnect`
                          : `✅ ${e.account_name || e.platform}`}
                      </div>
                      <button
                        onClick={() => disconnectMutation.mutate(e.id)}
                        disabled={disconnectMutation.isPending}
                        style={{
                          padding: '4px 8px', background: 'transparent', color: 'var(--error, #ef4444)',
                          border: '1px solid var(--error, #ef4444)', borderRadius: 4,
                          fontSize: '0.68rem', cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Meta: OAuth button */}
              {p.key === 'meta' && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => oauthMutation.mutate()}
                    disabled={oauthMutation.isPending}
                    style={{
                      ...btnStyle,
                      background: '#1877F2',
                      opacity: oauthMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    {oauthMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    Connect with Facebook (OAuth)
                  </button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    Recommended — grants full access
                  </span>
                </div>
              )}

              {/* Manual token fallback */}
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                  Or paste access token manually
                </summary>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
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
                    style={{ ...btnStyle, opacity: !token || connectMutation.isPending ? 0.5 : 1 }}
                  >
                    {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Connect
                  </button>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', color: '#fff', border: 'none',
  borderRadius: 6, fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none',
};
