import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderAdsLibraryAiView(el) {
  el.innerHTML = `
    <div class="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
      <div class="max-w-5xl mx-auto">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-3xl font-black text-white tracking-tight">Ads Library AI Search</h1>
            <p class="text-slate-400 text-sm mt-1">Direct browser-session access to Meta's Ad Library GraphQL endpoint.</p>
          </div>
          <div class="flex items-center gap-3">
            <div id="status-pill" class="text-xs px-3 py-1 rounded-full bg-slate-700 text-slate-300">checking…</div>
            <a href="#/settings" class="text-xs bg-[#161b22] border border-[#30363d] text-slate-300 px-3 py-1.5 rounded-md hover:text-white">⚙ Settings</a>
          </div>
        </div>

        <div id="setup-banner" class="hidden bg-amber-900/30 border border-amber-700/50 p-4 rounded-xl mb-4 text-amber-200 text-sm flex items-center justify-between">
          <span>⚠ Ads Library AI not configured. Add cookies in Settings.</span>
          <a href="#/settings" class="text-sky-400 underline whitespace-nowrap">Open Settings →</a>
        </div>

        <form id="search-form" class="bg-[#0d1117] border border-[#1c2128] rounded-2xl p-4 mb-6">
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Search query</label>
              <input type="text" id="search-q" class="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white" placeholder="brand, keyword, URL, or page name" required>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Country</label>
              <select id="search-country" class="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-white">
                <option value="ID" selected>Indonesia (ID)</option>
                <option value="US">United States (US)</option>
                <option value="MY">Malaysia (MY)</option>
                <option value="SG">Singapore (SG)</option>
                <option value="GB">United Kingdom (GB)</option>
                <option value="AU">Australia (AU)</option>
                <option value="BR">Brazil (BR)</option>
              </select>
            </div>
            <div class="flex items-end">
              <button type="submit" id="search-btn" class="w-full bg-sky-600 hover:bg-sky-500 px-6 py-3 rounded-lg font-bold text-white whitespace-nowrap">Search</button>
            </div>
          </div>
          <p class="text-xs text-slate-500 mt-2">Proxies to facebook.com/api/graphql with doc_id <code class="bg-slate-800 px-1 rounded">29650582277919185</code></p>
        </form>

        <div id="result-meta" class="text-sm text-slate-400 mb-3"></div>
        <div id="results" class="space-y-3"></div>
      </div>
    </div>
  `;

  const form = el.querySelector('#search-form');
  const qInput = el.querySelector('#search-q');
  const countrySelect = el.querySelector('#search-country');
  const searchBtn = el.querySelector('#search-btn');
  const resultsEl = el.querySelector('#results');
  const metaEl = el.querySelector('#result-meta');
  const statusPill = el.querySelector('#status-pill');
  const setupBanner = el.querySelector('#setup-banner');

  let lastResults = [];

  async function checkStatus() {
    try {
      const { data } = await api.get('/ads-library-ai/status');
      statusPill.textContent = data.configured ? `✓ ${data.source}` : '⚠ not configured';
      statusPill.className = data.configured
        ? 'text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300'
        : 'text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300';
      setupBanner.classList.toggle('hidden', data.configured);
    } catch (e) {
      statusPill.textContent = 'error';
      statusPill.className = 'text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-300';
    }
  }

  function renderAd(ad, index) {
    const pageName = ad.pageName || ad.page_name || ad.advertiser || 'Unknown page';
    const body = ad.ad_creative_bodies?.[0] || ad.body || ad.creativeBody || ad.text || '';
    const title = ad.ad_creative_link_titles?.[0] || ad.title || ad.linkTitle || '';
    const platforms = ad.publisher_platforms || ad.platforms || [];
    const start = ad.ad_delivery_start_time || ad.startDate || '';
    const spend = ad.spend || ad.spendAmount;
    const snapshot = ad.ad_snapshot_url || ad.snapshotUrl || ad.snapshot_url;
    const id = ad.id || ad.adid || ad.adArchiveId || `result-${index}`;

    return `
      <div class="bg-[#161b22] border border-[#1c2128] rounded-xl p-5">
        <div class="flex items-start justify-between gap-3 mb-2">
          <h3 class="font-bold text-white">${esc(pageName)}</h3>
          <span class="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 rounded uppercase">${esc(platforms.join(', ') || 'unknown')}</span>
        </div>
        ${title ? `<div class="text-sm text-sky-400 font-medium mb-2">${esc(title)}</div>` : ''}
        ${body ? `<p class="text-sm text-slate-300 mb-3 whitespace-pre-wrap">${esc(body)}</p>` : ''}
        <div class="flex items-center gap-4 text-xs text-slate-500">
          ${start ? `<span>Started: ${esc(start)}</span>` : ''}
          ${spend ? `<span>Spend: ${esc(spend)}</span>` : ''}
          <span class="ml-auto text-[10px] text-slate-600">id: ${esc(String(id).slice(0, 24))}</span>
        </div>
        ${snapshot ? `<a href="${esc(snapshot)}" target="_blank" rel="noopener" class="mt-3 inline-block text-xs text-sky-400 hover:underline">View snapshot →</a>` : ''}
      </div>
    `;
  }

  function renderRaw(payload) {
    return `<details class="bg-[#0d1117] border border-[#1c2128] rounded-xl p-4"><summary class="cursor-pointer text-sm font-bold text-slate-300">Raw response (debug)</summary><pre class="text-xs text-slate-400 mt-3 overflow-x-auto whitespace-pre-wrap">${esc(JSON.stringify(payload, null, 2)).slice(0, 8000)}</pre></details>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = qInput.value.trim();
    if (!query) return;
    const country = countrySelect.value;
    searchBtn.disabled = true;
    searchBtn.textContent = '...';
    resultsEl.innerHTML = '';
    metaEl.textContent = 'Searching…';
    try {
      const { data } = await api.post('/ads-library-ai/search', { query, country });
      const raw = data?.data;
      const ads = raw?.ads || raw?.results || raw?.data?.ads || raw?.ad_library_search?.ads || raw?.adLibrarySearch?.ads || (Array.isArray(raw) ? raw : []);
      lastResults = ads;
      metaEl.textContent = ads.length > 0
        ? `${ads.length} ads for "${query}" in ${country}`
        : `0 ads for "${query}" in ${country} — see raw response below`;
      if (ads.length > 0) {
        resultsEl.innerHTML = ads.slice(0, 20).map((ad, i) => renderAd(ad, i)).join('');
      }
      resultsEl.innerHTML += renderRaw(raw);
    } catch (err) {
      resultsEl.innerHTML = `<div class="bg-red-900/30 border border-red-700/50 p-4 rounded-xl text-red-300 text-sm">${esc(err.message)}</div>`;
      metaEl.textContent = '';
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    }
  });

  checkStatus();
}
