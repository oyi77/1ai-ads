import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderResearch(el) {
  el.innerHTML = `
    <div class="p-4 sm:p-8">
      <h1 class="text-2xl sm:text-3xl font-bold mb-2">Ads Research</h1>
      <p class="text-slate-400 text-sm mb-6">Search competitor ads from Meta Ad Library (Facebook & Instagram)</p>

      <!-- Search Controls -->
      <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-6">
        <div class="flex flex-col gap-4">
          <!-- Search by keyword -->
          <div>
            <label class="block text-sm text-slate-400 mb-1">Search by keyword</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input type="text" id="keyword-search" placeholder="e.g. digital marketing, skincare, kursus" class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <button id="keyword-btn" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px] whitespace-nowrap">Search Ads</button>
            </div>
          </div>

          <!-- Search by page -->
          <div>
            <label class="block text-sm text-slate-400 mb-1">Search by competitor page</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input type="text" id="page-search" placeholder="Facebook page name or URL (e.g. facebook.com/NikeIndonesia)" class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <button id="page-btn" class="bg-purple-500 hover:bg-purple-600 px-6 py-3 rounded-lg min-h-[44px] whitespace-nowrap">Spy Page</button>
            </div>
          </div>

          <!-- Filters -->
          <div class="flex flex-wrap gap-3">
            <select id="country-filter" class="p-2 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value="ID">Indonesia</option>
              <option value="US">United States</option>
              <option value="MY">Malaysia</option>
              <option value="SG">Singapore</option>
              <option value="ALL">All Countries</option>
            </select>
            <select id="status-filter" class="p-2 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
            <select id="media-filter" class="p-2 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value="ALL">All Media</option>
              <option value="IMAGE">Images</option>
              <option value="VIDEO">Videos</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div id="research-results">
        <p class="text-slate-500 text-center py-8">Enter a keyword or competitor page to start researching ads.</p>
      </div>
    </div>
  `;

  const resultsDiv = el.querySelector('#research-results');
  const getFilters = () => ({
    country: el.querySelector('#country-filter').value,
    status: el.querySelector('#status-filter').value,
    media_type: el.querySelector('#media-filter').value,
  });

  // Keyword search
  el.querySelector('#keyword-btn').addEventListener('click', async () => {
    const q = el.querySelector('#keyword-search').value.trim();
    if (!q) return;
    await doSearch(resultsDiv, q, null, getFilters());
  });

  el.querySelector('#keyword-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.querySelector('#keyword-btn').click();
  });

  // Page search
  el.querySelector('#page-btn').addEventListener('click', async () => {
    const q = el.querySelector('#page-search').value.trim();
    if (!q) return;
    await doPageSearch(resultsDiv, q, getFilters());
  });

  el.querySelector('#page-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.querySelector('#page-btn').click();
  });
}

async function doSearch(container, query, pageId, filters) {
  container.innerHTML = '<div class="text-slate-400 text-center py-8">Searching Meta Ad Library...</div>';

  try {
    const params = new URLSearchParams({ q: query, ...filters });
    const result = await api.get(`/research/search?${params}`);
    renderResults(container, result.data, query);
  } catch (err) {
    container.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg">${esc(err.message)}</div>`;
  }
}

async function doPageSearch(container, pageQuery, filters) {
  container.innerHTML = '<div class="text-slate-400 text-center py-8">Resolving page...</div>';

  try {
    // First resolve page name to ID
    const pageRes = await api.get(`/research/resolve-page?q=${encodeURIComponent(pageQuery)}`);
    const page = pageRes.data;

    container.innerHTML = `<div class="text-slate-400 text-center py-4">Found: <strong>${esc(page.name)}</strong> (${esc(page.category || 'Page')}) - ${(page.fanCount || 0).toLocaleString()} fans. Loading ads...</div>`;

    // Then search by page ID
    const params = new URLSearchParams({ country: filters.country, status: filters.status });
    const result = await api.get(`/research/page/${page.id}?${params}`);
    renderResults(container, result.data, `Page: ${page.name}`);
  } catch (err) {
    container.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg">${esc(err.message)}</div>`;
  }
}

function renderResults(container, data, query) {
  const ads = data.ads || [];
  if (ads.length === 0) {
    container.innerHTML = `<div class="text-slate-500 text-center py-8">No ads found for "${esc(query)}"</div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">${esc(ads.length)} ads found for "${esc(query)}"</h2>
      ${data.hasMore ? '<span class="text-slate-400 text-sm">Showing first page</span>' : ''}
    </div>
    <div class="grid gap-4">
      ${ads.map(ad => `
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="flex flex-col sm:flex-row sm:items-start gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-bold">${esc(ad.pageName)}</span>
                <span class="text-slate-500 text-xs">${esc(ad.platforms?.join(', ') || '')}</span>
              </div>
              ${ad.bodies.length > 0 ? `<p class="text-slate-300 text-sm mb-2">${esc(ad.bodies[0].substring(0, 300))}${ad.bodies[0].length > 300 ? '...' : ''}</p>` : ''}
              ${ad.titles.length > 0 ? `<p class="text-sky-400 text-sm font-medium mb-1">${esc(ad.titles[0])}</p>` : ''}
              ${ad.descriptions.length > 0 ? `<p class="text-slate-400 text-xs mb-2">${esc(ad.descriptions[0])}</p>` : ''}
              <div class="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>Started: ${ad.deliveryStart ? new Date(ad.deliveryStart).toLocaleDateString('id-ID') : 'N/A'}</span>
                ${ad.deliveryStop ? `<span>Ended: ${new Date(ad.deliveryStop).toLocaleDateString('id-ID')}</span>` : '<span class="text-emerald-400">Active</span>'}
                ${ad.spend ? `<span>Spend: ${ad.spend.lower_bound || '?'}-${ad.spend.upper_bound || '?'} ${ad.currency || ''}</span>` : ''}
                ${ad.impressions ? `<span>Impressions: ${ad.impressions.lower_bound || '?'}-${ad.impressions.upper_bound || '?'}</span>` : ''}
                ${ad.audienceSize ? `<span>Audience: ${(ad.audienceSize.lower_bound || 0).toLocaleString()}-${(ad.audienceSize.upper_bound || 0).toLocaleString()}</span>` : ''}
              </div>
            </div>
            ${ad.snapshotUrl ? `<a href="${esc(ad.snapshotUrl)}" target="_blank" rel="noopener" class="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm text-sky-400 min-h-[44px] flex items-center whitespace-nowrap">View Ad</a>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
