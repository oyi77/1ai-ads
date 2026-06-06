import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';
import { renderAutonomousSection, bindAutonomousSection } from './settings_autonomous.js';
import { renderAccountsSection, renderPlatformFields, bindAccountsSection } from './settings-accounts.js';
import { renderAISection, bindAISection } from './settings-ai.js';
import { renderBillingSection, bindBillingSection } from './settings-billing.js';
import { renderIntegrationsSection, bindIntegrationsSection } from './settings-integrations.js';
import { renderMetaAiSection, bindMetaAiSection } from './settings-meta-ai.js';
import { renderAdsLibraryAiSection, bindAdsLibraryAiSection } from './settings-ads-library-ai.js';

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
    aiMode: { autonomy_level: 'off' }
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
            <button data-section="autonomous" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'autonomous' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Autonomous Campaigns
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
            <button data-section="meta-ai" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'meta-ai' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Meta AI Chat
            </button>
            <button data-section="ads-library-ai" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${state.activeSection === 'ads-library-ai' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Ads Library AI
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

    if (state.activeSection === 'accounts') bindAccountsSection(el, state, { loadData, render });
    if (state.activeSection === 'ai') bindAISection(el, state, { loadData, render });
    if (state.activeSection === 'autonomous') bindAutonomousSection(el, state, { loadData, render });
    if (state.activeSection === 'billing') bindBillingSection(el, state, { loadData, render });
    if (state.activeSection === 'integrations') bindIntegrationsSection(el, state, { loadData, render });
    if (state.activeSection === 'meta-ai') bindMetaAiSection(el, state, { loadData, render });
    if (state.activeSection === 'ads-library-ai') bindAdsLibraryAiSection(el, state, { loadData, render });
  }

  function renderSection() {
    switch (state.activeSection) {
      case 'accounts': return renderAccountsSection(state);
      case 'security': return `<h2 class="text-2xl font-bold mb-6 text-white">Security Settings</h2><div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6"><div class="space-y-4 max-w-sm"><div><label class="block text-sm text-slate-400 mb-1">New Password</label><input type="password" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white"></div><button class="bg-[#21262d] text-[#c9d1d9] border border-[#30363d] px-6 py-2 rounded-lg font-bold">Update Password</button></div></div>`;
      case 'ai': return renderAISection(state);
      case 'autonomous': return renderAutonomousSection(state);
      case 'billing': return renderBillingSection(state);
      case 'integrations': return renderIntegrationsSection(state);
      case 'meta-ai': return renderMetaAiSection(state);
      case 'ads-library-ai': return renderAdsLibraryAiSection(state);
      default: return '';
    }
  }

  render();
}