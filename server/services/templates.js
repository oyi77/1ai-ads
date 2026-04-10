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

export function renderLandingPage({ theme, product_name, price, benefits, pain_points, cta_primary, cta_secondary, wa_link, checkout_link }) {
  const themeStyles = {
    dark: {
      bg: '#0a0a0a',
      text: '#ffffff',
      accent: '#6366f1',
      secondary: '#374151'
    },
    light: {
      bg: '#ffffff',
      text: '#111827',
      accent: '#6366f1',
      secondary: '#9ca3af'
    }
  };

  const styles = themeStyles[theme] || themeStyles.dark;

  // Safely parse benefits and pain_points
  let benefitsList = [];
  let painPointsList = [];

  if (Array.isArray(benefits)) {
    benefitsList = benefits;
  } else if (typeof benefits === 'string') {
    try {
      benefitsList = JSON.parse(benefits);
      if (!Array.isArray(benefitsList)) benefitsList = [];
    } catch {
      benefitsList = [];
    }
  }

  if (Array.isArray(pain_points)) {
    painPointsList = pain_points;
  } else if (typeof pain_points === 'string') {
    try {
      painPointsList = JSON.parse(pain_points);
      if (!Array.isArray(painPointsList)) painPointsList = [];
    } catch {
      painPointsList = [];
    }
  }

  // Escape and validate URLs
  const safeCheckoutLink = validateUrl(checkout_link) ? escapeHtml(checkout_link) : '#';
  const safeWaLink = validateUrl(wa_link) ? escapeHtml(wa_link) : '#';

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
    .hero h1 { font-size: 3rem; margin-bottom: 20px; background: linear-gradient(135deg, ${styles.accent}, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 1.25rem; color: ${styles.secondary}; margin-bottom: 30px; }
    .price-tag { font-size: 2.5rem; font-weight: bold; color: ${styles.accent}; margin: 20px 0; }
    .btn { display: inline-block; padding: 16px 40px; font-size: 1.1rem; font-weight: 600; border-radius: 8px; cursor: pointer; text-decoration: none; transition: all 0.3s ease; border: none; margin: 10px; }
    .btn-primary { background: ${styles.accent}; color: white; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3); }
    .btn-secondary { background: transparent; color: ${styles.text}; border: 2px solid ${styles.accent}; }
    .btn-secondary:hover { background: ${styles.accent}; color: white; }
    .section { padding: 80px 20px; }
    .section-title { text-align: center; font-size: 2.5rem; margin-bottom: 50px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
    .sm\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
    .md\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
    @media (min-width: 640px) { .sm\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 768px) { .md\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr); } }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 30px; }
    .card h3 { margin-bottom: 15px; color: ${styles.accent}; }
    .pain-points .card { border-color: rgba(239, 68, 68, 0.3); }
    .pain-points h3 { color: #ef4444; }
    .urgency-bar { background: linear-gradient(90deg, ${styles.accent}, #8b5cf6); padding: 15px; text-align: center; font-weight: 600; }
    .cta-section { text-align: center; padding: 100px 20px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); }
    @media (max-width: 768px) { .hero h1 { font-size: 2rem; } .price-tag { font-size: 2rem; } }
  </style>
</head>
<body>
  <div class="urgency-bar">🔥 Limited Time Offer - Act Now!</div>

  <section class="hero">
    <div class="container">
      <h1>${escapeHtml(product_name || 'Product')}</h1>
      <p>Transform your life with our exclusive solution</p>
      ${price ? `<div class="price-tag">${escapeHtml(price)}</div>` : ''}
      <div>
        ${cta_primary ? `<a href="${safeCheckoutLink}" class="btn btn-primary">${escapeHtml(cta_primary)}</a>` : ''}
        ${cta_secondary ? `<a href="${safeWaLink}" class="btn btn-secondary">${escapeHtml(cta_secondary)}</a>` : ''}
      </div>
    </div>
  </section>

  ${painPointsList.length > 0 ? `
  <section class="section pain-points">
    <div class="container">
      <h2 class="section-title">Struggling With These Problems?</h2>
      <div class="grid sm\:grid-cols-2 md\:grid-cols-3">
        ${painPointsList.map(point => `
          <div class="card">
            <h3>❌ ${escapeHtml(point)}</h3>
            <p>You're not alone - thousands face this daily challenge.</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>
  ` : ''}

  ${benefitsList.length > 0 ? `
  <section class="section benefits">
    <div class="container">
      <h2 class="section-title">Why Choose ${escapeHtml(product_name || 'Product')}?</h2>
      <div class="grid sm\:grid-cols-2 md\:grid-cols-3">
        ${benefitsList.map(benefit => `
          <div class="card">
            <h3>✨ ${escapeHtml(benefit)}</h3>
            <p>Experience difference with our proven solution.</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>
  ` : ''}

  <section class="cta-section">
    <div class="container">
      <h2>Ready to Get Started?</h2>
      <p style="margin: 20px 0; color: ${styles.secondary};">Join thousands of satisfied customers today</p>
      <div>
        ${cta_primary ? `<a href="${safeCheckoutLink}" class="btn btn-primary">${escapeHtml(cta_primary)}</a>` : ''}
        ${cta_secondary ? `<a href="${safeWaLink}" class="btn btn-secondary">${escapeHtml(cta_secondary)}</a>` : ''}
      </div>
    </div>
  </section>

  <script>
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        if (this.getAttribute('href') === '#') {
          e.preventDefault();
          alert('Please configure your checkout or WhatsApp link!');
        }
      });
    });
  </script>
</body>
</html>`;
}
