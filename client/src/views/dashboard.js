import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderDashboard(el) {
  try {
    const { data: m } = await api.get('/analytics/dashboard');

    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
          <h1 class="text-2xl sm:text-3xl font-bold">Dashboard</h1>
          <div class="flex items-center gap-3 text-sm">
            <button id="sync-btn" class="bg-sky-500 hover:bg-sky-600 px-3 py-2 rounded-lg text-sm min-h-[44px]">Sync Meta Ads</button>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">Total Spend</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.total_spend))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">Total Revenue</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.total_revenue))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">ROAS</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.avg_roas || 0).toFixed(1))}x</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CTR</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.avg_ctr || 0).toFixed(2))}%</div>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CPC</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpc))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CPA</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpa))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg col-span-2 sm:col-span-1">
            <div class="text-slate-400 text-xs sm:text-sm">Conversions</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(m.total_conversions)}</div>
          </div>
        </div>
      </div>
    `;

    // Sync button handler
    el.querySelector('#sync-btn')?.addEventListener('click', async () => {
      const btn = el.querySelector('#sync-btn');
      btn.disabled = true;
      btn.textContent = 'Syncing...';
      try {
        const res = await api.post('/meta/sync');
        btn.textContent = `Synced ${res.data.campaignsSynced} campaigns`;
        setTimeout(() => renderDashboard(el), 1500);
      } catch (err) {
        btn.textContent = err.message.includes('not configured') ? 'Configure in Settings' : 'Sync Failed';
        setTimeout(() => { btn.textContent = 'Sync Meta Ads'; btn.disabled = false; }, 3000);
      }
    });

  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8"><h1 class="text-2xl font-bold mb-4">Dashboard</h1><p class="text-red-400">Failed to load metrics</p></div>`;
  }
}
