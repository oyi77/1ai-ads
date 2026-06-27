import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>Terms of Service</h1>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.8 }}>
        <p style={{ marginBottom: 16 }}>Last updated: 2026</p>
        <p style={{ marginBottom: 24 }}>Welcome to AdForge. By using our platform, you agree to these terms of service. Please read them carefully.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>1. Acceptance of Terms</h2>
        <p style={{ marginBottom: 24 }}>By accessing and using our services, you accept and agree to be bound by the terms and provision of this agreement.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>2. Service Usage</h2>
        <p style={{ marginBottom: 24 }}>AdForge provides an AI-powered advertising management platform. You are responsible for maintaining the confidentiality of your account and API keys.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>3. Limitation of Liability</h2>
        <p style={{ marginBottom: 24 }}>AdForge shall not be liable for any indirect, incidental, special, consequential or punitive damages, or any loss of profits or revenues resulting from your ad campaigns.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>4. Termination</h2>
        <p style={{ marginBottom: 24 }}>We may terminate or suspend your access to the service immediately, without prior notice, for any reason, including breach of these terms.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>5. Changes to Terms</h2>
        <p style={{ marginBottom: 24 }}>We reserve the right to modify these terms at any time. We will notify users of any material changes via the platform.</p>

        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <Link to="/app" style={{ color: 'var(--accent)', fontWeight: 700 }}>Back to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
