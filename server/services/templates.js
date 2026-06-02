import { escapeHtml, validateUrl } from '../lib/escape.js';

export const templates = {
  dark: {
    colors: {
      bg: '#0a0a0a',
      text: '#ffffff',
      accent: '#6366f1',
      secondary: '#374151'
    }
  },
  light: {
    colors: {
      bg: '#ffffff',
      text: '#111827',
      accent: '#6366f1',
      secondary: '#9ca3af'
    }
  }
};

const THEME_STYLES = {
  dark: { bg: '#0a0a0a', text: '#ffffff', accent: '#6366f1', secondary: '#374151' },
  light: { bg: '#ffffff', text: '#111827', accent: '#6366f1', secondary: '#9ca3af' },
};

const COOKIE_SCRIPT = `
  const cookieBanner = document.getElementById('cookie-banner');
  if (!localStorage.getItem('cookieConsent')) {
    cookieBanner.style.display = 'flex';
  } else {
    cookieBanner.style.display = 'none';
  }
  document.getElementById('accept-cookies').addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'accepted');
    cookieBanner.style.display = 'none';
  });
  document.getElementById('decline-cookies').addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'declined');
    cookieBanner.style.display = 'none';
  });

  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      if (this.getAttribute('href') === '#') {
        e.preventDefault();
        alert('Please configure your checkout or WhatsApp link!');
      }
    });
  });
`;

function parseListField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}

function safeLink(url) {
  return validateUrl(url) ? escapeHtml(url) : '#';
}

function buildPainPointsSection(painPointsList) {
  if (!painPointsList.length) return '';
  return `
  <section class="section pain-points">
    <div class="container">
      <h2 class="section-title">Struggling With These Problems?</h2>
      <div class="grid sm:grid-cols-2 md:grid-cols-3">
        ${painPointsList.map(point => `
          <div class="card">
            <h3>❌ ${escapeHtml(point)}</h3>
            <p>You're not alone - thousands face this daily challenge.</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>`;
}

function buildBenefitsSection(benefitsList, productName) {
  if (!benefitsList.length) return '';
  return `
  <section class="section benefits">
    <div class="container">
      <h2 class="section-title">Why Choose ${escapeHtml(productName || 'Product')}?</h2>
      <div class="grid sm:grid-cols-2 md:grid-cols-3">
        ${benefitsList.map(benefit => `
          <div class="card">
            <h3>✨ ${escapeHtml(benefit)}</h3>
            <p>Experience difference with our proven solution.</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>`;
}

function buildCtaSection(styles, checkoutLink, waLink, ctaPrimary, ctaSecondary) {
  return `
  <section class="cta-section">
    <div class="container">
      <h2>Ready to Get Started?</h2>
      <p style="margin: 20px 0; color: ${styles.secondary};">Join thousands of satisfied customers today</p>
      <div>
        ${ctaPrimary ? `<a href="${checkoutLink}" class="btn btn-primary">${escapeHtml(ctaPrimary)}</a>` : ''}
        ${ctaSecondary ? `<a href="${waLink}" class="btn btn-secondary">${escapeHtml(ctaSecondary)}</a>` : ''}
      </div>
    </div>
  </section>`;
}

function buildFooter(styles, productName) {
  return `
  <footer style="padding: 40px 20px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 40px; font-size: 0.875rem; color: ${styles.secondary};">
    <div style="margin-bottom: 15px;">
      <a href="/#/privacy" style="color: ${styles.secondary}; text-decoration: none; margin: 0 10px;">Privacy Policy</a>
      <a href="/#/terms" style="color: ${styles.secondary}; text-decoration: none; margin: 0 10px;">Terms of Service</a>
      <a href="/#/gdpr" style="color: ${styles.secondary}; text-decoration: none; margin: 0 10px;">GDPR</a>
    </div>
    <p>&copy; ${new Date().getFullYear()} ${escapeHtml(productName || 'Product')}. All rights reserved.</p>
  </footer>`;
}

function buildCookieBanner(styles) {
  return `
  <div id="cookie-banner" style="position: fixed; bottom: 0; left: 0; right: 0; background: ${styles.bg}; border-top: 1px solid ${styles.accent}; padding: 15px 20px; z-index: 9999; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; box-shadow: 0 -4px 20px rgba(0,0,0,0.2);">
    <p style="margin: 0 20px 10px 0; font-size: 0.9rem; flex: 1; min-width: 280px;">
      We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic. By clicking "Accept All", you consent to our use of cookies. Read our <a href="/#/privacy" style="color: ${styles.accent}; text-decoration: underline;">Privacy Policy</a>.
    </p>
    <div style="display: flex; gap: 10px;">
      <button id="decline-cookies" style="background: transparent; border: 1px solid ${styles.secondary}; color: ${styles.text}; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">Decline</button>
      <button id="accept-cookies" style="background: ${styles.accent}; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">Accept All</button>
    </div>
  </div>`;
}

function buildHeroSection(styles, productName, price, checkoutLink, waLink, ctaPrimary, ctaSecondary) {
  return `
  <section class="hero">
    <div class="container">
      <h1>${escapeHtml(productName || 'Product')}</h1>
      <p>Transform your life with our exclusive solution</p>
      ${price ? `<div class="price-tag">${escapeHtml(price)}</div>` : ''}
      <div>
        ${ctaPrimary ? `<a href="${checkoutLink}" class="btn btn-primary">${escapeHtml(ctaPrimary)}</a>` : ''}
        ${ctaSecondary ? `<a href="${waLink}" class="btn btn-secondary">${escapeHtml(ctaSecondary)}</a>` : ''}
      </div>
    </div>
  </section>`;
}

export function renderLandingPage({ theme, product_name, price, benefits, pain_points, cta_primary, cta_secondary, wa_link, checkout_link }) {
  const styles = THEME_STYLES[theme] || THEME_STYLES.dark;
  const benefitsList = parseListField(benefits);
  const painPointsList = parseListField(pain_points);
  const safeCheckoutLink = safeLink(checkout_link);
  const safeWaLink = safeLink(wa_link);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(product_name || 'Product')} | Exclusive Offer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${styles.bg}; color: ${styles.text}; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    .hero { text-align: center; padding: 100px 20px; }
    .hero h1 { font-size: 3rem; margin-bottom: 20px; color: ${styles.accent}; }
    .urgency-bar { background-color: ${styles.accent}; padding: 15px; text-align: center; font-weight: 600; }
    .cta-section { text-align: center; padding: 100px 20px; background-color: rgba(99, 102, 241, 0.1); }
    @media (max-width: 768px) { .hero h1 { font-size: 2rem; } .price-tag { font-size: 2rem; } }
  </style>
</head>
<body>
  <div class="urgency-bar">\u{1F525} Limited Time Offer - Act Now!</div>

  ${buildHeroSection(styles, product_name, price, safeCheckoutLink, safeWaLink, cta_primary, cta_secondary)}
  ${buildPainPointsSection(painPointsList)}
  ${buildBenefitsSection(benefitsList, product_name)}
  ${buildCtaSection(styles, safeCheckoutLink, safeWaLink, cta_primary, cta_secondary)}
  ${buildFooter(styles, product_name)}
  ${buildCookieBanner(styles)}

  <script>${COOKIE_SCRIPT}</script>
</body>
</html>`;
}