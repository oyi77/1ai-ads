import { esc } from '../../lib/escape.js';

// Review & Confirmation Step
export function renderStep7(state) {
  const bestAd = state.aiResult?.copies?.[0] || {};
  return `
    <h2 class="text-lg font-semibold mb-3 text-sky-400">Review Your Campaign</h2>
    <div class="space-y-3">
      <div class="bg-slate-800 p-4 rounded-lg">
        <div class="text-xs text-slate-500 uppercase font-bold mb-1">Account</div>
        <div class="font-medium">${esc(state.accounts.find(a => a.id === state.selectedAccount)?.name || state.selectedAccount)}</div>
      </div>
      <div class="bg-slate-800 p-4 rounded-lg">
        <div class="text-xs text-slate-500 uppercase font-bold mb-1">Product</div>
        <div class="font-medium">${esc(state.product)}</div>
      </div>
      <div class="bg-slate-800 p-4 rounded-lg">
        <div class="text-xs text-slate-500 uppercase font-bold mb-1">Budget</div>
        <div class="font-medium">Rp ${state.dailyBudget.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} / day</div>
      </div>
      <div class="bg-[#1c2128] border border-emerald-500/30 p-4 rounded-lg">
        <p class="text-xs text-emerald-400 font-bold uppercase mb-2">Ad Preview</p>
        <div class="font-bold">${esc(bestAd.hook)}</div>
        <div class="text-sm text-slate-400 mt-1">${esc(bestAd.body)}</div>
      </div>
    </div>
    <div class="mt-6 flex flex-col gap-3">
      <button id="w-create" class="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20">Launch Campaign (Paused)</button>
      <button id="w-back" class="w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-lg text-slate-400">Go Back</button>
    </div>`;
}

export function bindStep7(el, state, { render, prevStep, api }) {
  el.querySelector('#w-back').addEventListener('click', prevStep);
  el.querySelector('#w-create').addEventListener('click', async () => {
    const btn = el.querySelector('#w-create');
    btn.disabled = true; btn.textContent = 'Launching...';
    try {
      await api.post('/campaigns/create', {
        accountId: state.selectedAccount,
        pageId: state.selectedPage,
        product: state.product,
        target: state.target,
        keunggulan: state.keunggulan,
        objective: state.objective,
        targeting: state.targeting,
        dailyBudget: state.dailyBudget,
        landingUrl: state.landingUrl
      });
      alert('Successfully launched!'); window.location.hash = '#/';
    } catch (e) {
      alert('Error: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Launch Campaign (Paused)';
    }
  });
}