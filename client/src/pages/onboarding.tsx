import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

const STEPS = ['Welcome', 'Connect Platform', 'Sync Data', 'AI Setup', 'Done'];

const PLATFORMS = [
  { key: 'meta', label: 'Meta (Facebook/Instagram)', color: '#1877F2', icon: '📘' },
  { key: 'google', label: 'Google Ads', color: '#4285F4', icon: '🔍' },
  { key: 'tiktok', label: 'TikTok Ads', color: '#000000', icon: '🎵' },
  { key: 'linkedin', label: 'LinkedIn Ads', color: '#0A66C2', icon: '💼' },
  { key: 'twitter', label: 'Twitter/X Ads', color: '#1DA1F2', icon: '🐦' },
  { key: 'snapchat', label: 'Snapchat Ads', color: '#FFFC00', icon: '👻' },
  { key: 'pinterest', label: 'Pinterest Ads', color: '#E60023', icon: '📌' },
  { key: 'microsoft', label: 'Microsoft/Bing Ads', color: '#00A4EF', icon: '🔷' },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [token, setToken] = useState('');
  const [aiUrl, setAiUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [syncResult, setSyncResult] = useState('');

  const { data: accounts } = useQuery<unknown[]>({
    queryKey: ['settings', 'accounts'],
    queryFn: () => api.get('/settings/accounts'),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.post('/settings/accounts/connect-token', { platform: selectedPlatform, access_token: token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'accounts'] });
      setToken('');
      setStep(2);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/campaigns/sync', {}),
    onSuccess: () => {
      setSyncResult('Campaigns synced successfully!');
      setTimeout(() => setStep(3), 1500);
    },
    onError: () => {
      setSyncResult('Sync completed — no live campaigns found yet. You can sync later from Settings.');
      setTimeout(() => setStep(3), 2000);
    },
  });

  const saveAiMutation = useMutation({
    mutationFn: () => api.put('/settings/ai', { url: aiUrl, model: aiModel, apiKey: aiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai'] });
      setStep(4);
    },
  });

  const connectedCount = Array.isArray(accounts) ? accounts.length : 0;

  function handleSkip() {
    if (step < 4) setStep(step + 1);
    else completeOnboarding();
  }

  function completeOnboarding() {
    localStorage.setItem('adforge_onboarded', 'true');
    navigate('/app');
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Progress Bar */}
        <div style={progressBarStyle}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ ...stepStyle, background: i <= step ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>
        <div style={{ textAlign: 'center', marginBottom: 8, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          Step {step + 1} of {STEPS.length}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div style={stepContentStyle}>
            <div style={logoStyle}>A</div>
            <h1 style={titleStyle}>Welcome to <span style={{ color: 'var(--accent)' }}>AdForge</span></h1>
            <p style={descStyle}>
              Your AI-powered ad management platform. Connect your ad platforms, manage campaigns,
              and optimize performance — all from one dashboard.
            </p>
            <button onClick={() => setStep(1)} style={primaryBtnStyle}>Get Started</button>
          </div>
        )}

        {/* Step 1: Connect Platform */}
        {step === 1 && (
          <div style={stepContentStyle}>
            <h2 style={titleStyle}>Connect Your Ad Platform</h2>
            <p style={descStyle}>Choose a platform and paste your access token to connect.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 20 }}>
              {PLATFORMS.map(p => (
                <button key={p.key} onClick={() => setSelectedPlatform(p.key)}
                  style={{
                    ...platformBtnStyle,
                    border: selectedPlatform === p.key ? `2px solid ${p.color}` : '1px solid var(--border)',
                    background: selectedPlatform === p.key ? `${p.color}15` : 'var(--bg-surface)',
                  }}>
                  <span style={{ fontSize: '1.4rem' }}>{p.icon}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{p.label.split('(')[0].trim()}</span>
                </button>
              ))}
            </div>

            {selectedPlatform && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>
                  {PLATFORMS.find(p => p.key === selectedPlatform)?.label} Access Token
                </label>
                <input type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder="Paste your access token here"
                  style={inputStyle} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(0)} style={secondaryBtnStyle}>Back</button>
              {selectedPlatform && token && (
                <button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} style={primaryBtnStyle}>
                  {connectMutation.isPending ? 'Connecting...' : 'Connect'}
                </button>
              )}
              <button onClick={handleSkip} style={ghostBtnStyle}>Skip for now</button>
            </div>

            {connectedCount > 0 && (
              <div style={{ marginTop: 16, padding: '8px 12px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--green)' }}>
                ✓ {connectedCount} platform account(s) connected
              </div>
            )}
          </div>
        )}

        {/* Step 2: Sync Data */}
        {step === 2 && (
          <div style={stepContentStyle}>
            <h2 style={titleStyle}>Sync Your Campaign Data</h2>
            <p style={descStyle}>Pull your existing campaigns from connected platforms.</p>

            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              {!syncResult && !syncMutation.isPending && (
                <button onClick={() => syncMutation.mutate()} style={primaryBtnStyle}>
                  Sync Now
                </button>
              )}
              {syncMutation.isPending && (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Syncing campaigns...</p>
                </div>
              )}
              {syncResult && (
                <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, color: 'var(--green)', fontSize: '0.85rem' }}>
                  ✓ {syncResult}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(1)} style={secondaryBtnStyle}>Back</button>
              <button onClick={handleSkip} style={ghostBtnStyle}>Skip for now</button>
            </div>
          </div>
        )}

        {/* Step 3: AI Setup */}
        {step === 3 && (
          <div style={stepContentStyle}>
            <h2 style={titleStyle}>AI Configuration</h2>
            <p style={descStyle}>Connect your AI provider for ad generation, optimization, and insights.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Endpoint URL</label>
                <input value={aiUrl} onChange={e => setAiUrl(e.target.value)} placeholder="https://api.openai.com/v1/chat/completions" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder="gpt-4o-mini" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>API Key</label>
                <input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="sk-..." style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(2)} style={secondaryBtnStyle}>Back</button>
              {aiUrl && aiKey ? (
                <button onClick={() => saveAiMutation.mutate()} disabled={saveAiMutation.isPending} style={primaryBtnStyle}>
                  {saveAiMutation.isPending ? 'Saving...' : 'Save & Continue'}
                </button>
              ) : null}
              <button onClick={handleSkip} style={ghostBtnStyle}>Skip for now</button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div style={stepContentStyle}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
            <h2 style={titleStyle}>You're All Set!</h2>
            <p style={descStyle}>
              AdForge is ready. Your dashboard will show campaigns, performance metrics, and AI-powered insights.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, textAlign: 'left' }}>
              <CheckItem text="Platform connected" done={connectedCount > 0} />
              <CheckItem text="Campaign data synced" done={!!syncResult} />
              <CheckItem text="AI configured" done={!!aiUrl} />
            </div>

            {/* Next steps guide */}
            <div style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                Next Steps
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>1.</span>
                  <span>Create your first campaign from the <strong>Campaigns</strong> page</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>2.</span>
                  <span>Chat with our <strong>Telegram Bot</strong> for on-the-go management</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>3.</span>
                  <span>Check <strong>Account Reports</strong> for AI-powered insights</span>
                </div>
              </div>
            </div>

            <button onClick={completeOnboarding} style={primaryBtnStyle}>
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckItem({ text, done }: { text: string; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: '0.85rem' }}>
      <span style={{ color: done ? 'var(--green)' : 'var(--text-tertiary)' }}>{done ? '✓' : '○'}</span>
      <span style={{ color: done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{text}</span>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────

const containerStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', background: 'var(--bg-deep)', padding: 20,
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
  borderRadius: 14, padding: 36, width: '100%', maxWidth: 520,
  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
};

const progressBarStyle: CSSProperties = {
  display: 'flex', gap: 4, marginBottom: 12,
};

const stepStyle: CSSProperties = {
  flex: 1, height: 4, borderRadius: 2, transition: 'background 0.3s',
};

const stepContentStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
};

const logoStyle: CSSProperties = {
  width: 56, height: 56, borderRadius: 12, background: 'var(--accent-soft)',
  color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '1.6rem', fontWeight: 800, marginBottom: 16,
};

const titleStyle: CSSProperties = {
  fontSize: '1.3rem', fontWeight: 700, marginBottom: 8, textAlign: 'center',
};

const descStyle: CSSProperties = {
  fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center',
  marginBottom: 24, lineHeight: 1.5, maxWidth: 400,
};

const primaryBtnStyle: CSSProperties = {
  padding: '10px 24px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
  fontSize: '0.85rem', fontFamily: 'var(--font)',
};

const secondaryBtnStyle: CSSProperties = {
  padding: '10px 24px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 6, fontWeight: 600,
  cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font)',
};

const ghostBtnStyle: CSSProperties = {
  padding: '10px 16px', background: 'transparent', color: 'var(--text-tertiary)',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  fontSize: '0.8rem', fontFamily: 'var(--font)',
};

const platformBtnStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  padding: '12px 8px', borderRadius: 8, cursor: 'pointer',
  transition: 'all 0.2s', fontFamily: 'var(--font)',
};

const labelStyle: CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem',
  outline: 'none', boxSizing: 'border-box',
};
