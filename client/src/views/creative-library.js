import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderCreativeLibrary(el) {
  el.innerHTML = `<div class="p-4 sm:p-8"><div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl sm:text-3xl font-bold">📚 Creative Library</h1>
    <p class="text-slate-400 text-sm mt-1">Save, organize, and reuse your best-performing creatives</p></div>
    <div class="flex gap-2">
      <select id="cl-filter-type" class="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm">
        <option value="">All Types</option><option value="copy">Copy</option><option value="image">Image</option><option value="video">Video</option>
      </select>
      <button id="cl-add-btn" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">+ Add Creative</button>
    </div>
  </div>
  <div id="cl-add-form" class="hidden mb-6"></div>
  <div id="cl-grid" class="text-slate-400">Loading creative library...</div></div>`;

  const grid = el.querySelector('#cl-grid');
  const addBtn = el.querySelector('#cl-add-btn');
  const formEl = el.querySelector('#cl-add-form');
  const filterType = el.querySelector('#cl-filter-type');

  addBtn?.addEventListener('click', () => {
    formEl.classList.toggle('hidden');
    if (!formEl.innerHTML) renderAddForm(formEl, grid);
  });

  filterType?.addEventListener('change', () => loadCreatives(grid, filterType.value));

  await loadCreatives(grid, '');
}

function renderAddForm(formEl, grid) {
  formEl.innerHTML = `
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
      <h3 class="text-lg font-semibold mb-4">Save Creative</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div><label class="block text-sm text-slate-400 mb-1">Name</label>
          <input id="cl-name" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm" placeholder="e.g. Summer Sale Hook" /></div>
        <div><label class="block text-sm text-slate-400 mb-1">Type</label>
          <select id="cl-type" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm">
            <option value="copy">Copy</option><option value="image">Image</option><option value="video">Video</option>
          </select></div>
        <div><label class="block text-sm text-slate-400 mb-1">Hook</label>
          <input id="cl-hook" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm" placeholder="Attention-grabbing headline" /></div>
        <div><label class="block text-sm text-slate-400 mb-1">CTA</label>
          <input id="cl-cta" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm" placeholder="Shop Now" /></div>
      </div>
      <div class="mb-4"><label class="block text-sm text-slate-400 mb-1">Body</label>
        <textarea id="cl-body" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm h-20" placeholder="Main ad copy..."></textarea></div>
      <div class="mb-4"><label class="block text-sm text-slate-400 mb-1">Tags (comma-separated)</label>
        <input id="cl-tags" class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm" placeholder="sale, summer, shoes" /></div>
      <div class="flex gap-2">
        <button id="cl-submit" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium">Save</button>
        <button id="cl-cancel" class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-sm">Cancel</button>
      </div>
    </div>`;

  formEl.querySelector('#cl-cancel')?.addEventListener('click', () => formEl.classList.add('hidden'));

  formEl.querySelector('#cl-submit')?.addEventListener('click', async () => {
    const name = formEl.querySelector('#cl-name').value.trim();
    if (!name) { window.vn?.warn('Name required'); return; }
    try {
      await api.post('/creative/library', {
        name,
        type: formEl.querySelector('#cl-type').value,
        hook: formEl.querySelector('#cl-hook').value,
        body: formEl.querySelector('#cl-body').value,
        cta: formEl.querySelector('#cl-cta').value,
        tags: formEl.querySelector('#cl-tags').value.split(',').map(s => s.trim()).filter(Boolean),
      });
      window.vn?.success('Creative saved to library');
      formEl.classList.add('hidden');
      formEl.innerHTML = '';
      await loadCreatives(grid, '');
    } catch (e) {
      window.vn?.error('Failed: ' + e.message);
    }
  });
}

async function loadCreatives(container, type) {
  try {
    const query = type ? `?type=${type}` : '';
    const res = await api.get(`/creative/library${query}`);
    const { data: items, total } = res.data || { data: [], total: 0 };

    if (!items.length) {
      container.innerHTML = `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
        <div class="text-4xl mb-3">📚</div>
        <div class="text-lg font-semibold">Library is Empty</div>
        <div class="text-slate-400 text-sm mt-2">Save your first creative to start building your library</div>
      </div>`;
      return;
    }

    container.innerHTML = `<div class="mb-3 text-sm text-slate-400">${total} creative${total !== 1 ? 's' : ''}</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${items.map(c => {
      const tags = typeof c.tags === 'string' ? JSON.parse(c.tags || '[]') : (c.tags || []);
      const typeBadge = { copy: '📝', image: '🖼️', video: '🎬' }[c.type] || '📄';
      return `<div class="bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-sky-500/50 transition-colors">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-slate-400">${typeBadge} ${esc(c.type || 'copy')}</span>
              <div class="flex gap-1">
                ${c.best_roas ? `<span class="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs">ROAS ${(c.best_roas).toFixed(1)}x</span>` : ''}
                ${c.best_ctr ? `<span class="px-2 py-0.5 bg-sky-500/10 text-sky-400 rounded text-xs">CTR ${(c.best_ctr).toFixed(1)}%</span>` : ''}
              </div>
            </div>
            <h4 class="font-medium mb-1">${esc(c.name)}</h4>
            ${c.hook ? `<div class="text-sm text-slate-300 mb-2 line-clamp-2">${esc(c.hook)}</div>` : ''}
            ${c.body ? `<div class="text-xs text-slate-500 mb-2 line-clamp-3">${esc(c.body)}</div>` : ''}
            ${tags.length ? `<div class="flex flex-wrap gap-1 mb-2">${tags.map(t => `<span class="px-2 py-0.5 bg-[#0d1117] rounded text-xs text-slate-400">${esc(t)}</span>`).join('')}</div>` : ''}
            <div class="flex items-center justify-between mt-3 pt-2 border-t border-[#21262d]">
              <span class="text-xs text-slate-500">Used ${c.times_used || 0}x</span>
              <div class="flex gap-1">
                <button class="px-2 py-1 bg-sky-600/20 hover:bg-sky-600/40 rounded text-xs" data-action="use" data-id="${esc(c.id)}">Use</button>
                <button class="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 rounded text-xs" data-action="delete" data-id="${esc(c.id)}">✕</button>
              </div>
            </div>
          </div>`;
    }).join('')}
      </div>`;

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'use') {
        try {
          await api.post(`/creative/library/${id}/use`);
          window.vn?.success('Usage recorded');
          await loadCreatives(container, type);
        } catch (err) { window.vn?.error(err.message); }
      } else if (btn.dataset.action === 'delete') {
        if (!confirm('Delete this creative?')) return;
        try {
          await api.del(`/creative/library/${id}`);
          window.vn?.success('Deleted');
          await loadCreatives(container, type);
        } catch (err) { window.vn?.error(err.message); }
      }
    });
  } catch (e) {
    container.innerHTML = `<div class="text-red-400 p-4">Failed to load library: ${esc(e.message)}</div>`;
  }
}
