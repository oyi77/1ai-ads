import { esc } from '../../lib/escape.js';

export function renderStep1(state) {
  return `
    <h2 class="text-lg font-semibold mb-3">Select Ad Account & Page</h2>
    <div class="space-y-4">
      <div>
        <label class="block text-sm text-slate-400 mb-1">Ad Account</label>
        <select id="w-account" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700">
          <option value="">Select account...</option>
          ${state.accounts.map(a => `<option value="${esc(a.id)}" ${state.selectedAccount === a.id ? 'selected' : ''}>${esc(a.name)} (${esc(a.id)})</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Facebook Page (for creative)</label>
        <select id="w-page" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700">
          <option value="">Select page...</option>
          ${state.pages.map(p => `<option value="${esc(p.id)}" ${state.selectedPage === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold">Next Step →</button>
    </div>
  `;
}

export function bindStep1(el, state, { render, nextStep }) {
  el.querySelector('#w-next').addEventListener('click', () => {
    state.selectedAccount = el.querySelector('#w-account').value;
    state.selectedPage = el.querySelector('#w-page').value;
    if (!state.selectedAccount) return alert('Please select an ad account');
    nextStep();
  });
}