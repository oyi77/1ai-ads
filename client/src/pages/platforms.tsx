import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface Platform {
  id: string;
  name: string;
  platform: string;
  connected: boolean;
  status: string;
  account_id?: string;
  account_name?: string;
}

const PLATFORMS = [
  { key: 'meta', label: 'Meta (Facebook/Instagram)', color: '#1877F2', desc: 'Manage Facebook & Instagram ads, audiences, and insights.' },
  { key: 'google', label: 'Google Ads', color: '#4285F4', desc: 'Search, Display, YouTube, and Shopping campaigns.' },
  { key: 'tiktok', label: 'TikTok Ads', color: '#000000', desc: 'TikTok For Business ad management.' },
  { key: 'linkedin', label: 'LinkedIn Ads', color: '#0A66C2', desc: 'B2B advertising on LinkedIn.' },
  { key: 'twitter', label: 'Twitter/X Ads', color: '#1DA1F2', desc: 'Promoted tweets and campaigns on X.' },
  { key: 'snapchat', label: 'Snapchat Ads', color: '#FFFC00', desc: 'Snap Ads and Story Ads.' },
  { key: 'pinterest', label: 'Pinterest Ads', color: '#E60023', desc: 'Promoted Pins and shopping ads.' },
  { key: 'microsoft', label: 'Microsoft/Bing Ads', color: '#00A4EF', desc: 'Bing search and audience ads.' },
  { key: 'reddit', label: 'Reddit Ads', color: '#FF4500', desc: 'Promoted posts and campaigns on Reddit.' },
  { key: 'spotify', label: 'Spotify Ads', color: '#1DB954', desc: 'Audio and display ads on Spotify.' },
  { key: 'whatsapp', label: 'WhatsApp Business Ads', color: '#25D366', desc: 'Click-to-WhatsApp and business messaging ads.' },
  { key: 'amazon', label: 'Amazon Ads', color: '#FF9900', desc: 'Sponsored Products, Brands, and Display ads on Amazon.' },
  { key: 'apple', label: 'Apple Search Ads', color: '#A2AAAD', desc: 'App Store search and display campaigns.' },
  { key: 'criteo', label: 'Criteo Ads', color: '#FF6600', desc: 'Commerce media and retargeting campaigns.' },
  { key: 'taboola', label: 'Taboola Ads', color: '#0077B5', desc: 'Native advertising and content discovery.' },
  { key: 'thetradedesk', label: 'The Trade Desk', color: '#4688F1', desc: 'Programmatic advertising and demand-side platform.' },
  { key: 'yandex', label: 'Yandex Direct', color: '#FF0000', desc: 'Search and display advertising on Yandex.' },
  { key: 'baidu', label: 'Baidu Ads', color: '#2319DC', desc: 'Search and display advertising on Baidu.' },
  { key: 'kakao', label: 'KakaoTalk Ads', color: '#FEE500', desc: 'KakaoTalk messaging and display ads.' },
  { key: 'line', label: 'LINE Ads', color: '#00B900', desc: 'LINE messaging and display advertising.' },
];

export function PlatformsPage() {
  const queryClient = useQueryClient();
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});

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
          const connected = connectedList.some(a => a.platform === p.key);
          return (
            <div key={p.key} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center',
              borderColor: connected ? 'var(--green)' : 'var(--border)',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>{p.label.split(' ')[0]}</div>
              {connected ? <CheckCircle size={16} style={{ color: 'var(--green)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--text-tertiary)' }} />}
              <div style={{ fontSize: '0.68rem', color: connected ? 'var(--green)' : 'var(--text-tertiary)', marginTop: 4 }}>
                {connected ? 'Connected' : 'Not connected'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {PLATFORMS.map(p => {
          const existing = connectedList.find(a => a.platform === p.key);
          const token = tokenInputs[p.key] || '';

          return (
            <div key={p.key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>{p.label}</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.desc}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    padding: '4px 10px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                    background: existing ? 'rgba(52,211,153,0.1)' : 'rgba(139,146,168,0.1)',
                    color: existing ? 'var(--green)' : 'var(--text-tertiary)',
                  }}>
                    {existing ? `✅ ${existing.account_name || existing.platform}` : 'Not Connected'}
                  </div>
                  {existing && (
                    <button
                      onClick={() => disconnectMutation.mutate(existing.id)}
                      disabled={disconnectMutation.isPending}
                      style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        color: 'var(--error, #ef4444)',
                        border: '1px solid var(--error, #ef4444)',
                        borderRadius: 4,
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {!existing && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                    style={btnStyle}
                  >
                    {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Connect
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
  whiteSpace: 'nowrap',
};

const inputStyle: CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', flex: 1,
};
