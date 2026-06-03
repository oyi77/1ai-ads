import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderMetaAiView(el) {
  el.innerHTML = `
    <div class="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-3xl font-black text-white tracking-tight">Meta AI for Business</h1>
            <p class="text-slate-400 text-sm mt-1">Chat with Meta's Ads Manager AI assistant (MAIBA) — requires browser session cookies.</p>
          </div>
          <div id="status-pill" class="text-xs px-3 py-1 rounded-full bg-slate-700 text-slate-300">checking…</div>
        </div>

        <details id="setup-panel" class="bg-[#161b22] border border-[#30363d] rounded-2xl mb-6">
          <summary class="cursor-pointer p-4 text-slate-300 font-bold select-none">⚙️ Setup — paste your adsmanager.facebook.com cookies</summary>
          <div class="p-4 pt-0 text-sm text-slate-400 space-y-3">
            <ol class="list-decimal list-inside space-y-2">
              <li>Open <a href="https://adsmanager.facebook.com" target="_blank" class="text-sky-400 underline">adsmanager.facebook.com</a> in your browser and log in.</li>
              <li>Open DevTools → Network tab → make any request → copy the <code class="bg-slate-800 px-1 rounded">cookie</code> request header.</li>
              <li>Paste the full cookie string below and save. It will be forwarded with each chat message.</li>
            </ol>
            <div class="bg-amber-900/30 border border-amber-700/50 p-3 rounded-lg text-amber-200 text-xs">
              <strong>⚠️ Risk:</strong> Cookies grant full Ads Manager access. Don't share them. They expire periodically — refresh if Meta returns 401.
            </div>
            <textarea id="cookies-input" class="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200" placeholder="c_user=...; xs=...; fr=...; datr=...; dpr=...; sb=...; m_pixel_ratio=..."></textarea>
            <div class="flex items-center gap-3">
              <input type="text" id="ad-account-input" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white" placeholder="Ad Account ID (e.g. 1181078009580337)" value="1181078009580337">
              <button id="save-setup" class="bg-sky-600 hover:bg-sky-500 px-6 py-3 rounded-lg font-bold text-white">Save & Test</button>
            </div>
            <div id="setup-result" class="text-xs"></div>
          </div>
        </details>

        <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl shadow-2xl flex flex-col" style="height: 60vh;">
          <div id="messages" class="flex-1 overflow-y-auto p-6 space-y-4"></div>
          <form id="chat-form" class="border-t border-[#1c2128] p-4 flex gap-3">
            <input type="text" id="chat-input" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white" placeholder="Ask Meta AI anything about your ads..." autocomplete="off">
            <button type="submit" id="send-btn" class="bg-sky-600 hover:bg-sky-500 px-6 py-3 rounded-lg font-bold text-white whitespace-nowrap">Send</button>
          </form>
        </div>
      </div>
    </div>
  `;

  const messagesEl = el.querySelector('#messages');
  const statusPill = el.querySelector('#status-pill');
  const form = el.querySelector('#chat-form');
  const input = el.querySelector('#chat-input');
  const sendBtn = el.querySelector('#send-btn');
  const cookiesInput = el.querySelector('#cookies-input');
  const accountInput = el.querySelector('#ad-account-input');
  const setupResult = el.querySelector('#setup-result');
  const setupPanel = el.querySelector('#setup-panel');

  const history = [];
  let adAccountId = localStorage.getItem('meta_ai_ad_account') || '';

  function renderMessage(role, content) {
    const div = document.createElement('div');
    div.className = role === 'user'
      ? 'bg-sky-600/20 border border-sky-500/30 p-4 rounded-xl ml-12'
      : 'bg-[#161b22] border border-[#1c2128] p-4 rounded-xl mr-12';
    div.innerHTML = `<div class="text-xs font-bold uppercase tracking-widest mb-1 ${role === 'user' ? 'text-sky-400' : 'text-emerald-400'}">${role === 'user' ? 'You' : 'Meta AI'}</div><div class="text-sm text-slate-200 whitespace-pre-wrap">${esc(content)}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderEmpty() {
    messagesEl.innerHTML = `<div class="text-center text-slate-500 py-12">
      <div class="text-4xl mb-3">💬</div>
      <p class="text-sm">No messages yet. Configure your cookies above, then ask Meta AI about your campaigns.</p>
      <p class="text-xs mt-2 text-slate-600">Try: "Why is my CPC high this week?" or "Optimize my ad set targeting"</p>
    </div>`;
  }

  async function checkStatus() {
    try {
      const { data } = await api.get('/meta-ai/status');
      statusPill.textContent = data.configured ? '✓ configured' : '⚠ not configured';
      statusPill.className = data.configured
        ? 'text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300'
        : 'text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300';
      if (!data.configured) setupPanel.open = true;
    } catch (e) {
      statusPill.textContent = 'error';
      statusPill.className = 'text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-300';
    }
  }

  el.querySelector('#save-setup').addEventListener('click', async () => {
    const cookies = cookiesInput.value.trim();
    adAccountId = accountInput.value.trim();
    if (!cookies || !adAccountId) {
      setupResult.innerHTML = '<p class="text-amber-400 mt-2">Both cookies and ad account ID required.</p>';
      return;
    }
    setupResult.innerHTML = '<p class="text-slate-400 mt-2">Cookies are sent to your browser — paste them in DevTools before refreshing. Backend reads from META_AI_COOKIES env var on server restart. Note: this UI step stores locally; for server-side use, the operator must set META_AI_COOKIES in .env.</p>';
    localStorage.setItem('meta_ai_ad_account', adAccountId);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    history.push({ role: 'user', content: text });
    renderMessage('user', text);
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    try {
      const { data } = await api.post('/meta-ai/chat', { message: text, adAccountId });
      const reply = data?.data?.maiba_ai_relay_message_send_v2?.message?.sensitive_string_value
        || data?.message?.sensitive_string_value
        || JSON.stringify(data, null, 2);
      history.push({ role: 'assistant', content: reply });
      renderMessage('assistant', reply);
    } catch (err) {
      renderMessage('assistant', `❌ ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  });

  renderEmpty();
  checkStatus();
}
