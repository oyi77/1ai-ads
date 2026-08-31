import { Link } from 'react-router-dom';

const LAST_UPDATED = '1 July 2026';
const COMPANY = 'BerkahKarya Digital';
const WEBSITE = 'https://adforge.aitradepulse.com';
const EMAIL_PRIVACY = 'privacy@berkahkarya.org';
const EMAIL_DPO = 'dpo@berkahkarya.org';

const S: Record<string, React.CSSProperties> = {
  page:      { maxWidth: 820, margin: '0 auto', padding: '56px 24px 80px', fontFamily: 'var(--font)' },
  badge:     { display: 'inline-block', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 4, textTransform: 'uppercase', marginBottom: 16 },
  h1:        { fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.2 },
  meta:      { color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: 48 },
  h2:        { fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 40, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border-strong)' },
  p:         { color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.85, marginBottom: 14 },
  ul:        { color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.85, marginBottom: 14, paddingLeft: 20 },
  li:        { marginBottom: 6 },
  table:     { width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: '0.85rem' },
  th:        { textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, padding: '8px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-strong)' },
  td:        { color: 'var(--text-secondary)', padding: '8px 12px', borderBottom: '1px solid var(--border)' },
  highlight: { background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '16px 20px', marginBottom: 20 },
  footer:    { marginTop: 64, paddingTop: 24, borderTop: '1px solid var(--border-strong)', display: 'flex', gap: 24, flexWrap: 'wrap' },
  link:      { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' },
  strong:    { color: 'var(--text-primary)' },
};

const T = ({ children }: { children: React.ReactNode }) => (
  <strong style={S.strong}>{children}</strong>
);

export function PrivacyPage() {
  return (
    <div style={S.page}>
      <span style={S.badge}>Legal</span>
      <h1 style={S.h1}>Privacy Policy</h1>
      <p style={S.meta}>
        Last updated: {LAST_UPDATED} · Effective: {LAST_UPDATED} · Applies to:{' '}
        <a href={WEBSITE} style={S.link}>{WEBSITE}</a>
      </p>

      <p style={S.p}>
        {COMPANY} ("we", "us", "our") operates <T>AdForge</T>, an AI-powered multi-platform ad
        management platform available at <a href={WEBSITE} style={S.link}>{WEBSITE}</a>. This
        Privacy Policy explains what personal data we collect, why we collect it, how we use and
        protect it, and your rights regarding that data.
      </p>
      <p style={S.p}>
        By using AdForge you agree to this policy. If you do not agree, discontinue use and contact
        us to delete your account.
      </p>

      {/* 1 */}
      <h2 style={S.h2}>1. Data Controller</h2>
      <div style={S.highlight}>
        <p style={{ ...S.p, marginBottom: 4 }}><T>BerkahKarya Digital</T></p>
        <p style={{ ...S.p, marginBottom: 4 }}>Website: <a href="https://berkahkarya.org" style={S.link}>berkahkarya.org</a></p>
        <p style={{ ...S.p, marginBottom: 4 }}>Privacy contact: <a href={`mailto:${EMAIL_PRIVACY}`} style={S.link}>{EMAIL_PRIVACY}</a></p>
        <p style={{ ...S.p, marginBottom: 0 }}>Data rights requests: <a href={`mailto:${EMAIL_DPO}`} style={S.link}>{EMAIL_DPO}</a></p>
      </div>

      {/* 2 */}
      <h2 style={S.h2}>2. Data We Collect</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Category</th>
            <th style={S.th}>Examples</th>
            <th style={S.th}>Source</th>
          </tr>
        </thead>
        <tbody>
          {([
            ['Account data', 'Name, email address, username, password hash (bcrypt)', 'Provided by you at registration'],
            ['Ad platform credentials', 'OAuth refresh tokens for Meta, Google Ads, TikTok, LinkedIn, Twitter, Snapchat, Microsoft, Pinterest', 'You connect via OAuth consent flow'],
            ['Campaign & performance data', 'Campaign names, budgets, spend, impressions, clicks, conversions, ROAS', 'Fetched from connected ad platforms via official APIs on your behalf'],
            ['Usage data', 'Pages visited, features used, session duration', 'Collected automatically via server logs'],
            ['Device & browser data', 'IP address, browser type, operating system, timezone', 'Collected automatically'],
            ['Communications', 'Support emails, feedback, bug reports', 'Provided by you'],
          ] as [string, string, string][]).map(([cat, ex, src]) => (
            <tr key={cat}>
              <td style={{ ...S.td, color: 'var(--text-primary)', fontWeight: 500 }}>{cat}</td>
              <td style={S.td}>{ex}</td>
              <td style={S.td}>{src}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={S.p}>We do <T>not</T> collect payment card details directly — payments are handled by third-party processors.</p>

      {/* 3 */}
      <h2 style={S.h2}>3. How We Use Your Data</h2>
      <ul style={S.ul}>
        {[
          'Provide, operate, and improve AdForge features — campaign management, analytics, AI optimization, and automation rules.',
          'Authenticate your identity and authorize access to connected ad accounts.',
          'Execute automated actions on connected ad platforms (pause/scale campaigns, adjust budgets) only as instructed by your configured rules.',
          'Send service notifications — billing alerts, token expiry warnings, optimization reports — via email and Telegram (if configured).',
          'Aggregate anonymized usage metrics to improve product performance.',
          'Comply with legal obligations and respond to lawful requests.',
        ].map(item => <li key={item} style={S.li}>{item}</li>)}
      </ul>
      <p style={S.p}><T>We never sell your data.</T> We do not share personal data with third parties for their own marketing purposes.</p>

      {/* 4 */}
      <h2 style={S.h2}>4. Ad Platform Data (Google, Meta, TikTok, etc.)</h2>
      <p style={S.p}>
        When you connect an ad platform, we access that account's data exclusively on your behalf
        using credentials you provide via OAuth 2.0. Specifically:
      </p>
      <ul style={S.ul}>
        <li style={S.li}><T>OAuth tokens</T> are encrypted at rest using AES-256-GCM and stored per-tenant. Access tokens are never persisted — obtained on-demand only.</li>
        <li style={S.li}><T>Campaign data</T> (names, budgets, performance metrics) is cached for up to 6 hours to minimize API calls, then refreshed.</li>
        <li style={S.li}><T>Raw API responses</T> are never stored — only normalized, structured data.</li>
        <li style={S.li}><T>No cross-user data access</T> — all queries are scoped to your user ID. No other user can access your account data.</li>
        <li style={S.li}><T>Disconnecting</T> an account (Settings → Connected Accounts → Disconnect) immediately deletes your stored credentials for that platform.</li>
      </ul>
      <p style={S.p}>
        Our use of Google Ads API data is limited to operating features you explicitly request and
        is not used for any other purpose. We comply with the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={S.link}>
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      {/* 5 */}
      <h2 style={S.h2}>5. Data Retention</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Data type</th>
            <th style={S.th}>Retention period</th>
          </tr>
        </thead>
        <tbody>
          {([
            ['Account data', 'Until account deletion'],
            ['Ad platform credentials (OAuth tokens)', 'Until you disconnect the platform or delete your account'],
            ['Campaign & performance history', '90-day rolling window'],
            ['Audit logs', '90 days'],
            ['Server access logs', '30 days'],
            ['Backups', '30 days, then automatically purged'],
          ] as [string, string][]).map(([type, ret]) => (
            <tr key={type}>
              <td style={{ ...S.td, color: 'var(--text-primary)', fontWeight: 500 }}>{type}</td>
              <td style={S.td}>{ret}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 6 */}
      <h2 style={S.h2}>6. Security</h2>
      <ul style={S.ul}>
        {[
          'All data in transit is encrypted via TLS 1.2+.',
          'Credentials and tokens are encrypted at rest using AES-256-GCM with per-record IVs.',
          'Passwords are hashed using bcrypt — never stored in plaintext.',
          'JWT authentication with short-lived access tokens.',
          'HTTP security headers: HSTS, X-Content-Type-Options, X-Frame-Options (via Helmet).',
          'All mutations are recorded in an immutable audit log.',
          'Rate limiting on all public endpoints.',
        ].map(item => <li key={item} style={S.li}>{item}</li>)}
      </ul>

      {/* 7 */}
      <h2 style={S.h2}>7. Your Rights</h2>
      <p style={S.p}>Under GDPR and Indonesian data protection law (UU PDP No. 27/2022), you have the right to:</p>
      <ul style={S.ul}>
        {[
          'Access — request a copy of the personal data we hold about you.',
          'Rectification — correct inaccurate or incomplete data.',
          'Erasure — request deletion of your account and all associated data.',
          'Portability — export your campaign data in CSV format (Reporting → Export).',
          'Restriction — request we limit processing of your data.',
          'Objection — object to processing based on legitimate interests.',
          'Withdraw consent — disconnect any ad platform account at any time from Settings.',
        ].map(item => <li key={item} style={S.li}>{item}</li>)}
      </ul>
      <p style={S.p}>
        To exercise any right, email <a href={`mailto:${EMAIL_DPO}`} style={S.link}>{EMAIL_DPO}</a>. We respond within 30 days.
      </p>

      {/* 8 */}
      <h2 style={S.h2}>8. Cookies & Local Storage</h2>
      <ul style={S.ul}>
        <li style={S.li}><T>Authentication token</T> — stored in localStorage to maintain your session. Cleared on sign out.</li>
        <li style={S.li}><T>Cookie consent preference</T> — stored in localStorage to remember your choice.</li>
        <li style={S.li}>We use Google Analytics 4 (G-V9C14XZ9SG) for anonymous usage analytics. GA4 is loaded only after you accept via the cookie consent banner. You can opt out by declining consent.</li>
      </ul>

      {/* 9 */}
      <h2 style={S.h2}>9. Third-Party Services</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Service</th>
            <th style={S.th}>Purpose</th>
            <th style={S.th}>Data shared</th>
          </tr>
        </thead>
        <tbody>
          {([
            ['Google Ads API', 'Read/write your Google Ads campaigns', 'Your Google OAuth token (on-demand only)'],
            ['Meta Marketing API', 'Read/write your Meta ad campaigns', 'Your Meta access token (on-demand only)'],
            ['TikTok Ads API', 'Read/write your TikTok campaigns', 'Your TikTok access token (on-demand only)'],
            ['Telegram Bot API', 'Send admin alerts and reports (optional)', 'Notification content only — no personal data'],
            ['AI / LLM provider (OmniRoute)', 'Generate ad copy and optimization suggestions', 'Ad creative text and campaign metrics — no PII'],
          ] as [string, string, string][]).map(([svc, purpose, data]) => (
            <tr key={svc}>
              <td style={{ ...S.td, color: 'var(--text-primary)', fontWeight: 500 }}>{svc}</td>
              <td style={S.td}>{purpose}</td>
              <td style={S.td}>{data}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 10 */}
      <h2 style={S.h2}>10. Children's Privacy</h2>
      <p style={S.p}>
        AdForge is not directed at children under 18. We do not knowingly collect personal data
        from minors. If you believe we have done so inadvertently, contact us and we will delete it
        immediately.
      </p>

      {/* 11 */}
      <h2 style={S.h2}>11. Changes to This Policy</h2>
      <p style={S.p}>
        We may update this policy periodically. Material changes will be announced via email and an
        in-app notice at least 14 days before taking effect. The "Last updated" date at the top
        always reflects the current version.
      </p>

      {/* 12 */}
      <h2 style={S.h2}>12. Contact</h2>
      <div style={S.highlight}>
        <p style={{ ...S.p, marginBottom: 4 }}>General privacy questions: <a href={`mailto:${EMAIL_PRIVACY}`} style={S.link}>{EMAIL_PRIVACY}</a></p>
        <p style={{ ...S.p, marginBottom: 0 }}>Data rights requests (access, deletion, export): <a href={`mailto:${EMAIL_DPO}`} style={S.link}>{EMAIL_DPO}</a></p>
      </div>

      <div style={S.footer}>
        <Link to="/login" style={S.link}>← Back to Login</Link>
        <Link to="/terms" style={S.link}>Terms of Service</Link>
        <a href="https://berkahkarya.org" target="_blank" rel="noopener noreferrer" style={S.link}>berkahkarya.org</a>
      </div>
    </div>
  );
}
