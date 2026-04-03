import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderOptimizer(el) {
  let rules = [];
  try {
    const res = await api.get('/optimizer/rules');
    rules = res.data;
  } catch {}

  el.innerHTML = `
    <div class="p-4 sm:p-8 max-w-3xl">
      <h1 class="text-2xl sm:text-3xl font-bold mb-2">Auto-Optimizer</h1>
      <p class="text-slate-400 text-sm mb-6">Set rules to automatically manage campaigns based on performance (Pareto Engine)</p>

      <!-- Create Rule -->
      <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-6">
        <h2 class="text-lg font-semibold mb-3">Create Rule</h2>
        <form id="rule-form" class="space-y-3">
          <input type="text" name="name" placeholder="Rule name (e.g. Pause low CTR)" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required>
          <input type="text" name="campaign_id" placeholder="Campaign ID (from Meta)" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required>
          <div class="flex flex-col sm:flex-row gap-2">
            <select name="condition_metric" class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value="cpc">CPC (Cost per Click)</option>
              <option value="ctr">CTR (Click-through Rate)</option>
              <option value="cpa">CPA (Cost per Action)</option>
              <option value="spend">Total Spend</option>
              <option value="impressions">Impressions</option>
            </select>
            <select name="condition_operator" class="p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value=">">Greater than (&gt;)</option>
              <option value="<">Less than (&lt;)</option>
              <option value=">=">Greater or equal (&gt;=)</option>
              <option value="<=">Less or equal (&lt;=)</option>
            </select>
            <input type="number" name="condition_value" placeholder="Value" class="w-32 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <select name="action" class="flex-1 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <option value="pause">Pause Campaign</option>
              <option value="scale_up">Scale Up Budget (%)</option>
              <option value="scale_down">Scale Down Budget (%)</option>
              <option value="alert">Alert Only</option>
            </select>
            <input type="number" name="action_value" placeholder="% (for scale)" class="w-32 p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
          </div>
          <button type="submit" class="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-lg min-h-[44px]">Create Rule</button>
        </form>
        <div id="rule-status" class="mt-3"></div>
      </div>

      <!-- Active Rules -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Active Rules</h2>
          <button id="evaluate-btn" class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded-lg text-sm min-h-[44px]">Run Evaluation Now</button>
        </div>
        <div id="rules-list" class="space-y-3">
          ${rules.length === 0 ? '<p class="text-slate-500">No rules created yet.</p>' : rules.map(r => `
            <div class="bg-slate-800 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div class="font-medium">${esc(r.name)}</div>
                <div class="text-slate-400 text-sm">IF ${esc(r.condition_metric)} ${esc(r.condition_operator)} ${r.condition_value} THEN ${esc(r.action)}${r.action_value ? ` (${r.action_value}%)` : ''}</div>
                <div class="text-slate-500 text-xs">Campaign: ${esc(r.campaign_id)} | ${r.is_active ? '<span class="text-emerald-400">Active</span>' : '<span class="text-slate-500">Disabled</span>'}${r.last_triggered ? ` | Last triggered: ${new Date(r.last_triggered).toLocaleString('id-ID')}` : ''}</div>
              </div>
              <div class="flex gap-2">
                <button data-toggle="${esc(r.id)}" data-active="${r.is_active}" class="px-3 py-2 rounded-lg text-sm min-h-[44px] ${r.is_active ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-emerald-600 hover:bg-emerald-700'}">${r.is_active ? 'Disable' : 'Enable'}</button>
                <button data-delete-rule="${esc(r.id)}" class="bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg text-sm min-h-[44px]">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div id="evaluate-result" class="mt-3"></div>
      </div>
    </div>
  `;

  // Create rule
  el.querySelector('#rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.condition_value = parseFloat(data.condition_value);
    data.action_value = data.action_value ? parseFloat(data.action_value) : null;
    try {
      await api.post('/optimizer/rules', data);
      renderOptimizer(el);
    } catch (err) {
      el.querySelector('#rule-status').innerHTML = `<div class="text-red-400 text-sm">${esc(err.message)}</div>`;
    }
  });

  // Toggle rules
  el.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isActive = btn.dataset.active === '1';
      await api.put(`/optimizer/rules/${btn.dataset.toggle}`, { is_active: isActive ? 0 : 1 });
      renderOptimizer(el);
    });
  });

  // Delete rules
  el.querySelectorAll('[data-delete-rule]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this rule?')) return;
      await api.del(`/optimizer/rules/${btn.dataset.deleteRule}`);
      renderOptimizer(el);
    });
  });

  // Manual evaluation
  el.querySelector('#evaluate-btn').addEventListener('click', async () => {
    const btn = el.querySelector('#evaluate-btn');
    btn.disabled = true; btn.textContent = 'Evaluating...';
    try {
      const { data } = await api.post('/optimizer/evaluate');
      el.querySelector('#evaluate-result').innerHTML = `<div class="bg-slate-800 p-3 rounded-lg text-sm">Checked ${data.checked} rules, triggered ${data.triggered} actions.</div>`;
    } catch (err) {
      el.querySelector('#evaluate-result').innerHTML = `<div class="text-red-400 text-sm">${esc(err.message)}</div>`;
    }
    btn.disabled = false; btn.textContent = 'Run Evaluation Now';
  });
}
