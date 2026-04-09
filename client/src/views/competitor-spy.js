import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderCompetitorSpy(el) {
  let competitors = [];
  let selectedCompetitor = null;
  let competitorAds = [];
  let competitorMetrics = null;
  let isLoading = false;
  let platformFilter = 'all';

  try {
    const resp = await api.get('/competitor-spy');
    competitors = resp.data || [];
  } catch (e) {
    console.error('Failed to load competitor data:', e);
  }

  function render() {
    if (isLoading) {
      el.innerHTML = `
        <div class="p-4 sm:p-8">
          <h1 class="text-2xl sm:text-3xl font-bold mb-6">Competitor Spy Dashboard</h1>
          <div class="flex items-center justify-center p-12">
            <div class="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-6">Competitor Spy Dashboard</h1>

        <!-- Competitor List Section -->
        <div class="mb-8">
          <h2 class="text-lg font-semibold mb-4">Competitors</h2>
          ${renderCompetitorTable()}
        </div>

        <!-- Selected Competitor Details -->
        ${selectedCompetitor ? renderCompetitorDetails() : ''}
      </div>
    `;

    attachEventHandlers();
  }

  function renderCompetitorTable() {
    if (!competitors.length) {
      return '<div class="text-slate-400">No competitor data available.</div>';
    }

    return `<div class="overflow-x-auto">
      <table class="w-full table-auto border border-slate-700">
        <thead class="bg-slate-800">
          <tr>
            <th class="px-2 py-1 text-left">Name</th>
            <th class="px-2 py-1 text-left">Website</th>
            <th class="px-2 py-1 text-left">Description</th>
            <th class="px-2 py-1 text-left">Features</th>
            <th class="px-2 py-1 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${competitors.map(c => `
            <tr class="border-t border-slate-700 ${selectedCompetitor?.id === c.id ? 'bg-slate-800/50' : ''}">
              <td class="px-2 py-1">${esc(c.name)}</td>
              <td class="px-2 py-1"><a href="${esc(c.website)}" target="_blank" rel="noopener" class="text-sky-400 hover:underline">${esc(c.website)}</a></td>
              <td class="px-2 py-1">${esc(c.description)}</td>
              <td class="px-2 py-1">${esc(c.features?.join(', ') || '')}</td>
              <td class="px-2 py-1">
                <button data-view-competitor="${esc(c.id)}" class="bg-sky-500 hover:bg-sky-600 px-3 py-1 rounded text-sm">
                  View Ads
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function renderCompetitorDetails() {
    return `
      <div class="bg-slate-800 rounded-lg p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 class="text-xl font-bold">${esc(selectedCompetitor.name)}</h2>
            <p class="text-slate-400 text-sm">${esc(selectedCompetitor.description)}</p>
          </div>
          <div class="flex items-center gap-2">
            <button data-close-details class="text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-slate-700">
              Close
            </button>
          </div>
        </div>

        <!-- Platform Filter -->
        <div class="mb-6">
          <label class="block text-sm text-slate-400 mb-2">Filter by Platform</label>
          <div class="flex flex-wrap gap-2">
            <button data-filter="all" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${platformFilter === 'all' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
              All Platforms
            </button>
            <button data-filter="meta" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${platformFilter === 'meta' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
              Meta
            </button>
            <button data-filter="google" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${platformFilter === 'google' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
              Google
            </button>
            <button data-filter="tiktok" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${platformFilter === 'tiktok' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
              TikTok
            </button>
          </div>
        </div>

        <!-- Metrics Summary -->
        ${competitorMetrics ? renderMetricsSummary() : ''}

        <!-- Analyze Strategy Button -->
        <div class="mb-6">
          <button data-analyze-strategy="${esc(selectedCompetitor.id)}" class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-lg font-medium transition-all">
            Analyze Strategy
          </button>
        </div>

        <!-- Spy Ads List -->
        <h3 class="text-lg font-semibold mb-4">Spy Ads</h3>
        ${isLoading && !competitorAds.length ? `
          <div class="flex items-center justify-center p-12">
            <div class="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mr-3"></div>
            <span class="text-slate-400">Loading ads...</span>
          </div>
        ` : renderAdsList()}
      </div>
    `;
  }

  function renderMetricsSummary() {
    const m = competitorMetrics;
    if (!m) return '';

    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-slate-900 rounded-lg p-4">
          <div class="text-slate-400 text-xs sm:text-sm">Total Impressions</div>
          <div class="text-lg sm:text-2xl font-bold">${esc((m.total_impressions || 0).toLocaleString())}</div>
        </div>
        <div class="bg-slate-900 rounded-lg p-4">
          <div class="text-slate-400 text-xs sm:text-sm">Total Clicks</div>
          <div class="text-lg sm:text-2xl font-bold">${esc((m.total_clicks || 0).toLocaleString())}</div>
        </div>
        <div class="bg-slate-900 rounded-lg p-4">
          <div class="text-slate-400 text-xs sm:text-sm">Average CTR</div>
          <div class="text-lg sm:text-2xl font-bold text-[#58a6ff]">${esc((m.avg_ctr || 0).toFixed(2))}%</div>
        </div>
        <div class="bg-slate-900 rounded-lg p-4">
          <div class="text-slate-400 text-xs sm:text-sm">Total Spend</div>
          <div class="text-lg sm:text-2xl font-bold text-[#f78166]">${esc(fmtIdr(m.total_spend || 0))}</div>
        </div>
      </div>
    `;
  }

  function renderAdsList() {
    const filteredAds = platformFilter === 'all'
      ? competitorAds
      : competitorAds.filter(ad => ad.platform === platformFilter);

    if (!filteredAds.length) {
      return `<div class="text-slate-400 text-center py-8">No ads found for this platform.</div>`;
    }

    return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filteredAds.map(ad => `
        <div class="bg-slate-900 rounded-lg overflow-hidden flex flex-col">
          <!-- Creative Thumbnail -->
          ${ad.creative_url ? `
            <div class="relative aspect-video bg-slate-800">
              <img src="${esc(ad.creative_url)}" alt="${esc(ad.headline)}" class="w-full h-full object-cover">
              <span class="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${
                ad.platform === 'meta' ? 'bg-blue-500 text-white' :
                ad.platform === 'google' ? 'bg-red-500 text-white' :
                'bg-black text-white'
              }">${esc(ad.platform)}</span>
            </div>
          ` : `
            <div class="aspect-video bg-slate-800 flex items-center justify-center">
              <span class="text-slate-500">No Creative</span>
            </div>
          `}

          <!-- Ad Content -->
          <div class="p-4 flex flex-col flex-1">
            <h4 class="font-bold text-lg mb-2">${esc(ad.headline)}</h4>
            <p class="text-slate-400 text-sm mb-4 flex-1">${esc(ad.description)}</p>

            <!-- Metrics -->
            ${ad.metrics ? `
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="bg-slate-800 rounded p-2">
                  <div class="text-slate-400 text-xs">Impressions</div>
                  <div class="font-semibold">${esc((ad.metrics.impressions || 0).toLocaleString())}</div>
                </div>
                <div class="bg-slate-800 rounded p-2">
                  <div class="text-slate-400 text-xs">Clicks</div>
                  <div class="font-semibold">${esc((ad.metrics.clicks || 0).toLocaleString())}</div>
                </div>
                <div class="bg-slate-800 rounded p-2">
                  <div class="text-slate-400 text-xs">CTR</div>
                  <div class="font-semibold text-[#58a6ff]">${esc((ad.metrics.ctr || 0).toFixed(1))}%</div>
                </div>
                <div class="bg-slate-800 rounded p-2">
                  <div class="text-slate-400 text-xs">Spend</div>
                  <div class="font-semibold text-[#f78166]">${esc(fmtIdr(ad.metrics.spend || 0))}</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  function attachEventHandlers() {
    // View competitor ads
    el.querySelectorAll('[data-view-competitor]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const competitorId = btn.dataset.viewCompetitor;
        selectedCompetitor = competitors.find(c => c.id === competitorId);
        competitorAds = [];
        competitorMetrics = null;
        isLoading = true;
        render();

        try {
          // Load ads
          const adsResp = await api.get(`/competitor-spy/${competitorId}/ads`);
          competitorAds = adsResp.data || [];

          // Load metrics
          try {
            const metricsResp = await api.get(`/competitor-spy/${competitorId}/metrics`);
            competitorMetrics = metricsResp.data || null;
          } catch (e) {
            console.warn('Failed to load competitor metrics:', e);
          }

          isLoading = false;
          render();
        } catch (e) {
          console.error('Failed to load competitor ads:', e);
          isLoading = false;
          render();
        }
      });
    });

    // Close details
    el.querySelectorAll('[data-close-details]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCompetitor = null;
        competitorAds = [];
        competitorMetrics = null;
        platformFilter = 'all';
        render();
      });
    });

    // Platform filter
    el.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        platformFilter = btn.dataset.filter;
        render();
      });
    });

    // Analyze Strategy
    el.querySelectorAll('[data-analyze-strategy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const competitorId = btn.dataset.analyzeStrategy;
        btn.disabled = true;
        btn.textContent = 'Analyzing...';

        try {
          const resp = await api.post(`/competitor-spy/${competitorId}/analyze`);
          btn.textContent = 'Analysis Complete!';
          setTimeout(() => {
            btn.textContent = 'Analyze Strategy';
            btn.disabled = false;
          }, 2000);
        } catch (e) {
          console.error('Failed to analyze strategy:', e);
          btn.textContent = 'Analysis Failed';
          setTimeout(() => {
            btn.textContent = 'Analyze Strategy';
            btn.disabled = false;
          }, 2000);
        }
      });
    });
  }

  render();
}
