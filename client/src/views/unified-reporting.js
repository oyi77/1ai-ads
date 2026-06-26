import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';
import { renderBarChart, renderDonutChart, renderLineChart } from '../lib/charts.js';

export async function renderUnifiedReporting(el) {
  el.innerHTML = `<div class="p-4 sm:p-8"><div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl sm:text-3xl font-bold">📊 Unified Reporting</h1>
    <p class="text-slate-400 text-sm mt-1">Cross-platform performance in one view</p></div>
    <select id="ur-range" class="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm">
      <option value="last_7d">Last 7 Days</option><option value="last_14d">Last 14 Days</option><option value="last_30d">Last 30 Days</option><option value="last_90d">Last 90 Days</option>
    </select>
  </div>
  <div id="ur-content"><div class="text-slate-400">Loading cross-platform data...</div></div></div>`;

  const content = el.querySelector('#ur-content');
  const rangeSelect = el.querySelector('#ur-range');

  rangeSelect?.addEventListener('change', () => loadUnifiedData(content, rangeSelect.value));

  // SSE refresh
  const evtSource = new EventSource('/api/realtime/events');
  evtSource.addEventListener('sync:complete', () => loadUnifiedData(content, rangeSelect.value));
  evtSource.addEventListener('campaign:updated', () => loadUnifiedData(content, rangeSelect.value));
  el._evtSource = evtSource;

  await loadUnifiedData(content, 'last_7d');
}

async function loadUnifiedData(container, dateRange) {
  try {
    const [dashRes, tsRes] = await Promise.all([
      api.get(`/reporting/unified/dashboard?dateRange=${dateRange}`),
      api.get(`/reporting/unified/timeseries?metric=spend&days=30`).catch(() => ({ data: [] })),
    ]);

    const { totals, byPlatform } = dashRes.data || { totals: {}, byPlatform: [] };
    const timeSeries = tsRes.data || [];

    container.innerHTML = '';

    // KPI cards
    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6';
    const kpis = [
      { label: 'Total Spend', value: fmtCurrency(totals.spend), color: 'text-[#f78166]' },
      { label: 'Total Revenue', value: fmtCurrency(totals.revenue), color: 'text-[#3fb950]' },
      { label: 'Overall ROAS', value: `${(totals.overallROAS || 0).toFixed(2)}x`, color: 'text-[#58a6ff]' },
      { label: 'Total Clicks', value: (totals.clicks || 0).toLocaleString(), color: 'text-[#d2a8ff]' },
    ];
    kpiGrid.innerHTML = kpis.map(k =>
      `<div class="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
        <div class="text-slate-400 text-xs">${k.label}</div>
        <div class="text-xl font-bold ${k.color} mt-1">${k.value}</div>
      </div>`
    ).join('');
    container.appendChild(kpiGrid);

    // Charts row
    const chartsRow = document.createElement('div');
    chartsRow.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6';

    // Donut: spend distribution
    const donutBox = document.createElement('div');
    donutBox.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-4';
    if (byPlatform.length) {
      renderDonutChart(donutBox, {
        labels: byPlatform.map(p => p.name),
        data: byPlatform.map(p => p.spend || 0),
        colors: ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#7ee787', '#ff7b72', '#79c0ff'],
        title: 'Spend Distribution',
      });
    }
    chartsRow.appendChild(donutBox);

    // Bar: ROAS comparison
    const barBox = document.createElement('div');
    barBox.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-4';
    if (byPlatform.length) {
      renderBarChart(barBox, {
        labels: byPlatform.map(p => p.name),
        datasets: [{ data: byPlatform.map(p => p.roas || 0), color: '#58a6ff', label: 'ROAS' }],
        title: 'ROAS by Platform',
      });
    }
    chartsRow.appendChild(barBox);
    container.appendChild(chartsRow);

    // Line chart: time series
    if (timeSeries.length) {
      const lineBox = document.createElement('div');
      lineBox.className = 'bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-6';
      const platforms = [...new Set(timeSeries.map(r => r.platform))];
      const dates = [...new Set(timeSeries.map(r => r.date))];
      const datasets = platforms.map((p, i) => ({
        label: p,
        data: dates.map(d => timeSeries.find(r => r.date === d && r.platform === p)?.value || 0),
        color: ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff'][i % 4],
      }));
      renderLineChart(lineBox, { labels: dates.map(d => d.slice(5)), datasets, title: 'Spend Over Time' });
      container.appendChild(lineBox);
    }

    // Platform breakdown table
    if (byPlatform.length) {
      const tableBox = document.createElement('div');
      tableBox.className = 'bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden';
      tableBox.innerHTML = `
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="border-b border-[#30363d] text-slate-400 text-left">
            <th class="p-3">Platform</th><th class="p-3 text-right">Spend</th><th class="p-3 text-right">Revenue</th><th class="p-3 text-right">ROAS</th><th class="p-3 text-right">Clicks</th><th class="p-3 text-right">CTR</th>
          </tr></thead>
          <tbody>${byPlatform.map(p => `
            <tr class="border-b border-[#21262d] hover:bg-[#1c2128]">
              <td class="p-3 font-medium">${esc(p.name)}</td>
              <td class="p-3 text-right">${fmtCurrency(p.spend)}</td>
              <td class="p-3 text-right">${fmtCurrency(p.revenue)}</td>
              <td class="p-3 text-right"><span class="${(p.roas || 0) >= 1 ? 'text-[#3fb950]' : 'text-[#f78166]'}">${(p.roas || 0).toFixed(2)}x</span></td>
              <td class="p-3 text-right">${(p.clicks || 0).toLocaleString()}</td>
              <td class="p-3 text-right">${(p.ctr || 0).toFixed(2)}%</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
      container.appendChild(tableBox);
    }
  } catch (e) {
    container.innerHTML = `<div class="text-red-400 p-4">Failed to load unified data: ${esc(e.message)}</div>`;
  }
}

function fmtCurrency(n) {
  if (!n) return 'Rp 0';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}
