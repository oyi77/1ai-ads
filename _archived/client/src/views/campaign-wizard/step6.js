import { esc } from '../../lib/escape.js';

export function renderStep6(state) {
  return `
    <h2 class="text-lg font-semibold mb-3">AI Creative</h2>
    <div id="w-kb-inspiration" class="mb-4"></div>
    <div id="w-creative-loading" class="${state.aiResult ? 'hidden' : ''} p-8 text-center text-slate-400">
      <div class="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p>Generating creative variations...</p>
    </div>
    <div id="w-creative-result" class="${state.aiResult ? '' : 'hidden'}"></div>
    <div class="flex gap-3 mt-4">
      <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
      <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold ${state.aiResult ? '' : 'hidden'}">Review & Confirm →</button>
    </div>
  `;
}

export function bindStep6(el, state, { render, prevStep, nextStep, api }) {
  if (state.aiResult) {
    const data = state.aiResult;
    const resDiv = el.querySelector('#w-creative-result');
    resDiv.innerHTML = `
      <div class="bg-slate-800 p-4 rounded-lg border-2 border-sky-500/50">
        <div class="text-xs text-sky-400 font-bold uppercase mb-2">Best Variation</div>
        <div class="font-bold text-xl">${esc(data.copies[0].hook)}</div>
        <div class="text-slate-300 mt-3 leading-relaxed">${esc(data.copies[0].body)}</div>
        <div class="mt-4 text-sky-400 font-bold underline">${esc(data.copies[0].cta)}</div>
      </div>
    `;
  }

  api.get(`/learning/inspire/creative?product=${encodeURIComponent(state.product)}&target=${encodeURIComponent(state.target)}`).then(({data}) => {
    const kbDiv = el.querySelector('#w-kb-inspiration');
    if (data && data.length > 0) {
      kbDiv.innerHTML = `
        <div class="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-4 mb-4">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>
            <span class="text-sm font-bold text-emerald-400">Past Campaign Insights (${data.length} found)</span>
          </div>
          <div class="space-y-2">
            ${data.slice(0, 3).map(r => `
              <div class="bg-slate-800/50 p-2 rounded text-xs">
                <div class="font-medium text-slate-300">${esc(r.title)}</div>
                <div class="text-slate-500 mt-1">${esc(r.snippet)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }).catch(() => {});

  if (!state.aiResult) {
    api.post('/campaigns/creative', { product: state.product, target: state.target, keunggulan: state.keunggulan }).then(({data}) => {
      state.aiResult = data;
      const resDiv = el.querySelector('#w-creative-result');
      resDiv.innerHTML = `
        <div class="bg-slate-800 p-4 rounded-lg border-2 border-sky-500/50">
          <div class="text-xs text-sky-400 font-bold uppercase mb-2">Best Variation</div>
          <div class="font-bold text-xl">${esc(data.copies[0].hook)}</div>
          <div class="text-slate-300 mt-3 leading-relaxed">${esc(data.copies[0].body)}</div>
          <div class="mt-4 text-sky-400 font-bold underline">${esc(data.copies[0].cta)}</div>
        </div>
      `;
      resDiv.classList.remove('hidden');
      el.querySelector('#w-creative-loading').classList.add('hidden');
      el.querySelector('#w-next').classList.remove('hidden');
      render();
    }).catch(e => {
      el.querySelector('#w-creative-loading').innerHTML = `<p class="text-red-400">Generation failed: ${esc(e.message)}</p>`;
    });
  }

  el.querySelector('#w-back').addEventListener('click', prevStep);
  el.querySelector('#w-next').addEventListener('click', nextStep);
}