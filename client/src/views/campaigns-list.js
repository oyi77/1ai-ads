import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null || n === 0) return '-';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderCampaignsList(el) {
  let campaigns = [];
  let platforms = [];
  let activePlatform = 'all';
  let activeStatus = 'all';
  let searchQuery = '';

  const loadData = async () => {
    try {
      const { data } = await api.get('/analytics/campaigns');
      campaigns = Array.isArray(data) ? data : [];
      
      const uniquePlatforms = [...new Set(campaigns.map(c => c.platform))];
      platforms = uniquePlatforms.sort();
    } catch (e) {
      console.error('Failed to load campaigns:', e);
      campaigns = [];
    }
  };

  await loadData();

  function render() {
    let filtered = [...campaigns];

    if (activePlatform !== 'all') {
      filtered = filtered.filter(c => c.platform === activePlatform);
    }

    if (activeStatus !== 'all') {
      filtered = filtered.filter(c => c.status === activeStatus);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        (c.name || '').toLowerCase().includes(q) ||
        (c.platform || '').toLowerCase().includes(q)
      );
    }

    const totalSpend = filtered.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalRevenue = filtered.reduce((sum, c) => sum + (c.revenue || 0), 0);
    const totalImpressions = filtered.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = filtered.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalConversions = filtered.reduce((sum, c) => sum + (c.conversions || 0), 0);
    
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    const platformOptions = ['all', ...platforms].map(p => 
      `<option value="${p}" ${activePlatform === p ? 'selected' : ''}>${p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}</option>`
    ).join('');

    const statusOptions = ['all', 'active', 'paused', 'completed'].map(s => 
      `<option value="${s}" ${activeStatus === s ? 'selected' : ''}>${s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold">Campaigns</h1>
            <p class="text-slate-400 text-sm mt-1">Real data from your connected ad accounts</p>
          </div>
          <button id="sync-all-btn" class="bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-lg text-sm font-medium">
            Sync All Platforms
          </button>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div class="bg-slate-800 p-3 rounded-lg">
            <div class="text-slate-400 text-xs">Campaigns</div>
            <div class="text-xl font-bold">${filtered.length}</div>
          </div>
          <div class="bg-slate-800 p-3 rounded-lg">
            <div class="text-slate-400 text-xs">Spend</div>
            <div class="text-xl font-bold text-orange-400">${fmtIdr(totalSpend)}</div>
          </div>
          <div class="bg-slate-800 p-3 rounded-lg">
            <div class="text-slate-400 text-xs">Revenue</div>
            <div class="text-xl font-bold text-green-400">${fmtIdr(totalRevenue)}</div>
          </div>
          <div class="bg-slate-800 p-3 rounded-lg">
            <div class="text-slate-400 text-xs">ROAS</div>
            <div class="text-xl font-bold ${avgRoas >= 3 ? 'text-green-400' : avgRoas >= 2 ? 'text-blue-400' : 'text-red-400'}">${avgRoas.toFixed(1)}x</div>
          </div>
          <div class="bg-slate-800 p-3 rounded-lg">
            <div class="text-slate-400 text-xs">CTR</div>
            <div class="text-xl font-bold">${avgCtr.toFixed(2)}%</div>
          </div>
          <div class="bg-slate-800 p-3 rounded-lg">
            <div class="text-slate-400 text-xs">Conv.</div>
            <div class="text-xl font-bold">${totalConversions.toLocaleString()}</div>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-col sm:flex-row gap-3 mb-4">
          <input type="text" id="campaign-search" placeholder="Search campaigns..." value="${esc(searchQuery)}" 
            class="flex-1 p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
          <select id="platform-filter" class="p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
            ${platformOptions}
          </select>
          <select id="status-filter" class="p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
            ${statusOptions}
          </select>
        </div>

        <!-- Campaigns Table -->
        <div class="bg-slate-800 rounded-lg overflow-hidden">
          ${filtered.length === 0 ? `
            <div class="p-8 text-center text-slate-400">
              <p class="mb-2">No campaigns found.</p>
              <p class="text-sm">Connect your ad accounts and sync to see your campaigns here.</p>
              <a href="#/settings" class="inline-block mt-4 bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-lg text-sm">Go to Settings</a>
            </div>
          ` : `
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-900">
                  <tr>
                    <th class="text-left p-3">Campaign</th>
                    <th class="text-left p-3">Platform</th>
                    <th class="text-right p-3">Status</th>
                    <th class="text-right p-3">Spend</th>
                    <th class="text-right p-3">Impr.</th>
                    <th class="text-right p-3">Clicks</th>
                    <th class="text-right p-3">CTR</th>
                    <th class="text-right p-3">Conv.</th>
                    <th class="text-right p-3">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.map(c => {
                    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                    const roas = c.spend > 0 ? (c.revenue || 0) / c.spend : 0;
                    const statusClass = c.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                                       c.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-600 text-slate-300';
                    const roasClass = roas >= 3 ? 'text-green-400' : roas >= 2 ? 'text-blue-400' : roas > 0 ? 'text-red-400' : 'text-slate-500';
                    
                    return `
                      <tr class="border-t border-slate-700 hover:bg-slate-750">
                        <td class="p-3 font-medium">${esc(c.name || 'Unnamed')}</td>
                        <td class="p-3">
                          <span class="px-2 py-1 rounded text-xs bg-slate-700">${esc(c.platform || '-')}</span>
                        </td>
                        <td class="p-3 text-right">
                          <span class="px-2 py-1 rounded text-xs ${statusClass}">${esc(c.status || '-')}</span>
                        </td>
                        <td class="p-3 text-right text-orange-400">${fmtIdr(c.spend)}</td>
                        <td class="p-3 text-right">${(c.impressions || 0).toLocaleString()}</td>
                        <td class="p-3 text-right">${(c.clicks || 0).toLocaleString()}</td>
                        <td class="p-3 text-right">${ctr.toFixed(2)}%</td>
                        <td class="p-3 text-right">${(c.conversions || 0).toLocaleString()}</td>
                        <td class="p-3 text-right font-bold ${roasClass}">${roas > 0 ? roas.toFixed(1) + 'x' : '-'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;

    attachHandlers();
  }

  function attachHandlers() {
    const searchInput = el.querySelector('#campaign-search');
    const platformFilter = el.querySelector('#platform-filter');
    const statusFilter = el.querySelector('#status-filter');
    const syncBtn = el.querySelector('#sync-all-btn');

    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render();
    });

    platformFilter?.addEventListener('change', (e) => {
      activePlatform = e.target.value;
      render();
    });

    statusFilter?.addEventListener('change', (e) => {
      activeStatus = e.target.value;
      render();
    });

    syncBtn?.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      try {
        await api.post('/meta/sync');
        await loadData();
        render();
        syncBtn.textContent = 'Synced!';
      } catch (err) {
        syncBtn.textContent = 'Sync Failed';
      }
      setTimeout(() => {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync All Platforms';
      }, 2000);
    });
  }

  render();
}
