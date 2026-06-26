import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export function renderIntegrationsSection(state) {
  const { enabled } = state.integrations.adspirer || {};
  const { connected } = state.adspirerStatus || {};

  return `
    <h2 class="text-2xl font-bold mb-6 text-white">Integrations</h2>
    <div class="grid gap-6">
      <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div class="p-6 border-b border-[#30363d] flex items-center justify-between bg-[#1c2128]">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 bg-[#0d1117] rounded-lg flex items-center justify-center border border-[#30363d] font-bold text-sky-400">A</div>
            <div>
              <h3 class="font-bold text-white">Adspirer</h3>
              <p class="text-xs text-slate-400">MCP-powered ad management across Google, Meta, TikTok & LinkedIn</p>
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="adspirer-toggle" ${enabled ? 'checked' : ''} class="sr-only peer">
            <div class="w-11 h-6 bg-[#30363d] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#238636]"></div>
          </label>
        </div>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-400">Status:</span>
            ${enabled
              ? connected
                ? '<span class="inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span> connected</span>'
                : '<span class="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span> enabled (not connected)</span>'
              : '<span class="inline-flex items-center gap-1.5 text-xs bg-slate-500/10 text-slate-400 px-2.5 py-1 rounded-full border border-slate-500/20"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span> disabled</span>'}
          </div>
          <p class="text-sm text-slate-400">
            ${enabled
              ? connected
                ? 'Adspirer is connected and ready to use.'
                : 'Adspirer is enabled but not connected. Check your API keys.'
              : 'Enable Adspirer to manage your ads across multiple platforms.'}
          </p>
          ${enabled && !connected ? `
          <div class="pt-4 border-t border-[#30363d]">
            <button id="adspirer-connect-btn" class="bg-[#238636] text-white px-4 py-2 rounded-lg text-sm font-bold">Connect Adspirer</button>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

export function bindIntegrationsSection(el, state, { loadData, render }) {
  const attachIntegrationsHandlers = () => {
    // Adspirer Toggle
    el.querySelector('#adspirer-toggle')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        await api.put('/settings/integrations/adspirer', { enabled });
        await loadData();
        render();
      } catch (err) {
        alert('Failed to update Adspirer integration: ' + err.message);
      }
    });

    // Adspirer Connect
    el.querySelector('#adspirer-connect-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.post('/adspirer/connect');
        if (res.success) {
          await loadData();
          render();
        } else {
          alert('Connection failed: ' + (res.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Connection failed: ' + err.message);
      }
    });
  };

  attachIntegrationsHandlers();
}