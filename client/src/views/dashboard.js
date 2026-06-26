import { api } from '../lib/api.js';

export function renderDashboard(el) {
  if (!localStorage.getItem('1ai-ads_token')) {
    window.location.hash = '/login';
    return;
  }
  // Define syncAllPlatforms for inline onclick handler
  window.syncAllPlatforms = async function() {
    try {
      await api.post('/meta/sync');
      window.vn?.success('All platforms synced successfully');
    } catch (e) {
      window.vn?.error('Sync failed: ' + e.message);
    }
  };

  api.get('/campaigns').then(response => {
    const campaigns = response.data || [];
    const stats = {
      revenue: campaigns.reduce((s, c) => s + (c.revenue || 0), 0),
      spend: campaigns.reduce((s, c) => s + (c.spend || 0), 0),
      active: campaigns.filter(c => c.status === 'active' || c.status === 'ACTIVE').length
    };
    stats.roas = stats.spend > 0 ? (stats.revenue / stats.spend).toFixed(1) : '0.0';

    el.innerHTML = `
      <div class="max-w-[1600px] mx-auto p-8 animate-fadeIn space-y-8">
        <!-- Dashboard Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 class="text-4xl font-black text-white tracking-tighter uppercase mb-1">Command Center</h1>
            <p class="text-slate-500 font-medium tracking-wide">Real-time intelligence mapping & growth automation.</p>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="window.location.hash='/research'" class="px-6 py-3 bg-[#161b22] border border-[#30363d] text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-white transition-all">🔬 Intel Research</button>
            <button onclick="window.location.hash='/ads/create'" class="px-8 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-sky-400 transition-all shadow-xl shadow-white/5">🚀 Deploy Node</button>
          </div>
        </div>

        <!-- KPI Power Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          ${renderMetricCard('Capital Velocity', 'IDR ' + stats.revenue.toLocaleString(), 'Revenue', '💰', 'emerald')}
          ${renderMetricCard('Burn Rate', 'IDR ' + stats.spend.toLocaleString(), 'Total Spend', '📉', 'rose')}
          ${renderMetricCard('Growth Multiplier', stats.roas + 'x', 'Avg. ROAS', '📈', 'sky')}
          ${renderMetricCard('Active Modules', stats.active, 'Live Campaigns', '🎯', 'indigo')}
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <!-- Main Analytics Visualization -->
          <div class="xl:col-span-2 space-y-8">
             <div class="bg-[#0d1117] border border-[#1c2128] rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div class="absolute -right-24 -top-24 w-64 h-64 bg-sky-500/5 blur-[100px] rounded-full group-hover:bg-sky-500/10 transition-all duration-1000"></div>
                
                <div class="flex items-center justify-between mb-10">
                   <div>
                      <h3 class="text-xl font-black text-white uppercase tracking-tight">Performance Flux</h3>
                      <p class="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Global Revenue vs Operational Cost</p>
                   </div>
                   <div class="flex bg-[#161b22] p-1 rounded-xl border border-[#30363d]">
                      <button class="px-4 py-1.5 bg-[#30363d] text-white text-[10px] font-black rounded-lg uppercase">7D</button>
                      <button class="px-4 py-1.5 text-slate-500 text-[10px] font-black rounded-lg uppercase hover:text-white">30D</button>
                   </div>
                </div>

                <div class="h-72 flex items-end justify-between gap-4 px-2">
                   ${[40, 70, 45, 90, 65, 85, 100].map((h, i) => `
                     <div class="flex-1 flex flex-col items-center gap-3">
                        <div class="w-full relative group/bar h-60 flex flex-col justify-end">
                           <div class="absolute -top-8 left-1/2 -translate-x-1/2 text-white font-black text-[10px] opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap bg-sky-500 px-2 py-1 rounded-md">8.${i}x</div>
                           <div class="w-full bg-[#161b22] rounded-2xl h-full absolute bottom-0 opacity-40 border border-transparent group-hover/bar:border-[#30363d]"></div>
                           <div class="w-full bg-gradient-to-t from-sky-600 to-sky-400 rounded-2xl transition-all duration-700 relative z-10 group-hover/bar:shadow-[0_0_20px_rgba(56,189,248,0.3)] shadow-lg shadow-sky-500/10" style="height: ${h}%">
                              <div class="w-full h-1/3 bg-white/20 rounded-t-2xl blur-sm"></div>
                           </div>
                        </div>
                        <span class="text-[9px] font-black text-slate-600 uppercase tracking-tighter">PHASE 0${i+1}</span>
                     </div>
                   `).join('')}
                </div>
             </div>

             <!-- Operations Grid -->
             <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Platform Sync Core -->
                <div class="bg-[#0d1117] border border-[#1c2128] rounded-[2.5rem] p-8 shadow-xl">
                   <h3 class="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full bg-sky-500"></span>
                      Platform Uplink
                   </h3>
                   <div class="space-y-4">
                      ${renderPlatformRow('Meta Network', 'Connected', 'v21.0', '#1877F2')}
                      ${renderPlatformRow('TikTok Engine', 'In Sync', 'Active', '#000000')}
                      ${renderPlatformRow('Google Ads', 'Stable', 'Verified', '#4285F4')}
                   </div>
                   <button id="sync-btn" onclick="syncAllPlatforms()" class="w-full mt-8 py-4 bg-[#161b22] border border-[#30363d] text-white text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-[#21262d] transition-all">Re-Sync Satellite Feed</button>
                </div>

                <!-- Ad Library Bridge -->
                <div class="bg-[#0d1117] border border-[#1c2128] rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
                   <div class="flex items-center justify-between mb-6">
                      <h3 class="text-sm font-black text-white uppercase tracking-widest">Asset Repository</h3>
                      <button onclick="window.location.hash='/ads'" class="text-[10px] font-black text-sky-400 uppercase tracking-widest">Access All</button>
                   </div>
                   <div class="grid grid-cols-2 gap-3">
                      <div class="aspect-square bg-[#161b22] rounded-2xl border border-[#30363d] flex flex-col items-center justify-center gap-2 group hover:border-sky-500 transition-all cursor-pointer">
                         <span class="text-2xl group-hover:scale-125 transition-transform">🖼️</span>
                         <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Static</span>
                      </div>
                      <div class="aspect-square bg-[#161b22] rounded-2xl border border-[#30363d] flex flex-col items-center justify-center gap-2 group hover:border-sky-500 transition-all cursor-pointer">
                         <span class="text-2xl group-hover:scale-125 transition-transform">🎥</span>
                         <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Motion</span>
                      </div>
                   </div>
                   <button onclick="window.location.hash='/ads/create'" class="w-full mt-4 py-4 bg-sky-500/10 text-sky-400 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-sky-500 hover:text-black transition-all">Inject New Creative</button>
                </div>
             </div>
          </div>

          <!-- Intelligence Sidebar -->
          <div class="space-y-8">
             <!-- Autonomous Core Monitor -->
             <div class="bg-gradient-to-br from-[#0d1117] to-indigo-900/10 border border-sky-500/20 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/10 blur-[50px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                
                <div class="flex items-start justify-between mb-8">
                   <div class="w-16 h-16 bg-[#161b22] border border-[#30363d] rounded-2xl flex items-center justify-center text-3xl shadow-xl group-hover:rotate-12 transition-transform">🧠</div>
                   <div class="text-right">
                      <div class="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                         <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                         <span class="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Neural Link Active</span>
                      </div>
                   </div>
                </div>

                <h3 class="text-xl font-black text-white uppercase tracking-tight mb-2">Autonomous Agent</h3>
                <p class="text-xs text-slate-500 font-medium mb-8">System User Access: <span class="text-slate-300">Verified Technology Provider</span></p>
                
                <div class="space-y-4 mb-8">
                   ${renderSidebarIntel('Active Rules', '12 Engines', 'sky')}
                   ${renderSidebarIntel('Safety Lock', 'Active', 'emerald')}
                   ${renderSidebarIntel('Next Scan', '14:02s', 'slate')}
                </div>

                <button onclick="window.location.hash='/settings'" class="w-full py-4 bg-white text-black font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-sky-400 transition-all shadow-xl shadow-white/5 active:scale-95">Open Control Tower</button>
             </div>

             <!-- AI Strategic Feed -->
             <div class="bg-[#0d1117] border border-[#1c2128] rounded-[2.5rem] p-8 shadow-xl">
                <h3 class="text-sm font-black text-white uppercase tracking-widest mb-6">Strategic Alerts</h3>
                <div class="space-y-4">
                   <div class="p-4 bg-[#161b22] border-l-4 border-emerald-500 rounded-2xl hover:translate-x-1 transition-transform cursor-pointer">
                      <p class="text-[9px] font-black text-emerald-400 mb-1 uppercase tracking-widest">Scaling Signal</p>
                      <p class="text-[11px] text-white font-bold leading-tight">Meta Campaign "Viral Hook 01" shows stable 4.2x ROAS. Safe to scale +30%.</p>
                   </div>
                   <div class="p-4 bg-[#161b22] border-l-4 border-rose-500 rounded-2xl hover:translate-x-1 transition-transform cursor-pointer">
                      <p class="text-[9px] font-black text-rose-500 mb-1 uppercase tracking-widest">Efficiency Alert</p>
                      <p class="text-[11px] text-white font-bold leading-tight">TikTok CPM has increased by 115%. Recommend budget redistribution.</p>
                   </div>
                   <div class="p-4 bg-[#161b22] border-l-4 border-sky-500 rounded-2xl hover:translate-x-1 transition-transform cursor-pointer">
                      <p class="text-[9px] font-black text-sky-500 mb-1 uppercase tracking-widest">New Intel</p>
                      <p class="text-[11px] text-white font-bold leading-tight">Trending creative pattern found in Beauty niche. Ready for injection.</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    `;
  }).catch(e => {
     el.innerHTML = `<div class="p-10 text-red-500 font-bold uppercase tracking-widest">Error Linking with Core: ${e.message}</div>`;
  });
}

