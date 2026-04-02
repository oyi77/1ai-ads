import { router } from './router.js';

const app = document.getElementById('app');

function render() {
  const path = window.location.pathname;
  const view = router[path] || router['/'];
  const result = view();
  if (result && typeof result.then === 'function') {
    result.then(html => { app.innerHTML = html; });
  } else {
    app.innerHTML = result;
  }
}

window.addEventListener('popstate', render);
window.addEventListener('DOMContentLoaded', render);

// Dashboard — fetches live metrics
router['/'] = async () => {
  try {
    const res = await fetch('/api/analytics/dashboard');
    const { data: m } = await res.json();

    const fmtIdr = (n) => n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

    return `
      <div class="p-8">
        <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">Total Spend</div>
            <div class="text-2xl font-bold">${fmtIdr(m.total_spend)}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">Total Revenue</div>
            <div class="text-2xl font-bold">${fmtIdr(m.total_revenue)}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">ROAS</div>
            <div class="text-2xl font-bold">${m.avg_roas.toFixed(1)}x</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">CTR</div>
            <div class="text-2xl font-bold">${m.avg_ctr.toFixed(2)}%</div>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">CPC</div>
            <div class="text-2xl font-bold">${fmtIdr(m.avg_cpc)}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">CPA</div>
            <div class="text-2xl font-bold">${fmtIdr(m.avg_cpa)}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-sm">Conversions</div>
            <div class="text-2xl font-bold">${m.total_conversions}</div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    return `<div class="p-8"><h1 class="text-3xl font-bold mb-4">Dashboard</h1><p class="text-red-400">Failed to load metrics: ${e.message}</p></div>`;
  }
};

// Ads Library - async fetch
router['/ads'] = async () => {
  const res = await fetch('/api/ads');
  const { data: ads } = await res.json();
  
  return `
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-4">Ads Library</h1>
      <a href="/ads/create" class="bg-sky-500 px-4 py-2 rounded inline-block mb-4">Create Ad</a>
      <div class="grid gap-4">
        ${ads.length === 0 ? '<p class="text-slate-400">No ads yet. Create your first ad!</p>' : ''}
        ${ads.map(ad => `
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="font-bold">${ad.name || 'Untitled'}</div>
            <div class="text-slate-400 text-sm">${ad.platform} | ${ad.content_model || 'N/A'}</div>
            <div class="text-slate-500 text-xs">${ad.hook || ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
};

// Ads Create — generates via AI then saves each variation to DB
router['/ads/create'] = () => `
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-4">Generate Ads</h1>
    <form id="generate-form" class="space-y-4 max-w-lg">
      <input type="text" name="product" placeholder="Product Name" class="w-full p-2 bg-slate-800 rounded" required>
      <input type="text" name="target" placeholder="Target Audience" class="w-full p-2 bg-slate-800 rounded" required>
      <textarea name="keunggulan" placeholder="Keunggulan (key selling points)" class="w-full p-2 bg-slate-800 rounded" required></textarea>
      <button type="submit" class="bg-sky-500 px-4 py-2 rounded">Generate</button>
    </form>
    <div id="result" class="mt-8"></div>
  </div>
  <script>
    document.getElementById('generate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      try {
        const res = await fetch('/api/ads/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error);
        const ads = result.data.ads || [];
        let saved = 0;
        for (const ad of ads) {
          await fetch('/api/ads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: ad.model_name || 'Untitled',
              product: data.product,
              target: data.target,
              keunggulan: data.keunggulan,
              content_model: ad.model_name,
              hook: ad.hook,
              body: ad.body,
              cta: ad.cta
            })
          });
          saved++;
        }
        document.getElementById('result').innerHTML =
          '<div class="bg-emerald-900 border border-emerald-700 p-4 rounded-lg mb-4">Saved ' + saved + ' ads to library</div>' +
          '<a href="/ads" class="bg-sky-500 px-4 py-2 rounded inline-block">View Ads Library</a>';
      } catch (err) {
        document.getElementById('result').innerHTML =
          '<div class="bg-red-900 border border-red-700 p-4 rounded-lg">Error: ' + err.message + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate';
      }
    });
  </script>
`;

// Landing pages
router['/landing'] = async () => {
  const res = await fetch('/api/landing');
  const { data: pages } = await res.json();
  
  return `
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-4">Landing Pages</h1>
      <a href="/landing/create" class="bg-sky-500 px-4 py-2 rounded inline-block mb-4">Create Page</a>
      <div class="grid gap-4">
        ${pages.length === 0 ? '<p class="text-slate-400">No landing pages yet.</p>' : ''}
        ${pages.map(p => `
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="font-bold">${p.name || 'Untitled'}</div>
            <div class="text-slate-400 text-sm">${p.template} | ${p.theme}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
};

// Landing page create — previews then saves to DB
router['/landing/create'] = () => `
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-4">Create Landing Page</h1>
    <form id="lp-form" class="space-y-4 max-w-lg">
      <input type="text" name="name" placeholder="Page Name" class="w-full p-2 bg-slate-800 rounded" required>
      <input type="text" name="product_name" placeholder="Product Name" class="w-full p-2 bg-slate-800 rounded" required>
      <input type="text" name="price" placeholder="Price" class="w-full p-2 bg-slate-800 rounded">
      <input type="text" name="cta_primary" placeholder="CTA Text" class="w-full p-2 bg-slate-800 rounded">
      <input type="text" name="checkout_link" placeholder="Checkout Link" class="w-full p-2 bg-slate-800 rounded">
      <select name="theme" class="w-full p-2 bg-slate-800 rounded">
        <option value="dark">Dark (Void)</option>
        <option value="slate">Slate Noir</option>
        <option value="obsidian">Obsidian Depth</option>
        <option value="light">Light (Cloud)</option>
      </select>
      <button type="submit" class="bg-emerald-500 px-4 py-2 rounded">Preview & Save</button>
    </form>
    <div id="preview" class="mt-8"></div>
  </div>
  <script>
    document.getElementById('lp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      try {
        const res = await fetch('/api/landing/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        document.getElementById('preview').innerHTML = result.data.html_output;
        await fetch('/api/landing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, template: data.theme })
        });
      } catch (err) {
        document.getElementById('preview').innerHTML =
          '<div class="bg-red-900 border border-red-700 p-4 rounded-lg">Error: ' + err.message + '</div>';
      }
    });
  </script>
`;

// Analytics
router['/analytics'] = async () => {
  const res = await fetch('/api/analytics/dashboard');
  const { data: metrics } = await res.json();
  
  return `
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-4">Analytics</h1>
      <div class="grid grid-cols-4 gap-4">
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400">Total Spend</div>
          <div class="text-2xl font-bold">$${metrics.total_spend}</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400">ROAS</div>
          <div class="text-2xl font-bold">${metrics.avg_roas}x</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400">CTR</div>
          <div class="text-2xl font-bold">${metrics.avg_ctr.toFixed(2)}%</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400">CPC</div>
          <div class="text-2xl font-bold">$${metrics.avg_cpc.toFixed(2)}</div>
        </div>
      </div>
    </div>
  `;
};
