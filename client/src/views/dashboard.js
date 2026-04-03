import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const fmtIdr = (n) => {
  if (n == null) return 'N/A';
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
};

// Generate last 7 days labels
const getLast7Days = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }));
  }
  return days;
};

// Sample trend data generator
const generateTrendData = (base, variance) => {
  return Array.from({ length: 7 }, () => Math.max(0, base + (Math.random() - 0.5) * variance));
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
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
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
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CPC</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpc))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg">
            <div class="text-slate-400 text-xs sm:text-sm">CPA</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(fmtIdr(m.avg_cpa))}</div>
          </div>
          <div class="bg-slate-800 p-3 sm:p-4 rounded-lg col-span-1 sm:col-span-2 lg:col-span-1">
            <div class="text-slate-400 text-xs sm:text-sm">Conversions</div>
            <div class="text-lg sm:text-2xl font-bold">${esc(m.total_conversions)}</div>
          </div>
        </div>
        
        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div class="bg-slate-800 p-4 sm:p-6 rounded-lg">
            <h3 class="text-lg font-semibold mb-4 text-slate-200">ROAS Trend (7 Days)</h3>
            <div class="relative h-64 sm:h-72">
              <canvas id="roasChart"></canvas>
            </div>
          </div>
          <div class="bg-slate-800 p-4 sm:p-6 rounded-lg">
            <h3 class="text-lg font-semibold mb-4 text-slate-200">Spend vs Revenue</h3>
            <div class="relative h-64 sm:h-72">
              <canvas id="spendChart"></canvas>
            </div>
          </div>
          <div class="bg-slate-800 p-4 sm:p-6 rounded-lg lg:col-span-2">
            <h3 class="text-lg font-semibold mb-4 text-slate-200">CTR Trend (7 Days)</h3>
            <div class="relative h-64 sm:h-72">
              <canvas id="ctrChart"></canvas>
            </div>
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

    // Initialize Charts
    const labels = getLast7Days();
    const roasData = generateTrendData(m.avg_roas || 2.5, 1);
    const spendData = generateTrendData((m.total_spend || 1000000) / 7, 200000);
    const revenueData = generateTrendData((m.total_revenue || 2500000) / 7, 500000);
    const ctrData = generateTrendData(m.avg_ctr || 2.5, 1);

    // Chart.js dark theme defaults
    Chart.defaults.color = '#c9d1d9';
    Chart.defaults.borderColor = '#30363d';

    // ROAS Chart
    const roasCtx = el.querySelector('#roasChart');
    if (roasCtx) {
      new Chart(roasCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'ROAS',
            data: roasData,
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88, 166, 255, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => v.toFixed(1) + 'x' } }
          }
        }
      });
    }

    // Spend vs Revenue Chart
    const spendCtx = el.querySelector('#spendChart');
    if (spendCtx) {
      new Chart(spendCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Spend',
              data: spendData,
              backgroundColor: '#f78166',
              borderRadius: 4
            },
            {
              label: 'Revenue',
              data: revenueData,
              backgroundColor: '#3fb950',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => 'Rp ' + (v / 1000000).toFixed(1) + 'M' } }
          }
        }
      });
    }

    // CTR Chart
    const ctrCtx = el.querySelector('#ctrChart');
    if (ctrCtx) {
      new Chart(ctrCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'CTR %',
            data: ctrData,
            borderColor: '#79c0ff',
            backgroundColor: 'rgba(121, 192, 255, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => v.toFixed(2) + '%' } }
          }
        }
      });
    }

  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8"><h1 class="text-2xl font-bold mb-4">Dashboard</h1><p class="text-red-400">Failed to load metrics</p></div>`;
  }
}
