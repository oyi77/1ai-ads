import { esc } from '../../lib/escape.js';

export function renderStep5(state) {
  return `
    <h2 class="text-lg font-semibold mb-3">Daily Budget</h2>
    <div class="space-y-4">
      <input id="w-budget" type="number" value="${state.dailyBudget}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 text-lg font-bold">
      <p class="text-slate-500 text-sm">Recommended: Rp 50.000 - 200.000 / day</p>
    </div>
    <div class="flex gap-3 mt-6">
      <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
      <button id="w-next" class="flex-1 bg-sky-500 hover:bg-sky-600 py-3 rounded-lg font-bold text-lg">Generate AI Creative →</button>
    </div>
  `;
}

export function bindStep5(el, state, { render, prevStep, nextStep }) {
  el.querySelector('#w-back').addEventListener('click', prevStep);
  el.querySelector('#w-next').addEventListener('click', () => {
    state.dailyBudget = parseInt(el.querySelector('#w-budget').value) || 20000;
    nextStep();
  });
}