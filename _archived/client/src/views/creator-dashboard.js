import { api } from '../lib/api.js';

export function renderCreatorDashboard(el) {
  let state = {
    currentTab: 'targeting',
    product: '',
    target: '',
    keunggulan: '',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 50000,
    landingUrl: '',
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
      const response = await api.get('/settings/accounts');
      state.accounts = Array.isArray(response.data) ? response.data.filter(a => a.platform === 'meta') : [];
    } catch (e) {
      console.error('Load accounts error:', e);
    }
    state.loading = false;
    render();
  }

  function render() {
    const tabs = [
      { id: 'targeting', label: 'Strategy', icon: '🎯' },
      { id: 'creative', label: 'AI Creative', icon: '✨' },
      { id: 'campaign', label: 'Budget', icon: '💰' },
      { id: 'review', label: 'Review & Launch', icon: '🚀' }
    ];

    el.innerHTML = `
      <div class="max-w-6xl mx-auto p-6 animate-fadeIn">
        <div class="flex items-center justify-between mb-10">
          <div>
            <h1 class="text-3xl font-black text-white tracking-tighter uppercase">Campaign Architect</h1>
            <p class="text-sm text-slate-500 mt-1 font-medium">Build high-ROAS marketing funnels with AI precision.</p>
          </div>
          <button id="refresh-accounts" class="p-2 border border-[#1c2128] rounded-xl hover:bg-[#161b22] transition-colors">🔄</button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <!-- Stepper Sidebar -->
           <div class="space-y-2">
              ${tabs.map((t, i) => `
                <div class="flex items-center gap-4 p-4 rounded-2xl border transition-all ${state.currentTab === t.id ? 'bg-sky-500/10 border-sky-500/50 shadow-lg shadow-sky-500/5' : 'border-transparent text-slate-500'}">
                   <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold ${state.currentTab === t.id ? 'bg-sky-500 text-black' : 'bg-[#0d1117] border border-[#1c2128]'}">
                      ${state.currentTab === t.id ? t.icon : i + 1}
                   </div>
                   <div>
                      <p class="text-xs font-black uppercase tracking-widest leading-none">${t.label}</p>
                      <p class="text-[10px] mt-1 font-bold ${state.currentTab === t.id ? 'text-sky-400' : 'text-slate-600'}">${t.id === 'targeting' ? 'Define Audience' : t.id === 'creative' ? 'Gen Copy' : t.id === 'campaign' ? 'Set Limits' : 'Final Check'}</p>
                   </div>
                </div>
              `).join('')}
           </div>

           <!-- Content Area -->
           <div class="lg:col-span-3 bg-[#0d1117] border border-[#1c2128] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div class="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full"></div>
              ${renderTabContent()}
           </div>
        </div>
      </div>
    `;

    attachListeners();
  }

  function renderTabContent() {
    switch (state.currentTab) {
      case 'targeting': return renderTargetingTab();
      case 'creative': return renderCreativeTab();
      case 'campaign': return renderCampaignTab();
      case 'review': return renderReviewTab();
    }
  }

  function renderTargetingTab() {
    return `
      <div class="space-y-8 relative z-10">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div class="space-y-2">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Ad Account</label>
              <select id="tb-account" class="w-full bg-[#161b22] border border-[#1c2128] rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-sky-500">
                <option value="">-- Choose Meta Account --</option>
                ${state.accounts.map(acc => `<option value="${acc.id}" ${state.selectedAccount === acc.id ? 'selected' : ''}>${acc.account_name}</option>`).join('')}
              </select>
           </div>
           <div class="space-y-2">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Campaign Objective</label>
              <select id="tb-objective" class="w-full bg-[#161b22] border border-[#1c2128] rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-sky-500">
                <option value="OUTCOME_SALES" ${state.objective === 'OUTCOME_SALES' ? 'selected' : ''}>Sales & Conversion</option>
                <option value="OUTCOME_TRAFFIC" ${state.objective === 'OUTCOME_TRAFFIC' ? 'selected' : ''}>Website Traffic</option>
                <option value="OUTCOME_AWARENESS" ${state.objective === 'OUTCOME_AWARENESS' ? 'selected' : ''}>Awareness</option>
              </select>
           </div>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identify Your Product / Offer</label>
          <input type="text" id="tb-product" value="${state.product}" placeholder="e.g., JendralBot AI Marketing Pro" class="w-full bg-[#161b22] border border-[#1c2128] rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-sky-500">
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Audience Prompt</label>
          <textarea id="tb-target" rows="3" placeholder="e.g., Small business owners in Indonesia, interest in digital marketing and automation, age 25-45." class="w-full bg-[#161b22] border border-[#1c2128] rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-sky-500 resize-none">${state.target}</textarea>
        </div>

        <div class="flex justify-end pt-4">
           <button id="next-step" class="px-10 py-4 bg-sky-500 hover:bg-sky-400 text-black font-black rounded-2xl transition-all shadow-xl shadow-sky-500/20 active:scale-95">PROCEED TO CREATIVE -></button>
        </div>
      </div>
    `;
  }

  function renderCreativeTab() {
     return `
        <div class="space-y-8 animate-fadeIn">
           <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6 flex items-start gap-4">
              <span class="text-2xl">🤖</span>
              <div>
                 <h4 class="text-indigo-400 font-black text-sm uppercase">AI Engine Ready</h4>
                 <p class="text-xs text-slate-400 mt-1">Our neural engine will analyze your product and audience to generate high-conversion ad copies.</p>
              </div>
           </div>

           <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-4">
                 <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Input Controls</h4>
                 <div class="p-6 bg-[#05070a] border border-[#1c2128] rounded-3xl space-y-4">
                    <div class="text-xs">
                       <span class="text-slate-500">Targeting:</span>
                       <span class="text-sky-400 font-bold ml-2">${state.target || 'Not defined'}</span>
                    </div>
                    <button id="gen-creative-btn" class="w-full py-4 bg-gradient-to-r from-indigo-600 to-sky-600 text-white font-black rounded-2xl hover:scale-[1.02] shadow-xl transition-all">GENERATE AI COPIES</button>
                 </div>
              </div>

              <div class="space-y-4">
                 <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ad Live Preview</h4>
                 <div class="p-6 bg-white rounded-3xl text-slate-900 border-b-8 border-slate-200">
                    <div class="flex items-center gap-2 mb-4">
                       <div class="w-8 h-8 bg-slate-200 rounded-full"></div>
                       <div>
                          <div class="w-24 h-2 bg-slate-200 rounded-full mb-1"></div>
                          <div class="w-16 h-1.5 bg-slate-100 rounded-full"></div>
                       </div>
                    </div>
                    <div class="space-y-3">
                       <p id="preview-hook" class="font-bold text-lg leading-tight">${state.creative?.hook || 'Your viral hook will appear here...'}</p>
                       <p id="preview-body" class="text-sm text-slate-600 line-clamp-3">${state.creative?.body || 'Compelling ad body focused on benefits.'}</p>
                       <div class="w-full aspect-video bg-slate-100 rounded-xl flex items-center justify-center text-slate-300 font-bold border-2 border-dashed">Visual Meta Data</div>
                       <div class="flex items-center justify-between pt-2">
                          <div>
                             <p class="text-[10px] font-bold text-slate-400 uppercase">Call to action</p>
                             <p class="text-sm font-black text-indigo-600 uppercase">${state.creative?.cta || 'LEARN MORE'}</p>
                          </div>
                          <button class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase">Action</button>
                       </div>
                    </div>
                 </div>
              </div>
           </div>

           <div class="flex justify-between pt-8 border-t border-[#1c2128]">
              <button id="prev-step" class="px-8 py-3 bg-[#161b22] text-slate-400 font-bold rounded-2xl hover:text-white transition-all">Back</button>
              <button id="next-step" class="px-10 py-4 bg-sky-500 text-black font-black rounded-2xl shadow-xl shadow-sky-500/20 active:scale-95">GO TO BUDGET -></button>
           </div>
        </div>
     `;
  }

  function renderCampaignTab() {
     return `
       <div class="space-y-8 animate-fadeIn">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div class="space-y-6">
                <div class="space-y-2">
                  <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Destination URL (Tracking)</label>
                  <input type="url" id="cp-url" value="${state.landingUrl}" placeholder="https://lynk.id/jendralbot/..." class="w-full bg-[#161b22] border border-[#1c2128] rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-sky-500">
                </div>
                <div class="space-y-2">
                  <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Daily Budget (IDR)</label>
                  <div class="relative">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black">Rp</span>
                    <input type="number" id="cp-budget" value="${state.dailyBudget}" class="w-full bg-[#161b22] border border-[#1c2128] rounded-2xl p-4 pl-12 text-lg font-black text-white outline-none focus:border-sky-500">
                  </div>
                </div>
             </div>

             <div class="p-6 bg-gradient-to-br from-sky-400/10 to-indigo-500/10 border border-sky-500/20 rounded-3xl flex flex-col justify-center">
                <h4 class="text-white font-black text-center mb-6 uppercase tracking-tighter">Performance Prediction</h4>
                <div class="space-y-4">
                   <div class="flex justify-between border-b border-[#1c2128] pb-2">
                      <span class="text-xs text-slate-400">Est. Daily Reach</span>
                      <span class="text-sm font-black text-white">4.2k - 12.8k</span>
                   </div>
                   <div class="flex justify-between border-b border-[#1c2128] pb-2">
                      <span class="text-xs text-slate-400">Est. Link Clicks</span>
                      <span class="text-sm font-black text-sky-400">120 - 450</span>
                   </div>
                   <div class="flex justify-between">
                      <span class="text-xs text-slate-400 font-black text-emerald-400 uppercase">Projected ROAS</span>
                      <span class="text-lg font-black text-emerald-400">3.4x</span>
                   </div>
                </div>
             </div>
          </div>

          <div class="flex justify-between pt-8 border-t border-[#1c2128]">
              <button id="prev-step" class="px-8 py-3 bg-[#161b22] text-slate-400 font-bold rounded-2xl hover:text-white">Back</button>
              <button id="next-step" class="px-10 py-4 bg-sky-500 text-black font-black rounded-2xl shadow-xl shadow-sky-500/20 active:scale-95">FINAL REVIEW -></button>
           </div>
       </div>
     `;
  }

  function renderReviewTab() {
     return `
       <div class="space-y-8 animate-fadeIn text-center">
          <div class="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">🚀</div>
          <h2 class="text-3xl font-black text-white tracking-tighter uppercase">Ready for Deployment</h2>
          <p class="max-w-md mx-auto text-slate-400 text-sm">Your campaign strategy is primed. AI monitoring will activate 5 minutes after launch.</p>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-8 bg-[#05070a] border border-[#1c2128] rounded-3xl text-left">
             <div>
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Account</p>
                <p class="text-xs font-bold text-white truncate">${state.accounts.find(a => a.id === state.selectedAccount)?.account_name || 'Personal'}</p>
             </div>
             <div>
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Objective</p>
                <p class="text-xs font-bold text-sky-400 uppercase">${state.objective.replace('OUTCOME_', '')}</p>
             </div>
             <div>
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Daily Limit</p>
                <p class="text-xs font-bold text-emerald-400">Rp ${state.dailyBudget.toLocaleString()}</p>
             </div>
             <div>
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">AI Status</p>
                <p class="text-xs font-bold text-indigo-400">Autonomous</p>
             </div>
          </div>

          <div class="flex items-center gap-4 pt-8">
              <button id="prev-step" class="flex-1 py-4 bg-[#161b22] text-slate-400 font-black rounded-2xl hover:text-white transition-all">EDIT PLAN</button>
              <button id="launch-btn" class="flex-[3] py-5 bg-white text-black font-black rounded-2xl hover:bg-sky-400 shadow-2xl transition-all transform hover:scale-[1.01] active:scale-95 uppercase tracking-tighter text-xl">LAUNCH TO META NETWORK</button>
          </div>
       </div>
     `;
  }

  function attachListeners() {
    el.querySelector('#refresh-accounts')?.addEventListener('click', loadAccounts);
    
    el.querySelector('#tb-account')?.addEventListener('change', (e) => state.selectedAccount = e.target.value);
    el.querySelector('#tb-product')?.addEventListener('input', (e) => state.product = e.target.value);
    el.querySelector('#tb-target')?.addEventListener('input', (e) => state.target = e.target.value);
    el.querySelector('#tb-objective')?.addEventListener('change', (e) => state.objective = e.target.value);

    el.querySelector('#gen-creative-btn')?.addEventListener('click', async (e) => {
       const btn = e.target;
       btn.textContent = 'Neural Processing...';
       btn.disabled = true;
       try {
          const res = await api.post('/campaigns/creative', { product: state.product, target: state.target });
          if(res.data?.copies) {
             state.creative = res.data.copies[0];
             render();
          }
       } catch(err) {
          alert('AI Busy: ' + err.message);
          btn.textContent = 'GENERATE AI COPIES';
          btn.disabled = false;
       }
    });

    el.querySelector('#cp-url')?.addEventListener('input', (e) => state.landingUrl = e.target.value);
    el.querySelector('#cp-budget')?.addEventListener('input', (e) => state.dailyBudget = parseInt(e.target.value));

    el.querySelector('#launch-btn')?.addEventListener('click', async (e) => {
       const btn = e.target;
       btn.textContent = 'ESTABLISHING CONNECTION...';
       btn.disabled = true;
       try {
          const res = await api.post('/campaigns/create', { 
            accountId: state.selectedAccount, 
            dailyBudget: state.dailyBudget,
            creative: state.creative,
            product: state.product
          });
          alert('SUCCESS: Campaign ID ' + res.data?.campaignId + ' is now live.');
          window.location.hash = '#/';
       } catch(err) {
          alert('Launch Error: ' + err.message);
          btn.textContent = 'LAUNCH TO META NETWORK';
          btn.disabled = false;
       }
    });

    el.querySelectorAll('#next-step').forEach(b => b.addEventListener('click', () => {
       const sequence = ['targeting', 'creative', 'campaign', 'review'];
       state.currentTab = sequence[sequence.indexOf(state.currentTab) + 1] || 'targeting';
       render();
    }));
    el.querySelectorAll('#prev-step').forEach(b => b.addEventListener('click', () => {
       const sequence = ['targeting', 'creative', 'campaign', 'review'];
       state.currentTab = sequence[sequence.indexOf(state.currentTab) - 1] || 'targeting';
       render();
    }));
  }

  loadAccounts();
}
