import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderAdsList(el) {
  try {
    const { data: ads } = await api.get('/ads');
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4">My Creatives</h1>
        <div class="flex flex-col sm:flex-row gap-3 mb-4">
          <input type="text" id="ads-search" placeholder="Search ads..." class="flex-1 p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
          <a href="#/ads/create" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg text-center min-h-[44px] inline-flex items-center justify-center">Create Ad</a>
        </div>
        <div id="ads-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${renderAdsGrid(ads)}
        </div>
      </div>
      
      <!-- Preview Modal -->
      <div id="ad-preview-modal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 class="text-xl font-bold">Ad Preview</h2>
            <button id="close-preview" class="text-slate-400 hover:text-white p-2">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="p-6 overflow-auto" id="preview-content"></div>
        </div>
      </div>
    `;

    // Search with debounce
    let timer;
    el.querySelector('#ads-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = e.target.value.trim();
        try {
          const result = q.length >= 2 ? await api.get(`/ads/search?q=${encodeURIComponent(q)}`) : await api.get('/ads');
          el.querySelector('#ads-grid').innerHTML = renderAdsGrid(result.data);
          attachHandlers(el);
        } catch {}
      }, 300);
    });

    attachHandlers(el);
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load ads: ${esc(e.message)}</div>`;
  }
}

function renderAdsGrid(ads) {
  if (ads.length === 0) return '<p class="text-slate-400">No ads found.</p>';
  return ads.map(ad => `
    <div class="bg-slate-800 p-4 rounded-lg flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1">
          <div class="font-bold">${esc(ad.name || 'Untitled')}</div>
          <div class="text-slate-400 text-sm">${esc(ad.platform)} · ${esc(ad.content_model || 'N/A')}</div>
          <div class="text-slate-500 text-xs mt-1">${esc(ad.hook || '')}</div>
        </div>
        <span class="flex-shrink-0 text-xs px-2 py-1 rounded-full bg-sky-500/20 text-sky-400 font-medium">${esc(ad.campaign_name || ad.account || 'Default Account')}</span>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button data-preview="${esc(ad.id)}" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors">Preview</button>
        <button data-edit="${esc(ad.id)}" class="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors">Edit</button>
        <button data-delete="${esc(ad.id)}" class="bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 px-3 rounded-lg text-sm font-medium min-h-[44px] transition-colors">Delete</button>
      </div>
    </div>
  `).join('');
}

function attachHandlers(el) {
  // Preview handlers
  el.querySelectorAll('[data-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const adId = btn.dataset.preview;
      const card = btn.closest('.bg-slate-800');
      const name = card.querySelector('.font-bold')?.textContent || 'Untitled';
      const platform = card.querySelector('.text-slate-400')?.textContent || '';
      const hook = card.querySelector('.text-slate-500')?.textContent || '';
      
      const content = el.querySelector('#preview-content');
      content.innerHTML = `
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Ad Name</label>
            <div class="text-white font-medium">${esc(name)}</div>
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Platform</label>
            <div class="text-white">${esc(platform)}</div>
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Hook</label>
            <div class="text-white p-3 bg-slate-900 rounded-lg">${esc(hook)}</div>
          </div>
        </div>
      `;
      el.querySelector('#ad-preview-modal').classList.remove('hidden');
    });
  });

  // Edit handlers
  el.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = `#/ads/create?edit=${btn.dataset.edit}`;
    });
  });

  // Delete handlers
  el.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this ad?')) return;
      await api.del(`/ads/${btn.dataset.delete}`);
      renderAdsList(el);
    });
  });

  // Close preview modal
  el.querySelector('#close-preview')?.addEventListener('click', () => {
    el.querySelector('#ad-preview-modal').classList.add('hidden');
  });
  
  el.querySelector('#ad-preview-modal')?.addEventListener('click', (e) => {
    if (e.target === el.querySelector('#ad-preview-modal')) {
      el.querySelector('#ad-preview-modal').classList.add('hidden');
    }
  });
}
