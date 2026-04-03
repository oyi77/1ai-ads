import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderTrending(el) {
  let activeTab = 'internal';
  let internalData = [];
  let externalData = [];

  try {
    const [internalRes, externalRes] = await Promise.all([
      api.get('/trending/internal'),
      api.get('/trending/external'),
    ]);
    internalData = internalRes.data.data || [];
    externalData = externalRes.data.data || [];
  } catch (e) {
    console.error('Failed to load trending data:', e);
  }

  function render() {
    const isInternal = activeTab === 'internal';
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-6">Trending Ads</h1>
        
        <div class="flex gap-2 mb-6">
          <button data-tab="internal" class="px-4 py-2 rounded-lg ${isInternal ? 'bg-sky-500' : 'bg-slate-700 hover:bg-slate-600'}">Campaign Performance</button>
          <button data-tab="external" class="px-4 py-2 rounded-lg ${!isInternal ? 'bg-sky-500' : 'bg-slate-700 hover:bg-slate-600'}">Market Trends</button>
        </div>

        ${isInternal ? renderInternal(internalData) : renderExternal(externalData)}
      </div>
    `;

    el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });
  }

  function renderInternal(data) {
    if (!data.length) {
      return '<div class="text-slate-400">No campaign data available. Connect your ad accounts to see trending campaigns.</div>';
    }

    return `
      <div class="space-y-3">
        ${data.map(c => `
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h3 class="font-bold text-lg">${esc(c.name || 'Unnamed Campaign')}</h3>
                <span class="text-slate-400 text-sm">${esc(c.platform)} · ${esc(c.status)}</span>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-emerald-400">${c.roas?.toFixed(1) || '0.0'}x ROAS</div>
                <div class="text-slate-400 text-sm">${c.trend === 'up' ? '↑' : '↓'} trend</div>
              </div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><span class="text-slate-400">Spend:</span> ${fmtIdr(c.spend)}</div>
              <div><span class="text-slate-400">Revenue:</span> ${fmtIdr(c.revenue)}</div>
              <div><span class="text-slate-400">CTR:</span> ${c.ctr}%</div>
              <div><span class="text-slate-400">Conv:</span> ${c.conversions}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderExternal(data) {
    if (!data.length) {
      return '<div class="text-slate-400">Loading market trends...</div>';
    }

    return `
      <div class="grid gap-3">
        ${data.map(t => `
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <div>
                <h3 class="font-bold text-lg">${esc(t.theme)}</h3>
                <span class="text-slate-400 text-sm">${esc(t.category)}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="bg-emerald-900 text-emerald-400 px-2 py-1 rounded text-sm font-bold">${esc(t.growth)}</span>
                <span class="text-slate-500 text-sm">${t.popularity}% popularity</span>
              </div>
            </div>
            <p class="text-slate-300 text-sm mb-2">${esc(t.ads_example)}</p>
            <div class="flex gap-2">
              ${t.platforms.map(p => `<span class="bg-slate-700 px-2 py-1 rounded text-xs">${esc(p)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  render();
}