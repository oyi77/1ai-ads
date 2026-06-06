import { esc } from '../lib/escape.js';

export function renderMetaAiSection() {
  return `
    <h2 class="text-2xl font-bold mb-6 text-white">Meta AI for Business (MAIBA)</h2>
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="text-sm text-slate-400">
            <a href="/#/meta-ai" class="text-sky-400 hover:underline font-bold">Open Meta AI chat →</a>
          </p>
          <p class="text-xs text-slate-500 mt-1">Status: <span id="meta-ai-status" class="text-slate-300">checking…</span></p>
        </div>
        <div class="flex gap-2">
          <button id="meta-ai-test" class="text-xs bg-[#21262d] text-slate-300 border border-[#30363d] px-3 py-1.5 rounded-md">Test</button>
          <button id="meta-ai-clear" class="text-xs bg-red-900/30 text-red-300 border border-red-700/50 px-3 py-1.5 rounded-md">Clear</button>
        </div>
      </div>

      <form id="meta-ai-form" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Default Ad Account ID</label>
          <input type="text" id="meta-ai-account" placeholder="e.g. 1181078009580337" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm font-mono">
          <p class="text-xs text-slate-500 mt-1">Used as default context for Meta AI chat. Override per-message in the chat view.</p>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">adsmanager.facebook.com Cookies</label>
          <textarea id="meta-ai-cookies" rows="6" placeholder="Paste the 'cookie' header from DevTools → Network → any adsmanager.facebook.com request" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-xs font-mono"></textarea>
          <p class="text-xs text-slate-500 mt-1">
            <strong class="text-amber-400">Risk:</strong> Cookies grant full Facebook access. Stored in settings table. Never share.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" class="bg-[#58a6ff] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#79c0ff]">Save Configuration</button>
          <span id="meta-ai-result" class="text-xs"></span>
        </div>
      </form>
    </div>
  `;
}

export function bindMetaAiSection(el, state, rerender) {
  const attachMetaAiHandlers = () => {
    api.get('/meta-ai/status').then(({ data }) => {
      const el = document.getElementById('meta-ai-status');
      if (el) el.innerHTML = data.configured
        ? `<span class="text-emerald-400">✓ configured (source: ${esc(data.source)})</span>`
        : `<span class="text-amber-400">⚠ not configured — paste cookies below</span>`;
    }).catch(() => {});

    el.querySelector('#meta-ai-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cookies = el.querySelector('#meta-ai-cookies').value.trim();
      const adAccountId = el.querySelector('#meta-ai-account').value.trim();
      const result = el.querySelector('#meta-ai-result');
      result.textContent = 'Saving…';
      result.className = 'text-xs text-slate-400';
      try {
        await api.put('/meta-ai/config', { cookies: cookies || undefined, adAccountId: adAccountId || undefined });
        result.textContent = '✓ saved';
        result.className = 'text-xs text-emerald-400';
        const status = await api.get('/meta-ai/status');
        const statusEl = document.getElementById('meta-ai-status');
        if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400">✓ configured (source: ${esc(status.data.source)})</span>`;
      } catch (err) {
        result.textContent = '✗ ' + err.message;
        result.className = 'text-xs text-red-400';
      }
    });

    el.querySelector('#meta-ai-clear')?.addEventListener('click', async () => {
      if (!confirm('Clear Meta AI cookies and ad account from server?')) return;
      try {
        await api.del('/meta-ai/config');
        el.querySelector('#meta-ai-cookies').value = '';
        el.querySelector('#meta-ai-account').value = '';
        const status = await api.get('/meta-ai/status');
        const statusEl = document.getElementById('meta-ai-status');
        if (statusEl) statusEl.innerHTML = `<span class="text-amber-400">⚠ not configured</span>`;
        el.querySelector('#meta-ai-result').textContent = '✓ cleared';
        el.querySelector('#meta-ai-result').className = 'text-xs text-emerald-400';
      } catch (err) {
        alert('Failed to clear: ' + err.message);
      }
    });

    el.querySelector('#meta-ai-test')?.addEventListener('click', async () => {
      const result = el.querySelector('#meta-ai-result');
      result.textContent = 'Testing…';
      result.className = 'text-xs text-slate-400';
      try {
        const { data } = await api.post('/meta-ai/chat', { message: 'ping' });
        result.textContent = '✓ connection works';
        result.className = 'text-xs text-emerald-400';
      } catch (err) {
        result.textContent = '✗ ' + err.message;
        result.className = 'text-xs text-red-400';
      }
    });
  };

  attachMetaAiHandlers();
}