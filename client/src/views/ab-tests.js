import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';
import { renderBarChart } from '../lib/charts.js';

export async function renderAbTests(el) {
  el.innerHTML = `<div class="p-4 sm:p-8"><div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl sm:text-3xl font-bold">🧪 A/B Tests</h1>
    <p class="text-slate-400 text-sm mt-1">Create and manage A/B tests with statistical significance</p></div>
    <button id="ab-create-btn" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">+ New Test</button>
  </div>
  <div id="ab-create-form" class="hidden mb-6"></div>
  <div id="ab-tests-list" class="text-slate-400">Loading tests...</div></div>`;

  const listEl = el.querySelector('#ab-tests-list');
  const createBtn = el.querySelector('#ab-create-btn');
  const formEl = el.querySelector('#ab-create-form');

  createBtn?.addEventListener('click', () => {
    formEl.classList.toggle('hidden');
    if (!formEl.innerHTML) renderCreateForm(formEl, listEl);
  });

  await loadTests(listEl);
}

function renderCreateForm(formEl, listEl) {
  formEl.innerHTML = `
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
      <h3 class="text-lg font-semibold mb-4">Create A/B Test</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div><label class="block text-sm text-slate-400 mb-1">Test Name</label>
          <input id="ab-name" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm" placeholder="e.g. Hook Test Q3" /></div>
        <div><label class="block text-sm text-slate-400 mb-1">Metric</label>
          <select id="ab-metric" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm">
            <option value="ctr">CTR</option><option value="cpc">CPC</option><option value="cpa">CPA</option><option value="cvr">CVR</option>
          </select></div>
      </div>
      <div class="mb-4">
        <label class="block text-sm text-slate-400 mb-2">Variants (one per line: "Name | Hook | Body")</label>
        <textarea id="ab-variants" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm h-24" placeholder="Variant A | Buy now and save 50% | Limited time offer...&#10;Variant B | Don't miss this deal | Get yours before it's gone..."></textarea>
      </div>
      <div class="flex gap-2">
        <button id="ab-submit" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">Create Test</button>
        <button id="ab-cancel" class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-sm">Cancel</button>
      </div>
    </div>`;

  formEl.querySelector('#ab-cancel')?.addEventListener('click', () => formEl.classList.add('hidden'));

  formEl.querySelector('#ab-submit')?.addEventListener('click', async () => {
    const name = formEl.querySelector('#ab-name').value.trim();
    const metric = formEl.querySelector('#ab-metric').value;
    const lines = formEl.querySelector('#ab-variants').value.trim().split('\n').filter(Boolean);
    if (!name || !lines.length) { window.vn?.warn('Name and at least one variant required'); return; }

    const variants = lines.map((line, i) => {
      const parts = line.split('|').map(s => s.trim());
      return { name: parts[0] || `Variant ${i + 1}`, hook: parts[1] || '', body: parts[2] || '' };
    });

    try {
      await api.post('/ab-tests', { name, metric, variants });
      window.vn?.success('A/B test created');
      formEl.classList.add('hidden');
      formEl.innerHTML = '';
      await loadTests(listEl);
    } catch (e) {
      window.vn?.error('Failed: ' + e.message);
    }
  });
}

async function loadTests(container) {
  try {
    const res = await api.get('/ab-tests');
    const tests = Array.isArray(res) ? res : (res.data || []);

    if (!tests.length) {
      container.innerHTML = `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
        <div class="text-4xl mb-3">🧪</div>
        <div class="text-lg font-semibold">No A/B Tests Yet</div>
        <div class="text-slate-400 text-sm mt-2">Create your first test to start optimizing creatives</div>
      </div>`;
      return;
    }

    container.innerHTML = tests.map(t => {
      const statusBadge = {
        draft: '<span class="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs">Draft</span>',
        running: '<span class="px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded text-xs">🟢 Running</span>',
        completed: '<span class="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">✅ Completed</span>',
        winner_selected: '<span class="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">🏆 Winner Selected</span>',
      }[t.status] || `<span class="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs">${esc(t.status)}</span>`;

      const variants = (t.variants || []).map(v =>
        `<div class="flex items-center gap-3 p-2 bg-[#0d1117] rounded-lg">
          <span class="font-medium text-sm">${esc(v.name)}</span>
          <span class="text-xs text-slate-400">${v.impressions || 0} imp / ${v.clicks || 0} clicks</span>
          ${t.winner === v.id ? '<span class="text-xs text-[#3fb950]">🏆 Winner</span>' : ''}
        </div>`
      ).join('');

      return `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6 mb-4">
        <div class="flex items-center justify-between mb-3">
          <div><h3 class="font-semibold">${esc(t.name)}</h3>
          <div class="text-xs text-slate-400 mt-1">${esc(t.metric?.toUpperCase() || 'CTR')} • ${t.variants?.length || 0} variants</div></div>
          <div class="flex items-center gap-2">${statusBadge}
            ${t.status === 'draft' ? `<button class="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-medium" data-action="start" data-id="${esc(t.id)}">▶ Start</button>` : ''}
            ${t.status === 'running' ? `<button class="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs font-medium" data-action="stop" data-id="${esc(t.id)}">⏹ Stop</button>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">${variants}</div>
        <div class="mt-3 text-xs text-slate-500">Created ${t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</div>
      </div>`;
    }).join('');

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      btn.disabled = true;
      try {
        await api.post(`/ab-tests/${id}/${action}`);
        window.vn?.success(`Test ${action === 'start' ? 'started' : 'stopped'}`);
        await loadTests(container);
      } catch (err) {
        window.vn?.error(err.message);
        btn.disabled = false;
      }
    });
  } catch (e) {
    container.innerHTML = `<div class="text-red-400 p-4">Failed to load tests: ${esc(e.message)}</div>`;
  }
}
