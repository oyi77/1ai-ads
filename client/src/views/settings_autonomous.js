export function renderAutonomousSection() {
  return `
    <div class="space-y-6 animate-fadeIn">
      <div class="flex items-center justify-between mb-2">
        <div>
          <h2 class="text-2xl font-bold text-white tracking-tight">Autonomous Command Center</h2>
          <p class="text-sm text-slate-400">AI-driven campaign optimization and automated decision making.</p>
        </div>
        <div class="flex items-center gap-3">
          <div id="autonomous-indicator" class="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span class="text-[10px] font-bold text-rose-500 uppercase tracking-widest">System Inactive</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Control Panel -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Step 1: Facebook Status -->
          <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl overflow-hidden shadow-xl">
             <div class="p-6 bg-gradient-to-r from-sky-600/10 to-transparent border-b border-[#1c2128] flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center text-sky-500">
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.335 0-1.748.826-1.748 1.675V12h2.77l-.443 2.89h-2.327V21.88C18.343 21.017 22 16.877 22 12z"/></svg>
                  </div>
                  <div>
                    <h3 class="text-white font-bold">Technology Provider Connection</h3>
                    <p class="text-xs text-slate-500">Status of Meta Business API integration</p>
                  </div>
                </div>
                <div id="fb-connection-badge">
                   <span class="px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg text-xs font-bold uppercase tracking-tight">System Active</span>
                </div>
             </div>
             
             <div class="p-6">
                <div class="flex flex-col md:flex-row gap-4 items-center">
                  <div class="flex-1">
                    <p class="text-sm text-slate-300 leading-relaxed font-medium">Your AdForge instance is successfully connected to BerkahKarya's Meta Technology Provider profile.</p>
                    <p class="text-xs text-slate-500 mt-1">Using System User Token: EAAKA2...ZDZD</p>
                  </div>
                  <button id="fb-reconnect-btn" class="px-6 py-2.5 bg-[#161b22] hover:bg-[#1c2128] border border-[#30363d] text-white rounded-xl text-sm font-bold transition-all">🔄 Rotate Token</button>
                </div>
             </div>
          </div>

          <!-- Step 2: Rule Engine -->
          <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl overflow-hidden shadow-xl">
             <div class="p-6 border-b border-[#1c2128]">
                <h3 class="text-white font-bold">Automation Logic Builder</h3>
                <p class="text-xs text-slate-500 mt-1">Define triggers that AI will use to manage your spend</p>
             </div>
             
             <div class="p-6 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                   <div class="md:col-span-2">
                     <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Rule Objective</label>
                     <input type="text" id="rule-name" placeholder="e.g., Protect Budget on low ROAS" class="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-2.5 text-sm focus:border-sky-500 outline-none">
                   </div>
                   <div>
                     <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Metric</label>
                     <select id="rule-condition" class="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-2.5 text-sm focus:border-sky-500 outline-none">
                        <option value="roas">ROAS</option>
                        <option value="cpa">CPA</option>
                        <option value="spend">Daily Spend</option>
                        <option value="ctr">CTR</option>
                     </select>
                   </div>
                   <div>
                     <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Threshold</label>
                     <input type="number" id="rule-condition-value" placeholder="e.g., 2.0" class="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-2.5 text-sm focus:border-sky-500 outline-none">
                   </div>
                </div>

                <div class="pt-4 border-t border-[#1c2128]">
                   <label class="block text-[10px] font-bold text-slate-500 uppercase mb-3 text-center">AI Executive Action</label>
                   <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                      ${renderActionOption('scale_up', '🚀 Scale Up', 'Increase budget 1.5x')}
                      ${renderActionOption('scale_down', '📉 Scale Down', 'Decrease budget 0.8x')}
                      ${renderActionOption('pause', '🛑 Pause', 'Stop campaign')}
                      ${renderActionOption('optimize', '✨ Optimize', 'AI-led rotation')}
                   </div>
                </div>

                <div class="pt-6 flex justify-end">
                   <button id="save-rule-btn" class="px-8 py-3 bg-sky-500 hover:bg-sky-400 text-black font-extrabold rounded-xl transition-all shadow-lg shadow-sky-500/20">Suntik Rule ke AI</button>
                </div>
             </div>

             <div id="rules-list" class="bg-[#05070a]/50 p-6 divide-y divide-[#1c2128]">
                <!-- Rules list items -->
                <div class="py-3 flex items-center justify-between group">
                   <div class="flex items-center gap-4">
                      <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <div>
                        <p class="text-sm font-bold text-white">Protect Capital Level 1</p>
                        <p class="text-[10px] text-slate-500 uppercase">IF <span class="text-sky-400">ROAS < 1.5</span> THEN <span class="text-rose-400">PAUSE</span></p>
                      </div>
                   </div>
                   <button class="opacity-0 group-hover:opacity-100 p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all">🗑️</button>
                </div>
             </div>
          </div>
        </div>

        <!-- Sidebar Config -->
        <div class="space-y-6">
          <!-- Global Kill Switch -->
          <div class="bg-gradient-to-br from-[#0d1117] to-indigo-900/10 border border-indigo-500/20 rounded-2xl p-6 shadow-2xl">
             <h3 class="text-white font-bold text-lg mb-2">Master Activation</h3>
             <p class="text-xs text-slate-400 mb-6">AI will only execute actions in "Full Autonomy" mode. Manual mode only generates alerts.</p>
             
             <div class="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-[#30363d] mb-4">
                <span class="text-sm font-bold text-white">Full Autonomy</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="autonomy-toggle" class="sr-only peer">
                  <div class="w-14 h-7 bg-[#1c2128] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white"></div>
                </label>
             </div>
             <p id="autonomy-feedback" class="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Engine Status: Standby</p>
             
             <button id="start-autonomous" class="w-full mt-6 py-4 bg-white text-black font-black rounded-2xl hover:bg-emerald-400 transition-all active:scale-95 shadow-xl">ACTIVATE ENGINE</button>
          </div>

          <!-- Logs -->
          <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl p-6 h-80 flex flex-col shadow-xl">
             <h3 class="text-white font-bold text-sm mb-4 flex items-center gap-2">📑 Live Execution Log</h3>
             <div class="flex-1 overflow-y-auto font-mono text-[10px] space-y-2 text-slate-400">
                <div class="text-emerald-500">[20:42:01] System user token validated.</div>
                <div class="text-sky-500">[21:15:30] Scanning 87 accounts for ROAS drift...</div>
                <div class="text-slate-500">[22:30:15] No rule matches. Current spend protected.</div>
                <div class="animate-pulse">_</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderActionOption(value, label, desc) {
  return `
    <label class="block cursor-pointer group">
      <input type="radio" name="rule-action" value="${value}" class="peer hidden">
      <div class="h-full p-3 rounded-xl border border-[#30363d] bg-[#161b22] group-hover:border-sky-500/50 peer-checked:border-sky-500 peer-checked:bg-sky-500/5 transition-all text-center">
        <p class="text-xs font-bold text-white mb-1">${label}</p>
        <p class="text-[9px] text-slate-500 leading-tight">${desc}</p>
      </div>
    </label>
  `;
}
