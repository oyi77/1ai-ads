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

              {/* Manual Token Flow — Primary option */}
              <div style={{ 
                marginTop: 8, 
                padding: 16, 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border-strong)', 
                borderRadius: 8 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    🔑 Paste Access Token
                  </span>
                  {p.key === 'meta' && (
                    <a 
                      href="https://developers.facebook.com/tools/explorer/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.7rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      Open Graph Explorer <ExternalLink size={12} />
                    </a>
                  )}
                  {p.key === 'google' && (
                    <a 
                      href="https://console.cloud.google.com/apis/credentials" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.7rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      Google Cloud Console <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                {p.key === 'meta' && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>Cara dapat token:</strong>
                    <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                      <li>Buka link Graph Explorer di atas</li>
                      <li>Pilih app (atau buat baru)</li>
                      <li>Klik <strong>"Generate Access Token"</strong></li>
                      <li>Pilih permissions: <code style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: 3 }}>ads_management, ads_read, business_management, pages_show_list</code></li>
                      <li>Paste token di bawah ini</li>
                    </ol>
                  </div>
                )}
                {p.key === 'google' && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>How to get Google Ads token:</strong>
                    <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                      <li>Go to Google Cloud Console link above</li>
                      <li>Create OAuth2 credentials</li>
                      <li>Use OAuth2 Playground to generate access token</li>
                      <li>Select scope: https://www.googleapis.com/auth/adwords</li>
                      <li>Paste token below</li>
                    </ol>
                  </div>
                )}
                {p.key === 'tiktok' && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>How to get TikTok Ads token:</strong>
                    <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>Go to <a href="https://ads.tiktok.com/marketing_api/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>TikTok Marketing API</a></li>
                      <li>Create an app and get App ID + Secret</li>
                      <li>Generate access token via OAuth2</li>
                      <li>Get Advertiser ID from TikTok Ads Manager</li>
                      <li>Paste token below</li>
                    </ol>
                  </div>
                )}
                {p.key === 'pinterest' && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>How to get Pinterest token:</strong>
                    <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>Go to <a href="https://developers.pinterest.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Pinterest Developers</a></li>
                      <li>Create an app</li>
                      <li>Generate access token</li>
                      <li>Paste token below</li>
                    </ol>
                  </div>
                )}
                {p.key === 'linkedin' && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>How to get LinkedIn token:</strong>
                    <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>Go to <a href="https://developer.linkedin.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>LinkedIn Developers</a></li>
                      <li>Create an app</li>
                      <li>Generate access token with ads scope</li>
                      <li>Paste token below</li>
                    </ol>
                  </div>
                )}
                {p.key === 'microsoft' && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>How to get Microsoft Ads token:</strong>
                    <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>Go to <a href="https://ads.microsoft.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Microsoft Ads</a></li>
                      <li>Apply for Developer Token</li>
                      <li>Generate OAuth2 refresh token</li>
                      <li>Paste token below</li>
                    </ol>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="password"
                    placeholder={`Paste ${p.label.split(' ')[0]} access token`}
                    value={token}
                    onChange={e => setTokenInputs(prev => ({ ...prev, [p.key]: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => connectMutation.mutate({ platform: p.key, token })}
                    disabled={!token || connectMutation.isPending}
                    style={{ 
                      ...btnStyle, 
                      background: 'var(--accent)',
                      opacity: !token || connectMutation.isPending ? 0.5 : 1,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Connect Token
                  </button>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Token dienkripsi. Expire ~60 hari. Bisa reconnect kapan saja.
                </div>
              </div>

              {/* OAuth — secondary option (requires working Facebook App) */}
              {p.key === 'meta' && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                    Atau connect dengan OAuth (perlu Facebook App aktif)
                  </summary>
                  <div style={{ marginTop: 8 }}>
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
                      Perlu App Domains + Valid OAuth Redirect URIs di Facebook Console
                    </span>
                  </div>
                </details>
              )}
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
