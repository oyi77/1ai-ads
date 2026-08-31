import { useState, useEffect } from 'react';

const CONSENT_KEY = '1ai-ads_cookie_consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
    // Load GA4 dynamically after consent — never before
    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
      const gtagScript = document.createElement('script');
      gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-V9C14XZ9SG';
      gtagScript.async = true;
      document.head.appendChild(gtagScript);
      const w = window as any;
      w.dataLayer = w.dataLayer || [];
      function gtag(...args: unknown[]) { w.dataLayer.push(args); }
      w.gtag = gtag;
      gtag('js', new Date());
      gtag('config', 'G-V9C14XZ9SG');
    }
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-strong)',
        padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16,
        zIndex: 1000, fontFamily: 'var(--font)', fontSize: '0.8rem',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ flex: 1, color: 'var(--text-secondary)', minWidth: 200 }}>
        We use cookies to improve your experience. By continuing, you agree to our{' '}
        <a href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</a>.
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={decline}
          style={{
            padding: '8px 16px', background: 'none', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: '0.8rem',
          }}
        >
          Decline
        </button>
        <button
          onClick={accept}
          style={{
            padding: '8px 16px', background: 'var(--accent)', border: 'none',
            borderRadius: 6, color: 'var(--bg-deep)', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: '0.8rem',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
