import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderSettings(el) {
  let state = {
    accounts: [],
    activeSection: 'accounts',
    mcpStatus: {},
    platformAccounts: {},
    aiConfig: { url: '', model: '', apiKey: '' },
    availableModels: [],
    testPromptResult: '',
    isTestingConnection: false,
    isFetchingModels: false,
    isTestingPrompt: false,
    isTestingAccount: {},
    planDetails: null,
    integrations: { adspirer: { enabled: false } },
    adspirerStatus: { connected: false, enabled: false },
    aiMode: { autonomy_level: 'off', ai_mode: false, auto_mode: false }
  };

  const loadData = async () => {
    try {
      const results = await Promise.allSettled([
        api.get('/settings/accounts'),
        api.get('/mcp/status'),
        api.get('/settings/ai'),
        api.get('/settings/plan'),
        api.get('/settings/integrations'),
        api.get('/adspirer/status'),
        api.get('/ai-agent/status')
      ]);

      if (results[0].status === 'fulfilled') state.accounts = results[0].value.data;
      if (results[1].status === 'fulfilled') state.mcpStatus = results[1].value.data;
      if (results[2].status === 'fulfilled') state.aiConfig = results[2].value.data;
      if (results[3].status === 'fulfilled') state.planDetails = results[3].value.data;
      if (results[4].status === 'fulfilled') state.integrations = results[4].value.data;
      if (results[5].status === 'fulfilled') state.adspirerStatus = results[5].value.data;
      if (results[6].status === 'fulfilled') state.aiMode = results[6].value.data;

      state.platformAccounts = { meta: [], google: [], tiktok: [], scalev: [], x: [] };
      state.accounts.forEach(acc => {
        if (state.platformAccounts[acc.platform]) {
          state.platformAccounts[acc.platform].push(acc);
        }
      });
    } catch (e) {
      console.error('Failed to load settings data', e);
    }
  };

  await loadData();

  function render() {
    el.innerHTML = `
      <div class="flex flex-col md:flex-row min-h-[calc(100vh-64px)] bg-[#0d1117]">
        <!-- Sidebar -->
        <aside class="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#30363d] bg-[#161b22]">
          <nav class="p-4 space-y-2 flex md:flex-col overflow-x-auto md:overflow-x-visible">
            <button data-section="accounts" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'accounts' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Connected Accounts
            </button>
            <button data-section="security" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'security' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Security & Privacy
            </button>
            <button data-section="ai" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'ai' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              AI Configuration
            </button>
            <button data-section="billing" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'billing' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Subscription
            </button>
            <button data-section="integrations" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'integrations' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Integrations
            </button>
          </nav>
        </aside>

<main class="flex-1 p-4 sm:p-8 overflow-y-auto">
             <div class="max-w-4xl mx-auto">
               <h1 class="text-2xl font-bold mb-6 text-white">Settings</h1>
               ${renderSection()}
             </div>
           </main>
      </div>
    `;

    el.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeSection = btn.dataset.section;
        render();
      });
    });

    if (state.activeSection === 'accounts') attachAccountHandlers();
    if (state.activeSection === 'ai') attachAIHandlers();
    if (state.activeSection === 'billing') attachBillingHandlers();
    if (state.activeSection === 'integrations') attachIntegrationsHandlers();
  }

  function renderSection() {
    switch (state.activeSection) {
      case 'accounts': return renderAccountsSection();
      case 'security': return `<h2 class="text-2xl font-bold mb-6 text-white">Security Settings</h2><div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6"><div class="space-y-4 max-w-sm"><div><label class="block text-sm text-slate-400 mb-1">New Password</label><input type="password" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white"></div><button class="bg-[#21262d] text-[#c9d1d9] border border-[#30363d] px-6 py-2 rounded-lg font-bold">Update Password</button></div></div>`;
      case 'ai': return renderAISection();
      case 'billing': return renderBillingSection();
      case 'integrations': return renderIntegrationsSection();
      default: return '';
    }
  }

  function renderAISection() {
    return `
      <h2 class="text-2xl font-bold mb-6 text-white">AI Configuration</h2>
      <div class="grid gap-6">
        <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <div class="flex items-center justify-between mb-6">
            <span class="text-lg font-bold text-white">AI Provider (OpenAI Compatible)</span>
            <button id="test-connection-btn" ${state.isTestingConnection ? 'disabled' : ''} class="text-xs bg-[#21262d] text-slate-300 border border-[#30363d] px-3 py-1.5 rounded-md">${state.isTestingConnection ? 'Testing...' : 'Test Connection'}</button>
          </div>
          <form id="ai-config-form" class="space-y-4">
            <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">API Endpoint</label><input type="text" name="url" value="${esc(state.aiConfig.url)}" placeholder="http://localhost:20128/v1" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">API Key</label><input type="password" name="apiKey" value="${esc(state.aiConfig.apiKey)}" placeholder="sk-..." class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm"></div>
            <div>
              <div class="flex items-center justify-between mb-1"><label class="block text-xs font-bold text-slate-500 uppercase">Default Model</label><button type="button" id="fetch-models-btn" class="text-[10px] text-sky-400 hover:underline">Fetch Models</button></div>
              <input type="text" name="model" value="${esc(state.aiConfig.model)}" list="model-list" placeholder="gpt-4o" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm">
              <datalist id="model-list">${state.availableModels.map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('')}</datalist>
            </div>
            <button type="submit" class="bg-[#238636] text-white px-6 py-2 rounded-lg font-bold">Save Configuration</button>
          </form>
          <div id="ai-status" class="mt-4"></div>
        </div>
        <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h3 class="text-lg font-bold text-white mb-4">Test Prompt</h3>
          <div class="space-y-4">
            <textarea id="test-user-prompt" rows="3" class="w-full p-2.5 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm" placeholder="Write something..."></textarea>
            <button id="run-test-prompt" ${state.isTestingPrompt ? 'disabled' : ''} class="bg-sky-600 text-white px-6 py-2 rounded-lg font-bold">${state.isTestingPrompt ? 'Running...' : 'Run Test'}</button>
            ${state.testPromptResult ? `<div class="mt-4 p-4 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-slate-300 whitespace-pre-wrap">${esc(state.testPromptResult)}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderAccountsSection() {
    const platforms = [
      { id: 'meta', name: 'Meta Ads', desc: 'Facebook & Instagram Ads' },
      { id: 'google', name: 'Google Ads', desc: 'Search and Display Ads' },
      { id: 'tiktok', name: 'TikTok Ads', desc: 'Short-form video Ads' },
      { id: 'x', name: 'X (Twitter) Ads', desc: 'X Ads Credentials' },
      { id: 'scalev', name: 'Scalev.id', desc: 'E-commerce Checkout' },
    ];

    return `
      <h2 class="text-2xl font-bold text-white mb-6">Connected Accounts</h2>
      <div class="grid gap-6">
        ${platforms.map(p => {
          const accounts = state.platformAccounts[p.id] || [];
          return `
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div class="p-6 border-b border-[#30363d] flex items-center justify-between bg-[#1c2128]">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-[#0d1117] rounded-lg flex items-center justify-center border border-[#30363d] font-bold text-sky-400">${p.name[0]}</div>
                <div><h3 class="font-bold text-white">${p.name}</h3><p class="text-xs text-slate-400">${p.desc}</p></div>
              </div>
              <button data-add-account="${p.id}" class="text-xs bg-[#238636] text-white px-3 py-1.5 rounded-md font-medium">+ Add Account</button>
            </div>
            <div class="p-0">
              ${accounts.length === 0 ? `<div class="p-8 text-center text-slate-500 text-sm">No accounts connected yet.</div>` : `
                <div class="divide-y divide-[#30363d]">
                  ${accounts.map(acc => `
                    <div class="p-4 flex items-center justify-between hover:bg-[#1c2128] group">
                      <div class="flex items-center gap-3">
                        <div class="w-2 h-2 rounded-full ${acc.is_active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}"></div>
                        <div><div class="text-sm font-medium text-slate-200">${esc(acc.account_name)}</div></div>
                        ${acc.is_active ? '<span class="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20">ACTIVE</span>' : ''}
                      </div>
                      <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${!acc.is_active ? `<button data-activate-account="${acc.id}" class="text-[10px] text-sky-400 hover:underline px-2">Set Active</button>` : ''}
                        <button data-test-existing="${acc.id}" data-platform="${p.id}" class="text-[10px] text-purple-400 hover:underline px-2">Test</button>
                        <button data-delete-account="${acc.id}" class="text-[10px] text-red-400 hover:text-red-300 px-2">Delete</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
            <div id="${p.id}-add-form" class="p-6 bg-[#0d1117] border-t border-[#30363d] hidden">
               <h4 class="text-sm font-bold text-white mb-4 text-sky-400">Add New Account</h4>
               <form id="${p.id}-creds-form" data-platform-form="${p.id}" class="space-y-4">
                 <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label><input type="text" name="account_name" required class="w-full p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-sm text-white"></div>
                 ${renderPlatformFields(p.id)}
                 <div class="flex items-center gap-3 pt-2">
                   <button type="submit" class="bg-[#238636] text-white px-4 py-2 rounded-lg text-sm font-bold">Connect</button>
                   <button type="button" data-test-account="${p.id}" class="bg-[#21262d] text-slate-300 border border-[#30363d] px-4 py-2 rounded-lg text-sm font-bold">${state.isTestingAccount[p.id] ? '...' : 'Test Connection'}</button>
                   <button type="button" data-cancel-add="${p.id}" class="text-slate-400 text-sm font-medium">Cancel</button>
                 </div>
               </form>
            </div>
          </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderPlatformFields(p, existing = {}) {
    const common = "w-full p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-sm text-white";
    const label = "block text-xs font-bold text-slate-500 uppercase mb-1";
    if (p === 'meta') return `
      <div>
        <label class="${label}">Access Token</label>
        <input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}" placeholder="Paste your long-lived token here">
      </div>
      <div class="bg-sky-900/20 border border-sky-700/30 rounded-lg p-3">
        <label class="block text-xs font-bold text-sky-400 uppercase mb-2">Or Exchange Short Token for Long-Lived (60 Days)</label>
        <div class="grid grid-cols-2 gap-2 mb-2">
          <input type="text" id="meta-app-id" class="${common}" placeholder="App ID">
          <input type="password" id="meta-app-secret" class="${common}" placeholder="App Secret">
        </div>
        <input type="password" id="meta-short-token" class="${common} mb-2" placeholder="Short-lived token from Graph API Explorer">
        <button type="button" id="meta-exchange-btn" class="w-full bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold py-2 rounded transition-all">Exchange & Save Token</button>
      </div>`;
    if (p === 'google') return `<div class="grid grid-cols-2 gap-4"><div><label class="${label}">Dev Token</label><input type="password" name="developer_token" value="${existing.developer_token || ''}" class="${common}"></div><div><label class="${label}">Cred Path</label><input type="text" name="credentials_path" value="${existing.credentials_path || ''}" class="${common}"></div></div>`;
    if (p === 'tiktok') return `<div><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div>`;
    if (p === 'x') return `<div class="grid grid-cols-2 gap-4"><div class="col-span-2"><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div><div><label class="${label}">API Key</label><input type="text" name="api_key" value="${existing.api_key || ''}" class="${common}"></div><div><label class="${label}">API Secret</label><input type="password" name="api_secret" value="${existing.api_secret || ''}" class="${common}"></div></div>`;
    if (p === 'scalev') return `<div><label class="${label}">API Token</label><input type="password" name="api_token" value="${existing.api_token || ''}" class="${common}"></div>`;
    return '';
  }

  function attachAccountHandlers() {
    el.querySelectorAll('[data-add-account]').forEach(btn => btn.addEventListener('click', () => {
      const p = btn.dataset.addAccount; el.querySelector(`#${p}-add-form`).classList.remove('hidden'); btn.classList.add('hidden');
    }));
    el.querySelectorAll('[data-cancel-add]').forEach(btn => btn.addEventListener('click', () => {
      const p = btn.dataset.cancelAdd; el.querySelector(`#${p}-add-form`).classList.add('hidden'); el.querySelector(`[data-add-account="${p}"]`).classList.remove('hidden');
    }));

    el.querySelectorAll('[data-test-account]').forEach(btn => btn.addEventListener('click', async () => {
      const p = btn.dataset.testAccount; const fd = new FormData(el.querySelector(`form[data-platform-form="${p}"]`));
      const creds = Object.fromEntries(fd); delete creds.account_name;
      state.isTestingAccount[p] = true; render();
      try {
        const res = await api.post('/settings/accounts/test', { platform: p, credentials: creds });
        alert(res.message || 'Success!');
      } catch (err) { alert('Failed: ' + err.message); }
      finally { state.isTestingAccount[p] = false; render(); }
    }));

    el.querySelectorAll('[data-test-existing]').forEach(btn => btn.addEventListener('click', async () => {
       const id = btn.dataset.testExisting; const p = btn.dataset.platform;
       const acc = state.accounts.find(a => a.id === id);
       try {
         const res = await api.post('/settings/accounts/test', { platform: p, credentials: acc.credentials });
         alert(res.message);
       } catch (err) { alert('Token invalid/expired: ' + err.message); }
    }));

    el.querySelectorAll('[data-platform-form]').forEach(form => form.addEventListener('submit', async (e) => {
      e.preventDefault(); const p = form.dataset.platformForm; const fd = new FormData(form);
      const raw = Object.fromEntries(fd); const name = raw.account_name; delete raw.account_name;
      try { await api.post('/settings/accounts', { platform: p, account_name: name, credentials: raw }); await loadData(); render(); }
      catch (err) { alert(err.message); }
    }));

    el.querySelector('#meta-exchange-btn')?.addEventListener('click', async () => {
      const appId = el.querySelector('#meta-app-id')?.value;
      const appSecret = el.querySelector('#meta-app-secret')?.value;
      const shortToken = el.querySelector('#meta-short-token')?.value;
      if (!appId || !appSecret || !shortToken) return alert('All three fields are required');

      const btn = el.querySelector('#meta-exchange-btn');
      btn.disabled = true; btn.textContent = 'Exchanging...';
      try {
        const res = await api.post('/settings/accounts/meta/exchange-token', { appId, appSecret, shortToken });
        alert(res.message);
        if (res.success) {
          await loadData();
          render();
        }
      } catch (err) { alert('Exchange failed: ' + err.message); }
      finally { btn.disabled = false; btn.textContent = 'Exchange & Save Token'; }
    });

    el.querySelectorAll('[data-activate-account]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.activateAccount; const acc = state.accounts.find(a => a.id === id); if (!acc) return;
      try {
        await api.put(`/settings/accounts/${id}`, { platform: acc.platform, is_active: 1 }); await loadData(); render();
      } catch (err) { alert(err.message); }
    }));

    el.querySelectorAll('[data-delete-account]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteAccount; if (!confirm('Are you sure?')) return;
      try { await api.delete(`/settings/accounts/${id}`); await loadData(); render(); }
      catch (err) { alert(err.message); }
    }));
  }

  function renderBillingSection() {
    const plan = state.planDetails;
    if (!plan) {
      return `<h2 class="text-2xl font-bold mb-6 text-white">Subscription</h2><div class="bg-gradient-to-br from-[#161b22] to-[#0d1117] border border-[#58a6ff]/30 rounded-xl p-8 text-center text-white"><h3 class="text-xl font-bold mb-2">Loading...</h3></div>`;
    }

    const features = [
      { key: 'basic_ads', label: 'Basic Ad Creation', icon: '📢' },
      { key: 'analytics', label: 'Analytics Dashboard', icon: '📊' },
      { key: 'ai_generation', label: 'AI Ad Generation', icon: '🤖' },
      { key: 'competitor_spy', label: 'Competitor Spy', icon: '🕵️' },
      { key: 'auto_optimization', label: 'Auto Optimization', icon: '⚡' },
      { key: 'api_access', label: 'API Access', icon: '🔌' },
    ];

    const limits = [
      { label: 'Max Ads', value: plan.maxAds === -1 ? 'Unlimited' : plan.maxAds },
      { label: 'Max Campaigns', value: plan.maxCampaigns === -1 ? 'Unlimited' : plan.maxCampaigns },
      { label: 'Platform Accounts', value: plan.maxPlatformAccounts === -1 ? 'Unlimited' : plan.maxPlatformAccounts },
    ];

    return `
      <h2 class="text-2xl font-bold mb-6 text-white">Subscription</h2>
      <div class="grid gap-6">
        <div class="bg-gradient-to-br from-[#161b22] to-[#0d1117] border border-[#58a6ff]/30 rounded-xl p-8">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-2xl font-bold text-white">${plan.name} Plan</h3>
              ${plan.isAdmin ? '<span class="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold">ADMIN ACCESS</span>' : ''}
            </div>
            <div class="text-4xl font-black text-sky-400">${plan.tier}</div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            ${limits.map(l => `
              <div class="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                <div class="text-xs text-slate-400 uppercase font-bold mb-1">${l.label}</div>
                <div class="text-lg font-bold text-white">${l.value}</div>
              </div>
            `).join('')}
          </div>

          <h4 class="text-lg font-bold text-white mb-4">Included Features</h4>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            ${features.map(f => `
              <div class="flex items-center gap-2 ${plan.features.includes(f.key) ? 'text-emerald-400' : 'text-slate-600'}">
                <span class="text-xl">${f.icon}</span>
                <span class="text-sm font-medium">${f.label}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h4 class="text-lg font-bold text-white mb-4">Upgrade Your Plan</h4>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            ${['Free', 'Pro', 'Enterprise'].map((p, i) => `
              <div class="bg-[#0d1117] rounded-lg p-4 border ${i + 1 === plan.tier ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-[#30363d]'}">
                <h5 class="text-lg font-bold text-white mb-2">${p}</h5>
                <div class="text-2xl font-black ${i + 1 === plan.tier ? 'text-sky-400' : 'text-slate-500'} mb-4">
                  ${['Basic', 'Pro', 'Enterprise'][i]}
                </div>
                <ul class="space-y-2 text-sm text-slate-400">
                  <li>✓ ${i === 0 ? '5 Ads' : i === 1 ? '50 Ads' : 'Unlimited'}</li>
                  <li>✓ ${i === 0 ? '2 Campaigns' : i === 1 ? '10 Campaigns' : 'Unlimited'}</li>
                  <li>✓ ${i === 0 ? '1 Platform' : i === 1 ? '3 Platforms' : 'All Platforms'}</li>
                </ul>
                ${i + 1 > plan.tier ? `<button data-upgrade-plan="${i === 1 ? 'plan_pro' : 'plan_enterprise'}" class="btn-upgrade-${i === 1 ? 'pro' : 'enterprise'} w-full mt-4 bg-[#58a6ff] hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">Upgrade</button>` : '<button disabled class="w-full mt-4 bg-[#21262d] text-slate-500 px-4 py-2 rounded-lg font-bold text-sm cursor-not-allowed">Current Plan</button>'}
              </div>
            `).join('')}
          </div>
          <div id="billing-error" class="hidden mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm"></div>
        </div>
      </div>
    `;
  }

  function attachAIHandlers() {
    const form = el.querySelector('#ai-config-form'); if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(form);
      try { await api.put('/settings/ai', Object.fromEntries(fd)); await loadData(); render(); }
      catch (err) { alert(err.message); }
    });
    el.querySelector('#test-connection-btn')?.addEventListener('click', async () => {
      const fd = new FormData(form); const data = Object.fromEntries(fd);
      state.aiConfig = { ...state.aiConfig, ...data }; state.isTestingConnection = true; render();
      try { const res = await api.post('/settings/ai/test-connection', data); alert(res.message); }
      catch (err) { alert(err.message); } finally { state.isTestingConnection = false; render(); }
    });
    el.querySelector('#fetch-models-btn')?.addEventListener('click', async () => {
      const fd = new FormData(form); const data = Object.fromEntries(fd);
      state.aiConfig = { ...state.aiConfig, ...data }; state.isFetchingModels = true; render();
      try { const res = await api.post('/settings/ai/models', data); state.availableModels = res.data; }
      catch (err) { alert(err.message); } finally { state.isFetchingModels = false; render(); }
    });
    el.querySelector('#run-test-prompt')?.addEventListener('click', async () => {
      const p = el.querySelector('#test-user-prompt').value;
      if (!p) return alert('Prompt required');
      state.isTestingPrompt = true; render();
      try { const res = await api.post('/settings/ai/test-prompt', { prompt: p }); state.testPromptResult = res.data; }
      catch (err) { alert(err.message); } finally { state.isTestingPrompt = false; render(); }
    });
  }

  function attachBillingHandlers() {
    const errorEl = el.querySelector('#billing-error');
    el.querySelectorAll('[data-upgrade-plan]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const planId = btn.dataset.upgradePlan;
        const token = localStorage.getItem('adforge_token');

        if (!token) {
          if (errorEl) {
            errorEl.textContent = 'You must be logged in to upgrade your plan';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        btn.disabled = true;
        btn.classList.add('loading');
        const originalText = btn.textContent;
        btn.textContent = 'Processing...';

        try {
          const res = await fetch('/api/payments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ planId })
          });

          const data = await res.json();

          if (data.success && data.data?.checkoutUrl) {
            window.location.href = data.data.checkoutUrl;
          } else {
            throw new Error(data.error || 'Failed to initiate payment');
          }
        } catch (err) {
          console.error('Payment initiation failed:', err);
          if (errorEl) {
            errorEl.textContent = err.message || 'Failed to initiate payment. Please try again.';
            errorEl.classList.remove('hidden');
          }
        } finally {
          btn.disabled = false;
          btn.classList.remove('loading');
          btn.textContent = originalText;
        }
      });
    });
  }
  function renderIntegrationsSection() {
    const { enabled } = state.integrations.adspirer || {};
    const { connected } = state.adspirerStatus || {};
    return `
      <h2 class="text-2xl font-bold mb-6 text-white">Integrations</h2>
      <div class="grid gap-6">
        <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div class="p-6 border-b border-[#30363d] flex items-center justify-between bg-[#1c2128]">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-[#0d1117] rounded-lg flex items-center justify-center border border-[#30363d] font-bold text-sky-400">A</div>
              <div>
                <h3 class="font-bold text-white">Adspirer</h3>
                <p class="text-xs text-slate-400">MCP-powered ad management across Google, Meta, TikTok &amp; LinkedIn</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="adspirer-toggle" ${enabled ? 'checked' : ''} class="sr-only peer">
              <div class="w-11 h-6 bg-[#30363d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#238636]"></div>
            </label>
          </div>
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-sm text-slate-400">Status:</span>
              ${enabled
                ? connected
                  ? '<span class="inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>Connected</span>'
                  : '<span class="inline-flex items-center gap-1.5 text-xs bg-yellow-500/10 text-yellow-400 px-2.5 py-1 rounded-full border border-yellow-500/20"><span class="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"></span>Enabled · Not Connected</span>'
                : '<span class="inline-flex items-center gap-1.5 text-xs bg-slate-700/50 text-slate-400 px-2.5 py-1 rounded-full border border-slate-600/30"><span class="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block"></span>Disabled</span>'
              }
            </div>
            ${enabled ? `
              <p class="text-xs text-slate-500">Adspirer connects via OAuth 2.1 and allows AdForge's AI to manage campaigns across platforms using the MCP protocol.</p>
              <div class="flex items-center gap-3 pt-2">
                ${connected
                  ? `<button id="adspirer-disconnect" class="text-xs bg-red-900/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg font-medium hover:bg-red-900/40 transition-colors">Disconnect</button>`
                  : `<a href="/api/adspirer/auth" id="adspirer-connect" class="text-xs bg-[#238636] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#2ea043] transition-colors">Connect with Adspirer</a>`
                }
              </div>
            ` : `
              <p class="text-xs text-slate-500">Enable Adspirer to connect your ad accounts and allow AI-powered campaign management via the MCP protocol.</p>
            `}
          </div>
        </div>

        <!-- AI Mode Card -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div class="p-6 border-b border-[#30363d] flex items-center gap-4 bg-[#1c2128]">
            <div class="w-10 h-10 bg-[#0d1117] rounded-lg flex items-center justify-center border border-[#30363d] font-bold text-purple-400">AI</div>
            <div>
              <h3 class="font-bold text-white">AI Mode</h3>
              <p class="text-xs text-slate-400">Let AI manage and optimize your ads, copy, landing pages, and creatives</p>
            </div>
          </div>
          <div class="p-6 space-y-4">
            <p class="text-xs text-slate-500 font-medium uppercase tracking-wide">Autonomy Level</p>
            <div class="space-y-2" id="ai-autonomy-group">
              ${[
                { value: 'off', label: 'Off', desc: 'AI is disabled. No suggestions generated.' },
                { value: 'manual', label: 'Manual Approval', desc: 'AI generates suggestions. You approve each one before it is applied.' },
                { value: 'semi_auto', label: 'Semi-Auto', desc: 'AI auto-applies low-risk changes (copy, creatives). High-risk changes (pause, landing pages) require your approval.' },
                { value: 'fully_auto', label: 'Fully Automatic', desc: 'AI applies all suggestions automatically without approval.' },
              ].map(opt => `
                <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${state.aiMode.autonomy_level === opt.value ? 'border-purple-500 bg-purple-500/10' : 'border-[#30363d] hover:border-[#8b949e]'}">
                  <input type="radio" name="ai-autonomy" value="${opt.value}" ${state.aiMode.autonomy_level === opt.value ? 'checked' : ''} class="mt-0.5 accent-purple-500">
                  <div>
                    <p class="text-sm font-medium text-white">${opt.label}</p>
                    <p class="text-xs text-slate-400 mt-0.5">${opt.desc}</p>
                  </div>
                </label>
              `).join('')}
            </div>
            ${state.aiMode.autonomy_level !== 'off' ? `
              <div class="flex items-center gap-3 pt-1 border-t border-[#30363d]">
                <a href="#/ai-suggestions" class="text-xs bg-[#21262d] text-slate-300 border border-[#30363d] px-3 py-1.5 rounded-md font-medium hover:bg-[#30363d] transition-colors">View Suggestions</a>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function attachIntegrationsHandlers() {
    el.querySelector('#adspirer-toggle')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        await api.post('/settings/integrations/adspirer', { enabled });
        state.integrations.adspirer = { enabled };
        const statusRes = await api.get('/adspirer/status');
        state.adspirerStatus = statusRes.data;
        render();
      } catch (err) {
        alert('Failed to update Adspirer: ' + err.message);
        e.target.checked = !enabled;
      }
    });

    el.querySelector('#adspirer-disconnect')?.addEventListener('click', async () => {
      if (!confirm('Disconnect Adspirer? This will remove stored tokens.')) return;
      try {
        await api.post('/adspirer/disconnect');
        state.adspirerStatus = { ...state.adspirerStatus, connected: false };
        render();
      } catch (err) {
        alert('Failed to disconnect: ' + err.message);
      }
    });

    el.querySelectorAll('input[name="ai-autonomy"]').forEach(radio => {
      radio.addEventListener('change', async (e) => {
        const level = e.target.value;
        try {
          const res = await api.post('/ai-agent/autonomy', { level });
          state.aiMode = res.data;
          render();
        } catch (err) {
          alert('Failed to update AI autonomy level: ' + err.message);
          render(); // re-render to reset selection
        }
      });
    });
  }

  render();
}
