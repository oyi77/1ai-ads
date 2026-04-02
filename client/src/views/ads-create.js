import { api } from '../lib/api.js';

export function renderAdsCreate(el) {
  el.innerHTML = `
    <div class="p-4 sm:p-8">
      <h1 class="text-2xl sm:text-3xl font-bold mb-4">Generate Ads</h1>
      <form id="generate-form" class="space-y-4 max-w-lg">
        <div>
          <label class="block text-sm text-slate-400 mb-1">Product Name</label>
          <input type="text" name="product" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" required>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Target Audience</label>
          <input type="text" name="target" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" required>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Keunggulan (Key Selling Points)</label>
          <textarea name="keunggulan" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" rows="3" required></textarea>
        </div>
        <button type="submit" class="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-medium min-h-[44px]">Generate 4 Ads</button>
      </form>
      <div id="result" class="mt-8"></div>
    </div>
  `;

  const form = el.querySelector('#generate-form');
  const resultDiv = el.querySelector('#result');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    resultDiv.innerHTML = '<div class="text-slate-400">Generating 4 ad variations via AI...</div>';

    const fd = new FormData(form);
    const data = Object.fromEntries(fd);

    try {
      const result = await api.post('/ads/generate', data);
      const ads = result.data.ads || [];

      if (result.data.error) {
        resultDiv.innerHTML = `<div class="bg-yellow-900 border border-yellow-700 p-4 rounded-lg">AI returned non-JSON. Raw response saved.</div>`;
        return;
      }

      let saved = 0;
      for (const ad of ads) {
        await api.post('/ads', {
          name: ad.model_name || 'Untitled',
          product: data.product,
          target: data.target,
          keunggulan: data.keunggulan,
          content_model: ad.model_name,
          hook: ad.hook,
          body: ad.body,
          cta: ad.cta,
        });
        saved++;
      }
      resultDiv.innerHTML = `
        <div class="bg-emerald-900 border border-emerald-700 p-4 rounded-lg mb-4">Saved ${saved} ads to library</div>
        <a href="#/ads" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg inline-block min-h-[44px]">View Ads Library</a>
      `;
    } catch (err) {
      resultDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg">Error: ${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate 4 Ads';
    }
  });
}
