import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

// Step Modules
import { renderStep1, bindStep1 } from './campaign-wizard/step1.js';
import { renderStep2, bindStep2 } from './campaign-wizard/step2.js';
import { renderStep3, bindStep3 } from './campaign-wizard/step3.js';
import { renderStep4, bindStep4 } from './campaign-wizard/step4.js';
import { renderStep5, bindStep5 } from './campaign-wizard/step5.js';
import { renderStep6, bindStep6 } from './campaign-wizard/step6.js';
import { renderStep7, bindStep7 } from './campaign-wizard/step7.js';

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
    const progress = steps.map((s, i) => `
      <span class="px-2 py-1 rounded text-xs ${i + 1 === step ? 'bg-sky-500 text-white' : i + 1 < step ? 'bg-emerald-700 text-emerald-200' : 'bg-slate-700 text-slate-400'}">${i + 1}. ${s}</span>
    `).join('');

    el.innerHTML = `
      <div class="p-4 sm:p-8 max-w-2xl">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl sm:text-3xl font-bold">Create Campaign</h1>
          <button id="w-refresh" class="text-xs text-sky-400 hover:underline">Refresh Accounts</button>
        </div>
        <div class="flex gap-2 mb-6 flex-wrap">${progress}</div>
        <div id="w-step-container"></div>
      </div>
    `;

    const c = el.querySelector('#w-step-container');
    switch (step) {
      case 1:
        c.innerHTML = renderStep1(state);
        bindStep1(c, state, { render, nextStep: () => { step = 2; render(); } });
        break;
      case 2:
        c.innerHTML = renderStep2(state);
        bindStep2(c, state, { render, prevStep: () => { step = 1; render(); }, nextStep: () => { step = 3; render(); } });
        break;
      case 3:
        c.innerHTML = renderStep3(state);
        bindStep3(c, state, { render, prevStep: () => { step = 2; render(); }, nextStep: () => { step = 4; render(); } });
        break;
      case 4:
        c.innerHTML = renderStep4(state);
        bindStep4(c, state, { render, prevStep: () => { step = 3; render(); }, nextStep: () => { step = 5; render(); }, api });
        break;
      case 5:
        c.innerHTML = renderStep5(state);
        bindStep5(c, state, { render, prevStep: () => { step = 4; render(); }, nextStep: () => { step = 6; render(); } });
        break;
      case 6:
        c.innerHTML = renderStep6(state);
        bindStep6(c, state, { render, prevStep: () => { step = 5; render(); }, nextStep: () => { step = 7; render(); }, api });
        break;
      case 7:
        c.innerHTML = renderStep7(state);
        bindStep7(c, state, { render, prevStep: () => { step = 6; render(); }, api });
        break;
    }

    el.querySelector('#w-refresh').addEventListener('click', loadData);
  }
}