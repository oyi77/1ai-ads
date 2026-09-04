import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, Check, AlertTriangle, Loader2, Eye, EyeOff, Shield } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

// ── Types ────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitTier: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[];
  rateLimitTier: string;
  expiresAt: string | null;
}

interface RateLimitTier {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
}

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function isExpiringSoon(iso: string | null): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  const now = Date.now();
  return ts > now && ts - now < 7 * 24 * 60 * 60 * 1000;
}

// ── Component ────────────────────────────────────────────────

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formScopes, setFormScopes] = useState<string[]>([]);
  const [formTier, setFormTier] = useState('');
  const [formExpiry, setFormExpiry] = useState('');
  const [formError, setFormError] = useState('');

  // Fetch keys
  const { data: keys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKey[]>('/api-keys'),
  });

  // Fetch scopes
  const { data: availableScopes } = useQuery<string[]>({
    queryKey: ['api-keys', 'scopes'],
    queryFn: () => api.get<string[]>('/api-keys/scopes'),
  });

  // Fetch tiers
  const { data: tiers } = useQuery<RateLimitTier[]>({
    queryKey: ['api-keys', 'tiers'],
    queryFn: () => api.get<RateLimitTier[]>('/api-keys/tiers'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: () => api.post<CreateApiKeyResponse>('/api-keys', {
      name: formName,
      scopes: formScopes,
      rateLimitTier: formTier,
      expiresAt: formExpiry || null,
    }),
    onSuccess: (data) => {
      setCreatedKey(data);
      setShowCreateModal(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Failed to create API key');
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api-keys/${id}`),
    onSuccess: () => {
      setRevokeConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  function resetForm() {
    setFormName('');
    setFormScopes([]);
    setFormTier('');
    setFormExpiry('');
    setFormError('');
  }

  function handleCopyKey() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleScopeToggle(scope: string) {
    setFormScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  }

  function handleCreate() {
    setFormError('');
    if (!formName.trim()) { setFormError('Name is required'); return; }
    if (formScopes.length === 0) { setFormError('Select at least one scope'); return; }
    if (!formTier) { setFormError('Select a rate limit tier'); return; }
    createMutation.mutate();
  }

  const keyList = Array.isArray(keys) ? keys : [];
  const scopeList = Array.isArray(availableScopes) ? availableScopes : [];
  const tierList = Array.isArray(tiers) ? tiers : [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>API Keys</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage programmatic access to your AdForge account.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreateModal(true); }}
          style={btnPrimaryStyle}
        >
          <Plus size={16} />
          Create New Key
        </button>
      </div>

      {/* Created Key Alert (shown once after creation) */}
      {createdKey && (
        <div style={alertSuccessStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Shield size={20} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4 }}>
                API Key Created — Copy It Now
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                This key will only be shown once. Store it securely.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={keyCodeStyle}>
                  {createdKey.key}
                </code>
                <button onClick={handleCopyKey} style={iconBtnStyle}>
                  {copied ? <Check size={14} color="var(--green)" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Your API Keys ({keyList.length})
          </h2>
        </div>

        {keysLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '0.82rem' }}>Loading keys...</div>
          </div>
        ) : keyList.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Key size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: 4 }}>No API keys yet</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              Create your first key to access the AdForge API.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Prefix</th>
                  <th style={thStyle}>Scopes</th>
                  <th style={thStyle}>Rate Tier</th>
                  <th style={thStyle}>Last Used</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keyList.map(k => {
                  const expired = isExpired(k.expiresAt);
                  const expiringSoon = !expired && isExpiringSoon(k.expiresAt);
                  const revoked = !!k.revokedAt;
                  const status = revoked ? 'revoked' : expired ? 'expired' : expiringSoon ? 'expiring' : 'active';

                  return (
                    <tr key={k.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{k.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                          Created {formatDate(k.createdAt)}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <code style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {k.prefix}…
                        </code>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {k.scopes.slice(0, 2).map(s => (
                            <span key={s} style={scopeBadgeStyle}>{s}</span>
                          ))}
                          {k.scopes.length > 2 && (
                            <span style={{ ...scopeBadgeStyle, background: 'transparent', color: 'var(--text-tertiary)' }}>
                              +{k.scopes.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {k.rateLimitTier}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                          {formatDateTime(k.lastUsedAt)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle(status)}>{status}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {revokeConfirm === k.id ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Revoke?</span>
                            <button
                              onClick={() => revokeMutation.mutate(k.id)}
                              disabled={revokeMutation.isPending}
                              style={{ ...btnDangerStyle, padding: '4px 10px', fontSize: '0.72rem' }}
                            >
                              {revokeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Yes'}
                            </button>
                            <button
                              onClick={() => setRevokeConfirm(null)}
                              style={{ ...btnGhostStyle, padding: '4px 10px', fontSize: '0.72rem' }}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRevokeConfirm(k.id)}
                            disabled={revoked}
                            style={{
                              ...iconBtnStyle,
                              opacity: revoked ? 0.3 : 1,
                              cursor: revoked ? 'default' : 'pointer',
                            }}
                            title={revoked ? 'Already revoked' : 'Revoke key'}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={modalOverlayStyle} onClick={() => setShowCreateModal(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Create API Key</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={alertErrorStyle}>
                <AlertTriangle size={14} /> {formError}
              </div>
            )}

            {/* Name */}
            <label style={labelStyle}>Key Name</label>
            <input
              type="text"
              placeholder="e.g. Production Server, Local Dev"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              style={inputStyle}
            />

            {/* Scopes */}
            <label style={labelStyle}>Scopes</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {scopeList.map(scope => {
                const selected = formScopes.includes(scope);
                return (
                  <button
                    key={scope}
                    onClick={() => handleScopeToggle(scope)}
                    style={{
                      ...chipStyle,
                      background: selected ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: selected ? 'var(--accent)' : 'var(--border-strong)',
                      color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {selected && <Check size={12} />}
                    {scope}
                  </button>
                );
              })}
            </div>

            {/* Rate Tier */}
            <label style={labelStyle}>Rate Limit Tier</label>
            <select
              value={formTier}
              onChange={e => setFormTier(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select a tier…</option>
              {tierList.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.requestsPerMinute}/min, {t.requestsPerDay.toLocaleString()}/day
                </option>
              ))}
            </select>

            {/* Expiry */}
            <label style={labelStyle}>Expires At (optional)</label>
            <input
              type="datetime-local"
              value={formExpiry}
              onChange={e => setFormExpiry(e.target.value)}
              style={inputStyle}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4, marginBottom: 16 }}>
              Leave empty for a key that never expires.
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={btnGhostStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                style={{
                  ...btnPrimaryStyle,
                  opacity: createMutation.isPending ? 0.6 : 1,
                  cursor: createMutation.isPending ? 'wait' : 'pointer',
                }}
              >
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                Create Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const btnPrimaryStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem',
  fontWeight: 700, cursor: 'pointer',
};

const btnGhostStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
};

const btnDangerStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 14px', background: 'rgba(248,113,113,0.1)', color: 'var(--red)',
  border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6,
  fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
};

const iconBtnStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 6, background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 4, cursor: 'pointer', color: 'var(--text-tertiary)',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflow: 'hidden',
};

const thStyle: CSSProperties = {
  padding: '12px 16px', textAlign: 'left',
  fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.82rem',
  verticalAlign: 'middle',
};

const scopeBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px', borderRadius: 4,
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  fontSize: '0.68rem', fontWeight: 600,
  fontFamily: 'var(--font-mono)',
};

const keyCodeStyle: CSSProperties = {
  display: 'block',
  padding: '10px 14px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  color: 'var(--text-primary)',
  wordBreak: 'break-all',
  flex: 1,
};

const alertSuccessStyle: CSSProperties = {
  background: 'rgba(52,211,153,0.08)',
  border: '1px solid rgba(52,211,153,0.2)',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 24,
};

const alertErrorStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid rgba(248,113,113,0.2)',
  color: 'var(--red)',
  padding: '10px 14px', borderRadius: 6,
  fontSize: '0.82rem', marginBottom: 16,
};

const modalOverlayStyle: CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 20,
};

const modalStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  padding: 24,
  width: '100%', maxWidth: 480,
  maxHeight: '90vh', overflowY: 'auto',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.78rem', fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6, marginTop: 12,
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', fontFamily: 'var(--font)',
  fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', fontFamily: 'var(--font)',
  fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box',
};

const chipStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid',
  fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 600,
  cursor: 'pointer', userSelect: 'none',
};

function statusBadgeStyle(status: string): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-block',
    padding: '3px 10px', borderRadius: 4,
    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
  };
  switch (status) {
    case 'active':
      return { ...base, background: 'rgba(52,211,153,0.1)', color: 'var(--green)' };
    case 'expiring':
      return { ...base, background: 'rgba(251,191,36,0.1)', color: 'var(--amber)' };
    case 'expired':
      return { ...base, background: 'rgba(139,146,168,0.1)', color: 'var(--text-tertiary)' };
    case 'revoked':
      return { ...base, background: 'rgba(248,113,113,0.1)', color: 'var(--red)' };
    default:
      return { ...base, background: 'var(--bg-surface)', color: 'var(--text-tertiary)' };
  }
}
