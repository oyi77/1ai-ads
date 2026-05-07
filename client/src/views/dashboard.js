import { api } from '../lib/api.js';
import { renderCampaignsList } from '../components/campaigns.js';
import { renderAnalyticsChart } from '../components/analytics.js';
import { renderScheduleQueue } from '../components/schedule.js';
import { renderAISuggestions } from '../components/ai-suggestions.js';

function checkAuth() {
  return localStorage.getItem('adforge_token') !== null;
}

export function renderDashboard() {
  if (!checkAuth()) {
    window.location.hash = '/login';
    return;
  }

  api.get('/api/campaigns')
    .then(response => {
      const campaigns = response.data || [];
      const stats = calculateStats(campaigns);
      
      const html = `
        <div class="flex h-screen bg-[#05070a] text-slate-200 overflow-hidden">
          <!-- SIDEBAR -->
          <aside class="w-64 bg-[#0d1117] border-r border-[#1c2128] hidden md:flex flex-col">
            <div class="p-6">
              <div class="flex items-center gap-3 mb-8">
                <div class="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center font-bold text-black text-xl">A</div>
                <span class="text-xl font-bold tracking-tight text-white">AdForge <span class="text-sky-500">AI</span></span>
              </div>
              
              <nav class="space-y-1">
                ${renderNavItem('Dashboard', '#/', '🏠', true)}
                ${renderNavItem('Campaigns', '#/campaigns', '🎯')}
                ${renderNavItem('Creatives', '#/ads', '🖼️')}
                ${renderNavItem('Landing Pages', '#/landing', '🌐')}
                ${renderNavItem('Analytics', '#/analytics', '📊')}
                ${renderNavItem('Autonomous', '#/settings', '🧠')}
              </nav>
            </div>
            
            <div class="mt-auto p-6">
              <div class="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
                <p class="text-xs text-slate-500 uppercase font-bold mb-2">Active Plan</p>
                <p class="text-sm font-bold text-white mb-1">PRO Business</p>
                <div class="w-full bg-[#0d1117] h-1.5 rounded-full mt-3 overflow-hidden">
                  <div class="bg-sky-500 h-full w-3/4"></div>
                </div>
              </div>
            </div>
          </aside>

          <!-- MAIN CONTENT -->
          <main class="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <!-- TOP BAR -->
            <header class="h-16 bg-[#0d1117]/80 backdrop-blur-md border-b border-[#1c2128] flex items-center justify-between px-8 sticky top-0 z-10">
              <div class="flex items-center gap-4 flex-1">
                <div class="relative max-w-md w-full">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                  <input type="text" placeholder="Search data, campaigns, or ads..." class="w-full bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-sky-500 transition-colors">
                </div>
              </div>
              
              <div class="flex items-center gap-6">
                <button class="text-slate-400 hover:text-white transition-colors relative">
                   🔔
                   <span class="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#0d1117]"></span>
                </button>
                <div class="flex items-center gap-3 border-l border-[#30363d] pl-6">
                   <div class="text-right hidden sm:block">
                     <p class="text-sm font-bold text-white leading-none">${localStorage.getItem('adforge_user') || 'Admin'}</p>
                     <p class="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Super Administrator</p>
                   </div>
                   <div class="w-10 h-10 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-full border-2 border-[#30363d] flex items-center justify-center text-white font-bold">A</div>
                </div>
              </div>
            </header>

            <div class="p-8">
              <!-- HERO WELCOME -->
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <h1 class="text-3xl font-bold text-white tracking-tight">Performance Command Center</h1>
                  <p class="text-slate-400 mt-1">Real-time cross-platform revenue monitoring and AI optimization.</p>
                </div>
                <div class="flex items-center gap-3">
                  <button onclick="syncAllPlatforms()" class="bg-[#161b22] border border-[#30363d] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#1c2128] transition-colors">🔄 Sync Platforms</button>
                  <button onclick="router.navigate('/campaign/create')" class="bg-sky-500 text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20">🚀 Launch Campaign</button>
                </div>
              </div>

              <!-- KPI GRID -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                ${renderStatCard('Total Revenue', 'IDR ' + stats.revenue, '+12.5%', '💰', 'emerald')}
                ${renderStatCard('Total Spend', 'IDR ' + stats.spend, '+4.2%', '📉', 'rose')}
                ${renderStatCard('Avg. ROAS', stats.roas + 'x', '+1.1x', '📈', 'sky')}
                ${renderStatCard('Active Ads', stats.activeCount, '-2', '🎯', 'indigo')}
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- CHART SECTION -->
                <div class="lg:col-span-2 space-y-8">
                  <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl p-6 shadow-xl">
                    <div class="flex items-center justify-between mb-8">
                      <div>
                        <h3 class="text-lg font-bold text-white">Revenue vs Spend</h3>
                        <p class="text-xs text-slate-500 mt-1">Daily trend across all connected accounts</p>
                      </div>
                      <select class="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-1 text-xs text-slate-300">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                      </select>
                    </div>
                    <div class="h-64 flex items-end justify-between gap-2 px-2">
                       <!-- Mock chart bars -->
                       ${[45, 65, 42, 80, 55, 90, 72].map((h, i) => `
                         <div class="flex-1 flex flex-col items-center gap-2 group">
                            <div class="w-full bg-sky-500/10 rounded-t-lg relative flex flex-col justify-end overflow-hidden h-40">
                               <div class="bg-sky-500 w-full rounded-t-lg transition-all duration-1000" style="height: ${h}%"></div>
                               <div class="bg-indigo-500 w-full opacity-40" style="height: ${h * 0.4}%"></div>
                            </div>
                            <span class="text-[10px] text-slate-500">Day ${i+1}</span>
                         </div>
                       `).join('')}
                    </div>
                  </div>

                  <!-- ACTIVE CAMPAIGNS LIST -->
                  <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl overflow-hidden shadow-xl">
                    <div class="p-6 border-b border-[#1c2128] flex items-center justify-between">
                      <h3 class="text-lg font-bold text-white">Top Performing Campaigns</h3>
                      <button class="text-sky-500 text-xs font-bold hover:underline">View All</button>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-left">
                        <thead class="bg-[#161b22]/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                          <tr>
                            <th class="px-6 py-4">Campaign Name</th>
                            <th class="px-6 py-4">Status</th>
                            <th class="px-6 py-4">Spend</th>
                            <th class="px-6 py-4">ROAS</th>
                            <th class="px-6 py-4">Action</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-[#1c2128]">
                          ${campaigns.slice(0, 5).map(c => `
                            <tr class="hover:bg-[#161b22]/30 transition-colors">
                              <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                  <div class="w-2 h-2 rounded-full ${getStatusColor(c.status)}"></div>
                                  <div>
                                    <p class="text-sm font-bold text-white">${c.name}</p>
                                    <p class="text-[10px] text-slate-500 uppercase">${c.platform}</p>
                                  </div>
                                </div>
                              </td>
                              <td class="px-6 py-4">
                                <span class="px-2 py-1 rounded-md text-[10px] font-bold bg-[#161b22] border border-[#30363d]">${c.status}</span>
                              </td>
                              <td class="px-6 py-4 text-sm font-medium">IDR ${c.spend?.toLocaleString() || '0'}</td>
                              <td class="px-6 py-4">
                                <div class="flex items-center gap-2">
                                  <span class="text-sm font-bold ${c.roas >= 2 ? 'text-emerald-400' : 'text-rose-400'}">${c.roas || '0.0'}x</span>
                                </div>
                              </td>
                              <td class="px-6 py-4">
                                <button class="p-2 hover:bg-[#30363d] rounded-lg transition-colors">⚙️</button>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <!-- SIDEBAR PANEL -->
                <div class="space-y-8">
                  <!-- AUTONOMOUS AGENT STATUS -->
                  <div class="bg-gradient-to-br from-indigo-900/20 to-sky-900/20 border border-sky-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 w-24 h-24 bg-sky-500/10 blur-3xl rounded-full"></div>
                    <div class="flex items-center gap-3 mb-6">
                      <div class="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/40 animate-pulse">🧠</div>
                      <div>
                        <h4 class="text-white font-bold">Autonomous Agent</h4>
                        <div class="flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                          <span class="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Active & Learning</span>
                        </div>
                      </div>
                    </div>
                    
                    <div class="space-y-4 mb-6">
                      <div class="flex justify-between text-xs">
                        <span class="text-slate-400">Rules Running</span>
                        <span class="text-white font-bold">12 Active</span>
                      </div>
                      <div class="flex justify-between text-xs">
                        <span class="text-slate-400">Actions Today</span>
                        <span class="text-white font-bold">4 Success</span>
                      </div>
                      <div class="flex justify-between text-xs">
                        <span class="text-slate-400">Budget Protected</span>
                        <span class="text-emerald-400 font-bold">IDR 1.2M</span>
                      </div>
                    </div>
                    
                    <button onclick="window.location.hash='/settings'" class="w-full py-3 bg-white text-black text-xs font-bold rounded-xl hover:bg-sky-400 transition-colors">Open Control Center</button>
                  </div>

                  <!-- AI SUGGESTIONS QUICK VIEW -->
                  <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl p-6 shadow-xl">
                    <h3 class="text-white font-bold mb-4 flex items-center gap-2">✨ AI Recommendations</h3>
                    <div class="space-y-4">
                       <div class="p-3 bg-[#161b22] border-l-2 border-emerald-500 rounded-lg">
                         <p class="text-xs font-bold text-white">Scaling Opportunity</p>
                         <p class="text-[10px] text-slate-400 mt-1">"Summer Sale" Meta campaign ROAS is 4.5x. AI suggests 20% budget increase.</p>
                       </div>
                       <div class="p-3 bg-[#161b22] border-l-2 border-rose-500 rounded-lg">
                         <p class="text-xs font-bold text-white">Creative Fatigue</p>
                         <p class="text-[10px] text-slate-400 mt-1">CTR on TikTok Ads dropped 30%. Suggest rotating video creative.</p>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      `;

      document.getElementById('app').innerHTML = html;
    })
    .catch(err => {
      console.error('Dashboard load failed:', err);
    });
}

function calculateStats(campaigns) {
  const totRev = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const totSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
  return {
    revenue: totRev.toLocaleString(),
    spend: totSpend.toLocaleString(),
    roas: totSpend > 0 ? (totRev / totSpend).toFixed(1) : '0.0',
    activeCount: campaigns.filter(c => c.status === 'active' || c.status === 'ACTIVE').length
  };
}

function renderNavItem(label, hash, icon, active = false) {
  return `
    <a href="${hash}" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-[#161b22]'}">
      <span class="text-lg">${icon}</span>
      <span class="text-sm font-bold">${label}</span>
      ${active ? '<div class="ml-auto w-1 h-4 bg-sky-500 rounded-full"></div>' : ''}
    </a>
  `;
}

function renderStatCard(label, value, trend, icon, color) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
  };
  
  return `
    <div class="bg-[#0d1117] border border-[#1c2128] p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-[#30363d] transition-all">
      <div class="flex justify-between items-start mb-4">
        <div class="p-3 bg-[#161b22] rounded-xl text-xl">${icon}</div>
        <span class="text-[10px] font-bold px-2 py-1 rounded-md ${colors[color]}">${trend}</span>
      </div>
      <div>
        <p class="text-xs text-slate-500 font-bold uppercase tracking-wider">${label}</p>
        <p class="text-2xl font-bold text-white mt-1">${value}</p>
      </div>
      <div class="absolute -right-2 -bottom-2 opacity-10 blur-xl w-16 h-16 bg-white rounded-full group-hover:scale-150 transition-transform duration-700"></div>
    </div>
  `;
}

function getStatusColor(status) {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'running') return 'bg-emerald-500 shadow-[0_0_8px_#10b981]';
  if (s === 'paused') return 'bg-amber-400';
  return 'bg-slate-600';
}

// Global functions for button handlers
window.syncPlatform = (platform) => {
  alert('Syncing ' + platform + '...');
  api.post('/api/platforms/' + platform + '/sync')
    .then(() => alert('Sync complete!'))
    .catch(err => alert('Sync failed: ' + err.message));
};

window.syncAllCampaigns = (platform) => {
  alert('Syncing ' + platform + ' campaigns...');
  api.post('/api/campaigns/sync')
    .then(() => alert('Campaigns synced!'))
    .catch(err => alert('Sync failed: ' + err.message));
};

window.createCampaign = (platform) => {
  router.navigate('/campaigns/create?platform=' + platform);
};

window.filterCampaigns = (platform) => {
  alert('Filtering ' + platform + ' campaigns...');
};

window.optimizeAllCampaigns = () => {
  if (!confirm('Apply AI optimizations to all campaigns?')) return;
  
  api.post('/api/campaigns/optimize-all')
    .then(result => {
      alert('Optimization complete!\n' + result.message);
      renderDashboard();
    })
    .catch(err => alert('Optimization failed: ' + err.message));
};

window.syncAllPlatforms = () => {
  if (!confirm('Sync all platforms (Meta, TikTok, Google)?')) return;
  
  api.post('/api/platforms/sync-all')
    .then(result => {
      alert('Sync complete for all platforms!');
      renderDashboard();
    })
    .catch(err => alert('Sync failed: ' + err.message));
};

window.applyAllAiSuggestions = () => {
  if (!confirm('Apply all AI suggestions?')) return;
  
  api.post('/api/ai/apply-all')
    .then(result => {
      alert('AI suggestions applied!');
      renderDashboard();
    })
    .catch(err => alert('Apply failed: ' + err.message));
};

window.openScheduleModal = () => {
  alert('Open schedule modal (to be implemented)');
};

window.openUploadModal = (type) => {
  alert('Open upload modal for ' + type + ' (to be implemented)');
};

window.schedulePost = () => {
  alert('Open schedule post flow (to be implemented)');
};
