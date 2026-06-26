import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';
import { renderBarChart, renderDonutChart } from '../lib/charts.js';

const WIDGET_TYPES = [
  { type: 'metric_card', label: 'Metric Card', icon: '📊' },
  { type: 'chart_bar', label: 'Bar Chart', icon: '📊' },
  { type: 'chart_donut', label: 'Donut Chart', icon: '🍩' },
  { type: 'campaign_list', label: 'Campaign List', icon: '📋' },
  { type: 'platform_breakdown', label: 'Platform Breakdown', icon: '🌐' },
];

const METRICS = ['spend', 'revenue', 'roas', 'clicks', 'impressions', 'conversions', 'ctr', 'cpc'];

export async function renderDashboardWidgets(el) {
  el.innerHTML = `<div class="p-4 sm:p-8"><div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl sm:text-3xl font-bold">🎛️ Dashboard Builder</h1>
    <p class="text-slate-400 text-sm mt-1">Customize your dashboard with drag-and-drop widgets</p></div>
    <button id="dw-add-btn" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">+ Add Widget</button>
  </div>
  <div id="dw-picker" class="hidden mb-6"></div>
  <div id="dw-grid" class="text-slate-400">Loading widgets...</div></div>`;

  const grid = el.querySelector('#dw-grid');
  const addBtn = el.querySelector('#dw-add-btn');
  const picker = el.querySelector('#dw-picker');

  addBtn?.addEventListener('click', () => {
    picker.classList.toggle('hidden');
    if (!picker.innerHTML) renderWidgetPicker(picker, grid);
  });

  await loadWidgets(grid);
}

function renderWidgetPicker(picker, grid) {
  picker.innerHTML = `
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
      <h3 class="text-lg font-semibold mb-4">Add Widget</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        ${WIDGET_TYPES.map(w => `
          <button class="flex flex-col items-center gap-2 p-3 bg-[#0d1117] border border-[#30363d] rounded-xl hover:border-sky-500 transition-colors" data-widget-type="${w.type}">
            <span class="text-2xl">${w.icon}</span>
            <span class="text-xs text-slate-300">${w.label}</span>
          </button>`).join('')}
      </div>
      <div id="dw-config" class="hidden"></div>
      <button id="dw-cancel-picker" class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-sm">Cancel</button>
    </div>`;

  picker.querySelector('#dw-cancel-picker')?.addEventListener('click', () => picker.classList.add('hidden'));

  picker.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-widget-type]');
    if (!btn) return;
    const widgetType = btn.dataset.widgetType;

    const configEl = picker.querySelector('#dw-config');
    configEl.classList.remove('hidden');
    configEl.innerHTML = `
      <div class="border-t border-[#30363d] pt-4 mt-4">
        <label class="block text-sm text-slate-400 mb-1">Metric</label>
        <select id="dw-metric" class="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm mb-3">
          ${METRICS.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}
        </select>
        <label class="block text-sm text-slate-400 mb-1">Size</label>
        <select id="dw-size" class="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm mb-3">
          <option value="small">Small</option><option value="medium" selected>Medium</option><option value="large">Large</option>
        </select>
        <button id="dw-confirm-add" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">Add to Dashboard</button>
      </div>`;

    configEl.querySelector('#dw-confirm-add')?.addEventListener('click', async () => {
      try {
        await api.post('/widgets', {
          widgetType,
          config: { metric: configEl.querySelector('#dw-metric').value },
          size: configEl.querySelector('#dw-size').value,
        });
        window.vn?.success('Widget added');
        picker.classList.add('hidden');
        picker.innerHTML = '';
        await loadWidgets(grid);
      } catch (err) {
        window.vn?.error(err.message);
      }
    });
  });
}

async function loadWidgets(container) {
  try {
    const res = await api.get('/widgets');
    const widgets = res.data || [];

    if (!widgets.length) {
      container.innerHTML = `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
        <div class="text-4xl mb-3">🎛️</div>
        <div class="text-lg font-semibold">No Widgets Yet</div>
        <div class="text-slate-400 text-sm mt-2">Click "Add Widget" to customize your dashboard</div>
      </div>`;
      return;
    }

    container.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${widgets.map(w => {
      const config = typeof w.config === 'string' ? JSON.parse(w.config || '{}') : (w.config || {});
      const sizeClass = w.size === 'large' ? 'sm:col-span-2 lg:col-span-3' : w.size === 'small' ? '' : 'sm:col-span-1';
      const typeInfo = WIDGET_TYPES.find(t => t.type === w.widget_type) || { icon: '📊', label: w.widget_type };
      return `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 ${sizeClass}" data-widget-id="${esc(w.id)}" id="widget-${esc(w.id)}">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium">${typeInfo.icon} ${typeInfo.label}</span>
              <button class="text-slate-500 hover:text-red-400 text-sm" data-action="delete-widget" data-id="${esc(w.id)}">✕</button>
            </div>
            <div id="widget-content-${esc(w.id)}" class="min-h-[60px]">
              <div class="text-xs text-slate-500">Loading...</div>
            </div>
          </div>`;
    }).join('')}
    </div>`;

    // Load widget data
    for (const w of widgets) {
      const contentEl = container.querySelector(`#widget-content-${CSS.escape(w.id)}`);
      if (!contentEl) continue;
      const config = typeof w.config === 'string' ? JSON.parse(w.config || '{}') : (w.config || {});
      await renderWidgetContent(contentEl, w.widget_type, config);
    }

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action="delete-widget"]');
      if (!btn) return;
      try {
        await api.del(`/widgets/${btn.dataset.id}`);
        window.vn?.success('Widget removed');
        await loadWidgets(container);
      } catch (err) { window.vn?.error(err.message); }
    });
  } catch (e) {
    container.innerHTML = `<div class="text-red-400 p-4">Failed to load widgets: ${esc(e.message)}</div>`;
  }
}

async function renderWidgetContent(container, type, config) {
  try {
    if (type === 'metric_card') {
      const res = await api.get(`/unified/dashboard?dateRange=last_7d`);
      const totals = res.data?.totals || {};
      const val = totals[config.metric] ?? 0;
      const formatted = config.metric === 'roas' ? `${val.toFixed(2)}x`
        : config.metric === 'ctr' ? `${val.toFixed(2)}%`
        : typeof val === 'number' ? val.toLocaleString() : val;
      container.innerHTML = `<div class="text-2xl font-bold text-sky-400">${formatted}</div><div class="text-xs text-slate-400 mt-1">${(config.metric || 'metric').toUpperCase()}</div>`;
    } else if (type === 'chart_bar') {
      const res = await api.get(`/unified/dashboard?dateRange=last_7d`);
      const byPlatform = res.data?.byPlatform || [];
      container.innerHTML = '';
      if (byPlatform.length) {
        renderBarChart(container, {
          labels: byPlatform.map(p => p.name),
          datasets: [{ data: byPlatform.map(p => p[config.metric] || 0), color: '#58a6ff' }],
        });
      }
    } else if (type === 'chart_donut') {
      const res = await api.get(`/unified/dashboard?dateRange=last_7d`);
      const byPlatform = res.data?.byPlatform || [];
      container.innerHTML = '';
      if (byPlatform.length) {
        renderDonutChart(container, {
          labels: byPlatform.map(p => p.name),
          data: byPlatform.map(p => p[config.metric] || 0),
          colors: ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#7ee787'],
        });
      }
    } else {
      container.innerHTML = `<div class="text-xs text-slate-500">${type} widget</div>`;
    }
  } catch {
    container.innerHTML = `<div class="text-xs text-red-400">Failed to load</div>`;
  }
}
