import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderCompetitorSpy(el) {
  let competitors = [];
  try {
    const resp = await api.get('/competitor-spy');
    competitors = resp.data || [];
  } catch (e) {
    console.error('Failed to load competitor data:', e);
  }

  function render() {
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-6">Competitor Spy Dashboard</h1>
        ${competitors.length ? renderTable() : '<div class="text-slate-400">No competitor data available.</div>'}
      </div>
    `;
  }

  function renderTable() {
    return `<table class="w-full table-auto border border-slate-700">
      <thead class="bg-slate-800">
        <tr>
          <th class="px-2 py-1 text-left">Name</th>
          <th class="px-2 py-1 text-left">Website</th>
          <th class="px-2 py-1 text-left">Description</th>
          <th class="px-2 py-1 text-left">Features</th>
        </tr>
      </thead>
      <tbody>
        ${competitors.map(c => `
          <tr class="border-t border-slate-700">
            <td class="px-2 py-1">${esc(c.name)}</td>
            <td class="px-2 py-1"><a href="${esc(c.website)}" target="_blank" rel="noopener" class="text-sky-400 hover:underline">${esc(c.website)}</a></td>
            <td class="px-2 py-1">${esc(c.description)}</td>
            <td class="px-2 py-1">${esc(c.features?.join(', ') || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  }

  render();
}
