import { esc } from '../../lib/escape.js';

export function renderStep3(state) {
  return `
    <h2 class="text-lg font-semibold mb-3">Product Details</h2>
    <div class="space-y-4">
      <div><label class="block text-sm text-slate-400 mb-1">Product Name</label><input id="w-product" type="text" value="${esc(state.product)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Skin Care Kit"></div>
      <div><label class="block text-sm text-slate-400 mb-1">Target Audience</label><input id="w-target" type="text" value="${esc(state.target)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Women 25-40"></div>
      <div><label class="block text-sm text-slate-400 mb-1">Key Benefits</label><textarea id="w-keunggulan" rows="3" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Organic, cheap, fast">${esc(state.keunggulan)}</textarea></div>
    </div>
    <div class="flex gap-3 mt-4">
      <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
      <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold">Next →</button>
    </div>
  `;
}

export function bindStep3(el, state, { render, prevStep, nextStep }) {
  el.querySelector('#w-back').addEventListener('click', prevStep);
  el.querySelector('#w-next').addEventListener('click', () => {
    state.product = el.querySelector('#w-product').value;
    state.target = el.querySelector('#w-target').value;
    state.keunggulan = el.querySelector('#w-keunggulan').value;
    if (!state.product) return alert('Product name is required');
    nextStep();
  });
}