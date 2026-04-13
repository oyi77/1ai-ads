import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderAnalytics(el) {
  try {
    const [dashRes, platRes, topRes] = await Promise.all([
      api.get('/analytics/dashboard'),
      api.get('/analytics/by-platform'),
      api.get('/analytics/top-campaigns?limit=5'),
    ]);

    const m = dashRes.data;
    const platformData = platRes.data || [];
    const topCampaigns = topRes.data || [];

    const hasPlatformData = platformData.length > 0;
    const hasTopCampaigns = topCampaigns.length > 0;

    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold">Analytics Dashboard</h1>
            <p class="text-slate-400 text-sm mt-1">Performance overview across all platforms</p>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Total Spend</div>
            <div class="text-lg sm:text-2xl font-bold text-[#f78166]">${esc(fmtIdr(m.total_spend))}</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">ROAS</div>
            <div class="text-lg sm:text-2xl font-bold text-[#3fb950]">${esc((m.avg_roas || 0).toFixed(1))}x</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">CTR</div>
            <div class="text-lg sm:text-2xl font-bold text-[#58a6ff]">${esc((m.avg_ctr || 0).toFixed(2))}%</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">CPC</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpc))}</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">CPA</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpa))}</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Impressions</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.total_impressions || 0).toLocaleString())}</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Conversions</div>
            <div class="text-lg sm:text-2xl font-bold text-[#3fb950]">${esc((m.total_conversions || 0).toLocaleString())}</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Total Revenue</div>
            <div class="text-lg sm:text-2xl font-bold text-[#3fb950]">${esc(fmtIdr(m.total_revenue))}</div>
          </div>
        </div>

        ${hasPlatformData ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Spend by Platform</h3>
            <canvas id="spend-platform-chart" height="250"></canvas>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">ROAS by Platform</h3>
            <canvas id="roas-platform-chart" height="250"></canvas>
          </div>
        </div>
        ` : ''}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Performance by Platform</h3>
            ${hasPlatformData ? `
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-slate-400 border-b border-[#30363d]">
                    <th class="text-left py-2 px-2">Platform</th>
                    <th class="text-right py-2 px-2">Spend</th>
                    <th class="text-right py-2 px-2">Revenue</th>
                    <th class="text-right py-2 px-2">ROAS</th>
                    <th class="text-right py-2 px-2">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  ${platformData.map(p => `
                    <tr class="border-b border-[#21262d] hover:bg-[#21262d]/50">
                      <td class="py-3 px-2 font-medium">${esc(p.platform)}</td>
                      <td class="py-3 px-2 text-right text-[#f78166]">${esc(fmtIdr(p.spend))}</td>
                      <td class="py-3 px-2 text-right text-[#3fb950]">${esc(fmtIdr(p.revenue))}</td>
                      <td class="py-3 px-2 text-right font-bold ${p.roas >= 3 ? 'text-[#3fb950]' : p.roas >= 2 ? 'text-[#58a6ff]' : 'text-red-400'}">${p.roas.toFixed(1)}x</td>
                      <td class="py-3 px-2 text-right">${p.ctr.toFixed(2)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : `
            <div class="text-center py-12 text-slate-500">
              <p class="text-lg mb-2">No platform data yet</p>
              <p class="text-sm">Connect your ad platforms and sync campaigns to see per-platform metrics.</p>
            </div>
            `}
          </div>

          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Top Campaigns by ROAS</h3>
            ${hasTopCampaigns ? `
            <div class="space-y-3">
              ${topCampaigns.map((c, i) => `
                <div class="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-400'}">${i + 1}</div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">${esc(c.name || 'Untitled Campaign')}</div>
                    <div class="text-xs text-slate-400">${esc(c.platform)} · <span class="${c.status === 'active' ? 'text-[#3fb950]' : 'text-slate-500'}">${esc(c.status || 'unknown')}</span></div>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <div class="font-bold text-[#3fb950]">${(c.roas || 0).toFixed(1)}x</div>
                    <div class="text-xs text-slate-500">${esc(fmtIdr(c.revenue))}</div>
                  </div>
                </div>
              `).join('')}
            </div>
            ` : `
            <div class="text-center py-12 text-slate-500">
              <p class="text-lg mb-2">No campaign data yet</p>
              <p class="text-sm">Create campaigns and sync performance data to see your top performers.</p>
            </div>
            `}
          </div>
        </div>
      </div>
    `;

    if (hasPlatformData) {
      const colors = ['#58a6ff', '#3fb950', '#a371f7', '#f78166', '#f0883e', '#d2a8ff'];

      setTimeout(() => {
        if (typeof window.Chart === 'undefined') return;

        new window.Chart(el.querySelector('#spend-platform-chart'), {
          type: 'doughnut',
          data: {
            labels: platformData.map(p => p.platform),
            datasets: [{ data: platformData.map(p => p.spend), backgroundColor: colors.slice(0, platformData.length), borderWidth: 0 }]
          },
          options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#c9d1d9' } } }
          }
        });

        new window.Chart(el.querySelector('#roas-platform-chart'), {
          type: 'bar',
          data: {
            labels: platformData.map(p => p.platform),
            datasets: [{ label: 'ROAS', data: platformData.map(p => p.roas), backgroundColor: colors.slice(0, platformData.length), borderRadius: 6 }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#8b949e' }, grid: { display: false } },
              y: { ticks: { color: '#8b949e', callback: (v) => v + 'x' }, grid: { color: '#21262d' } }
            }
          }
        });
      }, 100);
    }
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load analytics</div>`;
  }
}
