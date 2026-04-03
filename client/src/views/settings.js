import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderSettings(el) {
  let accounts = [];
  let activeSection = 'accounts';
  let mcpStatus = {};
  let credStatus = {}; // Add this line

  const loadData = async () => {
    try {
      const [accRes, statusRes] = await Promise.all([
        api.get('/settings/accounts'),
        api.get('/mcp/status')
      ]);
      accounts = accRes.data;
      mcpStatus = statusRes.data;
      // Build credStatus from accounts response
      accounts.forEach(acc => {
        credStatus[acc.platform] = {
          configured: acc.configured || false,
          fields: acc.fields || {}
        };
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
            <button data-section="accounts" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeSection === 'accounts' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Connected Accounts
            </button>
            <button data-section="security" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeSection === 'security' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              Security & Privacy
            </button>
            <button data-section="ai" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeSection === 'ai' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
              AI Configuration
            </button>
            <button data-section="billing" class="flex-shrink-0 w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeSection === 'billing' ? 'bg-[#58a6ff] text-white' : 'text-slate-400 hover:bg-[#21262d] hover:text-white'}">
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
        activeSection = btn.dataset.section;
        render();
      });
    });

    if (activeSection === 'accounts') attachAccountHandlers();
  }

  function renderSection() {
    switch (activeSection) {
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
            <div class="w-3 h-3 rounded-full ${mcpStatus.omniroute?.connected ? 'bg-emerald-400' : 'bg-red-400'}"></div>
            <span class="text-lg font-bold text-white">OmniRoute AI Gateway</span>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-slate-400 mb-1">API Endpoint</label>
              <input type="text" value="${esc(mcpStatus.omniroute?.url || '')}" disabled class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-slate-500">
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
      { id: 'meta', name: 'Meta Ads', desc: 'Facebook & Instagram Ads management' },
      { id: 'google', name: 'Google Ads', desc: 'Search and Display campaign management' },
      { id: 'tiktok', name: 'TikTok Ads', desc: 'Short-form video ad management' },
      { id: 'x', name: 'X (Twitter) Ads', desc: 'Credential storage for X Ads' },
      { id: 'scalev', name: 'Scalev.id', desc: 'E-commerce landing page checkout' },
    ];

    return `
      <h2 class="text-2xl font-bold mb-6 text-white">Connected Accounts</h2>
      <div class="grid gap-4">
        ${platforms.map(p => `
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6 transition-all hover:border-[#444c56]">
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-[#0d1117] rounded-xl flex items-center justify-center border border-[#30363d]">
                  <span class="font-bold text-sky-400">${p.name[0]}</span>
                </div>
                <div>
                  <h3 class="font-bold text-lg text-white">${p.name}</h3>
                  <p class="text-sm text-slate-400">${p.desc}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${credStatus[p.id]?.configured ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
                <span class="text-sm text-slate-300 font-medium">${credStatus[p.id]?.configured ? 'Configured' : 'Not setup'}</span>
              </div>
            </div>
            
            <form id="${p.id}-creds-form" class="space-y-4">
              ${renderPlatformFields(p.id)}
              <div class="flex items-center gap-3 pt-2">
                <button type="submit" class="bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:bg-[#30363d] px-6 py-2 rounded-lg font-bold transition-all min-h-[44px]">Save Changes</button>
                ${credStatus[p.id]?.configured && (p.id === 'meta' || p.id === 'google') ? 
                  `<button type="button" data-connect="${p.id}" class="text-[#58a6ff] hover:underline text-sm font-medium min-h-[44px]">Test Connection</button>` : ''}
              </div>
            </form>
            <div id="${p.id}-status" class="mt-4"></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderPlatformFields(platform) {
    const commonClass = "w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] focus:border-[#58a6ff] outline-none transition-all placeholder:text-slate-600 text-white";
    const labelClass = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1";
    
    switch (platform) {
      case 'meta': return `
        <div>
          <label class="${labelClass}">Access Token</label>
          <input type="password" name="access_token" placeholder="${credStatus.meta?.configured ? '••••••••••••••••' : 'Paste Meta access token'}" class="${commonClass}">
        </div>
      `;
      case 'google': return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="${labelClass}">Developer Token</label>
            <input type="password" name="developer_token" placeholder="${credStatus.google?.configured ? '••••••••' : 'Google Ads Dev Token'}" class="${commonClass}">
          </div>
          <div>
            <label class="${labelClass}">Credentials JSON Path</label>
            <input type="text" name="credentials_path" value="${esc(credStatus.google?.fields?.credentials_path || '')}" class="${commonClass}">
          </div>
        </div>
      `;
      case 'tiktok': return `
        <div>
          <label class="${labelClass}">Access Token</label>
          <input type="password" name="access_token" class="${commonClass}">
        </div>
      `;
      case 'x': return `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">
            <label class="${labelClass}">Access Token</label>
            <input type="password" name="access_token" class="${commonClass}">
          </div>
          <div>
            <label class="${labelClass}">API Key</label>
            <input type="text" name="api_key" class="${commonClass}">
          </div>
          <div>
            <label class="${labelClass}">API Secret</label>
            <input type="password" name="api_secret" class="${commonClass}">
          </div>
        </div>
      `;
      case 'scalev': return `
        <div>
          <label class="${labelClass}">API Token</label>
          <input type="password" name="api_token" class="${commonClass}">
        </div>
      `;
      default: return '';
    }
  }

  function attachAccountHandlers() {
    ['meta', 'google', 'tiktok', 'scalev', 'x'].forEach(platform => {
      const form = el.querySelector(`#${platform}-creds-form`);
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusDiv = el.querySelector(`#${platform}-status`);
        const fd = new FormData(form);
        const data = Object.fromEntries(fd);
        for (const key of Object.keys(data)) { if (!data[key]) delete data[key]; }

        try {
          await api.post(`/settings/credentials/${platform}`, data);
          statusDiv.innerHTML = '<div class="text-emerald-400 text-sm font-medium flex items-center gap-2"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg> Settings saved successfully</div>';
          setTimeout(async () => {
  await loadData();
            render();
          }, 1500);
        } catch (err) {
          statusDiv.innerHTML = `<div class="text-red-400 text-sm font-medium">${esc(err.message)}</div>`;
        }
      });
    });

    el.querySelectorAll('[data-connect]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const platform = btn.dataset.connect;
        const statusDiv = el.querySelector(`#${platform}-status`);
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Connecting...';
        try {
          const result = await api.post('/mcp/connect', { platform });
          statusDiv.innerHTML = `<div class="text-emerald-400 text-sm font-medium">Connected! ${result.data.toolCount} tools available.</div>`;
          setTimeout(() => renderSettings(el), 1500);
        } catch (err) {
          statusDiv.innerHTML = `<div class="text-red-400 text-sm font-medium">${esc(err.message)}</div>`;
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });
  }

  render();
}
