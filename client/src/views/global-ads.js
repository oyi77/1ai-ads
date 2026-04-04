import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderGlobalAds(el) {
  let state = {
    ads: [],
    isLoading: false,
    error: null,
    searchQuery: '',
    country: 'ID',
    pageName: ''
  };

  async function searchAds() {
    state.isLoading = true;
    state.error = null;
    render();
    try {
      const params = new URLSearchParams();
      if (state.searchQuery) params.set('q', state.searchQuery);
      if (state.country) params.set('country', state.country);
      params.set('limit', '30');
      const { data } = await api.get(`/meta/ad-library?${params.toString()}`);
      state.ads = data || [];
    } catch (err) {
      state.error = err.message;
      state.ads = [];
    } finally {
      state.isLoading = false;
      render();
    }
  }

  function render() {
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold">Trending Ads</h1>
            <p class="text-slate-400 mt-1">Search active ads from the Meta Ad Library</p>
          </div>
        </div>

        <div class="bg-slate-800 p-4 rounded-lg mb-6">
          <form id="ad-search-form" class="flex flex-col sm:flex-row gap-3">
            <input type="text" id="ad-search" value="${esc(state.searchQuery)}" placeholder="Search by keyword, brand, or product..." class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-700 text-white min-h-[44px]">
            <select id="ad-country" class="p-3 bg-slate-900 rounded-lg border border-slate-700 text-white min-h-[44px]">
              <option value="ID" ${state.country === 'ID' ? 'selected' : ''}>Indonesia</option>
              <option value="US" ${state.country === 'US' ? 'selected' : ''}>United States</option>
              <option value="MY" ${state.country === 'MY' ? 'selected' : ''}>Malaysia</option>
              <option value="SG" ${state.country === 'SG' ? 'selected' : ''}>Singapore</option>
              <option value="GB" ${state.country === 'GB' ? 'selected' : ''}>United Kingdom</option>
            </select>
            <button type="submit" class="bg-sky-600 hover:bg-sky-500 px-6 py-3 rounded-lg font-bold min-h-[44px] whitespace-nowrap">
              ${state.isLoading ? 'Searching...' : 'Search Ads'}
            </button>
          </form>
        </div>

        ${state.error ? `
          <div class="bg-red-900/30 border border-red-700/50 p-6 rounded-xl text-center">
            <p class="text-red-300 font-medium">${esc(state.error)}</p>
            <p class="text-slate-500 text-sm mt-2">Note: Ad Library API requires special permissions.</p>
          </div>
        ` : state.isLoading ? `
          <div class="p-12 text-center text-slate-400">
            <div class="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p>Searching Ad Library...</p>
          </div>
        ` : state.ads.length === 0 ? `
          <div class="p-12 text-center text-slate-500">
            <svg class="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <p class="text-lg font-medium mb-2">No ads found</p>
            <p class="text-sm">Enter a keyword above to search the Meta Ad Library for active ads.</p>
          </div>
        ` : `
          <div class="text-sm text-slate-400 mb-4">${state.ads.length} ads found${state.searchQuery ? ' for "' + esc(state.searchQuery) + '"' : ''}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            ${state.ads.map(ad => `
              <div class="bg-slate-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-sky-500 transition-all">
                <div class="p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-lg text-white">${esc(ad.page_name || 'Unknown Page')}</h3>
                    <span class="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">${(ad.publisher_platforms || []).slice(0, 2).join(', ')}</span>
                  </div>
                  ${ad.ad_creative_bodies?.[0] ? `
                    <p class="text-sm text-slate-400 mb-3 line-clamp-3">${esc(ad.ad_creative_bodies[0])}</p>
                  ` : ''}
                  ${ad.ad_creative_link_titles?.[0] ? `
                    <div class="text-xs text-sky-400 font-medium mb-3">${esc(ad.ad_creative_link_titles[0])}</div>
                  ` : ''}
                  <div class="flex items-center gap-4 text-xs text-slate-500">
                    <span>Started: ${ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time).toLocaleDateString() : 'N/A'}</span>
                    ${ad.spend ? `<span>Spend: ${esc(ad.spend)}</span>` : ''}
                  </div>
                  ${ad.ad_snapshot_url ? `
                    <a href="${esc(ad.ad_snapshot_url)}" target="_blank" class="mt-3 block text-center bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-sm font-medium transition-colors">
                      View Ad Snapshot
                    </a>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    el.querySelector('#ad-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      state.searchQuery = el.querySelector('#ad-search').value.trim();
      state.country = el.querySelector('#ad-country').value;
      searchAds();
    });
  }

  searchAds();
}
