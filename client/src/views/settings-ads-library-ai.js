import { esc } from '../lib/escape.js';

export function renderAdsLibraryAiSection() {
  return `
    <h2 class="text-2xl font-bold mb-6 text-white">Ads Library AI (Browser Session)</h2>
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="text-sm text-slate-400">
            <a href="/#/ads-library-ai" class="text-sky-400 hover:underline font-bold">Open Ads Library search →</a>
          </p>
          <p class="text-xs text-slate-500 mt-1">Status: <span id="adslib-status" class="text-slate-300">checking…</span></p>
        </div>
        <div class="flex gap-2">
          <button id="adslib-test" class="text-xs bg-[#21262d] text-slate-300 border border-[#30363d] px-3 py-1.5 rounded-md">Test</button>
          <button id="adslib-clear" class="text-xs bg-red-900/30 text-red-300 border border-red-700/50 px-3 py-1.5 rounded-md">Clear</button>
        </div>
      </div>

      <form id="adslib-form" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">www.facebook.com Cookies</label>
          <textarea id="adslib-cookies" rows="6" placeholder="Paste the 'cookie' header from DevTools → Network → any www.facebook.com request" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-xs font-mono"></textarea>
          <p class="text-xs text-slate-500 mt-1">
            <strong class="text-amber-400">Risk:</strong> Same as Meta AI — cookies grant full Facebook access. Stored in settings table. Never share.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button type="submit" class="bg-[#58a6ff] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#79c0ff]">Save Configuration</button>
          <span id="adslib-result" class="text-xs"></span>
        </div>
      </form>
    </div>
  `;
}

export function bindAdsLibraryAiSection(el, state, rerender) {
  const attachAdsLibraryAiHandlers = () => {
    api.get('/ads-library-ai/status').then(({ data }) => {
      const status = document.getElementById('adslib-status');
      if (status) status.innerHTML = data.configured
        ? `<span class="text-emerald-400">✓ configured (source: ${esc(data.source)})</span>`
        : `<span class="text-amber-400">⚠ not configured — paste cookies below</span>`;
    }).catch(() => {});

    el.querySelector('#adslib-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cookies = el.querySelector('#adslib-cookies').value.trim();
      const result = el.querySelector('#adslib-result');
      result.textContent = 'Saving & testing…';
      result.className = 'text-xs text-slate-400';
      try {
        const { data } = await api.put('/ads-library-ai/config', { cookies });
        if (data.cookieTest === 'ok') {
          result.textContent = '✓ saved + cookie test passed';
          result.className = 'text-xs text-emerald-400';
        } else if (data.cookieTest === 'failed') {
          result.innerHTML = `⚠ saved but cookie test failed: <span class="text-red-300">${esc(data.cookieTestError || 'unknown')}</span>`;
          result.className = 'text-xs text-amber-300';
        } else {
          result.textContent = '✓ saved (test skipped)';
          result.className = 'text-xs text-emerald-400';
        }
        const status = await api.get('/ads-library-ai/status');
        const statusEl = document.getElementById('adslib-status');
        if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400">✓ configured (source: ${esc(status.data.source)})</span>`;
      } catch (err) {
        result.textContent = '✗ ' + err.message;
        result.className = 'text-xs text-red-400';
      }
    });

    el.querySelector('#adslib-clear')?.addEventListener('click', async () => {
      if (!confirm('Clear Ads Library AI cookies?')) return;
      try {
        await api.del('/ads-library-ai/config');
        el.querySelector('#adslib-cookies').value = '';
        const statusEl = document.getElementById('adslib-status');
        if (statusEl) statusEl.innerHTML = `<span class="text-amber-400">⚠ not configured</span>`;
        el.querySelector('#adslib-result').textContent = '✓ cleared';
        el.querySelector('#adslib-result').className = 'text-xs text-emerald-400';
      } catch (err) {
        alert('Failed to clear: ' + err.message);
      }
    });

    el.querySelector('#adslib-test')?.addEventListener('click', async () => {
      const result = el.querySelector('#adslib-result');
      result.textContent = 'Testing…';
      result.className = 'text-xs text-slate-400';
      try {
        const { data } = await api.post('/ads-library-ai/search', { query: 'test' });
        result.textContent = '✓ connection works';
        result.className = 'text-xs text-emerald-400';
      } catch (err) {
        result.textContent = '✗ ' + err.message;
        result.className = 'text-xs text-red-400';
      }
    });
  };

  attachAdsLibraryAiHandlers();
}