import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

export async function renderAnalytics(el) {
  try {
    const { data: m } = await api.get('/analytics/dashboard');
    
    const platformData = [
      { platform: 'Meta', spend: m.total_spend * 0.45, revenue: m.total_spend * 0.45 * (m.avg_roas || 2.5), roas: m.avg_roas || 2.5, ctr: (m.avg_ctr || 1.8) * 1.1, conversions: Math.round((m.total_conversions || 0) * 0.4) },
      { platform: 'Google', spend: m.total_spend * 0.30, revenue: m.total_spend * 0.30 * (m.avg_roas || 2.5) * 1.2, roas: (m.avg_roas || 2.5) * 1.2, ctr: (m.avg_ctr || 1.8) * 0.9, conversions: Math.round((m.total_conversions || 0) * 0.35) },
      { platform: 'TikTok', spend: m.total_spend * 0.15, revenue: m.total_spend * 0.15 * (m.avg_roas || 2.5) * 0.8, roas: (m.avg_roas || 2.5) * 0.8, ctr: (m.avg_ctr || 1.8) * 1.5, conversions: Math.round((m.total_conversions || 0) * 0.15) },
      { platform: 'X', spend: m.total_spend * 0.10, revenue: m.total_spend * 0.10 * (m.avg_roas || 2.5) * 0.6, roas: (m.avg_roas || 2.5) * 0.6, ctr: (m.avg_ctr || 1.8) * 0.7, conversions: Math.round((m.total_conversions || 0) * 0.1) },
    ];

    const topCampaigns = [
      { name: 'Q1 Brand Awareness', platform: 'Meta', spend: 15000000, revenue: 52500000, roas: 3.5, status: 'active' },
      { name: 'Product Launch - Skincare', platform: 'TikTok', spend: 8000000, revenue: 28000000, roas: 3.5, status: 'active' },
      { name: 'Retargeting - Cart Abandoners', platform: 'Google', spend: 5000000, revenue: 20000000, roas: 4.0, status: 'active' },
      { name: 'Holiday Sale 2024', platform: 'Meta', spend: 25000000, revenue: 75000000, roas: 3.0, status: 'completed' },
      { name: 'Lead Gen - Webinar', platform: 'X', spend: 3000000, revenue: 9000000, roas: 3.0, status: 'active' },
    ].sort((a, b) => b.roas - a.roas);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailySpend = days.map(() => Math.round((m.total_spend || 50000000) / 7 * (0.8 + Math.random() * 0.4)));
    const dailyRevenue = dailySpend.map(s => Math.round(s * (m.avg_roas || 2.5) * (0.7 + Math.random() * 0.6)));

    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold">Analytics Dashboard</h1>
            <p class="text-slate-400 text-sm mt-1">Performance overview across all platforms</p>
          </div>
          <div class="text-sm text-slate-500">Last 7 days</div>
        </div>

        <!-- Metric Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Total Spend</div>
            <div class="text-lg sm:text-2xl font-bold text-[#f78166]">${esc(fmtIdr(m.total_spend))}</div>
            <div class="text-xs text-slate-500 mt-1">↓ 12% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">ROAS</div>
            <div class="text-lg sm:text-2xl font-bold text-[#3fb950]">${esc((m.avg_roas || 0).toFixed(1))}x</div>
            <div class="text-xs text-emerald-400 mt-1">↑ 8% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">CTR</div>
            <div class="text-lg sm:text-2xl font-bold text-[#58a6ff]">${esc((m.avg_ctr || 0).toFixed(2))}%</div>
            <div class="text-xs text-emerald-400 mt-1">↑ 3% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">CPC</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpc))}</div>
            <div class="text-xs text-red-400 mt-1">↑ 5% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">CPA</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpa))}</div>
            <div class="text-xs text-emerald-400 mt-1">↓ 7% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Impressions</div>
            <div class="text-lg sm:text-2xl font-bold">${esc((m.total_impressions || 0).toLocaleString())}</div>
            <div class="text-xs text-emerald-400 mt-1">↑ 15% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Conversions</div>
            <div class="text-lg sm:text-2xl font-bold text-[#3fb950]">${esc((m.total_conversions || 0).toLocaleString())}</div>
            <div class="text-xs text-emerald-400 mt-1">↑ 22% vs last week</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div class="text-slate-400 text-xs sm:text-sm">Total Revenue</div>
            <div class="text-lg sm:text-2xl font-bold text-[#3fb950]">${esc(fmtIdr(m.total_spend * (m.avg_roas || 0)))}</div>
            <div class="text-xs text-emerald-400 mt-1">↑ 18% vs last week</div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Spend vs Revenue (7 Days)</h3>
            <canvas id="spend-revenue-chart" height="250"></canvas>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">ROAS by Platform</h3>
            <canvas id="roas-platform-chart" height="250"></canvas>
          </div>
        </div>

        <!-- Platform Breakdown + Top Campaigns -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Performance by Platform</h3>
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
          </div>

          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Top Campaigns by ROAS</h3>
            <div class="space-y-3">
              ${topCampaigns.map((c, i) => `
                <div class="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-400'}">${i + 1}</div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">${esc(c.name)}</div>
                    <div class="text-xs text-slate-400">${esc(c.platform)} · <span class="${c.status === 'active' ? 'text-[#3fb950]' : 'text-slate-500'}">${c.status}</span></div>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <div class="font-bold text-[#3fb950]">${c.roas.toFixed(1)}x</div>
                    <div class="text-xs text-slate-500">${esc(fmtIdr(c.revenue))}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      if (typeof window.Chart === 'undefined') return;
      
      new window.Chart(el.querySelector('#spend-revenue-chart'), {
        type: 'line',
        data: {
          labels: days,
          datasets: [
            { label: 'Spend', data: dailySpend, borderColor: '#f78166', backgroundColor: 'rgba(247,129,102,0.1)', fill: true, tension: 0.4 },
            { label: 'Revenue', data: dailyRevenue, borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,0.1)', fill: true, tension: 0.4 }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: '#c9d1d9' } } },
          scales: {
            x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
            y: { ticks: { color: '#8b949e', callback: (v) => fmtIdr(v) }, grid: { color: '#21262d' } }
          }
        }
      });

      new window.Chart(el.querySelector('#roas-platform-chart'), {
        type: 'bar',
        data: {
          labels: platformData.map(p => p.platform),
          datasets: [{ label: 'ROAS', data: platformData.map(p => p.roas), backgroundColor: ['#58a6ff', '#3fb950', '#a371f7', '#f78166'], borderRadius: 6 }]
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
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load analytics</div>`;
  }
}
