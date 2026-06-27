import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>Privacy Policy</h1>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.8 }}>
        <p style={{ marginBottom: 16 }}>Last updated: 2026</p>
        <p style={{ marginBottom: 24 }}>At AdForge, we are committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information and advertising data.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>1. Data Collection</h2>
        <p style={{ marginBottom: 24 }}>We collect information that you provide directly to us, such as your account details, ad campaign data, and platform integrations (Meta, Google, TikTok, LinkedIn, Twitter, Snapchat, Microsoft, Pinterest).</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>2. Data Usage</h2>
        <p style={{ marginBottom: 24 }}>We use your data to provide and improve our advertising management and optimization services, including AI-driven insights and automated actions.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>3. Data Security</h2>
        <p style={{ marginBottom: 24 }}>We implement industry-standard security measures to protect your data against unauthorized access, alteration, disclosure, or destruction.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>4. Your Rights</h2>
        <p style={{ marginBottom: 24 }}>Under GDPR, you have the right to access, rectify, port, and erase your data. You can export your data from the Settings page or request account deletion.</p>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 32, marginBottom: 12 }}>5. Contact</h2>
        <p style={{ marginBottom: 24 }}>If you have any questions regarding your data privacy, please contact us at privacy@adforge.aitradepulse.com.</p>

        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <Link to="/app" style={{ color: 'var(--accent)', fontWeight: 700 }}>Back to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
