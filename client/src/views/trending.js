import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

const getTrendArrow = (trend) => {
  if (!trend || trend === 'up') return '<span class="text-emerald-400">↑</span>';
  if (trend === 'down') return '<span class="text-rose-400">↓</span>';
  return '<span class="text-slate-400">−</span>';
};

const getTrendIcon = (growth) => {
  if (!growth) return '';
  const hasPlus = growth.includes('+');
  return hasPlus ? '<span class="text-emerald-400">↑</span>' : '<span class="text-rose-400">↓</span>';
};

export async function renderTrending(el) {
  let viewMode = 'comparison'; // 'comparison', 'internal', 'external'
  let internalData = [];
  let externalData = [];
  let externalError = null;
  let isLoading = true;

  try {
    const [internalRes, externalRes] = await Promise.all([
      api.get('/trending/internal'),
      api.get('/trending/external').catch(err => {
        externalError = err.response?.data?.error || err.message || 'Failed to load external trends';
        return { data: { data: [] } };
      }),
    ]);
    internalData = internalRes.data.data || [];
    externalData = externalRes.data.data || [];
  } catch (e) {
    console.error('Failed to load trending data:', e);
  } finally {
    isLoading = false;
  }

  function render() {
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 class="text-2xl sm:text-3xl font-bold">Trending Ads</h1>
          <div class="flex gap-2">
            <button data-view="comparison" class="px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'comparison' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }">
              Compare
            </button>
            <button data-view="internal" class="px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'internal' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }">
              Internal
            </button>
            <button data-view="external" class="px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'external' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }">
              External
            </button>
          </div>
        </div>

        ${isLoading ? renderLoading() : renderContent()}
      </div>
    `;

    el.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        viewMode = btn.dataset.view;
        render();
      });
    });
  }

  function renderLoading() {
    return `
      <div class="flex items-center justify-center py-12">
        <div class="text-slate-400">Loading trending data...</div>
      </div>
    `;
  }

  function renderContent() {
    if (viewMode === 'comparison') {
      return renderComparison();
    } else if (viewMode === 'internal') {
      return renderInternalView();
    } else {
      return renderExternalView();
    }
  }

  function renderComparison() {
    if (!internalData.length && !externalData.length) {
      return `
        <div class="text-center py-12">
          <div class="text-slate-400 mb-2">No trending data available</div>
          <div class="text-slate-500 text-sm">Connect your ad accounts or configure external API</div>
        </div>
      `;
    }

    const maxItems = Math.max(internalData.length, externalData.length);
    const items = [];

    for (let i = 0; i < maxItems; i++) {
      const internal = internalData[i];
      const external = externalData[i];

      items.push(`
        <div class="bg-slate-800 rounded-lg overflow-hidden">
          <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
            ${internal ? renderInternalItem(internal, true) : renderEmptySlot('Internal')}
            ${external ? renderExternalItem(external, true) : renderEmptySlot('External')}
          </div>
        </div>
      `);
    }

    return `
      <div class="space-y-3">
        <div class="flex items-center gap-4 text-sm text-slate-400 mb-4">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-sky-500"></span>
            <span>Internal Campaigns</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-purple-500"></span>
            <span>Market Trends</span>
          </div>
        </div>
        ${items.join('')}
      </div>
    `;
  }

  function renderInternalView() {
    if (!internalData.length) {
      return `
        <div class="text-center py-12">
          <div class="text-slate-400 mb-2">No internal campaign data</div>
          <div class="text-slate-500 text-sm">Connect your ad accounts to see trending campaigns</div>
        </div>
      `;
    }

    return `
      <div class="space-y-3">
        ${internalData.map(c => renderInternalItem(c, false)).join('')}
      </div>
    `;
  }

  function renderExternalView() {
    if (externalError) {
      return `
        <div class="bg-rose-900/30 border border-rose-700 rounded-lg p-6">
          <div class="flex items-start gap-3">
            <svg class="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <h3 class="font-semibold text-rose-300 mb-1">External Trends Unavailable</h3>
              <p class="text-slate-300 text-sm mb-3">${esc(externalError)}</p>
              <div class="text-slate-400 text-xs">No external trend data available.</div>
            </div>
          </div>
        </div>
      `;
    }

    if (!externalData.length) {
      return `
        <div class="text-center py-12">
          <div class="text-slate-400 mb-2">No external trend data</div>
          <div class="text-slate-500 text-sm">Configure external API to see market trends</div>
        </div>
      `;
    }

    return `
      <div class="space-y-3">
        ${externalData.map(t => renderExternalItem(t, false)).join('')}
      </div>
    `;
  }

  function renderInternalItem(c, isComparison) {
    const badgeColor = 'bg-sky-500';
    const badgeText = 'Internal';

    return `
      <div class="p-4 ${isComparison ? '' : 'rounded-lg'}">
        <div class="flex items-start gap-2 mb-3">
          <span class="${badgeColor} text-white text-xs font-medium px-2 py-0.5 rounded-full">${esc(badgeText)}</span>
          ${getTrendArrow(c.trend)}
        </div>
        <div class="mb-3">
          <h3 class="font-bold text-lg">${esc(c.name || 'Unnamed Campaign')}</h3>
          <p class="text-slate-400 text-sm">${esc(c.platform)} · ${esc(c.status)}</p>
        </div>
        <div class="mb-3">
          <div class="text-2xl font-bold text-emerald-400">${c.roas?.toFixed(1) || '0.0'}x ROAS</div>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span class="text-slate-400">Spend:</span>
            <span class="text-slate-200">${fmtIdr(c.spend)}</span>
          </div>
          <div>
            <span class="text-slate-400">Revenue:</span>
            <span class="text-slate-200">${fmtIdr(c.revenue)}</span>
          </div>
          <div>
            <span class="text-slate-400">CTR:</span>
            <span class="text-slate-200">${c.ctr}%</span>
          </div>
          <div>
            <span class="text-slate-400">Conversions:</span>
            <span class="text-slate-200">${c.conversions || 0}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderExternalItem(t, isComparison) {
    const badgeColor = 'bg-purple-500';
    const badgeText = 'External';

    return `
      <div class="p-4 ${isComparison ? '' : 'rounded-lg'}">
        <div class="flex items-start gap-2 mb-3">
          <span class="${badgeColor} text-white text-xs font-medium px-2 py-0.5 rounded-full">${esc(badgeText)}</span>
          ${getTrendIcon(t.growth)}
        </div>
        <div class="mb-3">
          <h3 class="font-bold text-lg">${esc(t.theme)}</h3>
          <p class="text-slate-400 text-sm">${esc(t.category)}</p>
        </div>
        <div class="mb-3 flex items-center gap-3">
          <span class="bg-emerald-900 text-emerald-400 px-2 py-1 rounded text-sm font-bold">${esc(t.growth)}</span>
          <span class="text-slate-400 text-sm">${t.popularity}% popularity</span>
        </div>
        <p class="text-slate-300 text-sm mb-3">${esc(t.ads_example)}</p>
        <div class="flex flex-wrap gap-2">
          ${t.platforms.map(p => `<span class="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">${esc(p)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  function renderEmptySlot(type) {
    const color = type === 'Internal' ? 'sky' : 'purple';
    return `
      <div class="p-4 flex items-center justify-center min-h-[200px]">
        <div class="text-center">
          <div class="w-12 h-12 rounded-full bg-${color}-900/30 mx-auto mb-2 flex items-center justify-center">
            <svg class="w-6 h-6 text-${color}-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
            </svg>
          </div>
          <div class="text-slate-500 text-sm">No ${type.toLowerCase()} data</div>
        </div>
      </div>
    `;
  }

  render();
}