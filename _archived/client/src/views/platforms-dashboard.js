import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const PLATFORMS = [
  { id: 'meta', name: 'Meta Ads', icon: 'M', color: 'blue', desc: 'Facebook & Instagram', route: '/settings' },
  { id: 'google', name: 'Google Ads', icon: 'G', color: 'red', desc: 'Search & Display', route: '/settings' },
  { id: 'tiktok', name: 'TikTok Ads', icon: 'T', color: 'pink', desc: 'Short-form Video', route: '/settings' },
  { id: 'linkedin', name: 'LinkedIn Ads', icon: 'L', color: 'sky', desc: 'B2B Professional', route: '/settings' },
  { id: 'pinterest', name: 'Pinterest Ads', icon: 'P', color: 'rose', desc: 'Visual Discovery', route: '/settings' },
  { id: 'snapchat', name: 'Snapchat Ads', icon: 'S', color: 'yellow', desc: 'Full-Screen Mobile', route: '/settings' },
  { id: 'twitter', name: 'Twitter/X Ads', icon: 'X', color: 'slate', desc: 'Real-time Engagement', route: '/settings' },
  { id: 'microsoft', name: 'Microsoft Ads', icon: 'B', color: 'emerald', desc: 'Bing & Native Ads', route: '/settings' },
];

const STATUS_STYLES = {
  connected: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  configured: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  not_configured: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export async function renderPlatformsDashboard(el) {
  let platformStatuses = {};
  let syncResults = {};

  const loadStatuses = async () => {
    try {
      // Check each platform's connection status via settings
      const res = await api.get('/settings/platform-status');
      platformStatuses = res.data || {};
    } catch (e) {
      // If endpoint doesn't exist yet, derive from accounts
      try {
        const accountsRes = await api.get('/settings/accounts');
        const accounts = accountsRes.data || [];
        for (const acc of accounts) {
          platformStatuses[acc.platform] = {
            status: acc.is_active ? 'connected' : 'configured',
            accountName: acc.account_name,
          };
        }
      } catch (_) {
        // No data available
      }
    }
  };

  await loadStatuses();
  render();

  function getPlatformStatus(platformId) {
    return platformStatuses[platformId] || { status: 'not_configured' };
  }

  function render() {
    const connected = PLATFORMS.filter(p => getPlatformStatus(p.id).status === 'connected').length;
    const totalCampaigns = Object.values(syncResults).reduce((s, r) => s + (r.campaigns?.length || 0), 0);

    el.innerHTML = `
      <div class="max-w-[1600px] mx-auto p-8 animate-fadeIn space-y-8">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 class="text-4xl font-black text-white tracking-tighter uppercase mb-1">Platform Hub</h1>
            <p class="text-slate-500 font-medium tracking-wide">Manage all your ad platform integrations from one place.</p>
          </div>
          <div class="flex items-center gap-3">
            <button id="sync-all-btn" class="px-6 py-3 bg-[#161b22] border border-[#30363d] text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-white transition-all">🔄 Sync All</button>
            <button onclick="window.location.hash='/settings'" class="px-8 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-sky-400 transition-all shadow-xl shadow-white/5">⚙️ Settings</button>
          </div>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">Connected</div>
            <div class="text-4xl font-black text-white">${connected}<span class="text-lg text-slate-500 font-medium">/${PLATFORMS.length}</span></div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">Platforms Available</div>
            <div class="text-4xl font-black text-white">${PLATFORMS.length}</div>
          </div>
          <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">Synced Campaigns</div>
            <div class="text-4xl font-black text-white">${totalCampaigns}</div>
          </div>
        </div>

        <!-- Platform Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          ${PLATFORMS.map(p => {
            const status = getPlatformStatus(p.id);
            const style = STATUS_STYLES[status.status] || STATUS_STYLES.not_configured;
            const statusLabel = status.status === 'connected' ? 'Connected'
              : status.status === 'configured' ? 'Configured'
              : status.status === 'error' ? 'Error'
              : 'Not Configured';
            return `
            <div class="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden hover:border-[#484f58] transition-all group cursor-pointer" data-platform="${p.id}">
              <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                  <div class="w-12 h-12 bg-[#0d1117] rounded-xl flex items-center justify-center border border-[#30363d] text-2xl font-black text-${p.color}-400">${p.icon}</div>
                  <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${style}">
                    <span class="w-1.5 h-1.5 rounded-full bg-current inline-block"></span>
                    ${statusLabel}
                  </span>
                </div>
                <h3 class="text-lg font-black text-white mb-1">${p.name}</h3>
                <p class="text-xs text-slate-500">${p.desc}</p>
                ${status.accountName ? `<p class="text-xs text-sky-400 mt-2 truncate">${esc(status.accountName)}</p>` : ''}
              </div>
              <div class="px-6 py-3 bg-[#0d1117] border-t border-[#30363d] flex items-center justify-between">
                <span class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Manage</span>
                <span class="text-slate-500 group-hover:text-white transition-colors">→</span>
              </div>
            </div>`;
          }).join('')}
        </div>

        ${Object.keys(syncResults).length > 0 ? `
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
          <div class="p-6 border-b border-[#30363d]">
            <h2 class="text-lg font-black text-white">Sync Results</h2>
          </div>
          <div class="divide-y divide-[#30363d]">
            ${Object.entries(syncResults).map(([platform, result]) => `
              <div class="p-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-bold text-white">${PLATFORMS.find(p => p.id === platform)?.name || platform}</span>
                  ${result.error
                    ? `<span class="text-xs text-red-400">${esc(result.error)}</span>`
                    : `<span class="text-xs text-emerald-400">${result.campaigns?.length || 0} campaigns synced</span>`
                  }
                </div>
                <span class="text-xs text-slate-500">${result.syncedAt ? new Date(result.syncedAt).toLocaleString() : ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    `;

    bind();
  }

  function bind() {
    // Platform card clicks go to settings
    el.querySelectorAll('[data-platform]').forEach(card => {
      card.addEventListener('click', () => {
        window.location.hash = '/settings';
      });
    });

    // Sync all button
    el.querySelector('#sync-all-btn')?.addEventListener('click', async () => {
      const btn = el.querySelector('#sync-all-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Syncing...';
      
      const platforms = PLATFORMS.filter(p => getPlatformStatus(p.id).status === 'connected');
      
      for (const p of platforms) {
        try {
          const res = await api.post(`/${p.id === 'meta' ? 'meta' : p.id + '-ads'}/sync`);
          syncResults[p.id] = res.data || { syncedAt: new Date().toISOString() };
        } catch (e) {
          syncResults[p.id] = { error: e.message, syncedAt: new Date().toISOString() };
        }
      }

      btn.disabled = false;
      btn.textContent = '🔄 Sync All';
      render();
    });
  }
}
