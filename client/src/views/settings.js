import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderSettings(el) {
  let mcpStatus = {};
  let credStatus = {};

  try {
    const statusRes = await api.get('/mcp/status');
    mcpStatus = statusRes.data;
  } catch {}

  for (const p of ['meta', 'google', 'tiktok', 'scalev']) {
    try {
      const res = await api.get(`/settings/credentials/${p}`);
      credStatus[p] = res.data;
    } catch { credStatus[p] = { configured: false }; }
  }

  el.innerHTML = `
    <div class="p-4 sm:p-8 max-w-3xl">
      <h1 class="text-2xl sm:text-3xl font-bold mb-6">Settings</h1>

      <!-- Platform Connections -->
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4">Platform Connections</h2>

        <!-- Meta Ads -->
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
            <div>
              <h3 class="font-bold text-lg">Meta Ads</h3>
              <p class="text-slate-400 text-sm">Facebook & Instagram Ads management via MCP</p>
            </div>
            <span class="flex items-center gap-2 text-sm">
              <span class="w-2 h-2 rounded-full ${mcpStatus.meta?.connected ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
              ${mcpStatus.meta?.connected ? 'Connected' : credStatus.meta?.configured ? 'Configured (not connected)' : 'Not configured'}
            </span>
          </div>
          <form id="meta-creds-form" class="space-y-3">
            <div>
              <label class="block text-sm text-slate-400 mb-1">Access Token <span class="text-red-400">*</span></label>
              <input type="password" name="access_token" placeholder="${credStatus.meta?.configured ? credStatus.meta.fields?.access_token || '****' : 'Paste your Meta access token'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" ${credStatus.meta?.configured ? '' : 'required'}>
              <p class="text-slate-500 text-xs mt-1">Get from <a href="https://developers.facebook.com/tools/explorer/" target="_blank" class="text-sky-400 hover:underline">Graph API Explorer</a> with ads_read + ads_management permissions</p>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">App ID (optional)</label>
              <input type="text" name="app_id" placeholder="${credStatus.meta?.fields?.app_id || 'Meta App ID'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">App Secret (optional)</label>
              <input type="password" name="app_secret" placeholder="${credStatus.meta?.fields?.app_secret || 'Meta App Secret'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
              <button type="submit" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg min-h-[44px]">Save Credentials</button>
              ${credStatus.meta?.configured ? `<button type="button" data-connect="meta" class="bg-emerald-600 hover:bg-emerald-700 px-4 py-3 rounded-lg min-h-[44px]">${mcpStatus.meta?.connected ? 'Reconnect' : 'Connect'}</button>` : ''}
              ${mcpStatus.meta?.connected ? '<button type="button" data-disconnect="meta" class="bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg min-h-[44px]">Disconnect</button>' : ''}
            </div>
          </form>
          <div id="meta-status" class="mt-3"></div>
        </div>

        <!-- Google Ads -->
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
            <div>
              <h3 class="font-bold text-lg">Google Ads</h3>
              <p class="text-slate-400 text-sm">Google Ads management via MCP (GAQL queries)</p>
            </div>
            <span class="flex items-center gap-2 text-sm">
              <span class="w-2 h-2 rounded-full ${mcpStatus.google?.connected ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
              ${mcpStatus.google?.connected ? 'Connected' : credStatus.google?.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <form id="google-creds-form" class="space-y-3">
            <div>
              <label class="block text-sm text-slate-400 mb-1">Developer Token <span class="text-red-400">*</span></label>
              <input type="password" name="developer_token" placeholder="${credStatus.google?.fields?.developer_token || 'Google Ads developer token'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <p class="text-slate-500 text-xs mt-1">Get from Google Ads > Tools > API Center</p>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">Credentials JSON Path <span class="text-red-400">*</span></label>
              <input type="text" name="credentials_path" placeholder="${credStatus.google?.fields?.credentials_path || '/path/to/credentials.json'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">Login Customer ID (optional)</label>
              <input type="text" name="login_customer_id" placeholder="123-456-7890" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
              <button type="submit" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg min-h-[44px]">Save Credentials</button>
              ${credStatus.google?.configured ? `<button type="button" data-connect="google" class="bg-emerald-600 hover:bg-emerald-700 px-4 py-3 rounded-lg min-h-[44px]">Connect</button>` : ''}
            </div>
          </form>
          <div id="google-status" class="mt-3"></div>
        </div>

        <!-- TikTok Ads -->
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
            <div>
              <h3 class="font-bold text-lg">TikTok Ads</h3>
              <p class="text-slate-400 text-sm">TikTok Ads management via Marketing API</p>
            </div>
            <span class="flex items-center gap-2 text-sm">
              <span class="w-2 h-2 rounded-full ${credStatus.tiktok?.configured ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
              ${credStatus.tiktok?.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <form id="tiktok-creds-form" class="space-y-3">
            <div>
              <label class="block text-sm text-slate-400 mb-1">Access Token <span class="text-red-400">*</span></label>
              <input type="password" name="access_token" placeholder="${credStatus.tiktok?.fields?.access_token || 'TikTok Marketing API access token'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <p class="text-slate-500 text-xs mt-1">Get from <a href="https://business-api.tiktok.com/portal" target="_blank" class="text-sky-400 hover:underline">TikTok Business API Portal</a></p>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">Advertiser ID</label>
              <input type="text" name="advertiser_id" placeholder="${credStatus.tiktok?.fields?.advertiser_id || 'Your TikTok Advertiser ID'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            </div>
            <button type="submit" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg min-h-[44px]">Save Credentials</button>
          </form>
          <div id="tiktok-status" class="mt-3"></div>
        </div>

        <!-- Scalev -->
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
            <div>
              <h3 class="font-bold text-lg">Scalev.id</h3>
              <p class="text-slate-400 text-sm">Landing page checkout & payment integration</p>
            </div>
            <span class="flex items-center gap-2 text-sm">
              <span class="w-2 h-2 rounded-full ${credStatus.scalev?.configured ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
              ${credStatus.scalev?.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <form id="scalev-creds-form" class="space-y-3">
            <div>
              <label class="block text-sm text-slate-400 mb-1">API Token <span class="text-red-400">*</span></label>
              <input type="password" name="api_token" placeholder="${credStatus.scalev?.fields?.api_token || 'Scalev API Bearer token'}" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
              <p class="text-slate-500 text-xs mt-1">Get from <a href="https://app.scalev.id" target="_blank" class="text-sky-400 hover:underline">Scalev Dashboard</a> > Settings > API</p>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">Store URL (optional)</label>
              <input type="text" name="store_url" placeholder="https://your-store.scalev.id" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]">
            </div>
            <button type="submit" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg min-h-[44px]">Save Credentials</button>
          </form>
          <div id="scalev-status" class="mt-3"></div>
        </div>
      </section>

      <!-- OmniRoute AI -->
      <section class="mb-8">
        <h2 class="text-xl font-semibold mb-4">AI Configuration</h2>
        <div class="bg-slate-800 p-4 sm:p-6 rounded-lg">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full ${mcpStatus.omniroute?.connected ? 'bg-emerald-400' : 'bg-red-400'}"></span>
            <span class="font-bold">OmniRoute</span>
            <span class="text-slate-400 text-sm">${mcpStatus.omniroute?.connected ? 'Connected' : 'Not reachable'}</span>
          </div>
          <p class="text-slate-400 text-sm">URL: ${esc(mcpStatus.omniroute?.url || 'Not configured')}</p>
          <p class="text-slate-500 text-xs mt-1">Configure via OMNIROUTE_URL environment variable</p>
        </div>
      </section>
    </div>
  `;

  // Handle credential form submissions
  for (const platform of ['meta', 'google', 'scalev']) {
    const form = el.querySelector(`#${platform}-creds-form`);
    if (!form) continue;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusDiv = el.querySelector(`#${platform}-status`);
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      // Remove empty fields
      for (const key of Object.keys(data)) { if (!data[key]) delete data[key]; }

      try {
        await api.post(`/settings/credentials/${platform}`, data);
        statusDiv.innerHTML = '<div class="bg-emerald-900 border border-emerald-700 p-3 rounded-lg text-sm">Credentials saved</div>';
        setTimeout(() => renderSettings(el), 1500);
      } catch (err) {
        statusDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-3 rounded-lg text-sm">${esc(err.message)}</div>`;
      }
    });
  }

  // Handle connect/disconnect buttons
  el.querySelectorAll('[data-connect]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const platform = btn.dataset.connect;
      const statusDiv = el.querySelector(`#${platform}-status`);
      btn.disabled = true;
      btn.textContent = 'Connecting...';
      try {
        const result = await api.post('/mcp/connect', { platform });
        statusDiv.innerHTML = `<div class="bg-emerald-900 border border-emerald-700 p-3 rounded-lg text-sm">Connected! ${result.data.toolCount} tools available.</div>`;
        setTimeout(() => renderSettings(el), 1500);
      } catch (err) {
        statusDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-3 rounded-lg text-sm">${esc(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Connect';
      }
    });
  });

  el.querySelectorAll('[data-disconnect]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const platform = btn.dataset.disconnect;
      await api.post('/mcp/disconnect', { platform });
      renderSettings(el);
    });
  });
}
