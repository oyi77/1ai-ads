import { esc } from '../../lib/escape.js';

export function renderStep2(state) {
  const objectives = [
    { value: 'OUTCOME_TRAFFIC', label: 'Traffic', desc: 'Drive visitors to your website/landing page' },
    { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement', desc: 'Get likes, comments, shares' },
    { value: 'OUTCOME_SALES', label: 'Sales/Conversions', desc: 'Drive purchases and sign-ups' },
    { value: 'OUTCOME_LEADS', label: 'Leads', desc: 'Collect contact information' },
  ];
  return `
    <h2 class="text-lg font-semibold mb-3">Campaign Objective</h2>
    <div class="space-y-3">
      ${objectives.map(o => `
        <label class="block bg-slate-800 p-4 rounded-lg cursor-pointer border-2 ${state.objective === o.value ? 'border-sky-500' : 'border-transparent'} hover:border-slate-600">
          <input type="radio" name="objective" value="${o.value}" ${state.objective === o.value ? 'checked' : ''} class="mr-2">
          <span class="font-medium">${o.label}</span>
          <span class="text-slate-400 text-sm block mt-1">${o.desc}</span>
        </label>`).join('')}
    </div>
    <div class="flex gap-3 mt-4">
      <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
      <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold">Next →</button>
    </div>
  `;
}

export function bindStep2(el, state, { render, prevStep, nextStep }) {
  el.querySelectorAll('input[name="objective"]').forEach(r => r.addEventListener('change', () => { state.objective = r.value; render(); }));
  el.querySelector('#w-back').addEventListener('click', prevStep);
  el.querySelector('#w-next').addEventListener('click', nextStep);
}