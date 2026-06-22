import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export function renderAccountsSection(state) {
  const platforms = [
    { id: 'meta', name: 'Meta Ads', desc: 'Facebook & Instagram Ads' },
    { id: 'google', name: 'Google Ads', desc: 'Search and Display Ads' },
    { id: 'tiktok', name: 'TikTok Ads', desc: 'Short-form video Ads' },
    { id: 'linkedin', name: 'LinkedIn Ads', desc: 'B2B Professional Ads' },
    { id: 'pinterest', name: 'Pinterest Ads', desc: 'Visual Discovery Ads' },
    { id: 'snapchat', name: 'Snapchat Ads', desc: 'Full-Screen Mobile Ads' },
    { id: 'twitter', name: 'Twitter/X Ads', desc: 'Real-time Engagement Ads' },
    { id: 'microsoft', name: 'Microsoft/Bing Ads', desc: 'Search & Native Ads' },
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
                 <button type="button" data-cancel-add="${p.id}" class="bg-[#21262d] text-slate-300 border border-[#30363d] px-4 py-2 rounded-lg text-sm font-bold">Cancel</button>
               </div>
             </form>
          </div>
        </div>
        `;
      }).join('')}
    </div>
  `;
}

export function renderPlatformFields(p, existing = {}) {
  const common = "w-full p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-sm text-white";
  const label = "block text-xs font-bold text-slate-500 uppercase mb-1";
  if (p === 'meta') return `
    <div>
      <label class="${label}">Access Token</label>
      <input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}" placeholder="Paste your long-lived token here">
    </div>
    <div class="bg-sky-900/20 border border-sky-700/30 rounded-lg p-3">
      <div class="flex items-center justify-between mb-3">
        <label class="block text-xs font-bold text-sky-400 uppercase">Or Connect via Facebook OAuth</label>
        <button type="button" id="fb-oauth-btn" class="text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg transition-all">Connect Facebook</button>
      </div>
      <p class="text-[10px] text-sky-300 mb-2">Click "Connect Facebook" to login with your Meta credentials and automatically connect your Business Manager and Ads Accounts.</p>
    </div>`;
  if (p === 'google') return `<div class="grid grid-cols-2 gap-4"><div><label class="${label}">Developer Token</label><input type="password" name="developer_token" value="${existing.developer_token || ''}" class="${common}"></div><div><label class="${label}">Customer ID</label><input type="text" name="customer_id" value="${existing.customer_id || ''}" class="${common}" placeholder="123-456-7890"></div></div><div><label class="${label}">Refresh Token</label><input type="password" name="refresh_token" value="${existing.refresh_token || ''}" class="${common}"></div>`;
  if (p === 'tiktok') return `<div><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div>`;
  if (p === 'linkedin') return `<div class="grid grid-cols-2 gap-4"><div><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div><div><label class="${label}">Client ID</label><input type="text" name="client_id" value="${existing.client_id || ''}" class="${common}"></div></div><div><label class="${label}">Client Secret</label><input type="password" name="client_secret" value="${existing.client_secret || ''}" class="${common}"></div>`;
  if (p === 'pinterest') return `<div><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div><div><label class="${label}">Ad Account ID</label><input type="text" name="ad_account_id" value="${existing.ad_account_id || ''}" class="${common}"></div>`;
  if (p === 'snapchat') return `<div><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div><div><label class="${label}">Refresh Token</label><input type="password" name="refresh_token" value="${existing.refresh_token || ''}" class="${common}"></div>`;
  if (p === 'twitter') return `<div class="grid grid-cols-2 gap-4"><div><label class="${label}">Access Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div><div><label class="${label}">Account ID</label><input type="text" name="account_id" value="${existing.account_id || ''}" class="${common}"></div></div>`;
  if (p === 'microsoft') return `<div class="grid grid-cols-2 gap-4"><div><label class="${label}">OAuth Token</label><input type="password" name="access_token" value="${existing.access_token || ''}" class="${common}"></div><div><label class="${label}">Developer Token</label><input type="password" name="developer_token" value="${existing.developer_token || ''}" class="${common}"></div></div><div><label class="${label}">Customer ID</label><input type="text" name="customer_id" value="${existing.customer_id || ''}" class="${common}"></div>`;
  if (p === 'scalev') return `<div><label class="${label}">API Token</label><input type="password" name="api_token" value="${existing.api_token || ''}" class="${common}"></div>`;
  return '';
}

export function bindAccountsSection(el, state, { loadData, render }) {
  const attachAccountHandlers = () => {
    el.querySelectorAll('[data-add-account]').forEach(btn => btn.addEventListener('click', () => {
      const p = btn.dataset.addAccount; el.querySelector(`#${p}-add-form`).classList.remove('hidden'); btn.classList.add('hidden');
    }));
    el.querySelectorAll('[data-cancel-add]').forEach(btn => btn.addEventListener('click', () => {
      const p = btn.dataset.cancelAdd; el.querySelector(`#${p}-add-form`).classList.add('hidden'); el.querySelector(`[data-add-account="${p}"]`).classList.remove('hidden');
    }));

    // Facebook OAuth handler
    el.querySelector('#fb-oauth-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.get('/auth/facebook/login');
        if (res.success && res.data?.fb_url) {
          window.location.href = res.data.fb_url;
        } else {
          alert('Failed to initialize Facebook OAuth: ' + (res.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Facebook OAuth failed: ' + err.message);
      }
    });

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

    el.querySelectorAll('[data-activate-account]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.activateAccount;
      try {
        await api.post('/settings/accounts/activate', { accountId: id });
        await loadData();
        render();
      } catch (err) {
        alert('Failed to activate account: ' + err.message);
      }
    }));

    el.querySelectorAll('[data-delete-account]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this account?')) return;
      const id = btn.dataset.deleteAccount;
      try {
        await api.del('/settings/accounts', { id });
        await loadData();
        render();
      } catch (err) {
        alert('Failed to delete account: ' + err.message);
      }
    }));
  };

  attachAccountHandlers();
}