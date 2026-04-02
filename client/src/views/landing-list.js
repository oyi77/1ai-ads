import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderLandingList(el) {
  try {
    const { data: pages } = await api.get('/landing');
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4">Landing Pages</h1>
        <a href="#/landing/create" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg inline-flex items-center min-h-[44px] mb-4">Create Page</a>
        <div class="grid gap-4">
          ${pages.length === 0 ? '<p class="text-slate-400">No landing pages yet.</p>' : ''}
          ${pages.map(p => `
            <div class="bg-slate-800 p-4 rounded-lg flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <div class="flex-1">
                <div class="font-bold">${esc(p.name || 'Untitled')}</div>
                <div class="text-slate-400 text-sm">${esc(p.template)} | ${esc(p.theme)}</div>
              </div>
              <div class="flex gap-3 self-end sm:self-start">
                <button data-export="${esc(p.id)}" data-name="${esc(p.name || 'landing-page')}" class="text-sky-400 hover:text-sky-300 text-sm min-h-[44px] px-2">Export</button>
                <button data-delete="${esc(p.id)}" class="text-red-400 hover:text-red-300 text-sm min-h-[44px] px-2">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Export handlers (fetch with auth, then download)
    el.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('adforge_token');
          const res = await fetch(`/api/landing/${btn.dataset.export}/export`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const html = await res.text();
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${btn.dataset.name}.html`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          alert('Export failed: ' + e.message);
        }
      });
    });

    // Delete handlers
    el.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this landing page?')) return;
        await api.del(`/landing/${btn.dataset.delete}`);
        renderLandingList(el);
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load landing pages</div>`;
  }
}
