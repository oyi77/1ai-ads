import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Key, User, Bot, Save, Link2, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PlanBadge } from '../components/RequirePro';
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
  const [aiForm, setAiForm] = useState<AiConfigData>({ url: '', model: '', apiKey: '' });
  const [aiInitialized, setAiInitialized] = useState(false);

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

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Settings</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Manage your account and AI configuration
      </p>

      {/* Platform Connections — Link to dedicated page */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={14} style={{ color: 'var(--accent)' }} />
          Platform Connections
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          Connect and manage your advertising platform accounts.
        </p>
        <Link
          to="/platforms"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            border: 'none', borderRadius: 6,
            fontWeight: 600, fontSize: '0.8rem',
            textDecoration: 'none',
          }}
        >
          <Link2 size={14} /> Manage Platforms
        </Link>
      </div>

      {/* Current Plan */}
      {(() => {
        const user = api.getUser();
        const isPro = user?.role === 'admin' || user?.plan === 'pro';
        return (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Crown size={14} style={{ color: isPro ? '#818cf8' : '#94a3b8' }} />
              Current Plan
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isPro ? 0 : 12 }}>
              <PlanBadge />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {isPro ? 'Full access to all features' : 'Basic features included'}
              </span>
            </div>
            {!isPro && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  Upgrade to Pro to unlock: AI Agent, Automation Rules, A/B Testing, Attribution, and Audience Intelligence.
                </p>
                <button
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px',
                    background: 'var(--accent)', color: 'var(--bg-deep)',
                    border: 'none', borderRadius: 6,
                    fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >
                  <Crown size={14} /> Upgrade to Pro
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* AI Configuration — Editable */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 16 }}>
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
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
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
