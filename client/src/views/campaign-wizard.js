import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export function renderCampaignWizard(el) {
  let step = 1;
  let state = { accounts: [], pages: [], selectedAccount: null, selectedPage: null, objective: 'OUTCOME_TRAFFIC', targeting: null, dailyBudget: 20000, product: '', target: '', keunggulan: '', landingUrl: '', aiResult: null, interests: [] };

  async function loadAccounts() {
    try {
      const { data } = await api.get('/meta/accounts');
      state.accounts = data.filter(a => a.status === 'active');
    } catch (e) { state.accounts = []; }
    try {
      const { data } = await api.get('/campaigns/pages');
      state.pages = data;
    } catch { state.pages = []; }
  }

  function render() {
    const steps = ['Account', 'Objective', 'Product', 'Targeting', 'Budget', 'AI Creative', 'Review'];
    const progress = steps.map((s, i) => `<span class="px-2 py-1 rounded text-xs ${i + 1 === step ? 'bg-sky-500 text-white' : i + 1 < step ? 'bg-emerald-700 text-emerald-200' : 'bg-slate-700 text-slate-400'}">${i + 1}. ${s}</span>`).join('');

    el.innerHTML = `
      <div class="p-4 sm:p-8 max-w-2xl">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4">Create Campaign</h1>
        <div class="flex flex-wrap gap-2 mb-6">${progress}</div>
        <div id="wizard-step"></div>
      </div>`;

    const container = el.querySelector('#wizard-step');
    if (step === 1) renderStep1(container);
    else if (step === 2) renderStep2(container);
    else if (step === 3) renderStep3(container);
    else if (step === 4) renderStep4(container);
    else if (step === 5) renderStep5(container);
    else if (step === 6) renderStep6(container);
    else if (step === 7) renderStep7(container);
  }

  function renderStep1(c) {
    if (state.accounts.length === 0) {
      c.innerHTML = '<p class="text-slate-400">Loading accounts...</p>';
      loadAccounts().then(() => renderStep1(c));
      return;
    }
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Select Ad Account & Page</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-400 mb-1">Ad Account</label>
          <select id="w-account" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
            <option value="">Select account...</option>
            ${state.accounts.map(a => `<option value="${esc(a.id)}" ${state.selectedAccount === a.id ? 'selected' : ''}>${esc(a.name)} (${esc(a.id)})</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Facebook Page (for ad creative)</label>
          <select id="w-page" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
            <option value="">Select page...</option>
            ${state.pages.map(p => `<option value="${esc(p.id)}" ${state.selectedPage === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px]">Next →</button>
      </div>`;
    c.querySelector('#w-next').addEventListener('click', () => {
      state.selectedAccount = c.querySelector('#w-account').value;
      state.selectedPage = c.querySelector('#w-page').value;
      if (!state.selectedAccount) return alert('Select an ad account');
      step = 2; render();
    });
  }

  function renderStep2(c) {
    const objectives = [
      { value: 'OUTCOME_TRAFFIC', label: 'Traffic', desc: 'Drive visitors to your website/landing page' },
      { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement', desc: 'Get likes, comments, shares on your posts' },
      { value: 'OUTCOME_SALES', label: 'Sales/Conversions', desc: 'Drive purchases and sign-ups' },
      { value: 'OUTCOME_LEADS', label: 'Leads', desc: 'Collect contact information from prospects' },
      { value: 'OUTCOME_AWARENESS', label: 'Awareness', desc: 'Reach the maximum number of people' },
    ];
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Campaign Objective</h2>
      <div class="space-y-3">
        ${objectives.map(o => `
          <label class="block bg-slate-800 p-4 rounded-lg cursor-pointer border-2 ${state.objective === o.value ? 'border-sky-500' : 'border-transparent'} hover:border-slate-600">
            <input type="radio" name="objective" value="${o.value}" ${state.objective === o.value ? 'checked' : ''} class="mr-2">
            <span class="font-medium">${o.label}</span>
            <span class="text-slate-400 text-sm block mt-1">${o.desc}</span>
          </label>
        `).join('')}
      </div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg min-h-[44px]">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px]">Next →</button>
      </div>`;
    c.querySelectorAll('input[name="objective"]').forEach(r => r.addEventListener('change', () => { state.objective = r.value; render(); }));
    c.querySelector('#w-back').addEventListener('click', () => { step = 1; render(); });
    c.querySelector('#w-next').addEventListener('click', () => { step = 3; render(); });
  }

  function renderStep3(c) {
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Product Details</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-400 mb-1">Product Name</label>
          <input id="w-product" type="text" value="${esc(state.product)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" placeholder="e.g. Kursus Digital Marketing">
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Target Audience</label>
          <input id="w-target" type="text" value="${esc(state.target)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" placeholder="e.g. Pemilik UMKM usia 25-45">
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Key Selling Points (Keunggulan)</label>
          <textarea id="w-keunggulan" rows="3" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700" placeholder="e.g. Materi praktis, mentor berpengalaman, garansi 30 hari">${esc(state.keunggulan)}</textarea>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Landing Page URL (optional)</label>
          <input id="w-landing" type="url" value="${esc(state.landingUrl)}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" placeholder="https://...">
        </div>
      </div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg min-h-[44px]">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px]">Next →</button>
      </div>`;
    c.querySelector('#w-back').addEventListener('click', () => { step = 2; render(); });
    c.querySelector('#w-next').addEventListener('click', () => {
      state.product = c.querySelector('#w-product').value;
      state.target = c.querySelector('#w-target').value;
      state.keunggulan = c.querySelector('#w-keunggulan').value;
      state.landingUrl = c.querySelector('#w-landing').value;
      if (!state.product) return alert('Product name is required');
      step = 4; render();
    });
  }

  function renderStep4(c) {
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Targeting</h2>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Min Age</label>
            <input id="w-age-min" type="number" value="25" min="18" max="65" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Max Age</label>
            <input id="w-age-max" type="number" value="55" min="18" max="65" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
          </div>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Interests (search & add)</label>
          <div class="flex gap-2">
            <input id="w-interest-search" type="text" class="flex-1 p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" placeholder="Search interests...">
            <button id="w-interest-btn" class="bg-purple-500 hover:bg-purple-600 px-4 py-3 rounded-lg min-h-[44px]">Search</button>
          </div>
          <div id="w-interest-results" class="mt-2"></div>
          <div id="w-interest-selected" class="flex flex-wrap gap-2 mt-2">
            ${state.interests.map(i => `<span class="bg-sky-900 text-sky-200 px-2 py-1 rounded text-sm">${esc(i.name)} <button data-remove="${esc(i.id)}" class="ml-1 text-red-400">×</button></span>`).join('')}
          </div>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Or let AI suggest targeting</label>
          <button id="w-ai-target" class="bg-purple-500 hover:bg-purple-600 px-4 py-3 rounded-lg min-h-[44px] text-sm">AI Suggest Targeting</button>
          <div id="w-ai-target-result" class="mt-2"></div>
        </div>
      </div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg min-h-[44px]">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px]">Next →</button>
      </div>`;

    // Interest search
    c.querySelector('#w-interest-btn').addEventListener('click', async () => {
      const q = c.querySelector('#w-interest-search').value.trim();
      if (!q) return;
      const resultsDiv = c.querySelector('#w-interest-results');
      resultsDiv.innerHTML = '<span class="text-slate-400 text-sm">Searching...</span>';
      try {
        const { data } = await api.get(`/campaigns/targeting/search?q=${encodeURIComponent(q)}`);
        resultsDiv.innerHTML = data.map(t => `<button data-add-interest='${JSON.stringify({ id: t.id, name: t.name })}' class="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-sm mr-1 mb-1">${esc(t.name)} (${(t.audienceSize || 0).toLocaleString()})</button>`).join('') || '<span class="text-slate-500 text-sm">No results</span>';
        resultsDiv.querySelectorAll('[data-add-interest]').forEach(btn => {
          btn.addEventListener('click', () => {
            const interest = JSON.parse(btn.dataset.addInterest);
            if (!state.interests.find(i => i.id === interest.id)) { state.interests.push(interest); render(); }
          });
        });
      } catch (e) { resultsDiv.innerHTML = `<span class="text-red-400 text-sm">${esc(e.message)}</span>`; }
    });

    // AI targeting
    c.querySelector('#w-ai-target').addEventListener('click', async () => {
      const btn = c.querySelector('#w-ai-target');
      btn.disabled = true; btn.textContent = 'AI Thinking...';
      try {
        const { data } = await api.post('/campaigns/creative', { product: state.product, target: state.target, keunggulan: state.keunggulan });
        const suggestions = data.targetingSuggestions;
        if (suggestions?.interests) {
          for (const i of suggestions.interests) { if (!state.interests.find(x => x.name === i.name)) state.interests.push({ id: i.name, name: i.name }); }
        }
        render();
      } catch (e) { c.querySelector('#w-ai-target-result').innerHTML = `<span class="text-red-400 text-sm">${esc(e.message)}</span>`; }
      btn.disabled = false; btn.textContent = 'AI Suggest Targeting';
    });

    // Remove interests
    c.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => { state.interests = state.interests.filter(i => i.id !== btn.dataset.remove); render(); });
    });

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
        <div>
          <label class="block text-sm text-slate-400 mb-1">Daily Budget (IDR)</label>
          <input id="w-budget" type="number" value="${state.dailyBudget}" min="10000" step="5000" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
          <p class="text-slate-500 text-xs mt-1">Minimum Rp 10.000/day. Recommended: Rp 20.000-100.000/day for testing.</p>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <p class="text-slate-400 text-sm">Estimated daily reach: ${((state.dailyBudget / 100) * 15).toLocaleString()} - ${((state.dailyBudget / 100) * 40).toLocaleString()} people</p>
        </div>
      </div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg min-h-[44px]">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px]">Generate AI Creative →</button>
      </div>`;
    c.querySelector('#w-back').addEventListener('click', () => { step = 4; render(); });
    c.querySelector('#w-next').addEventListener('click', () => {
      state.dailyBudget = parseInt(c.querySelector('#w-budget').value) || 20000;
      step = 6; render();
    });
  }

  function renderStep6(c) {
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">AI Creative Preview</h2>
      <div id="w-creative-loading" class="text-slate-400">Generating ad creative with AI...</div>
      <div id="w-creative-result" class="hidden"></div>
      <div class="flex gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg min-h-[44px]">← Back</button>
        <button id="w-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg min-h-[44px] hidden">Review & Create →</button>
        <button id="w-regen" class="bg-purple-500 hover:bg-purple-600 px-4 py-3 rounded-lg min-h-[44px] hidden">Regenerate</button>
      </div>`;

    generateCreative(c);

    c.querySelector('#w-back').addEventListener('click', () => { step = 5; render(); });
    c.querySelector('#w-next').addEventListener('click', () => { step = 7; render(); });
    c.querySelector('#w-regen').addEventListener('click', () => generateCreative(c));
  }

  async function generateCreative(c) {
    c.querySelector('#w-creative-loading').classList.remove('hidden');
    c.querySelector('#w-creative-result').classList.add('hidden');
    c.querySelector('#w-next').classList.add('hidden');
    c.querySelector('#w-regen').classList.add('hidden');

    try {
      const { data } = await api.post('/campaigns/creative', { product: state.product, target: state.target, keunggulan: state.keunggulan });
      state.aiResult = data;
      const resultDiv = c.querySelector('#w-creative-result');
      resultDiv.innerHTML = `
        <div class="space-y-4">
          <h3 class="font-semibold text-sky-400">Ad Copy Variations</h3>
          ${(data.copies || []).map((ad, i) => `
            <div class="bg-slate-800 p-4 rounded-lg ${i === 0 ? 'border-2 border-sky-500' : ''}">
              <div class="text-xs text-slate-500 mb-1">${esc(ad.model_name || `Model ${ad.model}`)} ${i === 0 ? '<span class="text-sky-400">(will be used)</span>' : ''}</div>
              <div class="font-bold text-lg">${esc(ad.hook)}</div>
              <div class="text-slate-300 mt-1">${esc(ad.body)}</div>
              <div class="text-sky-400 mt-1 text-sm">${esc(ad.cta)}</div>
            </div>
          `).join('')}
          ${data.imageDirections?.length > 0 ? `
            <h3 class="font-semibold text-purple-400 mt-4">Image Direction</h3>
            ${data.imageDirections.map(img => `
              <div class="bg-slate-800 p-4 rounded-lg">
                <p class="text-slate-300">${esc(img.description)}</p>
                <p class="text-slate-500 text-sm mt-1">Layout: ${esc(img.layout)} | Mood: ${esc(img.mood)} | Colors: ${esc(img.colors)}</p>
              </div>
            `).join('')}
          ` : ''}
          ${data.videoScript ? `
            <h3 class="font-semibold text-emerald-400 mt-4">Video Script</h3>
            <div class="bg-slate-800 p-4 rounded-lg space-y-2">
              ${['hook', 'problem', 'solution', 'cta'].map(s => data.videoScript[s] ? `
                <div>
                  <span class="text-xs text-slate-500 uppercase">${s} (${esc(data.videoScript[s].time)})</span>
                  <p class="text-slate-300">${esc(data.videoScript[s].voiceover)}</p>
                  <p class="text-slate-500 text-xs">Visual: ${esc(data.videoScript[s].visual)}</p>
                </div>
              ` : '').join('')}
            </div>
          ` : ''}
        </div>`;
      resultDiv.classList.remove('hidden');
      c.querySelector('#w-creative-loading').classList.add('hidden');
      c.querySelector('#w-next').classList.remove('hidden');
      c.querySelector('#w-regen').classList.remove('hidden');
    } catch (e) {
      c.querySelector('#w-creative-loading').innerHTML = `<div class="text-red-400">Failed: ${esc(e.message)}</div>`;
      c.querySelector('#w-regen').classList.remove('hidden');
    }
  }

  function renderStep7(c) {
    const bestAd = state.aiResult?.copies?.[0] || {};
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-3">Review & Create</h2>
      <div class="space-y-3">
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400 text-sm">Account</div>
          <div class="font-medium">${esc(state.accounts.find(a => a.id === state.selectedAccount)?.name || state.selectedAccount)}</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400 text-sm">Objective</div>
          <div class="font-medium">${esc(state.objective)}</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400 text-sm">Product</div>
          <div class="font-medium">${esc(state.product)}</div>
          <div class="text-slate-500 text-sm">${esc(state.target)} | ${esc(state.keunggulan)}</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400 text-sm">Daily Budget</div>
          <div class="font-medium">Rp ${state.dailyBudget.toLocaleString()}</div>
        </div>
        <div class="bg-slate-800 p-4 rounded-lg">
          <div class="text-slate-400 text-sm">Ad Creative (Best)</div>
          <div class="font-bold">${esc(bestAd.hook)}</div>
          <div class="text-slate-300 text-sm">${esc(bestAd.body)}</div>
          <div class="text-sky-400 text-sm">${esc(bestAd.cta)}</div>
        </div>
        <div class="bg-yellow-900 border border-yellow-700 p-3 rounded-lg text-sm">
          Campaign will be created as <strong>PAUSED</strong>. You can activate it after review.
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mt-4">
        <button id="w-back" class="bg-slate-700 hover:bg-slate-600 px-4 py-3 rounded-lg min-h-[44px]">← Back</button>
        <button id="w-create" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-lg min-h-[44px] font-medium">Create Campaign (Paused)</button>
      </div>
      <div id="w-create-result" class="mt-4"></div>`;

    c.querySelector('#w-back').addEventListener('click', () => { step = 6; render(); });
    c.querySelector('#w-create').addEventListener('click', async () => {
      const btn = c.querySelector('#w-create');
      btn.disabled = true; btn.textContent = 'Creating campaign...';
      const resultDiv = c.querySelector('#w-create-result');

      try {
        const { data } = await api.post('/campaigns/create', {
          accountId: state.selectedAccount,
          pageId: state.selectedPage,
          product: state.product,
          target: state.target,
          keunggulan: state.keunggulan,
          objective: state.objective,
          targeting: state.targeting,
          dailyBudget: state.dailyBudget,
          landingUrl: state.landingUrl,
        });

        if (data.status === 'created') {
          resultDiv.innerHTML = `
            <div class="bg-emerald-900 border border-emerald-700 p-4 rounded-lg">
              <p class="font-bold text-lg">Campaign Created!</p>
              <p class="text-sm mt-1">Campaign ID: ${esc(data.campaignId)}</p>
              <p class="text-sm">Status: PAUSED (activate when ready)</p>
              <div class="flex gap-2 mt-3">
                <button id="w-activate" class="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg min-h-[44px]">Activate Now</button>
                <a href="#/" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg min-h-[44px] flex items-center">Back to Dashboard</a>
              </div>
            </div>`;
          resultDiv.querySelector('#w-activate')?.addEventListener('click', async () => {
            try {
              await api.post(`/campaigns/${data.campaignId}/activate`);
              resultDiv.querySelector('#w-activate').textContent = 'Activated!';
              resultDiv.querySelector('#w-activate').disabled = true;
            } catch (e) { alert(e.message); }
          });
        } else {
          resultDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg"><p class="font-bold">Failed</p><p class="text-sm">${esc(data.error)}</p><pre class="text-xs mt-2 text-slate-400">${esc(JSON.stringify(data.steps, null, 2))}</pre></div>`;
        }
      } catch (e) {
        resultDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg">${esc(e.message)}</div>`;
      }
      btn.disabled = false; btn.textContent = 'Create Campaign (Paused)';
    });
  }

  render();
}
