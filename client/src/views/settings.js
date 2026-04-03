import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderSettings(el) {
  let state = {
    accounts: [],
    activeSection: 'accounts',
    mcpStatus: {},
    platformAccounts: {} 
  };

  const loadData = async () => {
    try {
      const [accRes, statusRes] = await Promise.all([
        api.get('/settings/accounts'),
        api.get('/mcp/status')
      ]);
      state.accounts = accRes.data;
      state.mcpStatus = statusRes.data;
      
      state.platformAccounts = {
        meta: [],
        google: [],
        tiktok: [],
        scalev: [],
        x: []
      };
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
          </nav>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 p-4 sm:p-8 overflow-y-auto">
          <div class="max-w-4xl mx-auto">
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
  }

  function renderSection() {
    switch (state.activeSection) {
      case 'accounts': return renderAccountsSection();
      case 'security': return `
        <h2 class="text-2xl font-bold mb-6 text-white">Security Settings</h2>
        <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <p class="text-slate-400 mb-4">Update your password and manage session security.</p>
          <div class="space-y-4 max-w-sm">
            <div>
              <label class="block text-sm text-slate-400 mb-1">Current Password</label>
              <input type="password" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] focus:border-[#58a6ff] outline-none text-white">
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">New Password</label>
              <input type="password" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] focus:border-[#58a6ff] outline-none text-white">
            </div>
            <button class="bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:bg-[#30363d] px-6 py-2 rounded-lg font-bold min-h-[44px]">Update Password</button>
          </div>
        </div>
      `;
      case 'ai': return `
        <h2 class="text-2xl font-bold mb-6 text-white">AI Configuration</h2>
        <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-3 h-3 rounded-full ${state.mcpStatus.omniroute?.connected ? 'bg-emerald-400' : 'bg-red-400'}"></div>
            <span class="text-lg font-bold text-white">OmniRoute AI Gateway</span>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-slate-400 mb-1">API Endpoint</label>
              <input type="text" value="${esc(state.mcpStatus.omniroute?.url || '')}" disabled class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-slate-500">
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1 text-white">Default Model</label>
              <select class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] outline-none text-white">
                <option>auto/pro-reasoning</option>
                <option>openai/gpt-4o</option>
                <option>anthropic/claude-3-5-sonnet</option>
              </select>
            </div>
          </div>
        </div>
      `;
      case 'billing': return `
        <h2 class="text-2xl font-bold mb-6 text-white">Subscription & Billing</h2>
        <div class="bg-gradient-to-br from-[#161b22] to-[#0d1117] border border-[#58a6ff]/30 rounded-xl p-8 text-center text-white">
          <h3 class="text-xl font-bold text-white mb-2">You are on the Free Starter Plan</h3>
          <p class="text-slate-400 mb-6">Upgrade to unlock unlimited multi-account support and advanced AI features.</p>
          <button class="bg-[#58a6ff] hover:bg-[#79c0ff] text-white px-8 py-3 rounded-lg font-bold transition-all min-h-[44px]">View Plans</button>
        </div>
      `;
      default: return '';
    }
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
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-white">Connected Accounts</h2>
      </div>
      
      <div class="grid gap-6">
        ${platforms.map(p => {
          const accounts = state.platformAccounts[p.id] || [];
          return `
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div class="p-6 border-b border-[#30363d] flex items-center justify-between bg-[#1c2128]">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-[#0d1117] rounded-lg flex items-center justify-center border border-[#30363d]">
                  <span class="font-bold text-sky-400">${p.name[0]}</span>
                </div>
                <div>
                  <h3 class="font-bold text-white">${p.name}</h3>
                  <p class="text-xs text-slate-400">${p.desc}</p>
                </div>
              </div>
              <button data-add-account="${p.id}" class="text-xs bg-[#238636] hover:bg-[#2ea043] text-white px-3 py-1.5 rounded-md font-medium transition-all">
                + Add Account
              </button>
            </div>
            
            <div class="p-0">
              ${accounts.length === 0 ? `
                <div class="p-8 text-center text-slate-500 text-sm">
                  No accounts connected yet.
                </div>
              ` : `
                <div class="divide-y divide-[#30363d]">
                  ${accounts.map(acc => `
                    <div class="p-4 flex items-center justify-between hover:bg-[#1c2128] transition-colors group">
                      <div class="flex items-center gap-3">
                        <div class="w-2 h-2 rounded-full ${acc.is_active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}"></div>
                        <div>
                          <div class="text-sm font-medium text-slate-200">${esc(acc.account_name)}</div>
                          <div class="text-[10px] text-slate-500 font-mono">${acc.id.split('-')[0]}...</div>
                        </div>
                        ${acc.is_active ? '<span class="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 ml-2">ACTIVE</span>' : ''}
                      </div>
                      <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${!acc.is_active ? `<button data-activate-account="${acc.id}" class="text-[10px] text-sky-400 hover:underline px-2">Set Active</button>` : ''}
                        <button data-edit-account="${acc.id}" class="text-[10px] text-slate-400 hover:text-white px-2">Edit</button>
                        <button data-delete-account="${acc.id}" class="text-[10px] text-red-400 hover:text-red-300 px-2">Delete</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- New Account Form -->
            <div id="${p.id}-add-form" class="hidden p-6 bg-[#0d1117] border-t border-[#30363d] animate-in fade-in slide-in-from-top-4 duration-200">
               <h4 class="text-sm font-bold text-white mb-4">Connect New ${p.name} Account</h4>
               <form data-platform-form="${p.id}" class="space-y-4">
                 <div>
                   <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Account Name</label>
                   <input type="text" name="account_name" placeholder="e.g. My Primary Account" required class="w-full p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] focus:border-[#58a6ff] outline-none text-sm text-white">
                 </div>
                 ${renderPlatformFields(p.id)}
                 <div class="flex items-center gap-3 pt-2">
                   <button type="submit" class="bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-bold transition-all">Connect Account</button>
                   <button type="button" data-cancel-add="${p.id}" class="text-slate-400 hover:text-white text-sm font-medium">Cancel</button>
                 </div>
               </form>
            </div>
          </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderPlatformFields(platform, existingFields = {}) {
    const commonClass = "w-full p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] focus:border-[#58a6ff] outline-none text-sm text-white placeholder:text-slate-600";
    const labelClass = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1";
    
    switch (platform) {
      case 'meta': return `
        <div>
          <label class="${labelClass}">Access Token</label>
          <input type="password" name="access_token" value="${existingFields.access_token || ''}" placeholder="Paste Meta access token" class="${commonClass}">
        </div>
      `;
      case 'google': return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="${labelClass}">Developer Token</label>
            <input type="password" name="developer_token" value="${existingFields.developer_token || ''}" placeholder="Google Ads Dev Token" class="${commonClass}">
          </div>
          <div>
            <label class="${labelClass}">Credentials JSON Path</label>
            <input type="text" name="credentials_path" value="${esc(existingFields.credentials_path || '')}" class="${commonClass}">
          </div>
        </div>
      `;
      case 'tiktok': return `
        <div>
          <label class="${labelClass}">Access Token</label>
          <input type="password" name="access_token" value="${existingFields.access_token || ''}" class="${commonClass}">
        </div>
      `;
      case 'x': return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">
            <label class="${labelClass}">Access Token</label>
            <input type="password" name="access_token" value="${existingFields.access_token || ''}" class="${commonClass}">
          </div>
          <div>
            <label class="${labelClass}">API Key</label>
            <input type="text" name="api_key" value="${existingFields.api_key || ''}" class="${commonClass}">
          </div>
          <div>
            <label class="${labelClass}">API Secret</label>
            <input type="password" name="api_secret" value="${existingFields.api_secret || ''}" class="${commonClass}">
          </div>
        </div>
      `;
      case 'scalev': return `
        <div>
          <label class="${labelClass}">API Token</label>
          <input type="password" name="api_token" value="${existingFields.api_token || ''}" class="${commonClass}">
        </div>
      `;
      default: return '';
    }
  }

  function attachAccountHandlers() {
    el.querySelectorAll('[data-add-account]').forEach(btn => {
      btn.addEventListener('click', () => {
        const platform = btn.dataset.addAccount;
        el.querySelector(`#${platform}-add-form`).classList.remove('hidden');
        btn.classList.add('hidden');
      });
    });

    el.querySelectorAll('[data-cancel-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const platform = btn.dataset.cancelAdd;
        el.querySelector(`#${platform}-add-form`).classList.add('hidden');
        el.querySelector(`[data-add-account="${platform}"]`).classList.remove('hidden');
      });
    });

    el.querySelectorAll('[data-platform-form]').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const platform = form.dataset.platformForm;
        const fd = new FormData(form);
        const rawData = Object.fromEntries(fd);
        
        const account_name = rawData.account_name;
        delete rawData.account_name;
        
        const credentials = rawData;
        for (const key of Object.keys(credentials)) { if (!credentials[key]) delete credentials[key]; }

        try {
          await api.post('/settings/accounts', { platform, account_name, credentials });
          await loadData();
          render();
        } catch (err) {
          alert('Failed to connect account: ' + err.message);
        }
      });
    });

    el.querySelectorAll('[data-activate-account]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.activateAccount;
        try {
          const acc = state.accounts.find(a => a.id === id);
          if (!acc) return;
          
          const platformAccs = state.accounts.filter(a => a.platform === acc.platform && a.id !== id);
          for (const a of platformAccs) {
             if (a.is_active) await api.put(`/settings/accounts/${a.id}`, { is_active: 0 });
          }
          
          await api.put(`/settings/accounts/${id}`, { is_active: 1 });
          await loadData();
          render();
        } catch (err) {
          alert('Failed to activate account: ' + err.message);
        }
      });
    });

    el.querySelectorAll('[data-delete-account]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.deleteAccount;
        if (!confirm('Are you sure you want to delete this account?')) return;
        try {
          await api.delete(`/settings/accounts/${id}`);
          await loadData();
          render();
        } catch (err) {
          alert('Failed to delete account: ' + err.message);
        }
      });
    });
    
    el.querySelectorAll('[data-edit-account]').forEach(btn => {
      btn.addEventListener('click', () => {
        alert('Edit functionality coming soon! For now, please delete and re-add.');
      });
    });
  }

  render();
}
