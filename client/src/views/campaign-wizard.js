import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export function renderCampaignWizard(el) {
  let step = 1;
  let state = { 
    accounts: [], 
    pages: [], 
    isLoading: true,
    error: null,
    selectedAccount: null, 
    selectedPage: null, 
    objective: 'OUTCOME_TRAFFIC', 
    targeting: null, 
    dailyBudget: 20000, 
    product: '', 
    target: '', 
    keunggulan: '', 
    landingUrl: '', 
    aiResult: null, 
    interests: [] 
  };

  async function loadData() {
    state.isLoading = true;
    state.error = null;
    render();

    try {
      const { data } = await api.get('/meta/accounts');
      state.accounts = data.filter(a => a.status === 'active');
      if (state.accounts.length === 0) {
        state.error = 'No active Meta Ad Accounts found. Your token might be expired or lacks permissions.';
      }
    } catch (e) { 
      state.accounts = []; 
      state.error = e.message;
    }

    try {
      const { data } = await api.get('/campaigns/pages');
      state.pages = data;
    } catch { state.pages = []; }

    state.isLoading = false;
    render();
  }

  loadData();

  function render() {
    const steps = ['Account', 'Objective', 'Product', 'Targeting', 'Budget', 'AI Creative', 'Review'];
    const progress = steps.map((s, i) => `<span class="px-2 py-1 rounded text-xs ${i + 1 === step ? 'bg-sky-500 text-white' : i + 1 < step ? 'bg-emerald-700 text-emerald-200' : 'bg-slate-700 text-slate-400'}">${i + 1}. ${s}</span>`).join('');

    el.innerHTML = `
      <div class="p-4 sm:p-8 max-w-2xl">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl sm:text-3xl font-bold">Create Campaign</h1>
          <button id="w-refresh" class="text-xs text-sky-400 hover:underline">Refresh Accounts</button>
        </div>
        <div class="flex flex-wrap gap-2 mb-6">${progress}</div>
        <div id="wizard-step"></div>
      </div>`;

    el.querySelector('#w-refresh').addEventListener('click', loadData);

    const container = el.querySelector('#wizard-step');
    
    if (state.isLoading) {
      container.innerHTML = '<div class="p-12 text-center text-slate-400"><div class="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div><p>Loading ad accounts...</p></div>';
      return;
    }

    if (state.error && step === 1) {
      container.innerHTML = `
        <div class="bg-red-900/30 border border-red-700/50 p-6 rounded-xl text-center">
          <p class="text-red-300 font-medium mb-4">${esc(state.error)}</p>
          <div class="flex justify-center gap-3">
            <a href="#/settings" class="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all border border-slate-600">Update Token</a>
            <button id="w-retry" class="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all">Retry</button>
          </div>
        </div>`;
      container.querySelector('#w-retry').addEventListener('click', loadData);
      return;
    }

    if (step === 1) renderStep1(container);
    else if (step === 2) renderStep2(container);
    else if (step === 3) renderStep3(container);
    else if (step === 4) renderStep4(container);
    else if (step === 5) renderStep5(container);
    else if (step === 6) renderStep6(container);
    else if (step === 7) renderStep7(container);
  }

  function renderStep1(c) {
    c.innerHTML = `
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
      </div>`;
    
    c.querySelector('#w-next').addEventListener('click', () => {
      state.selectedAccount = c.querySelector('#w-account').value;
      state.selectedPage = c.querySelector('#w-page').value;
      if (!state.selectedAccount) return alert('Please select an ad account');
      step = 2; render();
    });
  }

  function renderStep2(c) {
    const objectives = [
      { value: 'OUTCOME_TRAFFIC', label: 'Traffic', desc: 'Drive visitors to your website/landing page' },
      { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement', desc: 'Get likes, comments, shares' },
      { value: 'OUTCOME_SALES', label: 'Sales/Conversions', desc: 'Drive purchases and sign-ups' },
      { value: 'OUTCOME_LEADS', label: 'Leads', desc: 'Collect contact information' },
    ];
    c.innerHTML = `
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
      </div>`;
    c.querySelectorAll('input[name="objective"]').forEach(r => r.addEventListener('change', () => { state.objective = r.value; render(); }));
    c.querySelector('#w-back').addEventListener('click', () => { step = 1; render(); });
    c.querySelector('#w-next').addEventListener('click', () => { step = 3; render(); });
  }

  function renderStep3(c) {
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Product Details</h2>
      <div class="space-y-4">
        <div><label class="block text-sm text-slate-400 mb-1">Product Name</label><input id="w-product" type="text" value="${esc(state.product)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Skin Care Kit"></div>
        <div><label class="block text-sm text-slate-400 mb-1">Target Audience</label><input id="w-target" type="text" value="${esc(state.target)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Women 25-40"></div>
        <div><label class="block text-sm text-slate-400 mb-1">Key Benefits</label><textarea id="w-keunggulan" rows="3" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Organic, cheap, fast">${esc(state.keunggulan)}</textarea></div>
      </div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold">Next →</button>
      </div>`;
    c.querySelector('#w-back').addEventListener('click', () => { step = 2; render(); });
    c.querySelector('#w-next').addEventListener('click', () => {
      state.product = c.querySelector('#w-product').value;
      state.target = c.querySelector('#w-target').value;
      state.keunggulan = c.querySelector('#w-keunggulan').value;
      if (!state.product) return alert('Product name is required');
      step = 4; render();
    });
  }

  function renderStep4(c) {
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Targeting</h2>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm text-slate-400 mb-1">Min Age</label><input id="w-age-min" type="number" value="25" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"></div>
          <div><label class="block text-sm text-slate-400 mb-1">Max Age</label><input id="w-age-max" type="number" value="55" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"></div>
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
      </div>`;

    c.querySelector('#w-interest-btn').addEventListener('click', async () => {
      const q = c.querySelector('#w-interest-search').value.trim();
      if (!q) return;
      const resDiv = c.querySelector('#w-interest-results');
      resDiv.innerHTML = '<span class="text-xs text-slate-500">Searching...</span>';
      try {
        const { data } = await api.get(`/campaigns/targeting/search?q=${encodeURIComponent(q)}`);
        resDiv.innerHTML = data.map(t => `<button data-add-interest='${JSON.stringify({id: t.id, name: t.name})}' class="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-xs">${esc(t.name)}</button>`).join('') || 'None';
        resDiv.querySelectorAll('[data-add-interest]').forEach(btn => btn.addEventListener('click', () => {
           state.interests.push(JSON.parse(btn.dataset.addInterest)); render();
        }));
      } catch (e) { resDiv.innerHTML = esc(e.message); }
    });

    c.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
      state.interests = state.interests.filter(i => i.id !== btn.dataset.remove); render();
    }));

    c.querySelector('#w-back').addEventListener('click', () => { step = 3; render(); });
    c.querySelector('#w-next').addEventListener('click', () => {
      state.targeting = {
        geo_locations: { countries: ['ID'] },
        age_min: parseInt(c.querySelector('#w-age-min').value) || 25,
        age_max: parseInt(c.querySelector('#w-age-max').value) || 55,
        ...(state.interests.length > 0 && { flexible_spec: [{ interests: state.interests.map(i => ({ id: i.id, name: i.name })) }] }),
      };
      step = 5; render();
    });
  }

  function renderStep5(c) {
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Daily Budget</h2>
      <div class="space-y-4">
        <input id="w-budget" type="number" value="${state.dailyBudget}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 text-lg font-bold">
        <p class="text-slate-500 text-sm">Recommended: Rp 50.000 - 200.000 / day</p>
      </div>
      <div class="flex gap-3 mt-6">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
        <button id="w-next" class="flex-1 bg-sky-500 hover:bg-sky-600 py-3 rounded-lg font-bold text-lg">Generate AI Creative →</button>
      </div>`;
    c.querySelector('#w-back').addEventListener('click', () => { step = 4; render(); });
    c.querySelector('#w-next').addEventListener('click', () => {
      state.dailyBudget = parseInt(c.querySelector('#w-budget').value) || 20000;
      step = 6; render();
    });
  }

  function renderStep6(c) {
    c.innerHTML = `<h2 class="text-lg font-semibold mb-3">AI Creative</h2><div id="w-creative-loading" class="p-8 text-center text-slate-400"><div class="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div><p>Generating creative variations...</p></div><div id="w-creative-result" class="hidden"></div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold hidden">Review & Confirm →</button>
      </div>`;
    
    api.post('/campaigns/creative', { product: state.product, target: state.target, keunggulan: state.keunggulan }).then(({data}) => {
      state.aiResult = data;
      const resDiv = c.querySelector('#w-creative-result');
      resDiv.innerHTML = `<div class="bg-slate-800 p-4 rounded-lg border-2 border-sky-500/50"><div class="text-xs text-sky-400 font-bold uppercase mb-2">Best Variation</div><div class="font-bold text-xl">${esc(data.copies[0].hook)}</div><div class="text-slate-300 mt-3 leading-relaxed">${esc(data.copies[0].body)}</div><div class="mt-4 text-sky-400 font-bold underline">${esc(data.copies[0].cta)}</div></div>`;
      resDiv.classList.remove('hidden');
      c.querySelector('#w-creative-loading').classList.add('hidden');
      c.querySelector('#w-next').classList.remove('hidden');
    }).catch(e => {
      c.querySelector('#w-creative-loading').innerHTML = `<p class="text-red-400">Generation failed: ${esc(e.message)}</p>`;
    });

    c.querySelector('#w-back').addEventListener('click', () => { step = 5; render(); });
    c.querySelector('#w-next').addEventListener('click', () => { step = 7; render(); });
  }

  function renderStep7(c) {
    const bestAd = state.aiResult?.copies?.[0] || {};
    c.innerHTML = `
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
          <div class="font-medium">Rp ${state.dailyBudget.toLocaleString()} / day</div>
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
    
    c.querySelector('#w-back').addEventListener('click', () => { step = 6; render(); });
    c.querySelector('#w-create').addEventListener('click', async () => {
      const btn = c.querySelector('#w-create');
      btn.disabled = true; btn.textContent = 'Launching...';
      try {
        await api.post('/campaigns/create', { accountId: state.selectedAccount, pageId: state.selectedPage, product: state.product, target: state.target, keunggulan: state.keunggulan, objective: state.objective, targeting: state.targeting, dailyBudget: state.dailyBudget, landingUrl: state.landingUrl });
        alert('Successfully launched!'); window.location.hash = '#/';
      } catch (e) { alert('Error: ' + e.message); btn.disabled = false; btn.textContent = 'Launch Campaign (Paused)'; }
    });
  }

  render();
}
