export function SettingsPage() {
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Settings</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>Manage your account and integrations</p>

      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Connected Accounts</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Connect your ad platform accounts to start managing campaigns.</p>
        <button style={{ marginTop: 16, padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
          Connect Meta Account
        </button>
      </div>
    </div>
  );
}
