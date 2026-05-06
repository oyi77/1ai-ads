import { api } from '../lib/api.js';

export function renderCreatorDashboard(el) {
  let state = {
    currentTab: 'targeting',
    product: '',
    target: '',
    keunggulan: '',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 20000,
    landingUrl: '',
    interests: [],
    targeting: {},
    aiResult: null,
    creative: null,
    selectedAccount: null,
    selectedPage: null,
    accounts: [],
    pages: [],
    loading: false
  };

  async function loadAccounts() {
    state.loading = true;
    render();
    try {
      const { data } = await api.get('/meta/accounts');
      state.accounts = Array.isArray(data) ? data.filter(a => a.status === 'active') : [];
    } catch (e) {
      state.accounts = [];
      console.error('Load accounts error:', e);
    }
    try {
      const { data } = await api.get('/campaigns/pages');
      state.pages = Array.isArray(data) ? data : [];
    } catch (e) {
      state.pages = [];
    }
    state.loading = false;
    render();
  }

  async function generateCreative() {
    if (!state.product || !state.target || !state.keunggulan) {
      alert('Please fill in Product, Target Audience, and Key Benefits first');
      return;
    }

    state.creative = null;
    render();

    try {
      const result = await api.post('/campaigns/creative', {
        product: state.product,
        target: state.target,
        keunggulan: state.keunggulan
      });

      if (result.data?.copies && result.data.copies.length > 0) {
        state.creative = result.data.copies[0];
        alert('Creative generated successfully!');
      } else {
        alert('Failed to generate creative: ' + JSON.stringify(result));
      }
    } catch (err) {
      alert('Creative generation error: ' + err.message);
    }
  }

  async function launchCampaign() {
    if (!state.selectedAccount) {
      alert('Please select an ad account first');
      return;
    }
    if (!state.creative) {
      alert('Please generate creative first');
      return;
    }

    const btn = document.querySelector('#launch-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Launching...';

    try {
      const result = await api.post('/campaigns/create', {
        accountId: state.selectedAccount,
        pageId: state.selectedPage || '',
        product: state.product,
        target: state.target,
        keunggulan: state.keunggulan,
        objective: state.objective,
        targeting: state.targeting,
        dailyBudget: state.dailyBudget,
        landingUrl: state.landingUrl
      });

      alert('Campaign launched successfully! ID: ' + result.data?.campaignId);
      window.location.hash = '#/campaigns';
    } catch (err) {
      alert('Campaign launch error: ' + err.message);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function render() {
    const tabs = [
      { id: 'targeting', label: 'Targeting' },
      { id: 'creative', label: 'Creative' },
      { id: 'campaign', label: 'Campaign' },
      { id: 'review', label: 'Review' }
    ];

    const activeTabContent = () => {
      switch (state.currentTab) {
        case 'targeting':
          return renderTargetingTab();
        case 'creative':
          return renderCreativeTab();
        case 'campaign':
          return renderCampaignTab();
        case 'review':
          return renderReviewTab();
        default:
          return renderTargetingTab();
      }
    };

    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl sm:text-3xl font-bold">Creator Dashboard</h1>
          <button id="refresh-accounts" class="text-sm text-sky-400 hover:text-sky-300 underline">Refresh Accounts</button>
        </div>

        <!-- Progress Tabs -->
        <div class="flex flex-wrap gap-2 mb-6">
          ${tabs.map((t, i) => `
            <button data-tab="${t.id}"
                    class="px-4 py-2 rounded-lg ${state.currentTab === t.id
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">
              ${i + 1}. ${t.label}
            </button>
          `).join('')}
        </div>

        <!-- Tab Content -->
        <div class="bg-slate-900/50 rounded-xl border border-slate-700 p-6 min-h-[400px]">
          ${activeTabContent()}
        </div>
      </div>
    `;

    // Tab switcher
    el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentTab = btn.dataset.tab;
        render();
      });
    });

    // Refresh accounts button
    el.querySelector('#refresh-accounts')?.addEventListener('click', loadAccounts);
  }

  function renderTargetingTab() {
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm text-slate-400 mb-2">Ad Account</label>
          <select id="tb-account"
                  class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 ${!state.accounts.length ? 'text-red-400' : ''}">
            <option value="">Select ad account...</option>
            ${state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.id})</option>`).join('')}
          </select>
          ${!state.accounts.length
            ? '<p class="text-red-400 text-sm mt-1">No active accounts found. Connect Meta in Settings first.</p>'
            : ''}
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Facebook Page</label>
          <select id="tb-page" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700">
            <option value="">Select page...</option>
            ${state.pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Campaign Objective</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="bg-slate-800 p-4 rounded-lg cursor-pointer border-2 ${state.objective === 'OUTCOME_TRAFFIC' ? 'border-sky-500 bg-sky-900/20' : 'border-transparent'}">
              <input type="radio" name="objective" value="OUTCOME_TRAFFIC"
                     ${state.objective === 'OUTCOME_TRAFFIC' ? 'checked' : ''}
                     class="mr-2">
              <span class="font-medium">Traffic</span>
              <span class="text-slate-400 text-sm block mt-1">Drive visitors to website</span>
            </label>
            <label class="bg-slate-800 p-4 rounded-lg cursor-pointer border-2 ${state.objective === 'OUTCOME_ENGAGEMENT' ? 'border-sky-500 bg-sky-900/20' : 'border-transparent'}">
              <input type="radio" name="objective" value="OUTCOME_ENGAGEMENT"
                     ${state.objective === 'OUTCOME_ENGAGEMENT' ? 'checked' : ''}
                     class="mr-2">
              <span class="font-medium">Engagement</span>
              <span class="text-slate-400 text-sm block mt-1">Get likes, comments, shares</span>
            </label>
            <label class="bg-slate-800 p-4 rounded-lg cursor-pointer border-2 ${state.objective === 'OUTCOME_SALES' ? 'border-sky-500 bg-sky-900/20' : 'border-transparent'}">
              <input type="radio" name="objective" value="OUTCOME_SALES"
                     ${state.objective === 'OUTCOME_SALES' ? 'checked' : ''}
                     class="mr-2">
              <span class="font-medium">Sales</span>
              <span class="text-slate-400 text-sm block mt-1">Drive purchases</span>
            </label>
            <label class="bg-slate-800 p-4 rounded-lg cursor-pointer border-2 ${state.objective === 'OUTCOME_LEADS' ? 'border-sky-500 bg-sky-900/20' : 'border-transparent'}">
              <input type="radio" name="objective" value="OUTCOME_LEADS"
                     ${state.objective === 'OUTCOME_LEADS' ? 'checked' : ''}
                     class="mr-2">
              <span class="font-medium">Leads</span>
              <span class="text-slate-400 text-sm block mt-1">Collect contact info</span>
            </label>
          </div>
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Product Name</label>
          <input type="text" id="tb-product" value="${state.product}"
                 class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"
                 placeholder="e.g. Skin Care Kit">
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Target Audience</label>
          <input type="text" id="tb-target" value="${state.target}"
                 class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"
                 placeholder="e.g. Women 25-40, beauty lovers">
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Key Benefits / USP</label>
          <textarea id="tb-keunggulan" rows="3" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"
                    placeholder="e.g. Organic, cheap, fast delivery">${state.keunggulan}</textarea>
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Daily Budget (IDR)</label>
          <input type="number" id="tb-budget" value="${state.dailyBudget}"
                 class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700">
        </div>

        <button id="tb-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold w-full min-h-[44px]">
          Next Step →
        </button>
      </div>
    `;
  }

  function renderCreativeTab() {
    return `
      <div class="space-y-6">
        <div class="bg-sky-900/30 border border-sky-700/50 p-4 rounded-lg text-sm text-sky-300">
          <p><strong>Tip:</strong> Enter product details in Targeting tab first, then click "Generate Creative" below.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="md:col-span-3">
            <label class="block text-sm text-slate-400 mb-2">Product Name</label>
            <input type="text" id="ct-product" value="${state.product}"
                   class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 mb-3">
          </div>
          <div class="md:col-span-3">
            <label class="block text-sm text-slate-400 mb-2">Target Audience</label>
            <input type="text" id="ct-target" value="${state.target}"
                   class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 mb-3">
          </div>
          <div class="md:col-span-3">
            <label class="block text-sm text-slate-400 mb-2">Key Benefits</label>
            <textarea id="ct-keunggulan" rows="3" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 mb-3">
${state.keunggulan}</textarea>
          </div>
        </div>

        <button id="ct-generate" class="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-bold w-full sm:w-auto min-h-[44px]">
          ✨ Generate AI Creative
        </button>

        ${state.creative ? `
          <div class="bg-emerald-900/30 border border-emerald-700/50 p-6 rounded-xl mt-6">
            <div class="text-xs text-emerald-400 font-bold uppercase mb-2">Generated Creative</div>
            <div class="text-2xl font-bold text-white mb-3">${state.creative.hook || ''}</div>
            <div class="text-slate-300 mb-4 leading-relaxed">${state.creative.body || ''}</div>
            <div class="text-sky-400 font-bold underline">${state.creative.cta || ''}</div>
            <button id="ct-select" class="mt-4 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-sm">
              ✓ Use This Creative
            </button>
          </div>
        ` : '<p id="ct-status" class="text-slate-500">Press "Generate AI Creative" to create your ad copy.</p>'}

        <button id="ct-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold w-full min-h-[44px]">
          Next Step →
        </button>
      </div>
    `;
  }

  function renderCampaignTab() {
    return `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm text-slate-400 mb-2">Landing Page URL</label>
            <input type="url" id="cp-url" value="${state.landingUrl}"
                   class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700"
                   placeholder="https://your-landing-page.com">
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-2">Daily Budget (IDR)</label>
            <input type="number" id="cp-budget" value="${state.dailyBudget}"
                   class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700">
          </div>
        </div>

        <div>
          <label class="block text-sm text-slate-400 mb-2">Ad Preview</label>
          <div class="bg-slate-800 p-4 rounded-lg text-sm">
            <div class="font-bold text-white mb-1">${state.creative?.hook || 'Add your hook here...'}</div>
            <div class="text-slate-300 mb-2">${state.creative?.body || 'Add your ad copy...'}</div>
            <div class="text-sky-400">${state.creative?.cta || 'Learn More'}</div>
          </div>
        </div>

        <button id="cp-next" class="bg-sky-500 hover:bg-sky-600 px-6 py-3 rounded-lg font-bold w-full min-h-[44px]">
          Next Step →
        </button>
      </div>
    `;
  }

  function renderReviewTab() {
    const bestCreative = state.creative || { hook: 'Hook', body: 'Body text', cta: 'CTA' };
    return `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div class="text-xs text-slate-500 uppercase font-bold mb-1">Product</div>
            <div class="text-lg font-medium text-white">${state.product || 'Not set'}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div class="text-xs text-slate-500 uppercase font-bold mb-1">Account</div>
            <div class="text-lg font-medium text-white">
              ${state.accounts.find(a => a.id === state.selectedAccount)?.name || 'Not selected'}
            </div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div class="text-xs text-slate-500 uppercase font-bold mb-1">Budget</div>
            <div class="text-lg font-medium text-white">Rp ${state.dailyBudget.toLocaleString()} / day</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div class="text-xs text-slate-500 uppercase font-bold mb-1">Objective</div>
            <div class="text-lg font-medium text-white">${state.objective.replace('OUTCOME_', '')}</div>
          </div>
        </div>

        <div class="bg-slate-900 p-6 rounded-lg border border-slate-700">
          <div class="text-xs text-slate-500 uppercase font-bold mb-2">Ad Preview</div>
          <div class="font-bold text-xl text-white mb-2">${bestCreative.hook || ''}</div>
          <div class="text-slate-300 mb-3">${bestCreative.body || ''}</div>
          <div class="text-sky-400 font-bold underline">${bestCreative.cta || ''}</div>
        </div>

        <button id="cp-launch" class="bg-emerald-600 hover:bg-emerald-500 px-8 py-4 rounded-xl font-bold text-lg w-full min-h-[48px]">
          🚀 Launch Campaign
        </button>
      </div>
    `;
  }

  // Initialize
  loadAccounts();

  // Event listeners
  setTimeout(() => {
    // Tab navigation
    el.querySelectorAll('#tb-next, #ct-next, #cp-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabs = ['targeting', 'creative', 'campaign', 'review'];
        const currentIdx = tabs.indexOf(state.currentTab);
        const nextIdx = Math.min(currentIdx + 1, tabs.length - 1);
        state.currentTab = tabs[nextIdx];
        render();
      });
    });

    // Targeting tab inputs
    el.querySelector('#tb-account')?.addEventListener('change', (e) => {
      state.selectedAccount = e.target.value;
    });
    el.querySelector('#tb-page')?.addEventListener('change', (e) => {
      state.selectedPage = e.target.value;
    });
    el.querySelector('#tb-product')?.addEventListener('input', (e) => {
      state.product = e.target.value;
    });
    el.querySelector('#tb-target')?.addEventListener('input', (e) => {
      state.target = e.target.value;
    });
    el.querySelector('#tb-keunggulan')?.addEventListener('input', (e) => {
      state.keunggulan = e.target.value;
    });
    el.querySelector('#tb-budget')?.addEventListener('input', (e) => {
      state.dailyBudget = parseInt(e.target.value) || 20000;
    });
    el.querySelectorAll('input[name="objective"]')?.forEach(r => {
      r.addEventListener('change', (e) => {
        state.objective = e.target.value;
      });
    });

    // Creative tab
    el.querySelector('#ct-generate')?.addEventListener('click', generateCreative);
    el.querySelector('#ct-select')?.addEventListener('click', () => {
      alert('Creative selected! Move to Campaign tab to continue.');
    });
    el.querySelector('#ct-generate')?.addEventListener('click', () => {
      const product = el.querySelector('#ct-product')?.value || state.product;
      const target = el.querySelector('#ct-target')?.value || state.target;
      const keunggulan = el.querySelector('#ct-keunggulan')?.value || state.keunggulan;
      if (product && target && keunggulan) {
        state.product = product;
        state.target = target;
        state.keunggulan = keunggulan;
        generateCreative();
      } else {
        alert('Please fill all fields first');
      }
    });

    // Campaign tab
    el.querySelector('#cp-url')?.addEventListener('input', (e) => {
      state.landingUrl = e.target.value;
    });
    el.querySelector('#cp-budget')?.addEventListener('input', (e) => {
      state.dailyBudget = parseInt(e.target.value) || 20000;
    });

    // Launch
    el.querySelector('#cp-launch')?.addEventListener('click', launchCampaign);
  }, 100);

  render();
}
