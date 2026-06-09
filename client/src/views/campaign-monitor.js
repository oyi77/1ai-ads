import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderCampaignMonitor(el) {
  // Load connected Meta accounts
  let accounts = [];
  try {
    const res = await api.get('/meta/accounts');
    accounts = (res.data || res.accounts || []).filter(a => a.status === 'active' || a.status === 'connected');
  } catch {}

  const defaultAccountId = accounts[0]?.id || '';

  el.innerHTML = `
    <div class="p-4 sm:p-8 max-w-6xl">
      <h1 class="text-2xl sm:text-3xl font-bold mb-2">Campaign Monitor</h1>
      <p class="text-slate-400 text-sm mb-6">Real-time monitoring for specific campaign accounts</p>

      <!-- Account Selector -->
      <div class="mb-6">
        <label class="text-sm text-slate-400 mr-2">Account:</label>
        <select id="cm-account" class="p-3 bg-slate-800 rounded-lg border border-slate-600 min-h-[44px]">
          ${accounts.length > 0
            ? accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('')
            : `<option value="">No accounts connected</option>`
          }
          <option value="manual">Enter Account ID…</option>
        </select>
        <input id="cm-account-manual" type="text" placeholder="act_XXXXXXXXX"
          class="hidden ml-2 p-3 bg-slate-800 rounded-lg border border-slate-600 min-h-[44px] w-64" />
        <button id="cm-refresh" class="ml-2 bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg min-h-[44px]">Refresh</button>
      </div>

      <!-- Status Cards -->
      <div id="cm-status-cards" class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-slate-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold text-emerald-400" id="cm-active">-</div><div class="text-sm text-slate-400">Active</div></div>
        <div class="bg-slate-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold text-yellow-400" id="cm-paused">-</div><div class="text-sm text-slate-400">Paused</div></div>
        <div class="bg-slate-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold text-blue-400" id="cm-spend-today">-</div><div class="text-sm text-slate-400">Spend Today</div></div>
        <div class="bg-slate-800 p-4 rounded-lg text-center"><div class="text-3xl font-bold text-purple-400" id="cm-spend-week">-</div><div class="text-sm text-slate-400">Spend This Week</div></div>
      </div>

      <!-- Health Score -->
      <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-6">
        <h2 class="text-lg font-semibold mb-3">Health Score</h2>
        <div class="flex items-center gap-4">
          <div id="cm-health-gauge" class="text-5xl font-bold text-slate-500">-</div>
          <div id="cm-health-grade" class="text-2xl font-bold text-slate-500"></div>
        </div>
        <div id="cm-health-factors" class="mt-3 space-y-1 text-sm"></div>
      </div>

      <!-- Alerts -->
      <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Alerts</h2>
          <span id="cm-alert-count" class="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">0</span>
        </div>
        <div id="cm-alerts" class="space-y-2 text-sm"><p class="text-slate-500">Loading…</p></div>
      </div>

      <!-- Performance Trend -->
      <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Performance Trend</h2>
          <select id="cm-trend-days" class="p-2 bg-slate-900 rounded border border-slate-600 text-sm">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </div>
        <div id="cm-trend" class="overflow-x-auto">
          <p class="text-slate-500">Loading…</p>
        </div>
      </div>

      <!-- Auto-Pause -->
      <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-6">
        <h2 class="text-lg font-semibold mb-3">Auto-Pause Check</h2>
        <p class="text-slate-400 text-sm mb-3">Identify campaigns spending &gt;2x daily budget with 0 conversions</p>
        <button id="cm-auto-pause" class="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg min-h-[44px]">Run Auto-Pause Check</button>
        <div id="cm-auto-pause-result" class="mt-3 text-sm"></div>
      </div>
    </div>
  `;

  // --- State ---
  let currentAccountId = defaultAccountId;

  // --- Helpers ---
  function getAccountId() {
    const sel = el.querySelector('#cm-account').value;
    if (sel === 'manual') return el.querySelector('#cm-account-manual').value.trim();
    return sel;
  }

  function severityColor(s) {
    return s === 'critical' ? 'text-red-400 bg-red-900/30' : s === 'warning' ? 'text-yellow-400 bg-yellow-900/30' : 'text-blue-400 bg-blue-900/30';
  }

  function formatCurrency(v) {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return String(v);
  }

  // --- Load all data ---
  async function loadAll() {
    const accountId = getAccountId();
    if (!accountId) return;
    currentAccountId = accountId;

    // Parallel fetches
    const [statusRes, healthRes, alertsRes, trendRes] = await Promise.all([
      api.get(`/campaign-monitor/${accountId}/status`).catch(() => ({ data: null })),
      api.get(`/campaign-monitor/${accountId}/health`).catch(() => ({ data: null })),
      api.get(`/campaign-monitor/${accountId}/alerts`).catch(() => ({ data: null })),
      api.get(`/campaign-monitor/${accountId}/trend?days=${el.querySelector('#cm-trend-days')?.value || 7}`).catch(() => ({ data: null })),
    ]);

    const status = statusRes.data || statusRes;
    const health = healthRes.data || healthRes;
    const alerts = alertsRes.data || alertsRes;
    const trend = trendRes.data || trendRes;

    // Status cards
    if (status && !status.error) {
      const s = status;
      el.querySelector('#cm-active').textContent = s.activeCampaigns ?? '-';
      el.querySelector('#cm-paused').textContent = s.pausedCampaigns ?? '-';
      el.querySelector('#cm-spend-today').textContent = s.spendToday != null ? formatCurrency(s.spendToday) : '-';
      el.querySelector('#cm-spend-week').textContent = s.spendThisWeek != null ? formatCurrency(s.spendThisWeek) : '-';
    }

    // Health
    if (health && !health.error) {
      const h = health;
      const gauge = el.querySelector('#cm-health-gauge');
      gauge.textContent = h.score ?? '-';
      gauge.className = `text-5xl font-bold ${h.score >= 80 ? 'text-emerald-400' : h.score >= 60 ? 'text-yellow-400' : h.score >= 40 ? 'text-orange-400' : 'text-red-400'}`;
      el.querySelector('#cm-health-grade').textContent = h.grade ? `Grade ${h.grade}` : '';
      el.querySelector('#cm-health-factors').innerHTML = (h.factors || []).map(f =>
        `<div class="flex justify-between"><span>${esc(f.name)}</span><span class="text-slate-400">${esc(f.detail)}</span></div>`
      ).join('');
    }

    // Alerts
    const alertList = alerts?.alerts || [];
    el.querySelector('#cm-alert-count').textContent = alertList.length;
    el.querySelector('#cm-alerts').innerHTML = alertList.length === 0
      ? '<p class="text-slate-500">No alerts</p>'
      : alertList.map(a => `
        <div class="p-3 rounded-lg ${severityColor(a.severity)}">
          <span class="font-semibold uppercase text-xs mr-2">${esc(a.severity)}</span>
          <span>${esc(a.message)}</span>
          ${a.campaignName ? `<span class="text-slate-500 ml-2">(${esc(a.campaignName)})</span>` : ''}
        </div>
      `).join('');

    // Trend table
    const daily = trend?.daily || [];
    if (daily.length > 0) {
      el.querySelector('#cm-trend').innerHTML = `
        <table class="w-full text-sm">
          <thead><tr class="text-slate-400 border-b border-slate-700">
            <th class="text-left py-2 px-2">Date</th>
            <th class="text-right py-2 px-2">Impressions</th>
            <th class="text-right py-2 px-2">Clicks</th>
            <th class="text-right py-2 px-2">Spend</th>
            <th class="text-right py-2 px-2">CTR</th>
            <th class="text-right py-2 px-2">CPC</th>
            <th class="text-right py-2 px-2">Conv</th>
          </tr></thead>
          <tbody>
            ${daily.map(d => `
              <tr class="border-b border-slate-800 hover:bg-slate-700/50">
                <td class="py-2 px-2">${esc(d.date)}</td>
                <td class="text-right py-2 px-2">${d.impressions?.toLocaleString() ?? 0}</td>
                <td class="text-right py-2 px-2">${d.clicks?.toLocaleString() ?? 0}</td>
                <td class="text-right py-2 px-2">${formatCurrency(d.spend || 0)}</td>
                <td class="text-right py-2 px-2">${(d.ctr || 0).toFixed(2)}%</td>
                <td class="text-right py-2 px-2">${formatCurrency(d.cpc || 0)}</td>
                <td class="text-right py-2 px-2">${d.conversions ?? 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      el.querySelector('#cm-trend').innerHTML = '<p class="text-slate-500">No trend data available</p>';
    }
  }

  // --- Event listeners ---
  el.querySelector('#cm-account').addEventListener('change', (e) => {
    el.querySelector('#cm-account-manual').classList.toggle('hidden', e.target.value !== 'manual');
    if (e.target.value !== 'manual') loadAll();
  });

  el.querySelector('#cm-refresh').addEventListener('click', loadAll);

  el.querySelector('#cm-trend-days').addEventListener('change', async () => {
    const accountId = getAccountId();
    if (!accountId) return;
    const days = el.querySelector('#cm-trend-days').value;
    const trendRes = await api.get(`/campaign-monitor/${accountId}/trend?days=${days}`).catch(() => ({ data: null }));
    const trend = trendRes.data || trendRes;
    const daily = trend?.daily || [];
    if (daily.length > 0) {
      el.querySelector('#cm-trend').innerHTML = `
        <table class="w-full text-sm">
          <thead><tr class="text-slate-400 border-b border-slate-700">
            <th class="text-left py-2 px-2">Date</th>
            <th class="text-right py-2 px-2">Impressions</th>
            <th class="text-right py-2 px-2">Clicks</th>
            <th class="text-right py-2 px-2">Spend</th>
            <th class="text-right py-2 px-2">CTR</th>
            <th class="text-right py-2 px-2">CPC</th>
            <th class="text-right py-2 px-2">Conv</th>
          </tr></thead>
          <tbody>
            ${daily.map(d => `
              <tr class="border-b border-slate-800 hover:bg-slate-700/50">
                <td class="py-2 px-2">${esc(d.date)}</td>
                <td class="text-right py-2 px-2">${d.impressions?.toLocaleString() ?? 0}</td>
                <td class="text-right py-2 px-2">${d.clicks?.toLocaleString() ?? 0}</td>
                <td class="text-right py-2 px-2">${formatCurrency(d.spend || 0)}</td>
                <td class="text-right py-2 px-2">${(d.ctr || 0).toFixed(2)}%</td>
                <td class="text-right py-2 px-2">${formatCurrency(d.cpc || 0)}</td>
                <td class="text-right py-2 px-2">${d.conversions ?? 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  });

  el.querySelector('#cm-auto-pause').addEventListener('click', async () => {
    const accountId = getAccountId();
    if (!accountId) return;
    const btn = el.querySelector('#cm-auto-pause');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const res = await api.post(`/campaign-monitor/${accountId}/auto-pause-check`);
      const data = res.data || res;
      const resultEl = el.querySelector('#cm-auto-pause-result');
      if (data.shouldPause) {
        resultEl.innerHTML = `
          <div class="bg-red-900/30 border border-red-700 p-3 rounded-lg">
            <p class="font-semibold text-red-400">${data.count} campaign(s) should be paused:</p>
            ${data.campaigns.map(c => `<div class="mt-1 text-slate-300">• ${esc(c.campaignName)} — ${esc(c.reason)}</div>`).join('')}
          </div>
        `;
      } else {
        resultEl.innerHTML = '<div class="text-emerald-400">No campaigns need auto-pausing</div>';
      }
    } catch (err) {
      el.querySelector('#cm-auto-pause-result').innerHTML = `<div class="text-red-400">Error: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run Auto-Pause Check';
    }
  });

  // --- Initial load ---
  if (defaultAccountId) loadAll();
}
