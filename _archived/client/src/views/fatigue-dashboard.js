import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';
import { renderSparkline } from '../lib/charts.js';

export async function renderFatigueDashboard(el) {
  el.innerHTML = `<div class="p-4 sm:p-8"><div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl sm:text-3xl font-bold">🎨 Creative Fatigue</h1>
    <p class="text-slate-400 text-sm mt-1">Detect and refresh fatigued creatives before performance drops</p></div>
    <button id="fatigue-snapshot-btn" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">📸 Snapshot Now</button>
  </div>
  <div id="fatigue-loading" class="text-slate-400">Loading creative performance data...</div>
  <div id="fatigue-content"></div></div>`;

  const content = el.querySelector('#fatigue-content');
  const snapBtn = el.querySelector('#fatigue-snapshot-btn');

  snapBtn?.addEventListener('click', async () => {
    snapBtn.disabled = true;
    snapBtn.textContent = '⏳ Snapshotting...';
    try {
      await api.get('/creative/fatigue/snapshot/act_me');
      window.vn?.success('Creative snapshot complete');
      await loadFatigueData(content);
    } catch (e) {
      window.vn?.error('Snapshot failed: ' + e.message);
    } finally {
      snapBtn.disabled = false;
      snapBtn.textContent = '📸 Snapshot Now';
    }
  });

  await loadFatigueData(content);
}

async function loadFatigueData(container) {
  try {
    const res = await api.get('/creative/fatigue/detect/act_me');
    const fatigued = res.data || [];
    container.innerHTML = '';

    if (!fatigued.length) {
      container.innerHTML = `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
        <div class="text-4xl mb-3">✅</div>
        <div class="text-lg font-semibold text-[#3fb950]">No Fatigue Detected</div>
        <div class="text-slate-400 text-sm mt-2">All creatives are performing within normal ranges</div>
      </div>`;
      return;
    }

    const severityOrder = { critical: 0, warning: 1 };
    fatigued.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

    const table = document.createElement('div');
    table.className = 'bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden';
    table.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-[#30363d] text-slate-400 text-left">
            <th class="p-3">Creative</th><th class="p-3">Severity</th><th class="p-3">Signals</th><th class="p-3">Trend</th><th class="p-3">Recommendation</th><th class="p-3">Action</th>
          </tr></thead>
          <tbody id="fatigue-table-body"></tbody>
        </table>
      </div>`;

    const tbody = table.querySelector('#fatigue-table-body');
    for (const item of fatigued) {
      const badge = item.severity === 'critical'
        ? '<span class="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium">CRITICAL</span>'
        : '<span class="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">WARNING</span>';

      const signals = (item.signals || []).map(s => {
        const icon = s.type === 'high_frequency' ? '🔊' : s.type === 'ctr_decline' ? '📉' : '⚠️';
        return `<span class="inline-block px-2 py-0.5 bg-[#0d1117] rounded text-xs mr-1 mb-1">${icon} ${esc(s.type.replace(/_/g, ' '))}</span>`;
      }).join('');

      const rec = item.recommendation === 'rotate' ? '🔄 Rotate Creative' : item.recommendation === 'pause' ? '⏸️ Pause' : '✨ Refresh Copy';

      const tr = document.createElement('tr');
      tr.className = 'border-b border-[#21262d] hover:bg-[#1c2128]';
      tr.innerHTML = `
        <td class="p-3 font-medium">${esc(item.adName || item.adId)}</td>
        <td class="p-3">${badge}</td>
        <td class="p-3">${signals}</td>
        <td class="p-3" id="spark-${esc(item.adId)}"></td>
        <td class="p-3 text-sm">${rec}</td>
        <td class="p-3">
          <button class="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs font-medium" data-action="refresh" data-ad-id="${esc(item.adId)}">Refresh</button>
        </td>`;
      tbody.appendChild(tr);

      // Load sparkline
      try {
        const histRes = await api.get(`/fatigue/history/${item.adId}?days=14`);
        const sparkCell = tr.querySelector(`#spark-${CSS.escape(item.adId)}`);
        if (sparkCell && histRes.data?.length) {
          renderSparkline(sparkCell, histRes.data.map(r => r.ctr || 0), { color: item.severity === 'critical' ? '#ff7b72' : '#ffa657' });
        }
      } catch { /* sparkline optional */ }
    }

    container.appendChild(table);

    // Event delegation for action buttons
    table.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const adId = btn.dataset.adId;
      btn.disabled = true;
      btn.textContent = '⏳';
      window.vn?.info(`Refreshing creative ${adId}...`);
      // Auto-flow would trigger here via fatigue → AB test
      setTimeout(() => { btn.textContent = '✅ Done'; }, 1500);
    });

  } catch (e) {
    container.innerHTML = `<div class="text-red-400 p-4">Failed to load fatigue data: ${esc(e.message)}</div>`;
  }
}