function renderMetricCard(label, value, sub, icon, color) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
  };
  return `
    <div class="bg-[#0d1117] border border-[#1c2128] p-7 rounded-[2rem] shadow-xl hover:border-[#30363d] transition-all relative overflow-hidden group">
      <div class="absolute -right-8 -bottom-8 w-24 h-24 bg-white/5 blur-[20px] rounded-full group-hover:scale-150 transition-transform duration-700"></div>
      <div class="flex items-start justify-between mb-5">
        <div class="w-12 h-12 bg-[#161b22] rounded-xl flex items-center justify-center text-2xl shadow-inner">${icon}</div>
        <div class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${colors[color]}">${sub}</div>
      </div>
      <div>
        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">${label}</p>
        <p class="text-2xl font-black text-white tracking-tight">${value}</p>
      </div>
    </div>
  `;
}

function renderPlatformRow(name, status, version, color) {
  return `
    <div class="flex items-center justify-between p-3 hover:bg-[#161b22] rounded-2xl transition-colors cursor-pointer group">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg" style="background: ${color}20; border: 1px solid ${color}40;"></div>
        <span class="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">${name}</span>
      </div>
      <div class="flex flex-col items-end">
        <span class="text-[9px] font-black text-emerald-400 uppercase tracking-tighter">${status}</span>
        <span class="text-[8px] font-bold text-slate-600 uppercase mt-0.5">${version}</span>
      </div>
    </div>
  `;
}

function renderSidebarIntel(label, value, color) {
  const colors = { sky: 'text-sky-400', emerald: 'text-emerald-400', slate: 'text-slate-400' };
  return `
     <div class="flex justify-between items-center border-b border-[#1c2128] pb-3">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${label}</span>
        <span class="text-xs font-black ${colors[color]} uppercase">${value}</span>
     </div>
  `;
}
