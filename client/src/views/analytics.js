import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderAnalytics(el) {
  try {
    const { data: m } = await api.get('/analytics/dashboard');
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4">Analytics</h1>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">Total Spend</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.total_spend))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">ROAS</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.avg_roas || 0).toFixed(1))}x</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CTR</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.avg_ctr || 0).toFixed(2))}%</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CPC</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpc))}</div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-4">
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CPA</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpa))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">Impressions</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.total_impressions || 0).toLocaleString())}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg col-span-1 lg:col-span-1">
            <div class="text-slate-400 text-xs sm:text-sm">Conversions</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.total_conversions || 0).toLocaleString())}</div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load analytics</div>`;
  }
}
