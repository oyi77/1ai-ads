import { darkPalettes, lightPalettes } from '../../src/design/colors.js';
import { escapeHtml, validateUrl } from '../lib/escape.js';

function safeParseArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return [];
  try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function safeUrl(url, fallback = '#') {
  if (!url) return fallback;
  return validateUrl(url) ? escapeHtml(url) : fallback;
}

// Uncodixfy: Strict template rules to prevent AI hallucination
export const templates = {
  dark: {
    colors: darkPalettes.void,
    name: 'Void Space'
  },
  slate: {
    colors: darkPalettes.slate,
    name: 'Slate Noir'
  },
  obsidian: {
    colors: darkPalettes.obsidian,
    name: 'Obsidian Depth'
  },
  light: {
    colors: lightPalettes.cloud,
    name: 'Cloud Canvas'
  }
};

// Anti-hallucination: Strict template rendering
export function renderLandingPage(data) {
  const t = templates[data.theme] || templates.dark;
  const c = t.colors;
  
  // Uncodixfy rules enforced:
  // - No <small> headers
  // - No rounded-[20px+] 
  // - No glassmorphism
  // - No gradient backgrounds
  // - No decorative copy
  // - Max border-radius: 12px
  // - System fonts only
  // - Predefined color palette
  
  const benefits = safeParseArray(data.benefits);
  const painPoints = safeParseArray(data.pain_points);

  const productName = escapeHtml(data.product_name || 'Produk');
  const price = escapeHtml(data.price || '');
  const ctaPrimary = escapeHtml(data.cta_primary || 'Beli Sekarang');
  const ctaSecondary = data.cta_secondary ? escapeHtml(data.cta_secondary) : '';
  const checkoutLink = safeUrl(data.checkout_link);
  const waLink = safeUrl(data.wa_link);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${productName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --bg: ${c.bg};
      --surface: ${c.surface};
      --primary: ${c.primary};
      --text: ${c.text};
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, sans-serif;
    }
    .card {
      background: var(--surface);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .btn {
      background: var(--primary);
      border-radius: 8px;
      padding: 12px 24px;
      font-weight: 500;
      color: ${c.bg};
      text-decoration: none;
      display: inline-block;
      min-height: 44px;
      line-height: 20px;
    }
  </style>
</head>
<body>
  <div class="min-h-screen">
    <!-- Hero Section -->
    <section class="p-8 text-center">
      <h1 class="text-3xl font-bold">${productName}</h1>
      <p class="mt-2 text-lg">${price}</p>
    </section>

    <!-- Pain Points Section -->
    <section class="p-8">
      <h2 class="text-xl font-semibold mb-4">Masalah yang Dihadapi</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${painPoints.map(p => `<div class="card p-4">${escapeHtml(p)}</div>`).join('')}
      </div>
    </section>

    <!-- Benefits Section -->
    <section class="p-8">
      <h2 class="text-xl font-semibold mb-4">Keunggulan</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${benefits.map(b => `<div class="card p-4">${escapeHtml(b)}</div>`).join('')}
      </div>
    </section>

    <!-- CTA Section -->
    <section class="p-8 text-center">
      <a href="${checkoutLink}" class="btn">
        ${ctaPrimary}
      </a>
      ${ctaSecondary ? `<a href="${waLink}" class="btn ml-4" style="background: var(--surface); border: 1px solid var(--primary);">${ctaSecondary}</a>` : ''}
    </section>
  </div>
</body>
</html>`;
}
