import { esc } from '../lib/escape.js';

export async function renderDocs(el) {
  el.innerHTML = `
    <div class="bg-[#0d1117] min-h-screen text-[#c9d1d9] font-sans pb-20">
      <div class="max-w-4xl mx-auto px-4 py-12">
        <header class="mb-12 border-b border-[#30363d] pb-8">
          <h1 class="text-4xl font-extrabold text-white mb-4 text-sky-400">Documentation</h1>
          <p class="text-xl text-slate-400">Learn how to automate AdForge using AI agents and OpenClaw.</p>
        </header>

        <section class="mb-16">
          <h2 class="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span class="w-8 h-8 bg-sky-500/10 text-sky-400 rounded-lg flex items-center justify-center text-sm">1</span>
            Integrating with OpenClaw
          </h2>
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-6">
            <p class="mb-4">AdForge is fully compatible with the <strong>Model Context Protocol (MCP)</strong>. This means you can connect it to OpenClaw, Claude Code, or any MCP-enabled agent to manage your ads via natural language.</p>
            
            <h3 class="text-lg font-bold text-white mb-3">Setup Instructions</h3>
            <ol class="space-y-4 text-slate-400 list-decimal list-inside ml-2">
              <li>Ensure you have the latest version of <strong>OpenClaw</strong> or <strong>Claude Code</strong> installed.</li>
              <li>Open your MCP configuration file (usually <code>~/.config/Claude/claude_desktop_config.json</code> or your OpenClaw environment settings).</li>
              <li>Add the AdForge MCP server configuration provided below.</li>
            </ol>
          </div>

          <div class="relative group">
            <div class="absolute -inset-1 bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
            <div class="relative bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden">
              <div class="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
                <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">MCP Configuration (JSON)</span>
                <button id="copy-mcp-btn" class="text-xs text-sky-400 hover:text-sky-300 font-bold transition-colors">Copy Code</button>
              </div>
              <pre class="p-6 overflow-x-auto text-sm font-mono text-emerald-400"><code>{
  "mcpServers": {
    "adforge": {
      "command": "node",
      "args": ["/home/openclaw/projects/adforge/mcp.js"],
      "env": {
        "DB_PATH": "/home/openclaw/projects/adforge/db/adforge.db"
      }
    }
  }
}</code></pre>
            </div>
          </div>
          <p class="mt-4 text-xs text-slate-500 italic text-center">* Note: Ensure the path to <code>mcp.js</code> is correct for your local installation.</p>
        </section>

        <section class="mb-16">
          <h2 class="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span class="w-8 h-8 bg-sky-500/10 text-sky-400 rounded-lg flex items-center justify-center text-sm">2</span>
            Available Tools
          </h2>
          <p class="text-slate-400 mb-6">Once connected, your AI agent will have access to the following specialized tools:</p>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="bg-[#161b22] border border-[#30363d] p-5 rounded-xl">
              <h4 class="font-bold text-white mb-2 text-emerald-400">adforge_list_campaigns</h4>
              <p class="text-sm text-slate-400">Fetch all active campaigns and their performance data (Spend, Revenue, ROAS) across Meta, Google, and TikTok.</p>
            </div>
            <div class="bg-[#161b22] border border-[#30363d] p-5 rounded-xl">
              <h4 class="font-bold text-white mb-2 text-emerald-400">adforge_get_analytics</h4>
              <p class="text-sm text-slate-400">Deep-dive into a specific campaign's metrics to identify scaling opportunities or budget leaks.</p>
            </div>
            <div class="bg-[#161b22] border border-[#30363d] p-5 rounded-xl">
              <h4 class="font-bold text-white mb-2 text-emerald-400">adforge_list_landing_pages</h4>
              <p class="text-sm text-slate-400">Review all generated landing pages, their status, and their assigned themes/slugs.</p>
            </div>
            <div class="bg-[#161b22] border border-[#30363d] p-5 rounded-xl">
              <h4 class="font-bold text-white mb-2 text-emerald-400">adforge_list_creatives</h4>
              <p class="text-sm text-slate-400">Retrieve all AI-generated ad copy variations and creative assets stored in the platform.</p>
            </div>
          </div>
        </section>

        <section>
          <div class="bg-gradient-to-br from-[#161b22] to-[#0d1117] border border-[#58a6ff]/30 rounded-2xl p-8 text-center">
            <h2 class="text-2xl font-bold text-white mb-4">Need help?</h2>
            <p class="text-slate-400 mb-6 max-w-xl mx-auto">If you're having trouble connecting AdForge to your AI agent, check the server logs in PM2 or reach out to our technical support team.</p>
            <div class="flex justify-center gap-4">
               <a href="#/" class="bg-[#21262d] hover:bg-[#30363d] text-white px-6 py-3 rounded-lg font-bold transition-all border border-[#30363d]">Back to Dashboard</a>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  el.querySelector('#copy-mcp-btn')?.addEventListener('click', (e) => {
    const code = el.querySelector('pre code')?.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      const btn = e.target;
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('text-emerald-400');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('text-emerald-400');
      }, 2000);
    }
  });
}
