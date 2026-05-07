function renderAutonomousSection() {
  return `
    <h2 class="text-2xl font-bold mb-6 text-white">Autonomous Campaign Manager</h2>
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <!-- Header -->
      <div class="p-6 bg-[#1c2128] border-b border-[#30363d]">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-bold text-white">Campaign Auto-Monitoring</h3>
            <p class="text-xs text-slate-400 mt-1">AI-powered campaigns that monitor, decide, and act automatically</p>
          </div>
          <button id="start-autonomous" class="bg-[#238636] text-white px-6 py-2 rounded-lg font-bold">Start Monitoring</button>
        </div>
        <div id="autonomous-status" class="mt-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-red-500"></span>
          <span class="text-sm text-slate-300">Stopped</span>
        </div>
      </div>

      <!-- Connect Facebook Section -->
      <div class="p-6 border-b border-[#30363d]">
        <h4 class="font-bold text-white mb-4">1. Connect Your Facebook Account</h4>
        <div class="bg-[#0d1117] p-4 rounded-lg border border-[#30363d]">
          <p class="text-xs text-slate-400 mb-3">Connect your Meta Business Account to manage campaigns</p>
          <button id="fb-connect-btn" class="bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <svg class="inline w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.335 0-1.748.826-1.748 1.675V12h2.77l-.443 2.89h-2.327V21.88C18.343 21.017 22 16.877 22 12z"/>
            </svg>
            Connect with Facebook
          </button>
          <div id="fb-connect-status" class="mt-2 text-xs text-slate-500"></div>
        </div>
      </div>

      <!-- Account Selection -->
      <div class="p-6 border-b border-[#30363d]">
        <h4 class="font-bold text-white mb-4">2. Select Accounts to Manage</h4>
        <div id="fb-accounts-container" class="space-y-2">
          <div class="text-sm text-slate-500 italic">Connect Facebook account first to see accounts</div>
        </div>
      </div>

      <!-- Rules Builder -->
      <div class="p-6">
        <h4 class="font-bold text-white mb-4">3. Create Automation Rules</h4>
        <div class="bg-[#0d1117] p-4 rounded-lg border border-[#30363d]">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">Rule Name</label>
              <input type="text" id="rule-name" placeholder="e.g., Scale ROAS > 3 campaigns" class="w-full p-2 bg-[#161b22] rounded border border-[#30363d] text-sm text-white">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">Priority</label>
              <select id="rule-priority" class="w-full p-2 bg-[#161b22] rounded border border-[#30363d] text-sm text-white">
                <option value="1">High</option>
                <option value="2">Medium</option>
                <option value="3">Low</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">Condition Type</label>
              <select id="rule-condition-type" class="w-full p-2 bg-[#161b22] rounded border border-[#30363d] text-sm text-white">
                <option value="roas">ROAS</option>
                <option value="spend">Spend</option>
                <option value="cpm">CPM</option>
                <option value="status">Status</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">Condition</label>
              <select id="rule-condition-op" class="w-full p-2 bg-[#161b22] rounded border border-[#30363d] text-sm text-white">
                <option value=">">More than</option>
                <option value="<">Less than</option>
                <option value=">=">At least</option>
                <option value="<="">At most</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">Threshold</label>
              <input type="number" id="rule-condition-value" placeholder="e.g., 2.0" class="w-full p-2 bg-[#161b22] rounded border border-[#30363d] text-sm text-white">
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-xs font-bold text-slate-500 mb-1">Action</label>
            <select id="rule-action" class="w-full p-2 bg-[#161b22] rounded border border-[#30363d] text-sm text-white">
              <option value="scale_up">Scale Up (1.5x budget)</option>
              <option value="scale_down">Scale Down (0.8x budget)</option>
              <option value="pause">Pause Campaign</option>
              <option value="resume">Resume Campaign</option>
              <option value="optimize_creative">Optimize Creative</option>
              <option value="optimize_budget">Optimize Budget</option>
            </select>
          </div>

          <button id="save-rule-btn" class="bg-[#238636] text-white text-sm font-bold px-6 py-2 rounded-lg mr-2">
            + Add Rule
          </button>
          <button id="test-rules-btn" class="bg-[#21262d] text-slate-300 text-sm font-bold px-6 py-2 rounded-lg">
            Test Rules
          </button>
        </div>

        <div id="rules-list" class="mt-6 space-y-3">
          <!-- Rules will be loaded here -->
        </div>
      </div>

      <!-- Autonomy Switch -->
      <div class="p-6 bg-[#0d1117] border-t border-[#30363d]">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-bold text-white">Full Autonomy Mode</h4>
            <p class="text-xs text-slate-400 mt-1">AI will automatically execute actions without asking for approval</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="autonomy-toggle" class="sr-only peer">
            <div class="w-11 h-6 bg-[#30363d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:border-gray-600 peer-checked:bg-[#238636]"></div>
          </label>
        </div>
        <div id="autonomy-feedback" class="mt-3 text-xs text-slate-500">AI Mode: OFF</div>
      </div>
    </div>
  `;
}
