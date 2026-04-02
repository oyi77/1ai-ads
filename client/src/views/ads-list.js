import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderAdsList(el) {
  try {
    const { data: ads } = await api.get('/ads');
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4">Ads Library</h1>
        <div class="flex flex-col sm:flex-row gap-3 mb-4">
          <input type="text" id="ads-search" placeholder="Search ads..." class="flex-1 p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
          <a href="#/ads/create" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg text-center min-h-[44px] inline-flex items-center justify-center">Create Ad</a>
        </div>
        <div id="ads-grid" class="grid gap-4">
          ${renderAdsGrid(ads)}
        </div>
      </div>
    `;

    // Search with debounce
    let timer;
    el.querySelector('#ads-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = e.target.value.trim();
        try {
          const result = q.length >= 2 ? await api.get(`/ads/search?q=${encodeURIComponent(q)}`) : await api.get('/ads');
          el.querySelector('#ads-grid').innerHTML = renderAdsGrid(result.data);
          attachDeleteHandlers(el);
        } catch {}
      }, 300);
    });

    attachDeleteHandlers(el);
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load ads: ${esc(e.message)}</div>`;
  }
}

function renderAdsGrid(ads) {
  if (ads.length === 0) return '<p class="text-slate-400">No ads found.</p>';
  return ads.map(ad => `
    <div class="bg-slate-800 p-4 rounded-lg flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
      <div class="flex-1">
        <div class="font-bold">${esc(ad.name || 'Untitled')}</div>
        <div class="text-slate-400 text-sm">${esc(ad.platform)} | ${esc(ad.content_model || 'N/A')}</div>
        <div class="text-slate-500 text-xs mt-1">${esc(ad.hook || '')}</div>
      </div>
      <button data-delete="${esc(ad.id)}" class="text-red-400 hover:text-red-300 text-sm min-h-[44px] px-2 self-end sm:self-start">Delete</button>
    </div>
  `).join('');
}

function attachDeleteHandlers(el) {
  el.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this ad?')) return;
      await api.del(`/ads/${btn.dataset.delete}`);
      renderAdsList(el);
    });
  });
}
