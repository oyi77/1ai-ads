import { esc } from '../../lib/escape.js';

export function renderStep4(state) {
  const ageMin = state.targeting?.age_min || 25;
  const ageMax = state.targeting?.age_max || 55;
  return `
    <h2 class="text-lg font-semibold mb-3">Targeting</h2>
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm text-slate-400 mb-1">Min Age</label><input id="w-age-min" type="number" value="${ageMin}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"></div>
        <div><label class="block text-sm text-slate-400 mb-1">Max Age</label><input id="w-age-max" type="number" value="${ageMax}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"></div>
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Interests</label>
        <div class="flex gap-2">
          <input id="w-interest-search" type="text" class="flex-1 p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="Search...">
          <button id="w-interest-btn" class="bg-purple-500 px-4 py-3 rounded-lg font-bold">Search</button>
        </div>
        <div id="w-interest-results" class="mt-2 flex flex-wrap gap-1"></div>
        <div id="w-interest-selected" class="flex flex-wrap gap-2 mt-2">
          ${state.interests.map(i => `<span class="bg-sky-900 text-sky-200 px-2 py-1 rounded text-sm">${esc(i.name)} <button data-remove="${esc(i.id)}" class="ml-1 text-red-400">×</button></span>`).join('')}
        </div>
      </div>
    </div>
    <div class="flex gap-3 mt-4">
      <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
      <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold">Next →</button>
    </div>
  `;
}

export function bindStep4(el, state, { render, prevStep, nextStep, api }) {
  const updateTargetingState = () => {
    state.targeting = {
      ...state.targeting,
      age_min: parseInt(el.querySelector('#w-age-min').value) || 25,
      age_max: parseInt(el.querySelector('#w-age-max').value) || 55,
    };
  };

  el.querySelector('#w-interest-btn').addEventListener('click', async () => {
    updateTargetingState();
    const q = el.querySelector('#w-interest-search').value.trim();
    if (!q) return;
    const resDiv = el.querySelector('#w-interest-results');
    resDiv.innerHTML = '<span class="text-xs text-slate-500">Searching...</span>';
    try {
      const { data } = await api.get(`/campaigns/targeting/search?q=${encodeURIComponent(q)}`);
      resDiv.innerHTML = data.map(t => `<button data-add-interest='${JSON.stringify({id: t.id, name: t.name})}' class="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-xs">${esc(t.name)}</button>`).join('') || 'None';
      resDiv.querySelectorAll('[data-add-interest]').forEach(btn => btn.addEventListener('click', () => {
         state.interests.push(JSON.parse(btn.dataset.addInterest)); render();
      }));
    } catch (e) { resDiv.innerHTML = esc(e.message); }
  });

  el.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
    updateTargetingState();
    state.interests = state.interests.filter(i => i.id !== btn.dataset.remove); render();
  }));

  el.querySelector('#w-back').addEventListener('click', () => { updateTargetingState(); prevStep(); });
  el.querySelector('#w-next').addEventListener('click', () => {
    updateTargetingState();
    if (state.interests.length > 0) {
      state.targeting.flexible_spec = [{ interests: state.interests.map(i => ({ id: i.id, name: i.name })) }];
    } else {
      delete state.targeting.flexible_spec;
    }
    state.targeting.geo_locations = { countries: ['ID'] };
    nextStep();
  });
}