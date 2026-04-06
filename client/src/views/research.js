import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderResearch(el) {
  // Check if Meta is configured
  let metaConfigured = false;
  try {
    const creds = await api.get('/settings/credentials/meta');
    metaConfigured = creds.data.configured;
  } catch {}

  el.innerHTML = `
    <div class="p-4 sm:p-8">
      <h1 class="text-2xl sm:text-3xl font-bold mb-2">Ads Research</h1>
      <p class="text-slate-400 text-sm mb-6">Research competitor ads and discover winning campaigns</p>

      ${!metaConfigured ? `
        <div class="bg-yellow-900 border border-yellow-700 p-4 rounded-lg mb-6">
          Meta access token not configured. <a href="#/settings" class="text-sky-400 hover:underline">Go to Settings</a> to add it.
        </div>
      ` : ''}

      <!-- Competitor Research -->
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4">Competitor Ad Spy</h2>
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg">
          <div class="flex flex-col sm:flex-row gap-3 mb-4">
            <input type="text" id="spy-search" placeholder="Search competitor page name..." class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            <button id="spy-btn" class="bg-purple-500 hover:bg-purple-600 px-6 py-3 rounded-lg min-h-[44px] whitespace-nowrap">Search Pages</button>
          </div>
          <div id="spy-results"></div>
        </div>
      </section>

      <!-- Ad Library Search -->
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4">Ad Library Search</h2>
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg">
          <div class="flex flex-col sm:flex-row gap-3 mb-4">
            <input type="text" id="adlib-search" placeholder="Search ads by keyword (e.g. skincare, kursus)" class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            <select id="adlib-country" class="p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value="ID">Indonesia</option>
              <option value="US">United States</option>
              <option value="MY">Malaysia</option>
              <option value="SG">Singapore</option>
            </select>
            <button id="adlib-btn" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px] whitespace-nowrap">Search Ads</button>
          </div>
          <div id="adlib-results"></div>
        </div>
      </section>
    </div>
  `;

  // Spy search
  el.querySelector('#spy-btn')?.addEventListener('click', () => {
    const q = el.querySelector('#spy-search').value.trim();
    if (q) searchPages(el.querySelector('#spy-results'), q);
  });
  el.querySelector('#spy-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.querySelector('#spy-btn').click();
  });

  // Ad Library search
  el.querySelector('#adlib-btn')?.addEventListener('click', () => {
    const q = el.querySelector('#adlib-search').value.trim();
    const country = el.querySelector('#adlib-country').value;
    if (q) searchAdLibrary(el.querySelector('#adlib-results'), q, country);
  });
  el.querySelector('#adlib-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.querySelector('#adlib-btn').click();
  });
}

async function searchPages(container, query) {
  container.innerHTML = '<p class="text-slate-400">Searching...</p>';
  try {
    const { data: pages } = await api.get(`/meta/search-pages?q=${encodeURIComponent(query)}`);
    if (pages.length === 0) {
      container.innerHTML = `<p class="text-slate-500">No pages found for "${esc(query)}"</p>`;
      return;
    }
    container.innerHTML = pages.map(p => `
      <div class="bg-slate-900 p-3 rounded-lg mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <span class="font-medium">${esc(p.name)}</span>
          <span class="text-slate-500 text-sm ml-2">${esc(p.category || '')} | ${(p.fan_count || 0).toLocaleString()} fans</span>
        </div>
        <button data-spy-page="${esc(p.id)}" data-spy-name="${esc(p.name)}" class="bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg text-sm min-h-[44px]">Spy Ads</button>
      </div>
    `).join('');

    container.querySelectorAll('[data-spy-page]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.textContent = 'Loading...';
        try {
          const { data } = await api.get(`/meta/page-ads/${btn.dataset.spyPage}`);
          if (data.source === 'ads_archive' && data.ads.length > 0) {
            container.innerHTML += '<div class="mt-4 space-y-3">' + data.ads.map(ad => `
              <div class="bg-slate-900 p-3 rounded-lg">
                <div class="font-medium">${esc(ad.page_name)}</div>
                ${(ad.ad_creative_bodies || []).map(b => `<p class="text-slate-300 text-sm mt-1">${esc(b.substring(0, 300))}</p>`).join('')}
                ${ad.ad_snapshot_url ? `<a href="${esc(ad.ad_snapshot_url)}" target="_blank" class="text-sky-400 text-sm hover:underline mt-1 inline-block">View Creative</a>` : ''}
              </div>
            `).join('') + '</div>';
          } else {
            container.innerHTML += `<div class="mt-3 bg-slate-900 p-3 rounded-lg text-sm">
              <p class="text-yellow-400">Ad Library API access not available. Page info:</p>
              <p class="text-slate-300 mt-1">${esc(data.page?.name || btn.dataset.spyName)} - ${esc(data.page?.category || 'Unknown')} | ${(data.page?.fan_count || 0).toLocaleString()} fans</p>
              ${data.page?.website ? `<p class="text-slate-400 text-xs mt-1">Website: ${esc(data.page.website)}</p>` : ''}
              <p class="text-slate-500 text-xs mt-2">To access competitor ads, apply for Ad Library API at <a href="https://www.facebook.com/ads/library/api" target="_blank" class="text-sky-400 hover:underline">facebook.com/ads/library/api</a></p>
            </div>`;
          }
        } catch (err) {
          container.innerHTML += `<div class="mt-2 text-red-400 text-sm">${esc(err.message)}</div>`;
        }
        btn.textContent = 'Spy Ads';
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="text-red-400">${esc(err.message)}</div>`;
  }
}

async function searchAdLibrary(container, query, country) {
  container.innerHTML = '<p class="text-slate-400">Searching Meta Ad Library...</p>';
  try {
    const { data } = await api.get(`/research/search?q=${encodeURIComponent(query)}&country=${country}`);
    const ads = data.ads || [];
    if (ads.length === 0) {
      container.innerHTML = `<p class="text-slate-500">No results. The Ad Library API may need separate app approval. <a href="https://www.facebook.com/ads/library/api" target="_blank" class="text-sky-400 hover:underline">Apply here</a></p>`;
      return;
    }
    container.innerHTML = `<p class="text-sm text-slate-400 mb-3">${ads.length} ads found</p>` +
      ads.map(ad => `
        <div class="bg-slate-900 p-3 rounded-lg mt-2">
          <div class="font-medium">${esc(ad.pageName)}</div>
          ${ad.bodies.length > 0 ? `<p class="text-slate-300 text-sm mt-1">${esc(ad.bodies[0].substring(0, 300))}</p>` : ''}
          ${ad.snapshotUrl ? `<a href="${esc(ad.snapshotUrl)}" target="_blank" class="text-sky-400 text-sm hover:underline">View Ad</a>` : ''}
        </div>
      `).join('');
  } catch (err) {
    container.innerHTML = `<div class="text-red-400">${esc(err.message)}</div>`;
  }
}
